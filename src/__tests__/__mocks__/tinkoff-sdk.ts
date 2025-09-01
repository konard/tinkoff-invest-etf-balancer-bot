/**
 * Mock implementation of Tinkoff SDK for testing
 * Provides controllable responses for all SDK methods used in the application
 */

import { 
  mockApiResponses, 
  mockCurrentPrices, 
  errorScenarios, 
  mockExchangeData 
} from '../__fixtures__/market-data';

// Mock response state for controlling test behavior
let mockState = {
  shouldFail: false,
  errorType: 'networkTimeout',
  customResponses: {} as Record<string, any>,
  callCounts: {} as Record<string, number>,
  lastCallArgs: {} as Record<string, any[]>,
};

// Helper to track method calls
const trackCall = (methodName: string, args: any[]) => {
  mockState.callCounts[methodName] = (mockState.callCounts[methodName] || 0) + 1;
  mockState.lastCallArgs[methodName] = args;
  
  // Also track in call history for enhanced testing
  if (!mockTinkoffSDKControls.callHistory) {
    mockTinkoffSDKControls.callHistory = {};
  }
  if (!mockTinkoffSDKControls.callHistory[methodName]) {
    mockTinkoffSDKControls.callHistory[methodName] = [];
  }
  mockTinkoffSDKControls.callHistory[methodName].push(args[0] || args);
};

// Helper to get response or throw error
const getResponse = (methodName: string, defaultResponse: any) => {
  // Check for method-specific failures first
  if (mockTinkoffSDKControls.methodFailures && mockTinkoffSDKControls.methodFailures[methodName]) {
    throw mockTinkoffSDKControls.methodFailures[methodName];
  }
  
  // Check for global failure
  if (mockState.shouldFail) {
    const error = errorScenarios[mockState.errorType as keyof typeof errorScenarios];
    throw new Error(`${error.code}: ${error.message}`);
  }
  
  return mockState.customResponses[methodName] || defaultResponse;
};

// Mock SDK client
// Mock function implementation
const mockFn = (implementation: Function) => {
  const fn = (...args: any[]) => implementation(...args);
  fn.mockClear = () => {};
  fn.mockReset = () => {};
  return fn;
};

