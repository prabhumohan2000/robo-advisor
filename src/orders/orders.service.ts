import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { addDays, format, isWeekend, setHours, setMinutes } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import Decimal from 'decimal.js';
import { STOCKS } from '../stocks/stocks.constants';
import { UsersService } from '../users/users.service';
import { CreateOrderDto } from './dto/order.dto';
import { OrderStatus, OrderType } from './enums/order.enums';
import {
  HoldingsSummary,
  Order,
  OrderItem,
  StockHolding,
} from './interfaces/order.interface';

type Stock = { id: string; symbol: string; name: string };

interface IdempotencyRecord {
  order: Order;
  createdAt: Date;
  userId: string;
  requestHash: string;
}

@Injectable()
export class OrdersService {
  private readonly orders: Order[] = [];
  private readonly fixedPrice: number;
  private readonly shareDecimals: number;

  private readonly US_TIMEZONE = 'America/New_York';
  private readonly MARKET_OPEN_HOUR = 9;
  private readonly MARKET_OPEN_MINUTE = 30;
  private readonly MARKET_CLOSE_HOUR = 16;
  private readonly MARKET_CLOSE_MINUTE = 0;

  private readonly holdings = new Map<string, Map<string, number>>();

  private readonly idempotencyStore = new Map<string, IdempotencyRecord>();

  private readonly IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    this.fixedPrice = this.configService.get<number>('FIXED_PRICE') ?? 100;
    this.shareDecimals = this.configService.get<number>('SHARE_DECIMALS') ?? 3;
  }

  findAll(userId: string): Order[] {
    return this.orders.filter((o) => o.userId === userId);
  }

  findOne(id: string, userId: string): Order {
    const order = this.orders.find((o) => o.id === id && o.userId === userId);
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

  private getUserHoldings(userId: string): Map<string, number> {
    if (!this.holdings.has(userId)) {
      this.holdings.set(userId, new Map());
    }
    return this.holdings.get(userId)!;
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

  private getHeldShares(userId: string, symbol: string): number {
    return this.getUserHoldings(userId).get(symbol) ?? 0;
  }

  private updateHoldings(
    userId: string,
    items: OrderItem[],
    orderType: OrderType,
  ): void {
    const userHoldings = this.getUserHoldings(userId);
    for (const item of items) {
      const current = new Decimal(userHoldings.get(item.symbol) ?? 0);
      const updated =
        orderType === OrderType.BUY
          ? current.plus(item.shares)
          : current.minus(item.shares);
      userHoldings.set(
        item.symbol,
        Math.round(updated.toNumber() * Math.pow(10, this.shareDecimals)) /
          Math.pow(10, this.shareDecimals),
      );
    }
  }

  create(dto: CreateOrderDto, userId: string, idempotencyKey?: string): Order {
    if (idempotencyKey) {
      const requestHash = this.calculateRequestHash(dto);
      const existingRecord = this.idempotencyStore.get(idempotencyKey);

      if (existingRecord) {
        if (existingRecord.userId !== userId) {
          throw new BadRequestException(
            'Idempotency key already used by another user',
          );
        }

        if (existingRecord.requestHash !== requestHash) {
          throw new BadRequestException(
            'Idempotency key used with different request payload',
          );
        }

        const now = new Date();
        const ageMs = now.getTime() - existingRecord.createdAt.getTime();

        if (ageMs < this.IDEMPOTENCY_TTL_MS) {
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

      return {
        symbol: this.findStock(item.stockId).symbol,
        amount: Math.round(allocatedAmount.toNumber() * 100) / 100,
        shares: Math.round(shares.toNumber() * Math.pow(10, this.shareDecimals)) / Math.pow(10, this.shareDecimals),
      };
    });

    if (dto.orderType === OrderType.BUY) {
      const user = this.usersService.findById(userId);
      if (dto.amount > user.balance) {
        throw new BadRequestException(
          `Insufficient balance: requested $${dto.amount}, available $${user.balance}`,
        );
      }
    }

    if (dto.orderType === OrderType.SELL) {
      for (const item of items) {
        const held = this.getHeldShares(userId, item.symbol);
        if (item.shares > held) {
          throw new BadRequestException(
            `Insufficient shares for ${item.symbol}: requested ${item.shares}, held ${held}`,
          );
        }
      }
    }

    const { executeOn, status } = this.getExecutionDay();
    const order: Order = {
      id: randomUUID(),
      userId,
      orderType: dto.orderType,
      totalAmount: Math.round(dto.amount * 100) / 100,
      items,
      executeOn,
      status,
      createdAt: new Date().toISOString(),
    };

    this.orders.push(order);
    this.updateHoldings(userId, items, dto.orderType);

    if (dto.orderType === OrderType.BUY) {
      this.usersService.deductBalance(userId, dto.amount);
    } else {
      this.usersService.addBalance(userId, dto.amount);
    }

    if (idempotencyKey) {
      const requestHash = this.calculateRequestHash(dto);
      this.idempotencyStore.set(idempotencyKey, {
        order,
        createdAt: new Date(),
        userId,
        requestHash,
      });
    }

    return order;
  }

  getHoldings(userId: string): HoldingsSummary {
    const userOrders = this.orders.filter((o) => o.userId === userId);
    const stockMap = new Map<
      string,
      { shares: any; totalInvested: any; totalSold: any }
    >();

    for (const order of userOrders) {
      for (const item of order.items) {
        const existing = stockMap.get(item.symbol) ?? {
          shares: new Decimal(0),
          totalInvested: new Decimal(0),
          totalSold: new Decimal(0),
        };
        if (order.orderType === OrderType.BUY) {
          existing.shares = existing.shares.plus(item.shares);
          existing.totalInvested = existing.totalInvested.plus(item.amount);
        } else {
          existing.shares = existing.shares.minus(item.shares);
          existing.totalSold = existing.totalSold.plus(item.amount);
        }
        stockMap.set(item.symbol, existing);
      }
    }

    const holdings: StockHolding[] = Array.from(stockMap.entries()).map(
      ([symbol, data]) => ({
        symbol,
        shares:
          Math.round(data.shares.toNumber() * Math.pow(10, this.shareDecimals)) /
          Math.pow(10, this.shareDecimals),
        totalInvested: Math.round(data.totalInvested.toNumber() * 100) / 100,
        totalSold: Math.round(data.totalSold.toNumber() * 100) / 100,
        netAmount:
          Math.round(data.totalInvested.minus(data.totalSold).toNumber() * 100) /
          100,
      }),
    );

    const totalInvested =
      Math.round(
        holdings
          .reduce((sum, h) => sum.plus(h.totalInvested), new Decimal(0))
          .toNumber() * 100,
      ) / 100;
    const totalSold =
      Math.round(
        holdings
          .reduce((sum, h) => sum.plus(h.totalSold), new Decimal(0))
          .toNumber() * 100,
      ) / 100;

    return {
      holdings,
      totalInvested,
      totalSold,
      netAmount: Math.round((totalInvested - totalSold) * 100) / 100,
    };
  }

  getExecutionDay(): { executeOn: string; status: OrderStatus } {
    const now = new Date();
    const estNow = toZonedTime(now, this.US_TIMEZONE);

    if (isWeekend(estNow)) {
      const nextTradingDay = this.getNextTradingDay(estNow);
      return {
        executeOn: format(nextTradingDay, 'yyyy-MM-dd'),
        status: OrderStatus.PENDING,
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
    } else {
      const nextTradingDay = this.getNextTradingDay(estNow);
      return {
        executeOn: format(nextTradingDay, 'yyyy-MM-dd'),
        status: OrderStatus.PENDING,
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
