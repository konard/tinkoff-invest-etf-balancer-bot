import { Wallet, Position, DesiredWallet, MarginPosition } from '../../types.d';

/**
 * Test fixtures for wallet and portfolio data
 * Used across multiple test suites to ensure consistency
 */

export const mockPrice = (units: number, nano: number = 0) => ({ units, nano });

export const createMockPosition = (overrides: Partial<Position> = {}): Position => {
  const defaults: Position = {
    base: "TRUR",
    figi: "BBG004S68614",
    amount: 1000,
    lotSize: 10,
    price: mockPrice(100),
    priceNumber: 100,
    lotPrice: mockPrice(1000),
    lotPriceNumber: 1000,
    totalPrice: mockPrice(100000),
    totalPriceNumber: 100000,
    toBuyLots: 0,
  };
  
  return { ...defaults, ...overrides };
};

// Balanced portfolio with multiple assets
export const mockBalancedWallet: Wallet = [
  createMockPosition({
    base: "TRUR",
    figi: "BBG004S68614",
    amount: 1000,
    lotSize: 10,
    price: mockPrice(100),
    priceNumber: 100,
    lotPrice: mockPrice(1000),
    lotPriceNumber: 1000,
    totalPrice: mockPrice(100000),
    totalPriceNumber: 100000,
  }),
  createMockPosition({
    base: "TMOS",
    figi: "BBG004S68B31",
    amount: 500,
    lotSize: 1,
    price: mockPrice(200),
    priceNumber: 200,
    lotPrice: mockPrice(200),
    lotPriceNumber: 200,
    totalPrice: mockPrice(100000),
    totalPriceNumber: 100000,
  }),
  createMockPosition({
    base: "TGLD",
    figi: "BBG004S687G5",
    amount: 200,
    lotSize: 1,
    price: mockPrice(500),
    priceNumber: 500,
    lotPrice: mockPrice(500),
    lotPriceNumber: 500,
    totalPrice: mockPrice(100000),
    totalPriceNumber: 100000,
  }),
  createMockPosition({
    base: "RUB",
    figi: "RUB000UTSTOM",
    amount: 50000,
    lotSize: 1,
    price: mockPrice(1),
    priceNumber: 1,
    lotPrice: mockPrice(1),
    lotPriceNumber: 1,
    totalPrice: mockPrice(50000),
    totalPriceNumber: 50000,
  }),
];

// Empty portfolio
export const mockEmptyWallet: Wallet = [];

// Single asset portfolio
export const mockSingleAssetWallet: Wallet = [
  createMockPosition({
    base: "TRUR",
    figi: "BBG004S68614",
    amount: 1000,
    lotSize: 10,
    totalPrice: mockPrice(100000),
    totalPriceNumber: 100000,
  }),
];

// Large portfolio for performance testing
export const mockLargeWallet: Wallet = [
  "TRUR", "TMOS", "TGLD", "TRAY", "TRND", "TLCB", "TOFZ", "TBRU",
  "TMON", "TITR", "TDIV", "TSPV", "TUSD", "TEUR", "TEMS", "TSPX",
  "TEUS", "TBUY", "TBEU", "TPAS", "TBIO", "TCBR", "TECH", "TSST",
  "TGRN", "TSOX", "TRAI", "TIPO", "TFNX"
].map((ticker, index) => createMockPosition({
  base: ticker,
  figi: `BBG${String(index).padStart(9, '0')}`,
  amount: 100 + index * 50,
  lotSize: index % 10 + 1,
  price: mockPrice(100 + index * 10),
  priceNumber: 100 + index * 10,
  totalPrice: mockPrice((100 + index * 50) * (100 + index * 10)),
  totalPriceNumber: (100 + index * 50) * (100 + index * 10),
}));

// Wallet with zero values for edge case testing
export const mockZeroWallet: Wallet = [
  createMockPosition({
    base: "TRUR",
    figi: "BBG004S68614",
    amount: 0,
    lotSize: 0,
    price: mockPrice(0),
    priceNumber: 0,
    totalPrice: mockPrice(0),
    totalPriceNumber: 0,
  }),
];

// Wallet with extreme values
export const mockExtremeWallet: Wallet = [
  createMockPosition({
    base: "EXTREME",
    figi: "BBG999999999",
    amount: 1000000000, // 1 billion
    lotSize: 1000000,
    price: mockPrice(1000000, 999999999),
    priceNumber: 1000000.999999999,
    totalPrice: mockPrice(1000000000000),
    totalPriceNumber: 1000000000000,
  }),
];

