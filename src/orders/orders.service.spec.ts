import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { OrderStatus, OrderType } from './enums/order.enums';
import { STOCKS } from '../stocks/stocks.constants';

const AAPL_ID = STOCKS.AAPL.id;
const TSLA_ID = STOCKS.TSLA.id;

describe('OrdersService', () => {
  let service: OrdersService;

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
              if (key === 'INITIAL_BALANCE') return 100000;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
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
      const order = service.create(buyDto);

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

    it('should deduct platform balance after a BUY', () => {
      service.create(buyDto);
      expect((service as any).platformBalance).toBe(100000 - 1000);
    });

    it('should throw BadRequestException if percentages do not sum to 100', () => {
      const dto = {
        ...buyDto,
        portfolio: [{ stockId: AAPL_ID, percentage: 60 }],
      };
      expect(() => service.create(dto)).toThrow(
        new BadRequestException(
          'Portfolio percentages must sum to 100, got 60.00',
        ),
      );
    });

    it('should throw BadRequestException if platform balance is insufficient', () => {
      (service as any).platformBalance = 50;
      expect(() => service.create(buyDto)).toThrow(
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
      expect(() => service.create(dto)).toThrow(BadRequestException);
    });

    it('should use marketPrice when provided and >= fixedPrice', () => {
      const dto = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100, marketPrice: 200 }],
      };
      const order = service.create(dto);
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
      service.create(buyDto);

      const sellDto = {
        amount: 300,
        orderType: OrderType.SELL,
        portfolio: [
          { stockId: AAPL_ID, percentage: 50 },
          { stockId: TSLA_ID, percentage: 50 },
        ],
      };

      const order = service.create(sellDto);

      expect(order.orderType).toBe(OrderType.SELL);
      expect(order.totalAmount).toBe(300);

      const aapl = order.items.find((i) => i.symbol === 'AAPL')!;
      expect(aapl.shares).toBe(1.5); // $150 / $100

      expect((service as any).platformBalance).toBe(100000 - 1000 + 300);
    });

    it('should throw BadRequestException when selling more shares than held', () => {
      service.create(buyDto);

      const sellDto = {
        amount: 2000,
        orderType: OrderType.SELL,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      expect(() => service.create(sellDto)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all orders', () => {
      const dto = {
        amount: 100,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };
      service.create(dto);
      service.create(dto);

      const orders = service.findAll();
      expect(orders).toHaveLength(2);
    });

    it('should filter orders by orderType BUY', () => {
      const buyDto = {
        amount: 100,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      service.create(buyDto);
      service.create(buyDto);

      // Create a SELL order to ensure filtering works
      const sellDto = {
        amount: 50,
        orderType: OrderType.SELL,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };
      service.create(sellDto);

      const buyOrders = service.findAll(OrderType.BUY);
      expect(buyOrders).toHaveLength(2);
      expect(buyOrders.every(order => order.orderType === OrderType.BUY)).toBe(true);
    });

    it('should filter orders by orderType SELL', () => {
      const buyDto = {
        amount: 100,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };
      service.create(buyDto);

      const sellDto = {
        amount: 50,
        orderType: OrderType.SELL,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };
      service.create(sellDto);

      const sellOrders = service.findAll(OrderType.SELL);
      expect(sellOrders).toHaveLength(1);
      expect(sellOrders.every(order => order.orderType === OrderType.SELL)).toBe(true);
    });
  });

  describe('findOne', () => {
    const dto = {
      amount: 100,
      orderType: OrderType.BUY,
      portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
    };

    it('should return the order for the given id', () => {
      const created = service.create(dto);
      const found = service.findOne(created.id);
      expect(found.id).toBe(created.id);
    });

    it('should throw NotFoundException for a non-existent order id', () => {
      expect(() =>
        service.findOne('00000000-0000-0000-0000-000000000000'),
      ).toThrow(NotFoundException);
    });
  });

  describe('getExecutionDay', () => {
    it('should return SCHEDULED status during US market hours (EST)', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T15:00:00Z'));
      const result = service.getExecutionDay();
      expect(result.executeOn).toBe('2024-01-15');
      expect(result.status).toBe(OrderStatus.SCHEDULED);
    });

    it('should return PENDING status before market opens (before 9:30 AM EST)', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T13:00:00Z'));
      const result = service.getExecutionDay();
      expect(result.executeOn).toBe('2024-01-15'); // Same day - market will open later
      expect(result.status).toBe(OrderStatus.PENDING);
    });

    it('should return QUEUED status after market closes (after 4:00 PM EST)', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T22:00:00Z'));
      const result = service.getExecutionDay();
      expect(result.executeOn).toBe('2024-01-16');
      expect(result.status).toBe(OrderStatus.QUEUED);
    });

    it('should return QUEUED status on Saturday with next Monday', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-13T15:00:00Z'));
      const result = service.getExecutionDay();
      expect(result.executeOn).toBe('2024-01-15');
      expect(result.status).toBe(OrderStatus.QUEUED);
    });

    it('should return QUEUED status on Sunday with next Monday', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-14T15:00:00Z'));
      const result = service.getExecutionDay();
      expect(result.executeOn).toBe('2024-01-15');
      expect(result.status).toBe(OrderStatus.QUEUED);
    });

    it('should handle market close boundary (exactly 4:00 PM EST)', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T21:00:00Z'));
      const result = service.getExecutionDay();
      expect(result.executeOn).toBe('2024-01-16');
      expect(result.status).toBe(OrderStatus.QUEUED);
    });

    it('should handle market open boundary (exactly 9:30 AM EST)', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T14:30:00Z'));
      const result = service.getExecutionDay();
      expect(result.executeOn).toBe('2024-01-15');
      expect(result.status).toBe(OrderStatus.SCHEDULED);
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
      const order = service.create(dto);

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
      expect(() => service.create(dto)).not.toThrow();
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
      expect(() => service.create(dto)).toThrow(BadRequestException);
    });

    it('should handle very small amounts with precision', () => {
      const dto = {
        amount: 0.01,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100, marketPrice: 150 }],
      };
      const order = service.create(dto);
      expect(order.totalAmount).toBe(0.01);
      expect(order.items[0].shares).toBe(0);
    });

    it('should handle share calculations with precision', () => {
      const dto = {
        amount: 100,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100, marketPrice: 137.5 }],
      };
      const order = service.create(dto);
      expect(order.items[0].shares).toBe(0.727);
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

      const order = service.create(dto, idempotencyKey);

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

      const order1 = service.create(dto, idempotencyKey);
      const order2 = service.create(dto, idempotencyKey);

      expect(order2.id).toBe(order1.id);
      expect(order2).toEqual(order1);
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

      service.create(dto1, idempotencyKey);

      expect(() => service.create(dto2, idempotencyKey)).toThrow(
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

      const order1 = service.create(dto);
      const order2 = service.create(dto);

      expect(order1.id).not.toBe(order2.id);
    });

    it('should cleanup expired idempotency keys', () => {
      jest.useFakeTimers();
      const dto = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      service.create(dto, 'expired-key');

      jest.advanceTimersByTime(25 * 60 * 60 * 1000);

      const removed = service.cleanupExpiredIdempotencyKeys();
      expect(removed).toBe(1);

      jest.useRealTimers();
    });
  });

  describe('getHoldings', () => {
    it('should return initial platform balance with no holdings when no orders exist', () => {
      const result = service.getHoldings();

      expect(result.platformBalance).toBe(100000);
      expect(result.holdings).toEqual([]);
      expect(result.totalInvested).toBe(0);
      expect(result.totalOrdersBought).toBe(0);
      expect(result.totalOrdersSold).toBe(0);
    });

    it('should return correct holdings after BUY orders', () => {
      const buyDto = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [
          { stockId: AAPL_ID, percentage: 60 },
          { stockId: TSLA_ID, percentage: 40 },
        ],
      };

      service.create(buyDto);
      const result = service.getHoldings();

      expect(result.platformBalance).toBe(99000); // 100000 - 1000
      expect(result.holdings).toHaveLength(2);
      expect(result.totalInvested).toBe(1000);
      expect(result.totalOrdersBought).toBe(1);
      expect(result.totalOrdersSold).toBe(0);

      const aaplHolding = result.holdings.find((h) => h.symbol === 'AAPL');
      const tslaHolding = result.holdings.find((h) => h.symbol === 'TSLA');

      expect(aaplHolding).toEqual({ symbol: 'AAPL', shares: 6 });
      expect(tslaHolding).toEqual({ symbol: 'TSLA', shares: 4 });
    });

    it('should update holdings after multiple BUY orders', () => {
      const buyDto1 = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      const buyDto2 = {
        amount: 500,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      service.create(buyDto1);
      service.create(buyDto2);

      const result = service.getHoldings();

      expect(result.platformBalance).toBe(98500); // 100000 - 1000 - 500
      expect(result.holdings).toHaveLength(1);
      expect(result.totalInvested).toBe(1500);
      expect(result.totalOrdersBought).toBe(2);
      expect(result.totalOrdersSold).toBe(0);
      expect(result.holdings[0]).toEqual({ symbol: 'AAPL', shares: 15 }); // 10 + 5
    });

    it('should reduce holdings and totalInvested after SELL orders', () => {
      const buyDto = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      const sellDto = {
        amount: 300,
        orderType: OrderType.SELL,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      service.create(buyDto);
      service.create(sellDto);

      const result = service.getHoldings();

      expect(result.platformBalance).toBe(99300); // 100000 - 1000 + 300
      expect(result.holdings).toHaveLength(1);
      expect(result.totalInvested).toBe(700); // 1000 - 300
      expect(result.totalOrdersBought).toBe(1);
      expect(result.totalOrdersSold).toBe(1);
      expect(result.holdings[0]).toEqual({ symbol: 'AAPL', shares: 7 }); // 10 - 3
    });

    it('should handle mixed BUY and SELL orders across multiple stocks', () => {
      const buyDto = {
        amount: 2000,
        orderType: OrderType.BUY,
        portfolio: [
          { stockId: AAPL_ID, percentage: 50 },
          { stockId: TSLA_ID, percentage: 50 },
        ],
      };

      const sellDto = {
        amount: 500,
        orderType: OrderType.SELL,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      service.create(buyDto);
      service.create(sellDto);

      const result = service.getHoldings();

      expect(result.platformBalance).toBe(98500); // 100000 - 2000 + 500
      expect(result.holdings).toHaveLength(2);
      expect(result.totalInvested).toBe(1500); // 2000 - 500
      expect(result.totalOrdersBought).toBe(1);
      expect(result.totalOrdersSold).toBe(1);

      const aaplHolding = result.holdings.find((h) => h.symbol === 'AAPL');
      const tslaHolding = result.holdings.find((h) => h.symbol === 'TSLA');

      expect(aaplHolding).toEqual({ symbol: 'AAPL', shares: 5 }); // 10 - 5
      expect(tslaHolding).toEqual({ symbol: 'TSLA', shares: 10 });
    });

    it('should track balance changes through BUY and SELL operations', () => {
      const buyDto1 = {
        amount: 2000,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      const buyDto2 = {
        amount: 1000,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: TSLA_ID, percentage: 100 }],
      };

      const sellDto = {
        amount: 500,
        orderType: OrderType.SELL,
        portfolio: [{ stockId: AAPL_ID, percentage: 100 }],
      };

      service.create(buyDto1); // Balance: 98000
      service.create(buyDto2); // Balance: 97000
      service.create(sellDto); // Balance: 97500

      const result = service.getHoldings();

      expect(result.platformBalance).toBe(97500); // 100000 - 2000 - 1000 + 500
      expect(result.holdings).toHaveLength(2);
      expect(result.totalInvested).toBe(2500); // 2000 + 1000 - 500
      expect(result.totalOrdersBought).toBe(2);
      expect(result.totalOrdersSold).toBe(1);
    });

    it('should handle fractional shares correctly', () => {
      const buyDto = {
        amount: 100,
        orderType: OrderType.BUY,
        portfolio: [{ stockId: AAPL_ID, percentage: 100, marketPrice: 137.5 }],
      };

      service.create(buyDto);

      const result = service.getHoldings();

      expect(result.platformBalance).toBe(99900);
      expect(result.holdings).toHaveLength(1);
      expect(result.totalInvested).toBe(100);
      expect(result.totalOrdersBought).toBe(1);
      expect(result.totalOrdersSold).toBe(0);
      expect(result.holdings[0]).toEqual({ symbol: 'AAPL', shares: 0.727 });
    });
  });
});
