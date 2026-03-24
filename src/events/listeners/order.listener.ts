import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type {
  OrderCreatedEvent,
  OrderExecutedEvent,
  BalanceUpdatedEvent,
  HoldingsUpdatedEvent,
} from '../interfaces/events.interface';
import { EventType } from '../interfaces/events.interface';

@Controller()
export class OrderEventListener {
  private readonly logger = new Logger(OrderEventListener.name);

  @MessagePattern(EventType.ORDER_CREATED)
  handleOrderCreated(@Payload() event: OrderCreatedEvent): void {
    this.logger.log(
      `[ORDER_CREATED] Order ${event.data.order.id} created for account ${event.data.accountId}`,
    );
    this.logger.debug(`Order details:`, {
      orderId: event.data.order.id,
      type: event.data.order.orderType,
      amount: event.data.order.totalAmount,
      status: event.data.order.status,
      executeOn: event.data.order.executeOn,
    });

    // Example async processing:
    // - Send order confirmation email/SMS
    // - Post to external webhook
    // - Update analytics dashboard
    // - Trigger portfolio rebalancing alerts
  }

  @MessagePattern(EventType.ORDER_EXECUTED)
  handleOrderExecuted(@Payload() event: OrderExecutedEvent): void {
    this.logger.log(
      `[ORDER_EXECUTED] Order ${event.data.orderId} executed for account ${event.data.accountId} at ${event.data.executedAt}`,
    );

    // Example async processing:
    // - Send execution confirmation notification
    // - Update portfolio performance metrics
    // - Trigger tax lot tracking
    // - Generate trade confirmation document
    // - Post to external reconciliation system
  }

  @MessagePattern(EventType.BALANCE_UPDATED)
  handleBalanceUpdated(@Payload() event: BalanceUpdatedEvent): void {
    this.logger.log(
      `[BALANCE_UPDATED] Account ${event.data.accountId}: ${event.data.previousBalance} → ${event.data.newBalance} (${event.data.operation})`,
    );
  }

  @MessagePattern(EventType.HOLDINGS_UPDATED)
  handleHoldingsUpdated(@Payload() event: HoldingsUpdatedEvent): void {
    this.logger.log(
      `[HOLDINGS_UPDATED] Account ${event.data.accountId} ${event.data.symbol}: ${event.data.previousShares} → ${event.data.newShares} shares`,
    );
  }
}
