import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import { EventsService } from '../events/events.service';
import type { OrderType } from '../orders/enums/order.enums';
import type { OrderItem } from '../orders/interfaces/order.interface';
import type { CreateAccountDto } from './dto/create-account.dto';
import type { Account, AccountBalance } from './interfaces/account.interface';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);
  private readonly accounts = new Map<string, Account>();

  constructor(private readonly eventsService: EventsService) {}

  private serializeAccount(account: Account): any {
    return {
      ...account,
      holdings: Object.fromEntries(account.holdings),
    };
  }

  create(dto: CreateAccountDto): any {
    const accountId = randomUUID();
    const now = new Date().toISOString();

    const account: Account = {
      id: accountId,
      name: dto.name,
      balance: Math.round(dto.initialBalance * 100) / 100,
      holdings: new Map<string, number>(),
      totalInvested: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.accounts.set(accountId, account);

    this.logger.log(
      `Account created: ${accountId} | Name: ${dto.name} | Initial Balance: $${account.balance}`,
    );

    return this.serializeAccount(account);
  }

  findOne(accountId: string): Account {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new NotFoundException(`Account with id ${accountId} not found`);
    }
    return account;
  }

  findOneForApi(accountId: string): any {
    const account = this.findOne(accountId);
    return this.serializeAccount(account);
  }

  findAll(): any[] {
    return Array.from(this.accounts.values()).map((account) =>
      this.serializeAccount(account),
    );
  }

  deposit(accountId: string, amount: number): any {
    const account = this.findOne(accountId);
    const previousBalance = account.balance;
    const depositAmount = Math.round(amount * 100) / 100;
    account.balance = Math.round((account.balance + depositAmount) * 100) / 100;
    account.updatedAt = new Date().toISOString();

    this.logger.log(
      `Deposit: $${depositAmount} to account ${accountId} | New Balance: $${account.balance}`,
    );
    this.eventsService.emitBalanceUpdated({
      data: {
        accountId,
        previousBalance,
        newBalance: account.balance,
        amount: depositAmount,
        operation: 'DEPOSIT',
      },
    });

    return this.serializeAccount(account);
  }

  withdraw(accountId: string, amount: number): any {
    const account = this.findOne(accountId);

    const previousBalance = account.balance;
    const withdrawAmount = Math.round(amount * 100) / 100;

    if (withdrawAmount > account.balance) {
      throw new BadRequestException(
        `Insufficient balance: requested $${withdrawAmount}, available $${account.balance}`,
      );
    }

    account.balance =
      Math.round((account.balance - withdrawAmount) * 100) / 100;
    account.updatedAt = new Date().toISOString();

    this.logger.log(
      `Withdrawal: $${withdrawAmount} from account ${accountId} | New Balance: $${account.balance}`,
    );
    this.eventsService.emitBalanceUpdated({
      data: {
        accountId,
        previousBalance,
        newBalance: account.balance,
        amount: withdrawAmount,
        operation: 'WITHDRAW',
      },
    });
    return this.serializeAccount(account);
  }

  getBalance(accountId: string): AccountBalance {
    const account = this.findOne(accountId);

    const holdings = Array.from(account.holdings.entries()).map(
      ([symbol, shares]) => ({
        symbol,
        shares,
      }),
    );

    return {
      accountId: account.id,
      balance: account.balance,
      totalInvested: account.totalInvested,
      holdings,
    };
  }
  checkAndDeductBalance(
    accountId: string,
    amount: number,
    orderType: OrderType,
  ): void {
    const account = this.findOne(accountId);
    const previousBalance = account.balance;

    if (orderType === 'BUY') {
      if (amount > account.balance) {
        throw new BadRequestException(
          `Insufficient balance: required $${amount}, available $${account.balance}`,
        );
      }
      account.balance = Math.round((account.balance - amount) * 100) / 100;
      account.totalInvested = Math.round((account.totalInvested + amount) * 100) / 100;
      this.logger.log(
        `BUY order: Deducted $${amount} from account ${accountId} | New Balance: $${account.balance}`,
      );
    } else {
      account.balance = Math.round((account.balance + amount) * 100) / 100;
      account.totalInvested = Math.round((account.totalInvested - amount) * 100) / 100;
      this.logger.log(
        `SELL order: Added $${amount} to account ${accountId} | New Balance: $${account.balance}`,
      );
    }

    account.updatedAt = new Date().toISOString();
    this.eventsService.emitBalanceUpdated({
      data: {
        accountId,
        previousBalance,
        newBalance: account.balance,
        amount,
        operation: orderType === 'BUY' ? 'ORDER_BUY' : 'ORDER_SELL',
      },
    });
  }
  updateHoldings(
    accountId: string,
    items: OrderItem[],
    orderType: OrderType,
  ): void {
    const account = this.findOne(accountId);

    for (const item of items) {
      const previousShares = account.holdings.get(item.symbol) ?? 0;
      const newShares = new Decimal(previousShares);

      const updatedShares =
        orderType === 'BUY'
          ? newShares.plus(item.shares)
          : newShares.minus(item.shares);

      const roundedShares = Math.round(updatedShares.toNumber() * 1000) / 1000;

      if (roundedShares === 0) {
        account.holdings.delete(item.symbol);
      } else {
        account.holdings.set(item.symbol, roundedShares);
      }
      this.eventsService.emitHoldingsUpdated({
        data: {
          accountId,
          symbol: item.symbol,
          previousShares,
          newShares: roundedShares,
          orderType,
        },
      });
    }

    account.updatedAt = new Date().toISOString();

    this.logger.log(
      `Holdings updated for account ${accountId} | ${orderType} | ${items.length} items`,
    );
  }

  checkSufficientShares(accountId: string, items: OrderItem[]): void {
    const account = this.findOne(accountId);

    for (const item of items) {
      const held = account.holdings.get(item.symbol) ?? 0;
      if (item.shares > held) {
        throw new BadRequestException(
          `Insufficient shares for ${item.symbol}: requested ${item.shares}, held ${held}`,
        );
      }
    }
  }
}
