import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { format, isWeekend } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { EventsService } from '../events/events.service';
import { OrderStatus } from './enums/order.enums';
import type { Order } from './interfaces/order.interface';
import { OrdersService } from './orders.service';

@Injectable()
export class OrderExecutionService {
  private readonly logger = new Logger(OrderExecutionService.name);
  private readonly US_TIMEZONE = 'America/New_York';

  constructor(
    private readonly ordersService: OrdersService,
    private readonly eventsService: EventsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'execute-orders',
    timeZone: 'America/New_York',
  })
  async handleScheduledExecution(): Promise<void> {
    const startTime = Date.now();
    const now = new Date();
    const estNow = toZonedTime(now, this.US_TIMEZONE);
    const today = format(estNow, 'yyyy-MM-dd');
    const currentTime = format(estNow, 'HH:mm:ss');

    this.logger.log(
      `[CRON] Order execution job started | Date: ${today} | Time: ${currentTime} EST`,
    );

    if (isWeekend(estNow)) {
      this.logger.log(
        `[CRON] Skipping execution - Weekend detected | Date: ${today}`,
      );
      return;
    }

    const currentHour = estNow.getHours();
    const currentMinute = estNow.getMinutes();
    const isMarketHours =
      (currentHour > 9 || (currentHour === 9 && currentMinute >= 30)) &&
      currentHour < 16;

    if (!isMarketHours) {
      this.logger.log(
        `[CRON] Skipping execution - Outside market hours | Time: ${currentTime} EST (Market: 09:30-16:00)`,
      );
      return;
    }

    this.logger.log(`[CRON] Market hours confirmed | Checking for orders...`);

    try {
      const executedOrders = await this.executeOrdersForDate(today);
      const duration = Date.now() - startTime;

      this.logger.log(
        `[CRON] Order execution job completed | ` +
          `Executed: ${executedOrders.length} orders | ` +
          `Duration: ${duration}ms | ` +
          `Date: ${today}`,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `[CRON] Order execution job failed | ` +
          `Duration: ${duration}ms | ` +
          `Error: ${error.message}`,
        error.stack,
      );
    }
  }

  async executeOrdersForDate(executeOn: string): Promise<Order[]> {
    const startTime = Date.now();
    const allOrders = this.ordersService.findAll();
    const ordersToExecute = allOrders.filter(
      (order) =>
        order.executeOn === executeOn &&
        (order.status === OrderStatus.PENDING ||
          order.status === OrderStatus.QUEUED ||
          order.status === OrderStatus.SCHEDULED),
    );

    if (ordersToExecute.length === 0) {
      this.logger.log(
        `[EXECUTION] No orders to execute | Date: ${executeOn} | Total orders in system: ${allOrders.length}`,
      );
      return [];
    }

    const buyOrders = ordersToExecute.filter((o) => o.orderType === 'BUY');
    const sellOrders = ordersToExecute.filter((o) => o.orderType === 'SELL');
    const totalAmount = ordersToExecute.reduce(
      (sum, order) => sum + order.totalAmount,
      0,
    );

    this.logger.log(
      `[EXECUTION] Starting batch execution | ` +
        `Date: ${executeOn} | ` +
        `Total: ${ordersToExecute.length} orders | ` +
        `BUY: ${buyOrders.length} | ` +
        `SELL: ${sellOrders.length} | ` +
        `Total Amount: $${totalAmount.toFixed(2)}`,
    );

    const executedOrders: Order[] = [];
    const failedOrders: Array<{ orderId: string; error: string }> = [];

    for (let i = 0; i < ordersToExecute.length; i++) {
      const order = ordersToExecute[i];
      try {
        this.logger.log(
          `[EXECUTION] Processing order ${i + 1}/${ordersToExecute.length} | ` +
            `ID: ${order.id} | ` +
            `Type: ${order.orderType} | ` +
            `Amount: $${order.totalAmount}`,
        );

        const executedOrder = await this.executeOrder(order.id);
        executedOrders.push(executedOrder);
      } catch (error) {
        failedOrders.push({ orderId: order.id, error: error.message });
        this.logger.error(
          `[EXECUTION] Failed to execute order ${order.id} | ` +
            `Error: ${error.message}`,
          error.stack,
        );
      }
    }

    const duration = Date.now() - startTime;
    const successRate = (
      (executedOrders.length / ordersToExecute.length) *
      100
    ).toFixed(1);

    this.logger.log(
      `[EXECUTION] Batch execution completed | ` +
        `Date: ${executeOn} | ` +
        `Success: ${executedOrders.length}/${ordersToExecute.length} (${successRate}%) | ` +
        `Failed: ${failedOrders.length} | ` +
        `Duration: ${duration}ms`,
    );

    if (failedOrders.length > 0) {
      this.logger.warn(
        `[EXECUTION] Failed orders: ${JSON.stringify(failedOrders)}`,
      );
    }

    return executedOrders;
  }

  async executeOrder(orderId: string): Promise<Order> {
    const order = this.ordersService.findOne(orderId);

    if (order.status === OrderStatus.EXECUTED) {
      this.logger.warn(`Order ${orderId} is already executed`);
      return order;
    }

    this.logger.log(
      `Executing order ${orderId} | Type: ${order.orderType} | Amount: $${order.totalAmount}`,
    );
    const executedAt = new Date().toISOString();

    order.status = OrderStatus.EXECUTED;
    order.executedAt = executedAt;

    this.logger.log(
      `Order ${orderId} executed successfully at ${executedAt} | ` +
        `${order.items.length} stock(s) | Total: $${order.totalAmount}`,
    );

    this.eventsService.emitOrderExecuted({
      data: {
        orderId: order.id,
        accountId: order.accountId,
        executedAt,
      },
    });

    return order;
  }

  getExecutionStats(): {
    total: number;
    pending: number;
    scheduled: number;
    queued: number;
    executed: number;
    failed: number;
  } {
    const allOrders = this.ordersService.findAll();

    return {
      total: allOrders.length,
      pending: allOrders.filter((o) => o.status === OrderStatus.PENDING)
        .length,
      scheduled: allOrders.filter((o) => o.status === OrderStatus.SCHEDULED)
        .length,
      queued: allOrders.filter((o) => o.status === OrderStatus.QUEUED).length,
      executed: allOrders.filter((o) => o.status === OrderStatus.EXECUTED)
        .length,
      failed: allOrders.filter((o) => o.status === OrderStatus.FAILED).length,
    };
  }
}