export const mockTinkoffSDK = {
  // Orders API
  orders: {
    postOrder: mockFn(async (orderRequest: any) => {
      trackCall('postOrder', [orderRequest]);
      return getResponse('postOrder', mockApiResponses.orderSuccess);
    }),
    
    getOrders: mockFn(async (accountId: string) => {
      trackCall('getOrders', [accountId]);
      return getResponse('getOrders', { orders: [] });
    }),
    
    cancelOrder: mockFn(async (accountId: string, orderId: string) => {
      trackCall('cancelOrder', [accountId, orderId]);
      return getResponse('cancelOrder', { orderId });
    }),
    
    getOrderState: mockFn(async (accountId: string, orderId: string) => {
      trackCall('getOrderState', [accountId, orderId]);
      return getResponse('getOrderState', mockApiResponses.orderSuccess);
    }),
  },

  // Market Data API
  marketData: {
    getLastPrices: mockFn(async (figis: string[]) => {
      trackCall('getLastPrices', [figis]);
      const lastPrices = figis.map(figi => ({
        figi,
        price: mockCurrentPrices.TRUR, // Default price
        time: new Date(),
      }));
      return getResponse('getLastPrices', { lastPrices });
    }),
    
    getCandles: mockFn(async (request: any) => {
      trackCall('getCandles', [request]);
      return getResponse('getCandles', { candles: [] });
    }),
    
    getOrderBook: mockFn(async (figi: string, depth: number) => {
      trackCall('getOrderBook', [figi, depth]);
      return getResponse('getOrderBook', {
        figi,
        depth,
        bids: [],
        asks: [],
        lastPrice: mockCurrentPrices.TRUR,
        closePrice: mockCurrentPrices.TRUR,
      });
    }),
    
    getTradingStatus: mockFn(async (figi: string) => {
      trackCall('getTradingStatus', [figi]);
      return getResponse('getTradingStatus', {
        figi,
        tradingStatus: 'SECURITY_TRADING_STATUS_NORMAL_TRADING',
        limitOrderAvailableFlag: true,
        marketOrderAvailableFlag: true,
      });
    }),
  },

  // Users API
  users: {
    getAccounts: mockFn(async () => {
      trackCall('getAccounts', []);
      return getResponse('getAccounts', {
        accounts: [
          {
            id: 'test-account-0',
            accountId: 'test-account-0',
            account_id: 'test-account-0',
            type: 1, // BROKER account type
            name: 'Test Broker Account',
            status: 'ACCOUNT_STATUS_OPEN',
            openedDate: new Date('2023-01-01'),
            closedDate: null,
          },
          {
            id: 'test-account-1',
            accountId: 'test-account-1',
            account_id: 'test-account-1',
            type: 2, // ISS account type
            name: 'Test IIS Account',
            status: 'ACCOUNT_STATUS_OPEN',
            openedDate: new Date('2023-01-01'),
            closedDate: null,
          },
          {
            id: 'test-account-2',
            accountId: 'test-account-2',
            account_id: 'test-account-2',
            type: 1, // BROKER account type
            name: 'Test Account 2',
            status: 'ACCOUNT_STATUS_OPEN',
            openedDate: new Date('2023-01-01'),
            closedDate: null,
          },
        ],
      });
    }),
    
    getMarginAttributes: mockFn(async (accountId: string) => {
      trackCall('getMarginAttributes', [accountId]);
      return getResponse('getMarginAttributes', {
        liquidPortfolio: mockCurrentPrices.RUB,
        startingMargin: mockCurrentPrices.RUB,
        minimalMargin: mockCurrentPrices.RUB,
        fundsSufficiencyLevel: mockCurrentPrices.RUB,
        amountOfMissingFunds: mockCurrentPrices.RUB,
      });
    }),
    
    getUserTariff: mockFn(async () => {
      trackCall('getUserTariff', []);
      return getResponse('getUserTariff', {
        unaryLimits: [],
        streamLimits: [],
      });
    }),
  },

  // Operations API
  operations: {
    getPortfolio: mockFn(async (accountId: string) => {
      trackCall('getPortfolio', [accountId]);
      return getResponse('getPortfolio', mockApiResponses.portfolioSuccess);
    }),
    
    getPositions: mockFn(async (accountId: string) => {
      trackCall('getPositions', [accountId]);
      return getResponse('getPositions', {
        money: [],
        blocked: [],
        securities: [],
        limitsLoadingInProgress: false,
        futures: [],
      });
    }),
    
    getOperations: mockFn(async (request: any) => {
      trackCall('getOperations', [request]);
      return getResponse('getOperations', { operations: [] });
    }),
    
    getOperationsByCursor: mockFn(async (request: any) => {
      trackCall('getOperationsByCursor', [request]);
      return getResponse('getOperationsByCursor', {
        hasNext: false,
        nextCursor: '',
        items: [],
      });
    }),
  },

  // Instruments API
  instruments: {
    shares: mockFn(async () => {
      trackCall('shares', []);
      return getResponse('shares', mockApiResponses.instrumentsSuccess);
    }),
    
    etfs: mockFn(async () => {
      trackCall('etfs', []);
      return getResponse('etfs', mockApiResponses.instrumentsSuccess);
    }),
    
    bonds: mockFn(async () => {
      trackCall('bonds', []);
      return getResponse('bonds', []);
    }),
    
    currencies: mockFn(async () => {
      trackCall('currencies', []);
      return getResponse('currencies', []);
    }),
    
    getInstrumentBy: mockFn(async (request: any) => {
      trackCall('getInstrumentBy', [request]);
      return getResponse('getInstrumentBy', mockApiResponses.instrumentsSuccess[0]);
    }),
    
    shareBy: mockFn(async (request: any) => {
      trackCall('shareBy', [request]);
      return getResponse('shareBy', mockApiResponses.instrumentsSuccess[0]);
    }),
    
    etfBy: mockFn(async (request: any) => {
      trackCall('etfBy', [request]);
      return getResponse('etfBy', mockApiResponses.instrumentsSuccess[0]);
    }),
    
    getTradingSchedules: mockFn(async (request: any) => {
      trackCall('getTradingSchedules', [request]);
      return getResponse('getTradingSchedules', {
        exchanges: [
          {
            exchange: 'MOEX',
            days: [
              {
                date: '2024-01-01',
                isTradingDay: true,
                startTime: '2024-01-01T10:00:00Z',
                endTime: '2024-01-01T18:45:00Z'
              }
            ]
          }
        ]
      });
    }),

    tradingSchedules: mockFn(async (request: any) => {
      trackCall('tradingSchedules', [request]);
      return getResponse('tradingSchedules', {
        exchanges: [
          {
            exchange: 'MOEX',
            days: [
              {
                date: '2024-01-01',
                isTradingDay: true,
                startTime: '2024-01-01T10:00:00Z',
                endTime: '2024-01-01T18:45:00Z'
              }
            ]
          }
        ]
      });
    }),

    futures: mockFn(async () => {
      trackCall('futures', []);
      return getResponse('futures', { instruments: [] });
    }),
  },

  // Sandbox API (for testing)
  sandbox: {
    openSandboxAccount: mockFn(async () => {
      trackCall('openSandboxAccount', []);
      return getResponse('openSandboxAccount', { accountId: 'sandbox-account' });
    }),
    
    closeSandboxAccount: mockFn(async (accountId: string) => {
      trackCall('closeSandboxAccount', [accountId]);
      return getResponse('closeSandboxAccount', {});
    }),
    
    sandboxPayIn: mockFn(async (request: any) => {
      trackCall('sandboxPayIn', [request]);
      return getResponse('sandboxPayIn', { balance: mockCurrentPrices.RUB });
    }),
  },
};

