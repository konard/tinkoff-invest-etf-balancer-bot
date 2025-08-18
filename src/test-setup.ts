// Test setup file for Bun.js
// This file is loaded before running tests

// Set up test environment
process.env.NODE_ENV = 'test';

// Mock environment variables for testing
process.env.TOKEN = 'test-token';
process.env.ACCOUNT_ID = 'test-account';

// Global test utilities
(global as any).testUtils = {
  // Helper to create mock Tinkoff numbers
  createTinkoffNumber: (value: number) => {
    const [units, nano] = value.toFixed(9).split('.').map(item => Number(item));
    return { units, nano };
  },

  // Helper to create mock positions
  createMockPosition: (base: string, amount: number, lots: number) => ({
    base,
    figi: `figi_${base}`,
    uid: `uid_${base}`,
    lot: 1,
    lotPrice: { units: amount / lots, nano: 0 },
    toBuyLots: 0,
    currentAmount: amount,
    currentLots: lots,
    currentPrice: { units: amount / lots, nano: 0 },
    desiredAmount: amount,
    desiredLots: lots,
    desiredPercentage: 25,
    currentPercentage: 25,
  }),

  // Helper to create mock wallets
  createMockWallet: (assets: string[]) => {
    return assets.map((asset, index) => 
      (global as any).testUtils.createMockPosition(asset, 1000 + index * 100, 10 + index)
    );
  },

  // Helper to wait for async operations
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  // Helper to create mock API responses
  createMockApiResponse: (data: any) => ({
    success: true,
    data,
    timestamp: new Date().toISOString()
  })
};

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };
console.log = () => {};
console.info = () => {};
console.warn = () => {};
console.error = () => {};

// Global test timeout
export const TEST_TIMEOUT = 10000;

// Test data fixtures
export const TEST_TICKERS = ['TRUR', 'TMOS', 'TBRU', 'TDIV', 'TITR', 'TLCB', 'TOFZ', 'TMON'];
export const TEST_AMOUNTS = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000];
export const TEST_LOTS = [10, 20, 30, 40, 50, 60, 70, 80];

// Export test utilities for use in tests
export const testUtils = (global as any).testUtils;
