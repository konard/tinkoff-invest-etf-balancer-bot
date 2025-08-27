import { TinkoffNumber, Ohlcv } from '../../types.d';

/**
 * Test fixtures for market data
 * Used for testing API responses, price calculations, and market data processing
 */

// Helper to create Tinkoff price format
export const createTinkoffPrice = (units: number, nano: number = 0): TinkoffNumber => ({
  units,
  nano,
  currency: 'RUB',
});

// Current market prices for testing
export const mockCurrentPrices = {
  TRUR: createTinkoffPrice(100, 500000000), // 100.5 RUB
  TMOS: createTinkoffPrice(200, 250000000), // 200.25 RUB
  TGLD: createTinkoffPrice(500, 750000000), // 500.75 RUB
  TRAY: createTinkoffPrice(150, 333000000), // 150.333 RUB
  TRND: createTinkoffPrice(80, 900000000),  // 80.9 RUB
  TLCB: createTinkoffPrice(120, 120000000), // 120.12 RUB
  TOFZ: createTinkoffPrice(300, 450000000), // 300.45 RUB
  TBRU: createTinkoffPrice(75, 800000000),  // 75.8 RUB
  TMON: createTinkoffPrice(180, 600000000), // 180.6 RUB
  TITR: createTinkoffPrice(250, 100000000), // 250.1 RUB
  TDIV: createTinkoffPrice(90, 950000000),  // 90.95 RUB
  RUB: createTinkoffPrice(1, 0),           // 1.0 RUB
};

// Historical price data for backtesting
export const mockHistoricalPrices = {
  TRUR: [
    { date: '2024-01-01', price: createTinkoffPrice(95, 0) },
    { date: '2024-01-02', price: createTinkoffPrice(96, 500000000) },
    { date: '2024-01-03', price: createTinkoffPrice(98, 0) },
    { date: '2024-01-04', price: createTinkoffPrice(99, 250000000) },
    { date: '2024-01-05', price: createTinkoffPrice(100, 500000000) },
  ],
  
  TMOS: [
    { date: '2024-01-01', price: createTinkoffPrice(190, 0) },
    { date: '2024-01-02', price: createTinkoffPrice(195, 0) },
    { date: '2024-01-03', price: createTinkoffPrice(198, 500000000) },
    { date: '2024-01-04', price: createTinkoffPrice(199, 0) },
    { date: '2024-01-05', price: createTinkoffPrice(200, 250000000) },
  ],
};

// OHLCV data for candle testing
export const mockOhlcvData: Record<string, Ohlcv[]> = {
  TRUR: [
    {
      open: 100,
      high: 102,
      low: 99,
      close: 101,
      volume: 1000000,
      time: new Date('2024-01-01T10:00:00Z'),
      isComplete: true,
    },
    {
      open: 101,
      high: 103,
      low: 100.5,
      close: 102.5,
      volume: 850000,
      time: new Date('2024-01-01T11:00:00Z'),
      isComplete: true,
    },
    {
      open: 102.5,
      high: 104,
      low: 102,
      close: 103.5,
      volume: 950000,
      time: new Date('2024-01-01T12:00:00Z'),
      isComplete: false, // Current candle
    },
  ],
  
  TMOS: [
    {
      open: 200,
      high: 205,
      low: 198,
      close: 203,
      volume: 500000,
      time: new Date('2024-01-01T10:00:00Z'),
      isComplete: true,
    },
    {
      open: 203,
      high: 207,
      low: 201,
      close: 205,
      volume: 600000,
      time: new Date('2024-01-01T11:00:00Z'),
      isComplete: true,
    },
  ],
};

// Market capitalization data
export const mockMarketCapData = {
  TRUR: {
    marketCap: 50000000000, // 50B RUB
    sharesOutstanding: 500000000,
    freeFloat: 0.85,
  },
  
  TMOS: {
    marketCap: 30000000000, // 30B RUB
    sharesOutstanding: 150000000,
    freeFloat: 0.90,
  },
  
  TGLD: {
    marketCap: 20000000000, // 20B RUB
    sharesOutstanding: 40000000,
    freeFloat: 0.95,
  },
  
  TRAY: {
    marketCap: 25000000000, // 25B RUB
    sharesOutstanding: 166666667,
    freeFloat: 0.80,
  },
  
  TRND: {
    marketCap: 8000000000, // 8B RUB
    sharesOutstanding: 100000000,
    freeFloat: 0.75,
  },
};

