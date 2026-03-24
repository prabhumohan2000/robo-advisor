import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { addDays, format, isWeekend, setHours, setMinutes } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import Decimal from 'decimal.js';
import { AccountsService } from '../accounts/accounts.service';
import { EventsService } from '../events/events.service';
import { STOCKS } from '../stocks/stocks.constants';
import { CreateOrderDto } from './dto/order.dto';
import { OrderStatus, OrderType } from './enums/order.enums';
import { Order, OrderItem } from './interfaces/order.interface';

type Stock = { id: string; symbol: string; name: string };

interface IdempotencyRecord {
  order: Order;
  createdAt: Date;
  requestHash: string;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly orders: Order[] = [];
  private readonly fixedPrice: number;
  private readonly shareDecimals: number;

  private readonly US_TIMEZONE = 'America/New_York';
  private readonly MARKET_OPEN_HOUR = 9;
  private readonly MARKET_OPEN_MINUTE = 30;
  private readonly MARKET_CLOSE_HOUR = 16;
  private readonly MARKET_CLOSE_MINUTE = 0;

  private readonly idempotencyStore = new Map<string, IdempotencyRecord>();

  private readonly IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly accountsService: AccountsService,
    private readonly eventsService: EventsService,
  ) {
    this.fixedPrice = this.configService.get<number>('FIXED_PRICE') ?? 100;
    this.shareDecimals = this.configService.get<number>('SHARE_DECIMALS') ?? 3;
  }

  findAll(orderType?: OrderType): Order[] {
    this.logger.log(`Finding orders${orderType ? ` with filter: orderType=${orderType}` : ' (no filter)'}`);
    if (orderType) {
      const filtered = this.orders.filter((order) => order.orderType === orderType);
      this.logger.log(`Filtered results: ${filtered.length} of ${this.orders.length} orders`);
      return filtered;
    }
    this.logger.log(`Returning all ${this.orders.length} orders`);
    return this.orders;
  }

  findOne(id: string): Order {
    const order = this.orders.find((o) => o.id === id);
    if (!order) {
      throw new NotFoundException(`Order with id ${id} not found`);
    }
    return order;
  }

  findStock(stockId: string): Stock {
    const stock = (Object.values(STOCKS) as Stock[]).find(
      (s) => s.id === stockId,
    );
    if (!stock) {
      throw new NotFoundException(`Stock with id ${stockId} not found`);
    }
    return stock;
  }


  private calculateRequestHash(dto: CreateOrderDto): string {
    const payload = JSON.stringify({
      amount: dto.amount,
      orderType: dto.orderType,
      portfolio: dto.portfolio.map((item) => ({
        stockId: item.stockId,
        percentage: item.percentage,
        marketPrice: item.marketPrice,
      })),
    });
    return createHash('sha256').update(payload).digest('hex');
  }

  create(dto: CreateOrderDto, idempotencyKey?: string): Order {
    this.accountsService.findOne(dto.accountId);
    this.logger.log(
      `Received order request: Account ${dto.accountId} | ${dto.orderType} $${dto.amount} across ${dto.portfolio.length} stocks` +
      (idempotencyKey ? ` [Idempotency-Key: ${idempotencyKey}]` : ''),
    );

    if (idempotencyKey) {
      const requestHash = this.calculateRequestHash(dto);
      const existingRecord = this.idempotencyStore.get(idempotencyKey);

      if (existingRecord) {

        if (existingRecord.requestHash !== requestHash) {
          this.logger.warn(
            `Idempotency key conflict: ${idempotencyKey} used with different payload`,
          );
          throw new BadRequestException(
            'Idempotency key used with different request payload',
          );
        }

        const now = new Date();
        const ageMs = now.getTime() - existingRecord.createdAt.getTime();

        if (ageMs < this.IDEMPOTENCY_TTL_MS) {
          this.logger.log(
            `Returning cached order ${existingRecord.order.id} for idempotency key ${idempotencyKey}`,
          );
          return existingRecord.order;
        } else {
          this.idempotencyStore.delete(idempotencyKey);
        }
      }
    }

    const totalPercentage = dto.portfolio.reduce(
      (sum, item) => sum.plus(item.percentage),
      new Decimal(0),
    );

    if (!totalPercentage.equals(100) && totalPercentage.minus(100).abs().greaterThan(0.01)) {
      throw new BadRequestException(
        `Portfolio percentages must sum to 100, got ${totalPercentage.toFixed(2)}`,
      );
    }

    const items: OrderItem[] = dto.portfolio.map((item) => {
      if (
        item.marketPrice !== undefined &&
        item.marketPrice < this.fixedPrice
      ) {
        const stock = this.findStock(item.stockId);
        throw new BadRequestException(
          `marketPrice for ${stock.symbol} must be at least $${this.fixedPrice}, got $${item.marketPrice}`,
        );
      }
      const price = new Decimal(item.marketPrice ?? this.fixedPrice);
      const allocatedAmount = new Decimal(dto.amount)
        .times(item.percentage)
        .dividedBy(100);
      const shares = allocatedAmount.dividedBy(price);
      const roundedShares = Math.round(shares.toNumber() * Math.pow(10, this.shareDecimals)) / Math.pow(10, this.shareDecimals);
      const actualAmount = new Decimal(roundedShares).times(price);
      return {
        symbol: this.findStock(item.stockId).symbol,
        amount: Math.round(actualAmount.toNumber() * 100) / 100,
        shares: roundedShares,
      };
    });

    const actualTotal = items.reduce(
      (sum, item) => sum.plus(item.amount),
      new Decimal(0),
    );
    const actualTotalRounded = Math.round(actualTotal.toNumber() * 100) / 100;
    if (dto.orderType === OrderType.SELL) {
      this.accountsService.checkSufficientShares(dto.accountId, items);
    }

    this.accountsService.checkAndDeductBalance(
      dto.accountId,
      actualTotalRounded,
      dto.orderType,
    );

    const { executeOn, status } = this.getExecutionDay();
    const orderId = randomUUID();
    const order: Order = {
      id: orderId,
      accountId: dto.accountId,
      orderType: dto.orderType,
      totalAmount: actualTotalRounded,
      items,
      executeOn,
      status,
      createdAt: new Date().toISOString(),
    };

    this.logger.log(
      `Order created: ${orderId} | Account: ${dto.accountId} | Type: ${dto.orderType} | Amount: $${order.totalAmount} | ` +
      `Status: ${status} | Will execute on: ${executeOn}`,
    );

    this.orders.push(order);
    this.accountsService.updateHoldings(dto.accountId, items, dto.orderType);
    this.eventsService.emitOrderCreated({
      data: {
        order,
        accountId: dto.accountId,
      },
    });

    if (idempotencyKey) {
      const requestHash = this.calculateRequestHash(dto);
      this.idempotencyStore.set(idempotencyKey, {
        order,
        createdAt: new Date(),
        requestHash,
      });
      this.logger.log(`Idempotency record stored for key: ${idempotencyKey}`);
    }

    return order;
  }

  getExecutionDay(): { executeOn: string; status: OrderStatus } {
    const now = new Date();
    const estNow = toZonedTime(now, this.US_TIMEZONE);

    if (isWeekend(estNow)) {
      const nextTradingDay = this.getNextTradingDay(estNow);
      return {
        executeOn: format(nextTradingDay, 'yyyy-MM-dd'),
        status: OrderStatus.QUEUED,
      };
    }

    const marketOpen = setMinutes(
      setHours(estNow, this.MARKET_OPEN_HOUR),
      this.MARKET_OPEN_MINUTE,
    );
    const marketClose = setMinutes(
      setHours(estNow, this.MARKET_CLOSE_HOUR),
      this.MARKET_CLOSE_MINUTE,
    );

    if (estNow >= marketOpen && estNow < marketClose) {
      return {
        executeOn: format(estNow, 'yyyy-MM-dd'),
        status: OrderStatus.SCHEDULED,
      };
    } else if (estNow < marketOpen) {
      return {
        executeOn: format(estNow, 'yyyy-MM-dd'),
        status: OrderStatus.PENDING,
      };
    } else {
      const nextTradingDay = this.getNextTradingDay(estNow);
      return {
        executeOn: format(nextTradingDay, 'yyyy-MM-dd'),
        status: OrderStatus.QUEUED,
      };
    }
  }

  private getNextTradingDay(date: Date): Date {
    let nextDay = addDays(date, 1);
    while (isWeekend(nextDay)) {
      nextDay = addDays(nextDay, 1);
    }
    return nextDay;
  }

  cleanupExpiredIdempotencyKeys(): number {
    const now = new Date();
    let removedCount = 0;

    for (const [key, record] of this.idempotencyStore.entries()) {
      const ageMs = now.getTime() - record.createdAt.getTime();
      if (ageMs >= this.IDEMPOTENCY_TTL_MS) {
        this.idempotencyStore.delete(key);
        removedCount++;
      }
    }
    return removedCount;
  }
}
