import type { OrderStatus, OrderType } from '../enums/order.enums';

export interface OrderItem {
  symbol: string;
  amount: number;
  shares: number;
}

export interface StockHolding {
  symbol: string;
  shares: number;
  totalInvested: number;
  totalSold: number;
  netAmount: number;
}

export interface HoldingsSummary {
  holdings: StockHolding[];
  totalInvested: number;
  totalSold: number;
  netAmount: number;
}

export interface Order {
  id: string;
  userId: string;
  orderType: OrderType;
  totalAmount: number;
  items: OrderItem[];
  executeOn: string;
  status: OrderStatus;
  createdAt: string;
}
