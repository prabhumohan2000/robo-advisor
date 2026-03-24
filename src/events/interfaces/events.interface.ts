import type { Order } from '../../orders/interfaces/order.interface';
import type { OrderType } from '../../orders/enums/order.enums';

export enum EventType {
  ORDER_CREATED = 'order.created',
  ORDER_EXECUTED = 'order.executed',
  BALANCE_UPDATED = 'balance.updated',
  HOLDINGS_UPDATED = 'holdings.updated',
}

export interface OrderCreatedEvent {
  type: EventType.ORDER_CREATED;
  timestamp: string;
  data: {
    order: Order;
    accountId: string;
  };
}

export interface OrderExecutedEvent {
  type: EventType.ORDER_EXECUTED;
  timestamp: string;
  data: {
    orderId: string;
    accountId: string;
    executedAt: string;
  };
}

export interface BalanceUpdatedEvent {
  type: EventType.BALANCE_UPDATED;
  timestamp: string;
  data: {
    accountId: string;
    previousBalance: number;
    newBalance: number;
    amount: number;
    operation: 'DEPOSIT' | 'WITHDRAW' | 'ORDER_BUY' | 'ORDER_SELL';
  };
}

export interface HoldingsUpdatedEvent {
  type: EventType.HOLDINGS_UPDATED;
  timestamp: string;
  data: {
    accountId: string;
    symbol: string;
    previousShares: number;
    newShares: number;
    orderType: OrderType;
  };
}

export type DomainEvent =
  | OrderCreatedEvent
  | OrderExecutedEvent
  | BalanceUpdatedEvent
  | HoldingsUpdatedEvent;
