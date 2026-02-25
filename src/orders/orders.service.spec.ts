import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { UsersService } from '../users/users.service';
import { OrderStatus, OrderType } from './enums/order.enums';
import { STOCKS } from '../stocks/stocks.constants';

const AAPL_ID = STOCKS.AAPL.id;
const TSLA_ID = STOCKS.TSLA.id;
const USER_ID = 'user-123';

const mockUser = {
  id: USER_ID,
  email: 'test@test.com',
  passwordHash: 'hash',
  balance: 10000,
  createdAt: new Date().toISOString(),
};

describe('OrdersService', () => {
  let service: OrdersService;
  let usersService: {
    findById: jest.Mock;
    deductBalance: jest.Mock;
    addBalance: jest.Mock;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'FIXED_PRICE') return 100;
              if (key === 'SHARE_DECIMALS') return 3;
              return undefined;
            }),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn().mockReturnValue({ ...mockUser }),
            deductBalance: jest.fn(),
            addBalance: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    usersService = module.get(UsersService);
  });

  afterEach(() => jest.useRealTimers());

  describe('findStock', () => {
    it('should return the stock for a valid stockId', () => {
      const stock = service.findStock(AAPL_ID);
      expect(stock.symbol).toBe('AAPL');
    });

    it('should throw NotFoundException for an unknown stockId', () => {
      expect(() =>
        service.findStock('00000000-0000-0000-0000-000000000000'),
      ).toThrow(NotFoundException);
    });
  });

  describe('create — BUY', () => {
    const buyDto = {
      amount: 1000,
      orderType: OrderType.BUY,
      portfolio: [
        { stockId: AAPL_ID, percentage: 60 },
        { stockId: TSLA_ID, percentage: 40 },
      ],
    };

    it('should create a BUY order with correctly split items', () => {
      const order = service.create(buyDto, USER_ID);

      expect(order.orderType).toBe(OrderType.BUY);
      expect(order.totalAmount).toBe(1000);
      expect(order.items).toHaveLength(2);

      const aapl = order.items.find((i) => i.symbol === 'AAPL')!;
      expect(aapl.amount).toBe(600);
      expect(aapl.shares).toBe(6);

      const tsla = order.items.find((i) => i.symbol === 'TSLA')!;
      expect(tsla.amount).toBe(400);
      expect(tsla.shares).toBe(4);
    });

    it('should deduct balance after a BUY', () => {
      service.create(buyDto, USER_ID);
      expect(usersService.deductBalance).toHaveBeenCalledWith(USER_ID, 1000);
    });

    it('should throw BadRequestException if percentages do not sum to 100', () => {
      const dto = {
        ...buyDto,
        portfolio: [{ stockId: AAPL_ID, percentage: 60 }],
      };
      expect(() => service.create(dto, USER_ID)).toThrow(
        new BadRequestException(
          'Portfolio percentages must sum to 100, got 60.00',
        ),
      );
    });

    it('should throw BadRequestException if balance is insufficient', () => {
      usersService.findById.mockReturnValue({ ...mockUser, balance: 50 });
      expect(() => service.create(buyDto, USER_ID)).toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if marketPrice is below fixedPrice', () => {
      const dto = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [
          { stockId: AAPL_ID, percentage: 60, marketPrice: 80 },
          { stockId: TSLA_ID, percentage: 40 },
        ],
      };
      expect(() => service.create(dto, USER_ID)).toThrow(BadRequestException);
    });

    it('should use marketPrice when provided and >= fixedPrice', () => {
      const dto = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100, marketPrice: 200 }],
      };
      const order = service.create(dto, USER_ID);
      expect(order.items[0].shares).toBe(5); // 1000 / $200
    });
  });

  describe('create — SELL', () => {
    const buyDto = {
      amount: 1000,
      orderType: OrderType.BUY,
      portfolio: [
        { stockId: AAPL_ID, percentage: 60 },
        { stockId: TSLA_ID, percentage: 40 },
      ],
    };

    it('should create a SELL order and add balance', () => {
      service.create(buyDto, USER_ID);

      const sellDto = {
        amount: 300,
        orderType: OrderType.SELL,
        portfolio: [
          { stockId: AAPL_ID, percentage: 50 },
          { stockId: TSLA_ID, percentage: 50 },
        ],
      };

      const order = service.create(sellDto, USER_ID);

      expect(order.orderType).toBe(OrderType.SELL);
      expect(order.totalAmount).toBe(300);

      const aapl = order.items.find((i) => i.symbol === 'AAPL')!;
      expect(aapl.shares).toBe(1.5); // $150 / $100

      expect(usersService.addBalance).toHaveBeenCalledWith(USER_ID, 300);
    });

    it('should throw BadRequestException when selling more shares than held', () => {
      service.create(buyDto, USER_ID);

      const sellDto = {
        amount: 2000,
        orderType: OrderType.SELL,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      expect(() => service.create(sellDto, USER_ID)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return only orders belonging to the given user', () => {
      const dto = {
        amount: 100,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };
      service.create(dto, USER_ID);
      service.create(dto, 'other-user');

      const orders = service.findAll(USER_ID);
      expect(orders).toHaveLength(1);
      expect(orders[0].userId).toBe(USER_ID);
    });
  });

  describe('findOne', () => {
    const dto = {
      amount: 100,
      orderType: OrderType.BUY,
      portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
    };

    it('should return the order for the correct user and id', () => {
      const created = service.create(dto, USER_ID);
      const found = service.findOne(created.id, USER_ID);
      expect(found.id).toBe(created.id);
    });

    it('should throw NotFoundException when order belongs to a different user', () => {
      const created = service.create(dto, USER_ID);
      expect(() => service.findOne(created.id, 'other-user')).toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for a non-existent order id', () => {
      expect(() =>
        service.findOne('00000000-0000-0000-0000-000000000000', USER_ID),
      ).toThrow(NotFoundException);
    });
  });

  describe('getExecutionDay', () => {
    it('should return SCHEDULED during US market hours (EST)', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T15:00:00Z'));
      const result = service.getExecutionDay();
      expect(result.status).toBe(OrderStatus.SCHEDULED);
      expect(result.executeOn).toBe('2024-01-15');
    });

    it('should return PENDING before market opens (before 9:30 AM EST)', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T13:00:00Z'));
      const result = service.getExecutionDay();
      expect(result.status).toBe(OrderStatus.PENDING);
      expect(result.executeOn).toBe('2024-01-16');
    });

    it('should return PENDING after market closes (after 4:00 PM EST)', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T22:00:00Z'));
      const result = service.getExecutionDay();
      expect(result.status).toBe(OrderStatus.PENDING);
      expect(result.executeOn).toBe('2024-01-16');
    });

    it('should return PENDING with next Monday on Saturday', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-13T15:00:00Z'));
      const result = service.getExecutionDay();
      expect(result.status).toBe(OrderStatus.PENDING);
      expect(result.executeOn).toBe('2024-01-15');
    });

    it('should return PENDING with next Monday on Sunday', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-14T15:00:00Z'));
      const result = service.getExecutionDay();
      expect(result.status).toBe(OrderStatus.PENDING);
      expect(result.executeOn).toBe('2024-01-15');
    });

    it('should handle market close boundary (exactly 4:00 PM EST)', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T21:00:00Z'));
      const result = service.getExecutionDay();
      expect(result.status).toBe(OrderStatus.PENDING);
      expect(result.executeOn).toBe('2024-01-16');
    });

    it('should handle market open boundary (exactly 9:30 AM EST)', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T14:30:00Z'));
      const result = service.getExecutionDay();
      expect(result.status).toBe(OrderStatus.SCHEDULED);
      expect(result.executeOn).toBe('2024-01-15');
    });
  });

  describe('Decimal precision and edge cases', () => {
    it('should handle percentage calculations with precision', () => {
      const dto = {
        amount: 1000.33,
        orderType: OrderType.BUY,
        portfolio: [
          { stockId: AAPL_ID, percentage: 33.33 },
          { stockId: TSLA_ID, percentage: 66.67 },
        ],
      };
      const order = service.create(dto, USER_ID);

      expect(order.totalAmount).toBe(1000.33);
      const aapl = order.items.find((i) => i.symbol === 'AAPL')!;
      const tsla = order.items.find((i) => i.symbol === 'TSLA')!;

      expect(aapl.amount).toBeCloseTo(333.41, 2);
      expect(tsla.amount).toBeCloseTo(666.92, 2);
    });

    it('should allow percentages with small floating-point tolerance', () => {
      const dto = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [
          { stockId: AAPL_ID, percentage: 33.33 },
          { stockId: TSLA_ID, percentage: 66.67 },
        ],
      };
      expect(() => service.create(dto, USER_ID)).not.toThrow();
    });

    it('should reject percentages that exceed tolerance', () => {
      const dto = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [
          { stockId: AAPL_ID, percentage: 33 },
          { stockId: TSLA_ID, percentage: 66 },
        ],
      };
      expect(() => service.create(dto, USER_ID)).toThrow(BadRequestException);
    });

    it('should handle very small amounts with precision', () => {
      const dto = {
        amount: 0.01,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100, marketPrice: 150 }],
      };
      const order = service.create(dto, USER_ID);
      expect(order.totalAmount).toBe(0.01);
      expect(order.items[0].shares).toBe(0);
    });

    it('should handle share calculations with precision', () => {
      const dto = {
        amount: 100,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100, marketPrice: 137.5 }],
      };
      const order = service.create(dto, USER_ID);
      expect(order.items[0].shares).toBe(0.727);
    });
  });

  describe('getHoldings', () => {
    it('should return correct summary after a BUY', () => {
      const dto = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [
          { stockId: AAPL_ID, percentage: 60 },
          { stockId: TSLA_ID, percentage: 40 },
        ],
      };
      service.create(dto, USER_ID);

      const summary = service.getHoldings(USER_ID);

      expect(summary.totalInvested).toBe(1000);
      expect(summary.totalSold).toBe(0);
      expect(summary.netAmount).toBe(1000);

      const aapl = summary.holdings.find((h) => h.symbol === 'AAPL')!;
      expect(aapl.shares).toBe(6);
      expect(aapl.totalInvested).toBe(600);
    });

    it('should reflect sold shares in the holdings summary', () => {
      const buyDto = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };
      service.create(buyDto, USER_ID);

      const sellDto = {
        amount: 500,
        orderType: OrderType.SELL,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };
      service.create(sellDto, USER_ID);

      const summary = service.getHoldings(USER_ID);
      const aapl = summary.holdings.find((h) => h.symbol === 'AAPL')!;

      expect(aapl.shares).toBe(5);
      expect(summary.totalSold).toBe(500);
      expect(summary.netAmount).toBe(500);
    });
  });

  describe('Idempotency', () => {
    const idempotencyKey = '123e4567-e89b-12d3-a456-426614174000';

    it('should create order on first request with idempotency key', () => {
      const dto = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      const order = service.create(dto, USER_ID, idempotencyKey);

      expect(order).toBeDefined();
      expect(order.id).toBeDefined();
      expect(order.totalAmount).toBe(1000);
    });

    it('should return cached order on duplicate request with same key and payload', () => {
      const dto = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      const order1 = service.create(dto, USER_ID, idempotencyKey);
      const order2 = service.create(dto, USER_ID, idempotencyKey);

      expect(order2.id).toBe(order1.id);
      expect(order2).toEqual(order1);
    });

    it('should throw error when same key used by different user', () => {
      const dto = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      service.create(dto, USER_ID, idempotencyKey);

      expect(() => service.create(dto, 'different-user', idempotencyKey)).toThrow(
        BadRequestException,
      );
    });

    it('should throw error when same key used with different payload', () => {
      const dto1 = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      const dto2 = {
        amount: 2000,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      service.create(dto1, USER_ID, idempotencyKey);

      expect(() => service.create(dto2, USER_ID, idempotencyKey)).toThrow(
        new BadRequestException(
          'Idempotency key used with different request payload',
        ),
      );
    });

    it('should create new order without idempotency key', () => {
      const dto = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      const order1 = service.create(dto, USER_ID);
      const order2 = service.create(dto, USER_ID);

      expect(order1.id).not.toBe(order2.id);
    });

    it('should cleanup expired idempotency keys', () => {
      jest.useFakeTimers();
      const dto = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      service.create(dto, USER_ID, 'expired-key');

      jest.advanceTimersByTime(25 * 60 * 60 * 1000);

      const removed = service.cleanupExpiredIdempotencyKeys();
      expect(removed).toBe(1);

      jest.useRealTimers();
    });
  });
});
