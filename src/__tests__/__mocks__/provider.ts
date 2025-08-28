/**
 * Mock implementation of provider module for testing
 * Prevents real API calls that cause timeouts
 */

import { createTinkoffPrice } from '../__fixtures__/market-data';

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
};

// Helper to get response or throw error
const getResponse = (methodName: string, defaultResponse: any) => {
  // Check for global failure
  if (mockState.shouldFail) {
    throw new Error(`Mock ${mockState.errorType} error`);
  }
  
  return mockState.customResponses[methodName] || defaultResponse;
};

// Mock function implementation
const mockFn = (implementation: Function) => {
  const fn = (...args: any[]) => implementation(...args);
  (fn as any).mockClear = () => {};
  (fn as any).mockReset = () => {};
  return fn;
};

// Mock provider functions
export const getLastPrice = mockFn(async (figi: string) => {
  trackCall('getLastPrice', [figi]);
  return getResponse('getLastPrice', createTinkoffPrice(100));
});

export const generateOrders = mockFn(async (wallet: any) => {
  trackCall('generateOrders', [wallet]);
  return getResponse('generateOrders', undefined);
});

export const getAccountId = mockFn(async (type: any) => {
  trackCall('getAccountId', [type]);
  return getResponse('getAccountId', 'test-account-id');
});

export const getInstruments = mockFn(async () => {
  trackCall('getInstruments', []);
  return getResponse('getInstruments', undefined);
});

export const getPositionsCycle = mockFn(async (options?: { runOnce?: boolean }) => {
  trackCall('getPositionsCycle', [options]);
  return getResponse('getPositionsCycle', undefined);
});

export const isExchangeOpenNow = mockFn(async (exchange: string = 'MOEX') => {
  trackCall('isExchangeOpenNow', [exchange]);
  return getResponse('isExchangeOpenNow', true);
});

// Mock control functions for tests
export const mockProviderControls = {
  // Reset all mock state
  reset: () => {
    mockState = {
      shouldFail: false,
      errorType: 'networkTimeout',
      customResponses: {},
      callCounts: {},
      lastCallArgs: {},
    };
  },
  
  // Enable/disable success mode
  setSuccess: () => {
    mockState.shouldFail = false;
  },
  
  // Configure custom response for specific method
  setResponse: (method: string, response: any) => {
    mockState.customResponses[method] = response;
  },
  
  // Configure multiple responses
  setResponses: (responses: Record<string, any>) => {
    mockState.customResponses = { ...mockState.customResponses, ...responses };
  },
  
  // Simulate network timeout
  simulateTimeout: () => {
    mockState.shouldFail = true;
    mockState.errorType = 'networkTimeout';
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
};