// AUM (Assets Under Management) data
export const mockAumData = {
  TRUR: {
    aum: 15000000000, // 15B RUB
    navPerShare: 30,
    totalShares: 500000000,
  },
  
  TMOS: {
    aum: 12000000000, // 12B RUB
    navPerShare: 80,
    totalShares: 150000000,
  },
  
  TGLD: {
    aum: 8000000000, // 8B RUB
    navPerShare: 200,
    totalShares: 40000000,
  },
  
  TRAY: {
    aum: 10000000000, // 10B RUB
    navPerShare: 60,
    totalShares: 166666667,
  },
  
  TRND: {
    aum: 3000000000, // 3B RUB
    navPerShare: 30,
    totalShares: 100000000,
  },
};

// News sentiment data for decorrelation testing
export const mockNewsData = {
  TRUR: {
    sentiment: 0.7, // Positive
    mentions: 150,
    lastUpdate: new Date('2024-01-01T12:00:00Z'),
  },
  
  TMOS: {
    sentiment: -0.3, // Negative
    mentions: 89,
    lastUpdate: new Date('2024-01-01T11:30:00Z'),
  },
  
  TGLD: {
    sentiment: 0.1, // Neutral
    mentions: 45,
    lastUpdate: new Date('2024-01-01T10:15:00Z'),
  },
  
  TRAY: {
    sentiment: 0.4, // Positive
    mentions: 67,
    lastUpdate: new Date('2024-01-01T09:45:00Z'),
  },
};

// API response fixtures
export const mockApiResponses = {
  // Successful portfolio response
  portfolioSuccess: {
    totalAmountShares: createTinkoffPrice(1000000, 0),
    totalAmountBonds: createTinkoffPrice(0, 0),
    totalAmountEtf: createTinkoffPrice(500000, 0),
    totalAmountCurrencies: createTinkoffPrice(50000, 0),
    totalAmountFutures: createTinkoffPrice(0, 0),
    expectedYield: createTinkoffPrice(25000, 0),
    positions: [
      {
        figi: 'BBG004S68614',
        instrumentType: 'etf',
        quantity: { units: 1000, nano: 0 },
        averagePositionPrice: createTinkoffPrice(100, 0),
        expectedYield: createTinkoffPrice(5000, 0),
        currentNkd: createTinkoffPrice(0, 0),
        averagePositionPricePt: createTinkoffPrice(0, 0),
        currentPrice: createTinkoffPrice(105, 0),
        averagePositionPriceFifo: createTinkoffPrice(100, 0),
        quantityLots: { units: 100, nano: 0 },
      },
    ],
  },
  
  // Error response
  portfolioError: {
    code: 'UNAUTHENTICATED',
    message: 'Invalid token',
    details: [],
  },
  
  // Empty portfolio response
  portfolioEmpty: {
    totalAmountShares: createTinkoffPrice(0, 0),
    totalAmountBonds: createTinkoffPrice(0, 0),
    totalAmountEtf: createTinkoffPrice(0, 0),
    totalAmountCurrencies: createTinkoffPrice(50000, 0),
    totalAmountFutures: createTinkoffPrice(0, 0),
    expectedYield: createTinkoffPrice(0, 0),
    positions: [],
  },
  
  // Instruments response
  instrumentsSuccess: [
    {
      figi: 'BBG004S68614',
      ticker: 'TRUR',
      name: 'Tinkoff Russian ETF',
      lot: 10,
      currency: 'rub',
      exchange: 'MOEX',
      tradingStatus: 'SECURITY_TRADING_STATUS_NORMAL_TRADING',
    },
    {
      figi: 'BBG004S68B31',
      ticker: 'TMOS',
      name: 'Tinkoff Moscow ETF',
      lot: 1,
      currency: 'rub',
      exchange: 'MOEX',
      tradingStatus: 'SECURITY_TRADING_STATUS_NORMAL_TRADING',
    },
  ],
  
  // Last prices response
  lastPricesSuccess: {
    lastPrices: [
      {
        figi: 'BBG004S68614',
        price: mockCurrentPrices.TRUR,
        time: new Date('2024-01-01T12:00:00Z'),
      },
      {
        figi: 'BBG004S68B31',
        price: mockCurrentPrices.TMOS,
        time: new Date('2024-01-01T12:00:00Z'),
      },
    ],
  },
  
  // Order execution response
  orderSuccess: {
    orderId: 'order_123456',
    executionReportStatus: 'EXECUTION_REPORT_STATUS_FILL',
    lotsRequested: 10,
    lotsExecuted: 10,
    initialOrderPrice: mockCurrentPrices.TRUR,
    executedOrderPrice: mockCurrentPrices.TRUR,
    totalOrderAmount: createTinkoffPrice(1005, 0),
    initialCommission: createTinkoffPrice(5, 0),
    executedCommission: createTinkoffPrice(5, 0),
    aci: createTinkoffPrice(0, 0),
    direction: 'ORDER_DIRECTION_BUY',
    initialSecurityPrice: mockCurrentPrices.TRUR,
    figi: 'BBG004S68614',
    instrumentUid: 'uid_123',
  },
  
  // Order rejection response
  orderRejected: {
    orderId: 'order_789',
    executionReportStatus: 'EXECUTION_REPORT_STATUS_REJECTED',
    rejectReason: 'Insufficient funds',
  },
};

