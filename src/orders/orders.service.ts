import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
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

@Injectable()
export class OrdersService {
  private readonly orders: Order[] = [];
  private readonly fixedPrice: number;
  private readonly shareDecimals: number;

  // Map<userId, Map<symbol, netShares>>
  private readonly holdings = new Map<string, Map<string, number>>();

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
      const current = userHoldings.get(item.symbol) ?? 0;
      const updated =
        orderType === OrderType.BUY
          ? current + item.shares
          : current - item.shares;
      userHoldings.set(
        item.symbol,
        parseFloat(updated.toFixed(this.shareDecimals)),
      );
    }
  }

  create(dto: CreateOrderDto, userId: string): Order {
    const totalPercentage = dto.portfolio.reduce(
      (sum, item) => sum + item.percentage,
      0,
    );
    if (totalPercentage !== 100) {
      throw new BadRequestException(
        `Portfolio percentages must sum to 100, got ${totalPercentage}`,
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
      const price = item.marketPrice ?? this.fixedPrice;
      const allocatedAmount = dto.amount * (item.percentage / 100);
      const shares = parseFloat(
        (allocatedAmount / price).toFixed(this.shareDecimals),
      );
      return {
        symbol: this.findStock(item.stockId).symbol,
        amount: allocatedAmount,
        shares,
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
      totalAmount: dto.amount,
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

    return order;
  }

  getHoldings(userId: string): HoldingsSummary {
    const userOrders = this.orders.filter((o) => o.userId === userId);
    const stockMap = new Map<
      string,
      { shares: number; totalInvested: number; totalSold: number }
    >();

    for (const order of userOrders) {
      for (const item of order.items) {
        const existing = stockMap.get(item.symbol) ?? {
          shares: 0,
          totalInvested: 0,
          totalSold: 0,
        };
        if (order.orderType === OrderType.BUY) {
          existing.shares = parseFloat(
            (existing.shares + item.shares).toFixed(this.shareDecimals),
          );
          existing.totalInvested = parseFloat(
            (existing.totalInvested + item.amount).toFixed(2),
          );
        } else {
          existing.shares = parseFloat(
            (existing.shares - item.shares).toFixed(this.shareDecimals),
          );
          existing.totalSold = parseFloat(
            (existing.totalSold + item.amount).toFixed(2),
          );
        }
        stockMap.set(item.symbol, existing);
      }
    }

    const holdings: StockHolding[] = Array.from(stockMap.entries()).map(
      ([symbol, data]) => ({
        symbol,
        shares: data.shares,
        totalInvested: data.totalInvested,
        totalSold: data.totalSold,
        netAmount: parseFloat((data.totalInvested - data.totalSold).toFixed(2)),
      }),
    );

    const totalInvested = parseFloat(
      holdings.reduce((sum, h) => sum + h.totalInvested, 0).toFixed(2),
    );
    const totalSold = parseFloat(
      holdings.reduce((sum, h) => sum + h.totalSold, 0).toFixed(2),
    );

    return {
      holdings,
      totalInvested,
      totalSold,
      netAmount: parseFloat((totalInvested - totalSold).toFixed(2)),
    };
  }

  getExecutionDay(): { executeOn: string; status: OrderStatus } {
    const today = new Date();
    const dayOfWeek = today.getUTCDay();

    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    if (isWeekday) {
      return {
        executeOn: today.toISOString().split('T')[0],
        status: OrderStatus.SCHEDULED,
      };
    }
    const daysUntilMonday = dayOfWeek === 6 ? 2 : 1;
    const nextMonday = new Date(today);
    nextMonday.setUTCDate(today.getUTCDate() + daysUntilMonday);
    return {
      executeOn: nextMonday.toISOString().split('T')[0],
      status: OrderStatus.PENDING,
    };
  }
}
