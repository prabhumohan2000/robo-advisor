export interface Account {
  id: string;
  name: string;
  balance: number;
  holdings: Map<string, number>; // symbol -> shares
  totalInvested: number; // Track actual amount invested (BUY - SELL)
  createdAt: string;
  updatedAt: string;
}

export interface AccountBalance {
  accountId: string;
  balance: number;
  totalInvested: number;
  holdings: Array<{ symbol: string; shares: number }>;
}
