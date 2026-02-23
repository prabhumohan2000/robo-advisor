export const STOCKS = {
  AAPL: {
    id: 'a1b2c3d4-0001-4000-8000-000000000001',
    symbol: 'AAPL',
    name: 'Apple Inc.',
  },
  TSLA: {
    id: 'a1b2c3d4-0002-4000-8000-000000000002',
    symbol: 'TSLA',
    name: 'Tesla Inc.',
  },
  GOOGL: {
    id: 'a1b2c3d4-0003-4000-8000-000000000003',
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
  },
  MSFT: {
    id: 'a1b2c3d4-0004-4000-8000-000000000004',
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
  },
  AMZN: {
    id: 'a1b2c3d4-0005-4000-8000-000000000005',
    symbol: 'AMZN',
    name: 'Amazon.com Inc.',
  },
} as const;

export type StockSymbol = keyof typeof STOCKS;

export const STOCK_IDS: string[] = Object.values(STOCKS).map((s) => s.id);