// Mock control functions for tests
export const mockTinkoffSDKControls = {
  // Call history tracking
  callHistory: {} as Record<string, any[]>,
  methodFailures: {} as Record<string, any>,
  
  // Reset all mock state
  reset: () => {
    mockState = {
      shouldFail: false,
      errorType: 'networkTimeout',
      customResponses: {},
      callCounts: {},
      lastCallArgs: {},
    };
    
    mockTinkoffSDKControls.callHistory = {};
    mockTinkoffSDKControls.methodFailures = {};
    
    // Reset all mock functions
    Object.values(mockTinkoffSDK).forEach(api => {
      Object.values(api).forEach(method => {
        if (method && typeof method.mockClear === 'function') {
          method.mockClear();
        }
      });
    });
  },
  
  // Enhanced call tracking
  getCallHistory(method: string): any[] {
    return this.callHistory[method] || [];
  },
  
  clearCallHistory() {
    this.callHistory = {};
  },
  
  // Enhanced failure handling
  setFailure: (method: string | 'all' = 'all', errorType: string = 'networkTimeout') => {
    if (method === 'all') {
      mockState.shouldFail = true;
      mockState.errorType = errorType as keyof typeof errorScenarios;
    } else {
      if (!mockTinkoffSDKControls.methodFailures) {
        mockTinkoffSDKControls.methodFailures = {};
      }
      mockTinkoffSDKControls.methodFailures[method] = mockTinkoffSDKControls.createError(errorType);
    }
  },
  
  createError(type: string) {
    switch (type) {
      case 'unauthorized':
        return { code: 16, message: 'UNAUTHENTICATED: Token is invalid' };
      case 'rate_limit':
        return { code: 8, message: 'RESOURCE_EXHAUSTED: Rate limit exceeded' };
      case 'network_error':
        return { code: 14, message: 'UNAVAILABLE: Network error' };
      default:
        return { code: 13, message: 'INTERNAL: Unknown error' };
    }
  },
  
  // Configure custom response for specific method
  setResponse: (methodPath: string, response: any) => {
    mockState.customResponses[methodPath] = response;
  },
  
  // Configure multiple responses
  setResponses: (responses: Record<string, any>) => {
    mockState.customResponses = { ...mockState.customResponses, ...responses };
  },
  
  // Get call count for method
  getCallCount: (methodName: string): number => {
    return mockState.callCounts[methodName] || 0;
  },
  
  // Get last call arguments for method
  getLastCallArgs: (methodName: string): any[] => {
    return mockState.lastCallArgs[methodName] || [];
  },
  
  // Get all call counts
  getAllCallCounts: () => ({ ...mockState.callCounts }),
  
  // Verify method was called
  wasMethodCalled: (methodName: string): boolean => {
    return (mockState.callCounts[methodName] || 0) > 0;
  },
  
  // Verify method was called with specific arguments
  wasMethodCalledWith: (methodName: string, expectedArgs: any[]): boolean => {
    const lastArgs = mockState.lastCallArgs[methodName];
    return lastArgs ? JSON.stringify(lastArgs) === JSON.stringify(expectedArgs) : false;
  },
  
  // Enable/disable success mode
  setSuccess: () => {
    mockState.shouldFail = false;
  },
  
  // Set exchange status
  setExchangeStatus: (status: 'open' | 'closed' | 'weekend') => {
    mockState.customResponses['getExchangeStatus'] = mockExchangeData[status];
  },
  
  // Simulate rate limiting
  simulateRateLimit: () => {
    mockState.shouldFail = true;
    mockState.errorType = 'rateLimited';
  },
  
  // Simulate network timeout
  simulateTimeout: () => {
    mockState.shouldFail = true;
    mockState.errorType = 'networkTimeout';
  },
  
  // Simulate unauthorized access
  simulateUnauthorized: () => {
    mockState.shouldFail = true;
    mockState.errorType = 'unauthorized';
  },
};

// Mock createSdk function that's imported by provider
export const createSdk = (token: string) => {
  return mockTinkoffSDK;
};

// Default export for easy import
export default mockTinkoffSDK;