// Margin trading positions
export const mockMarginPosition: MarginPosition = {
  ...createMockPosition({
    base: "TRUR",
    figi: "BBG004S68614",
    amount: 2000, // Leveraged position
    totalPrice: mockPrice(200000),
    totalPriceNumber: 200000,
  }),
  isMargin: true,
  marginValue: 100000,
  leverage: 2,
  marginCall: false,
};

export const mockMarginWallet: (MarginPosition | Position)[] = [
  mockMarginPosition,
  createMockPosition({
    base: "TMOS",
    figi: "BBG004S68B31",
    amount: 500,
    totalPrice: mockPrice(100000),
    totalPriceNumber: 100000,
  }),
];

// Desired wallet configurations
export const mockDesiredWallets: Record<string, DesiredWallet> = {
  balanced: {
    TRUR: 25,
    TMOS: 25,
    TGLD: 25,
    RUB: 25,
  },
  
  concentrated: {
    TRUR: 60,
    TMOS: 30,
    RUB: 10,
  },
  
  equal: {
    TRUR: 20,
    TMOS: 20,
    TGLD: 20,
    TRAY: 20,
    RUB: 20,
  },
  
  empty: {},
  
  single: {
    TRUR: 100,
  },
  
  // For testing normalization
  unnormalized: {
    TRUR: 30,
    TMOS: 20,
    TGLD: 15,
    // Sum = 65, should be normalized to 100
  },
  
  // Large portfolio desired allocation
  diversified: Object.fromEntries(
    ["TRUR", "TMOS", "TGLD", "TRAY", "TRND", "TLCB", "TOFZ", "TBRU", "TMON", "TITR"]
      .map(ticker => [ticker, 10])
  ),
};

// Complex balancing scenarios
export const balancingScenarios = {
  // Scenario 1: Need to buy everything
  needToBuy: {
    current: [
      createMockPosition({
        base: "RUB",
        amount: 100000,
        totalPriceNumber: 100000,
      })
    ],
    desired: mockDesiredWallets.balanced,
  },
  
  // Scenario 2: Need to sell everything
  needToSell: {
    current: mockBalancedWallet,
    desired: { RUB: 100 },
  },
  
  // Scenario 3: Rebalancing required
  needRebalance: {
    current: [
      createMockPosition({
        base: "TRUR",
        amount: 2000,
        totalPriceNumber: 200000,
      }),
      createMockPosition({
        base: "TMOS",
        amount: 100,
        totalPriceNumber: 20000,
      }),
      createMockPosition({
        base: "RUB",
        amount: 10000,
        totalPriceNumber: 10000,
      })
    ],
    desired: mockDesiredWallets.balanced,
  },
  
  // Scenario 4: Already balanced
  alreadyBalanced: {
    current: mockBalancedWallet,
    desired: mockDesiredWallets.balanced,
  }
};

// Market cap and AUM test data
export const mockMarketData = {
  prices: {
    TRUR: mockPrice(100, 500000000),
    TMOS: mockPrice(200, 250000000),
    TGLD: mockPrice(500, 100000000),
    TRAY: mockPrice(150, 300000000),
    RUB: mockPrice(1, 0),
  },
  
  marketCaps: {
    TRUR: 50000000000, // 50B RUB
    TMOS: 30000000000, // 30B RUB
    TGLD: 20000000000, // 20B RUB
    TRAY: 25000000000, // 25B RUB
  },
  
  aums: {
    TRUR: 15000000000, // 15B RUB
    TMOS: 12000000000, // 12B RUB
    TGLD: 8000000000,  // 8B RUB
    TRAY: 10000000000, // 10B RUB
  },
  
  sharesOutstanding: {
    TRUR: 500000000,
    TMOS: 150000000,
    TGLD: 40000000,
    TRAY: 166666667,
  }
};

export const createMockWallet = (positions: Partial<Position>[] = []): Wallet => {
  if (positions.length === 0) {
    return [
      createMockPosition({ base: 'TRUR', totalPriceNumber: 50000 }),
      createMockPosition({ base: 'TMOS', totalPriceNumber: 30000 }),
      createMockPosition({ base: 'RUB', quote: 'RUB', totalPriceNumber: 20000 })
    ];
  }
  return positions.map(pos => createMockPosition(pos));
};

// Error scenarios for testing error handling
export const errorScenarios = {
  invalidFigi: createMockPosition({
    figi: "INVALID_FIGI",
    base: "INVALID",
  }),
  
  negativePrices: createMockPosition({
    price: mockPrice(-100),
    priceNumber: -100,
  }),
  
  missingData: {
    base: "MISSING",
    figi: "BBG000000000",
    // Missing required fields
  } as Position,
};