// Exchange status data
export const mockExchangeData = {
  open: {
    exchange: 'MOEX',
    status: 'EXCHANGE_STATUS_OPEN',
    startTime: new Date('2024-01-01T09:00:00Z'),
    endTime: new Date('2024-01-01T18:00:00Z'),
  },
  
  closed: {
    exchange: 'MOEX',
    status: 'EXCHANGE_STATUS_CLOSED',
    startTime: new Date('2024-01-01T18:00:00Z'),
    endTime: new Date('2024-01-02T09:00:00Z'),
  },
  
  weekend: {
    exchange: 'MOEX',
    status: 'EXCHANGE_STATUS_WEEKEND',
    startTime: new Date('2024-01-06T18:00:00Z'),
    endTime: new Date('2024-01-08T09:00:00Z'),
  },
};

// Performance test data
export const performanceTestData = {
  // Large portfolio for performance testing
  largePortfolio: Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [
      `TICKER${i.toString().padStart(3, '0')}`,
      createTinkoffPrice(100 + i, Math.floor(Math.random() * 1000000000))
    ])
  ),
  
  // Deep market data
  deepMarketData: Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [
      `TICKER${i.toString().padStart(3, '0')}`,
      {
        marketCap: (10 + i) * 1000000000,
        aum: (5 + i) * 1000000000,
        shares: (1 + i) * 1000000,
        sentiment: (Math.random() - 0.5) * 2, // -1 to 1
      }
    ])
  ),
};

// Error scenarios for API testing
export const errorScenarios = {
  networkTimeout: {
    code: 'DEADLINE_EXCEEDED',
    message: 'Request timed out',
  },
  
  rateLimited: {
    code: 'RESOURCE_EXHAUSTED',
    message: 'Rate limit exceeded',
  },
  
  unauthorized: {
    code: 'UNAUTHENTICATED',
    message: 'Invalid authentication credentials',
  },
  
  forbidden: {
    code: 'PERMISSION_DENIED',
    message: 'Insufficient permissions',
  },
  
  notFound: {
    code: 'NOT_FOUND',
    message: 'Instrument not found',
  },
  
  internalError: {
    code: 'INTERNAL',
    message: 'Internal server error',
  },
  
  invalidRequest: {
    code: 'INVALID_ARGUMENT',
    message: 'Invalid request parameters',
  },
};

// Real-time data simulation
export const mockRealtimeData = {
  priceUpdates: [
    { figi: 'BBG004S68614', price: createTinkoffPrice(100, 600000000), timestamp: Date.now() },
    { figi: 'BBG004S68B31', price: createTinkoffPrice(200, 300000000), timestamp: Date.now() + 1000 },
    { figi: 'BBG004S687G5', price: createTinkoffPrice(500, 800000000), timestamp: Date.now() + 2000 },
  ],
  
  orderBookUpdates: [
    {
      figi: 'BBG004S68614',
      depth: 10,
      bids: [
        { price: createTinkoffPrice(100, 500000000), quantity: 100 },
        { price: createTinkoffPrice(100, 400000000), quantity: 200 },
      ],
      asks: [
        { price: createTinkoffPrice(100, 600000000), quantity: 150 },
        { price: createTinkoffPrice(100, 700000000), quantity: 300 },
      ],
    },
  ],
};