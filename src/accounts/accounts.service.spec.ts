import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from '../events/events.service';
import { OrderType } from '../orders/enums/order.enums';
import { AccountsService } from './accounts.service';

describe('AccountsService', () => {
  let service: AccountsService;

  // Mock EventsService
  const mockEventsService = {
    emitBalanceUpdated: jest.fn(),
    emitHoldingsUpdated: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        {
          provide: EventsService,
          useValue: mockEventsService,
        },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);

    // Clear mock calls before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an account with initial balance', () => {
      const dto = { name: 'John Doe', initialBalance: 10000 };
      const account = service.create(dto);

      expect(account).toBeDefined();
      expect(account.id).toBeDefined();
      expect(account.name).toBe('John Doe');
      expect(account.balance).toBe(10000);
      expect(account.holdings).toEqual({});
      expect(account.totalInvested).toBe(0);
      expect(account.createdAt).toBeDefined();
      expect(account.updatedAt).toBeDefined();
    });

    it('should round initial balance to 2 decimals', () => {
      const dto = { name: 'Test User', initialBalance: 10000.999 };
      const account = service.create(dto);

      expect(account.balance).toBe(10001.0);
    });

    it('should create account with zero initial balance', () => {
      const dto = { name: 'Zero Balance', initialBalance: 0 };
      const account = service.create(dto);

      expect(account.balance).toBe(0);
    });
  });

  describe('findAll', () => {
    it('should return empty array when no accounts exist', () => {
      const accounts = service.findAll();
      expect(accounts).toEqual([]);
    });

    it('should return all accounts', () => {
      service.create({ name: 'User 1', initialBalance: 1000 });
      service.create({ name: 'User 2', initialBalance: 2000 });

      const accounts = service.findAll();
      expect(accounts).toHaveLength(2);
    });

    it('should serialize holdings as objects', () => {
      const account = service.create({ name: 'Test', initialBalance: 5000 });
      const accounts = service.findAll();

      expect(accounts[0].holdings).toEqual({});
      expect(typeof accounts[0].holdings).toBe('object');
    });
  });

  describe('findOne', () => {
    it('should find an account by ID', () => {
      const created = service.create({ name: 'Test', initialBalance: 1000 });
      const found = service.findOne(created.id);

      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.name).toBe('Test');
    });

    it('should throw NotFoundException for non-existent account', () => {
      expect(() => service.findOne('non-existent-id')).toThrow(
        NotFoundException,
      );
      expect(() => service.findOne('non-existent-id')).toThrow(
        'Account with id non-existent-id not found',
      );
    });
  });

  describe('findOneForApi', () => {
    it('should return serialized account', () => {
      const created = service.create({ name: 'Test', initialBalance: 1000 });
      const account = service.findOneForApi(created.id);

      expect(account).toBeDefined();
      expect(account.holdings).toEqual({});
      expect(typeof account.holdings).toBe('object');
    });

    it('should throw NotFoundException for non-existent account', () => {
      expect(() => service.findOneForApi('invalid-id')).toThrow(
        NotFoundException,
      );
    });
  });

  describe('deposit', () => {
    let accountId: string;

    beforeEach(() => {
      const account = service.create({ name: 'Test', initialBalance: 1000 });
      accountId = account.id;
    });

    it('should deposit funds to account', () => {
      const result = service.deposit(accountId, 500);

      expect(result.balance).toBe(1500);
    });

    it('should round deposit amount to 2 decimals', () => {
      const result = service.deposit(accountId, 500.999);

      expect(result.balance).toBe(1501.0);
    });

    it('should update updatedAt timestamp', () => {
      const result = service.deposit(accountId, 100);

      expect(result.updatedAt).toBeDefined();
      expect(typeof result.updatedAt).toBe('string');
    });

    it('should emit balance.updated event', () => {
      service.deposit(accountId, 500);

      expect(mockEventsService.emitBalanceUpdated).toHaveBeenCalledWith({
        data: {
          accountId,
          previousBalance: 1000,
          newBalance: 1500,
          amount: 500,
          operation: 'DEPOSIT',
        },
      });
    });

    it('should throw NotFoundException for invalid account', () => {
      expect(() => service.deposit('invalid-id', 100)).toThrow(
        NotFoundException,
      );
    });

    it('should serialize holdings in response', () => {
      const result = service.deposit(accountId, 100);

      expect(typeof result.holdings).toBe('object');
    });
  });

  describe('withdraw', () => {
    let accountId: string;

    beforeEach(() => {
      const account = service.create({ name: 'Test', initialBalance: 1000 });
      accountId = account.id;
    });

    it('should withdraw funds from account', () => {
      const result = service.withdraw(accountId, 300);

      expect(result.balance).toBe(700);
    });

    it('should round withdraw amount to 2 decimals', () => {
      const result = service.withdraw(accountId, 300.999);

      expect(result.balance).toBe(699.0);
    });

    it('should throw BadRequestException for insufficient balance', () => {
      expect(() => service.withdraw(accountId, 2000)).toThrow(
        BadRequestException,
      );
      expect(() => service.withdraw(accountId, 2000)).toThrow(
        'Insufficient balance: requested $2000, available $1000',
      );
    });

    it('should allow withdrawing exact balance', () => {
      const result = service.withdraw(accountId, 1000);

      expect(result.balance).toBe(0);
    });

    it('should emit balance.updated event', () => {
      service.withdraw(accountId, 300);

      expect(mockEventsService.emitBalanceUpdated).toHaveBeenCalledWith({
        data: {
          accountId,
          previousBalance: 1000,
          newBalance: 700,
          amount: 300,
          operation: 'WITHDRAW',
        },
      });
    });

    it('should throw NotFoundException for invalid account', () => {
      expect(() => service.withdraw('invalid-id', 100)).toThrow(
        NotFoundException,
      );
    });
  });

  describe('getBalance', () => {
    let accountId: string;

    beforeEach(() => {
      const account = service.create({ name: 'Test', initialBalance: 5000 });
      accountId = account.id;
    });

    it('should return account balance with empty holdings', () => {
      const balance = service.getBalance(accountId);

      expect(balance).toEqual({
        accountId,
        balance: 5000,
        totalInvested: 0,
        holdings: [],
      });
    });

    it('should return holdings as array', () => {
      const balance = service.getBalance(accountId);

      expect(Array.isArray(balance.holdings)).toBe(true);
    });

    it('should throw NotFoundException for invalid account', () => {
      expect(() => service.getBalance('invalid-id')).toThrow(
        NotFoundException,
      );
    });
  });

  describe('checkAndDeductBalance', () => {
    let accountId: string;

    beforeEach(() => {
      const account = service.create({ name: 'Test', initialBalance: 10000 });
      accountId = account.id;
    });

    it('should deduct balance for BUY order', () => {
      service.checkAndDeductBalance(accountId, 2000, OrderType.BUY);
      const account = service.findOne(accountId);

      expect(account.balance).toBe(8000);
      expect(account.totalInvested).toBe(2000);
    });

    it('should add balance for SELL order', () => {
      // First invest some money
      service.checkAndDeductBalance(accountId, 3000, OrderType.BUY);

      // Then sell
      service.checkAndDeductBalance(accountId, 1500, OrderType.SELL);
      const account = service.findOne(accountId);

      expect(account.balance).toBe(8500);
      expect(account.totalInvested).toBe(1500);
    });

    it('should throw BadRequestException for insufficient balance on BUY', () => {
      expect(() =>
        service.checkAndDeductBalance(accountId, 15000, OrderType.BUY),
      ).toThrow(BadRequestException);
      expect(() =>
        service.checkAndDeductBalance(accountId, 15000, OrderType.BUY),
      ).toThrow('Insufficient balance: required $15000, available $10000');
    });

    it('should emit balance.updated event for BUY', () => {
      service.checkAndDeductBalance(accountId, 2000, OrderType.BUY);

      expect(mockEventsService.emitBalanceUpdated).toHaveBeenCalledWith({
        data: {
          accountId,
          previousBalance: 10000,
          newBalance: 8000,
          amount: 2000,
          operation: 'ORDER_BUY',
        },
      });
    });

    it('should emit balance.updated event for SELL', () => {
      service.checkAndDeductBalance(accountId, 1000, OrderType.SELL);

      expect(mockEventsService.emitBalanceUpdated).toHaveBeenCalledWith({
        data: {
          accountId,
          previousBalance: 10000,
          newBalance: 11000,
          amount: 1000,
          operation: 'ORDER_SELL',
        },
      });
    });

    it('should round amounts to 2 decimals', () => {
      service.checkAndDeductBalance(accountId, 1000.999, OrderType.BUY);
      const account = service.findOne(accountId);

      expect(account.balance).toBe(8999.0);
      expect(account.totalInvested).toBe(1001.0);
    });
  });

  describe('updateHoldings', () => {
    let accountId: string;

    beforeEach(() => {
      const account = service.create({ name: 'Test', initialBalance: 10000 });
      accountId = account.id;
    });

    it('should add holdings for BUY order', () => {
      const items = [
        { symbol: 'AAPL', amount: 1000, shares: 10 },
        { symbol: 'TSLA', amount: 500, shares: 5 },
      ];

      service.updateHoldings(accountId, items, OrderType.BUY);
      const account = service.findOne(accountId);

      expect(account.holdings.get('AAPL')).toBe(10);
      expect(account.holdings.get('TSLA')).toBe(5);
    });

    it('should subtract holdings for SELL order', () => {
      // First buy
      const buyItems = [{ symbol: 'AAPL', amount: 1000, shares: 10 }];
      service.updateHoldings(accountId, buyItems, OrderType.BUY);

      // Then sell
      const sellItems = [{ symbol: 'AAPL', amount: 300, shares: 3 }];
      service.updateHoldings(accountId, sellItems, OrderType.SELL);

      const account = service.findOne(accountId);
      expect(account.holdings.get('AAPL')).toBe(7);
    });

    it('should remove holding when shares reach zero', () => {
      // Buy 10 shares
      service.updateHoldings(
        accountId,
        [{ symbol: 'AAPL', amount: 1000, shares: 10 }],
        OrderType.BUY,
      );

      // Sell all 10 shares
      service.updateHoldings(
        accountId,
        [{ symbol: 'AAPL', amount: 1000, shares: 10 }],
        OrderType.SELL,
      );

      const account = service.findOne(accountId);
      expect(account.holdings.has('AAPL')).toBe(false);
    });

    it('should handle fractional shares', () => {
      const items = [{ symbol: 'AAPL', amount: 100, shares: 2.567 }];

      service.updateHoldings(accountId, items, OrderType.BUY);
      const account = service.findOne(accountId);

      expect(account.holdings.get('AAPL')).toBe(2.567);
    });

    it('should round shares to 3 decimals', () => {
      const items = [{ symbol: 'AAPL', amount: 100, shares: 2.56789 }];

      service.updateHoldings(accountId, items, OrderType.BUY);
      const account = service.findOne(accountId);

      expect(account.holdings.get('AAPL')).toBe(2.568);
    });

    it('should emit holdings.updated event for each stock', () => {
      const items = [
        { symbol: 'AAPL', amount: 1000, shares: 10 },
        { symbol: 'TSLA', amount: 500, shares: 5 },
      ];

      service.updateHoldings(accountId, items, OrderType.BUY);

      expect(mockEventsService.emitHoldingsUpdated).toHaveBeenCalledTimes(2);
      expect(mockEventsService.emitHoldingsUpdated).toHaveBeenCalledWith({
        data: {
          accountId,
          symbol: 'AAPL',
          previousShares: 0,
          newShares: 10,
          orderType: OrderType.BUY,
        },
      });
      expect(mockEventsService.emitHoldingsUpdated).toHaveBeenCalledWith({
        data: {
          accountId,
          symbol: 'TSLA',
          previousShares: 0,
          newShares: 5,
          orderType: OrderType.BUY,
        },
      });
    });

    it('should accumulate holdings across multiple orders', () => {
      service.updateHoldings(
        accountId,
        [{ symbol: 'AAPL', amount: 1000, shares: 10 }],
        OrderType.BUY,
      );
      service.updateHoldings(
        accountId,
        [{ symbol: 'AAPL', amount: 500, shares: 5 }],
        OrderType.BUY,
      );

      const account = service.findOne(accountId);
      expect(account.holdings.get('AAPL')).toBe(15);
    });
  });

  describe('checkSufficientShares', () => {
    let accountId: string;

    beforeEach(() => {
      const account = service.create({ name: 'Test', initialBalance: 10000 });
      accountId = account.id;

      // Add some initial holdings
      service.updateHoldings(
        accountId,
        [
          { symbol: 'AAPL', amount: 1000, shares: 10 },
          { symbol: 'TSLA', amount: 500, shares: 5 },
        ],
        'BUY',
      );
    });

    it('should not throw when sufficient shares exist', () => {
      const items = [{ symbol: 'AAPL', amount: 300, shares: 3 }];

      expect(() =>
        service.checkSufficientShares(accountId, items),
      ).not.toThrow();
    });

    it('should throw BadRequestException for insufficient shares', () => {
      const items = [{ symbol: 'AAPL', amount: 1500, shares: 15 }];

      expect(() => service.checkSufficientShares(accountId, items)).toThrow(
        BadRequestException,
      );
      expect(() => service.checkSufficientShares(accountId, items)).toThrow(
        'Insufficient shares for AAPL: requested 15, held 10',
      );
    });

    it('should throw BadRequestException for non-existent stock', () => {
      const items = [{ symbol: 'GOOGL', amount: 100, shares: 1 }];

      expect(() => service.checkSufficientShares(accountId, items)).toThrow(
        BadRequestException,
      );
      expect(() => service.checkSufficientShares(accountId, items)).toThrow(
        'Insufficient shares for GOOGL: requested 1, held 0',
      );
    });

    it('should allow selling exact number of shares held', () => {
      const items = [{ symbol: 'AAPL', amount: 1000, shares: 10 }];

      expect(() =>
        service.checkSufficientShares(accountId, items),
      ).not.toThrow();
    });

    it('should check multiple stocks', () => {
      const items = [
        { symbol: 'AAPL', amount: 300, shares: 3 },
        { symbol: 'TSLA', amount: 500, shares: 5 },
      ];

      expect(() =>
        service.checkSufficientShares(accountId, items),
      ).not.toThrow();
    });

    it('should fail if any stock has insufficient shares', () => {
      const items = [
        { symbol: 'AAPL', amount: 300, shares: 3 }, // OK
        { symbol: 'TSLA', amount: 600, shares: 6 }, // Insufficient (only have 5)
      ];

      expect(() => service.checkSufficientShares(accountId, items)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('Integration: Full workflow', () => {
    it('should handle complete trading workflow', () => {
      // 1. Create account
      const account = service.create({ name: 'Trader', initialBalance: 10000 });
      const accountId = account.id;

      // 2. Deposit additional funds
      service.deposit(accountId, 5000);
      expect(service.findOne(accountId).balance).toBe(15000);

      // 3. Execute BUY order
      service.checkAndDeductBalance(accountId, 5000, OrderType.BUY);
      service.updateHoldings(
        accountId,
        [
          { symbol: 'AAPL', amount: 3000, shares: 30 },
          { symbol: 'TSLA', amount: 2000, shares: 20 },
        ],
        OrderType.BUY,
      );

      const afterBuy = service.findOne(accountId);
      expect(afterBuy.balance).toBe(10000);
      expect(afterBuy.totalInvested).toBe(5000);
      expect(afterBuy.holdings.get('AAPL')).toBe(30);
      expect(afterBuy.holdings.get('TSLA')).toBe(20);

      // 4. Execute SELL order
      service.checkSufficientShares(accountId, [
        { symbol: 'AAPL', amount: 1000, shares: 10 },
      ]);
      service.checkAndDeductBalance(accountId, 1000, OrderType.SELL);
      service.updateHoldings(
        accountId,
        [{ symbol: 'AAPL', amount: 1000, shares: 10 }],
        OrderType.SELL,
      );

      const afterSell = service.findOne(accountId);
      expect(afterSell.balance).toBe(11000);
      expect(afterSell.totalInvested).toBe(4000);
      expect(afterSell.holdings.get('AAPL')).toBe(20);

      // 5. Withdraw profits
      service.withdraw(accountId, 1000);
      expect(service.findOne(accountId).balance).toBe(10000);

      // 6. Get final balance
      const balance = service.getBalance(accountId);
      expect(balance.balance).toBe(10000);
      expect(balance.totalInvested).toBe(4000);
      expect(balance.holdings).toHaveLength(2);
      expect(balance.holdings).toContainEqual({
        symbol: 'AAPL',
        shares: 20,
      });
      expect(balance.holdings).toContainEqual({
        symbol: 'TSLA',
        shares: 20,
      });
    });
  });
});
