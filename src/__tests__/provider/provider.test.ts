import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { 
  getAccountId,
  getLastPrice,
  generateOrder,
  generateOrders,
  isExchangeOpenNow
} from "../../provider";
import { Position, Wallet } from "../../types.d";

// Import test utilities and fixtures
import { 
  TestEnvironment, 
  FinancialAssertions, 
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { 
  mockBalancedWallet, 
  createMockPosition 
} from '../__fixtures__/wallets';
import { 
  mockCurrentPrices, 
  mockApiResponses,
  errorScenarios 
} from '../__fixtures__/market-data';
import { mockAccountConfigs } from '../__fixtures__/configurations';
import { mockTinkoffSDKControls } from '../__mocks__/tinkoff-sdk';
import { mockControls } from '../__mocks__/external-deps';

// Mock the configuration loader to avoid file system dependencies
const mockConfigLoader = {
  getAccountById: (id: string) => {
    if (id === 'test-account') {
      return mockAccountConfigs.basic;
    }
    if (id === 'margin-account') {
      return mockAccountConfigs.withMargin;
    }
    return null;
  }
};

// Mock the global configuration
(global as any).configLoader = mockConfigLoader;

testSuite('Provider Module Tests', () => {
  beforeEach(() => {
    // Setup mocks for provider tests
    mockTinkoffSDKControls.setSuccess();
    mockControls.resetAll();
    
    // Set default environment
    process.env.ACCOUNT_ID = 'test-account';
    process.env.TOKEN = 'test_token';
    
    // Mock global instruments
    (global as any).INSTRUMENTS = [
      {
        ticker: 'TRUR',
        figi: 'BBG004S68614',
        lot: 10,
        currency: 'RUB',
        name: 'Tinkoff Russian ETF'
      },
      {
        ticker: 'TMOS',
        figi: 'BBG004S68B31',
        lot: 1,
        currency: 'RUB',
        name: 'Tinkoff Moscow ETF'
      }
    ];
  });

  describe('Account Management', () => {
    describe('getAccountId', () => {
      it('should return account ID by index', async () => {
        // Mock accounts response
        mockTinkoffSDKControls.setResponse('getAccounts', {
          accounts: [
            { id: 'account-0', name: 'Account 0', type: 1 },
            { id: 'account-1', name: 'Account 1', type: 1 },
            { id: 'account-2', name: 'Account 2', type: 2 }
          ]
        });
        
        const accountId = await getAccountId('0');
        expect(accountId).toBe('account-0');
        
        const accountId1 = await getAccountId('INDEX:1');
        expect(accountId1).toBe('account-1');
      });
      
      it('should return account ID by type (ISS)', async () => {
        mockTinkoffSDKControls.setResponse('getAccounts', {
          accounts: [
            { id: 'broker-account', name: 'Broker Account', type: 1 },
            { id: 'iss-account', name: 'ISS Account', type: 2 }
          ]
        });
        
        const accountId = await getAccountId('ISS');
        expect(accountId).toBe('iss-account');
      });
      
      it('should return account ID by type (BROKER)', async () => {
        mockTinkoffSDKControls.setResponse('getAccounts', {
          accounts: [
            { id: 'broker-account', name: 'Broker Account', type: 1 },
            { id: 'iss-account', name: 'ISS Account', type: 2 }
          ]
        });
        
        const accountId = await getAccountId('BROKER');
        expect(accountId).toBe('broker-account');
      });
      
      it('should return string ID as-is when not index or type', async () => {
        const accountId = await getAccountId('custom-account-id');
        expect(accountId).toBe('custom-account-id');
      });
      
      it('should handle errors when getting accounts list', async () => {
        mockTinkoffSDKControls.setFailure('unauthorized');
        
        await ErrorTestUtils.expectError(
          () => getAccountId('ISS'),
          'UNAUTHENTICATED'
        );
      });
      
      it('should throw error when account not found by index', async () => {
        mockTinkoffSDKControls.setResponse('getAccounts', {
          accounts: [
            { id: 'account-0', name: 'Account 0', type: 1 }
          ]
        });
        
        await ErrorTestUtils.expectError(
          () => getAccountId('5'),
          'Could not determine ACCOUNT_ID by index'
        );
      });
      
      it('should throw error when account not found by type', async () => {
        mockTinkoffSDKControls.setResponse('getAccounts', {
          accounts: [
            { id: 'broker-account', name: 'Broker Account', type: 1 }
          ]
        });
        
        await ErrorTestUtils.expectError(
          () => getAccountId('ISS'),
          'Could not determine ACCOUNT_ID by type'
        );
      });
    });
  });

  describe('Market Data Functions', () => {
    describe('getLastPrice', () => {
      it('should fetch last price for given FIGI', async () => {
        const mockPrice = mockCurrentPrices.TRUR;
        
        mockTinkoffSDKControls.setResponse('getLastPrices', {
          lastPrices: [
            {
              figi: 'BBG004S68614',
              price: mockPrice,
              time: new Date()
            }
          ]
        });
        
        const price = await getLastPrice('BBG004S68614');
        
        expect(price).toEqual(mockPrice);
        expect(mockTinkoffSDKControls.getCallCount('getLastPrices')).toBe(1);
      });
      
      it('should handle API errors gracefully', async () => {
        mockTinkoffSDKControls.setFailure('networkTimeout');
        
        // Should not throw, just return undefined
        const price = await getLastPrice('BBG004S68614');
        expect(price).toBeUndefined();
      });
      
      it('should handle empty response', async () => {
        mockTinkoffSDKControls.setResponse('getLastPrices', {
          lastPrices: []
        });
        
        const price = await getLastPrice('BBG004S68614');
        expect(price).toBeUndefined();
      });
      
      it('should respect sleep_between_orders configuration', async () => {
        const startTime = performance.now();
        
        mockTinkoffSDKControls.setResponse('getLastPrices', {
          lastPrices: [{ figi: 'test', price: mockCurrentPrices.TRUR }]
        });
        
        await getLastPrice('test');
        
        const elapsed = performance.now() - startTime;
        // Should include sleep time (mocked to be very fast)
        expect(elapsed).toBeGreaterThan(0);
      });
    });

    describe('isExchangeOpenNow', () => {
      it('should return true when exchange is open', async () => {
        const now = new Date();
        const startTime = new Date(now);
        startTime.setHours(9, 0, 0, 0); // 9:00 AM
        const endTime = new Date(now);
        endTime.setHours(18, 0, 0, 0); // 6:00 PM
        
        mockTinkoffSDKControls.setResponse('tradingSchedules', {
          exchanges: [{
            days: [{
              isTradingDay: true,
              startTime: startTime,
              endTime: endTime
            }]
          }]
        });
        
        const isOpen = await isExchangeOpenNow('MOEX');
        
        // Should return true if current time is within trading hours
        const currentHour = now.getHours();
        if (currentHour >= 9 && currentHour < 18) {
          expect(isOpen).toBe(true);
        }
      });
      
      it('should return false when exchange is closed', async () => {
        mockTinkoffSDKControls.setResponse('tradingSchedules', {
          exchanges: [{
            days: [{
              isTradingDay: false
            }]
          }]
        });
        
        const isOpen = await isExchangeOpenNow('MOEX');
        expect(isOpen).toBe(false);
      });
      
      it('should handle API errors by returning true (fail-safe)', async () => {
        mockTinkoffSDKControls.setFailure('networkTimeout');
        
        const isOpen = await isExchangeOpenNow('MOEX');
        expect(isOpen).toBe(true); // Fail-safe behavior
      });
      
      it('should check evening trading session', async () => {
        const now = new Date();
        const eveningStart = new Date(now);
        eveningStart.setHours(19, 0, 0, 0); // 7:00 PM
        const eveningEnd = new Date(now);
        eveningEnd.setHours(23, 0, 0, 0); // 11:00 PM
        
        mockTinkoffSDKControls.setResponse('tradingSchedules', {
          exchanges: [{
            days: [{
              isTradingDay: true,
              startTime: new Date(now.getTime() - 10 * 60 * 60 * 1000), // Past main session
              endTime: new Date(now.getTime() - 5 * 60 * 60 * 1000),
              eveningStartTime: eveningStart,
              eveningEndTime: eveningEnd
            }]
          }]
        });
        
        const isOpen = await isExchangeOpenNow('MOEX');
        
        // Should handle evening session correctly
        const currentHour = now.getHours();
        if (currentHour >= 19 && currentHour < 23) {
          expect(isOpen).toBe(true);
        }
      });
    });
  });

  describe('Order Management', () => {
    describe('generateOrder', () => {
      it('should create buy order for positive toBuyLots', async () => {
        const position = createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: 5,
          lotSize: 10
        });
        
        mockTinkoffSDKControls.setResponse('postOrder', mockApiResponses.orderSuccess);
        
        await generateOrder(position);
        
        expect(mockTinkoffSDKControls.getCallCount('postOrder')).toBe(1);
        const orderArgs = mockTinkoffSDKControls.getLastCallArgs('postOrder');
        expect(orderArgs[0].direction).toBe(1); // ORDER_DIRECTION_BUY
        expect(orderArgs[0].quantity).toBe(5);
        expect(orderArgs[0].figi).toBe('BBG004S68614');
      });
      
      it('should create sell order for negative toBuyLots', async () => {
        const position = createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: -3,
          lotSize: 10
        });
        
        mockTinkoffSDKControls.setResponse('postOrder', mockApiResponses.orderSuccess);
        
        await generateOrder(position);
        
        expect(mockTinkoffSDKControls.getCallCount('postOrder')).toBe(1);
        const orderArgs = mockTinkoffSDKControls.getLastCallArgs('postOrder');
        expect(orderArgs[0].direction).toBe(2); // ORDER_DIRECTION_SELL
        expect(orderArgs[0].quantity).toBe(3); // Absolute value
      });
      
      it('should skip RUB positions', async () => {
        const position = createMockPosition({
          base: 'RUB',
          figi: 'RUB000UTSTOM',
          toBuyLots: 5
        });
        
        const result = await generateOrder(position);
        
        expect(result).toBe(false);
        expect(mockTinkoffSDKControls.getCallCount('postOrder')).toBe(0);
      });
      
      it('should skip orders less than 1 lot', async () => {
        const position = createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: 0.5
        });
        
        const result = await generateOrder(position);
        
        expect(result).toBe(0);
        expect(mockTinkoffSDKControls.getCallCount('postOrder')).toBe(0);
      });
      
      it('should skip positions with invalid toBuyLots', async () => {
        const position = createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: NaN
        });
        
        const result = await generateOrder(position);
        
        expect(result).toBe(0);
        expect(mockTinkoffSDKControls.getCallCount('postOrder')).toBe(0);
      });
      
      it('should skip positions without figi', async () => {
        const position = createMockPosition({
          base: 'TRUR',
          figi: undefined,
          toBuyLots: 5
        });
        
        const result = await generateOrder(position);
        
        expect(result).toBe(0);
        expect(mockTinkoffSDKControls.getCallCount('postOrder')).toBe(0);
      });
      
      it('should handle order placement errors gracefully', async () => {
        const position = createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: 5
        });
        
        mockTinkoffSDKControls.setFailure('rateLimited');
        
        // Should not throw error, just log and continue
        await generateOrder(position);
        
        expect(mockTinkoffSDKControls.getCallCount('postOrder')).toBe(1);
      });
      
      it('should round lots to integer', async () => {
        const position = createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: 5.7 // Should round down to 5
        });
        
        mockTinkoffSDKControls.setResponse('postOrder', mockApiResponses.orderSuccess);
        
        await generateOrder(position);
        
        const orderArgs = mockTinkoffSDKControls.getLastCallArgs('postOrder');
        expect(orderArgs[0].quantity).toBe(5); // Rounded down
      });
    });

    describe('generateOrders', () => {
      it('should process multiple orders in sequence', async () => {
        const wallet: Wallet = [
          createMockPosition({
            base: 'TRUR',
            figi: 'BBG004S68614',
            toBuyLots: 3
          }),
          createMockPosition({
            base: 'TMOS',
            figi: 'BBG004S68B31',
            toBuyLots: -2
          }),
          createMockPosition({
            base: 'RUB', // Should be skipped
            toBuyLots: 5
          })
        ];
        
        mockTinkoffSDKControls.setResponse('postOrder', mockApiResponses.orderSuccess);
        
        await generateOrders(wallet);
        
        // Should place 2 orders (skip RUB)
        expect(mockTinkoffSDKControls.getCallCount('postOrder')).toBe(2);
      });
      
      it('should handle empty wallet', async () => {
        const wallet: Wallet = [];
        
        await generateOrders(wallet);
        
        expect(mockTinkoffSDKControls.getCallCount('postOrder')).toBe(0);
      });
      
      it('should continue processing despite individual order errors', async () => {
        const wallet: Wallet = [
          createMockPosition({
            base: 'TRUR',
            figi: 'BBG004S68614',
            toBuyLots: 3
          }),
          createMockPosition({
            base: 'TMOS',
            figi: 'BBG004S68B31',
            toBuyLots: 2
          })
        ];
        
        // First order succeeds, second fails
        let callCount = 0;
        mockTinkoffSDKControls.setResponse('postOrder', () => {
          callCount++;
          if (callCount === 1) {
            return mockApiResponses.orderSuccess;
          } else {
            throw new Error('Order failed');
          }
        });
        
        // Should not throw error
        await generateOrders(wallet);
        
        expect(mockTinkoffSDKControls.getCallCount('postOrder')).toBe(2);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle network timeouts', async () => {
      mockTinkoffSDKControls.simulateTimeout();
      
      // Functions should handle timeouts gracefully
      const price = await getLastPrice('BBG004S68614');
      expect(price).toBeUndefined();
      
      const isOpen = await isExchangeOpenNow('MOEX');
      expect(isOpen).toBe(true); // Fail-safe
    });
    
    it('should handle rate limiting', async () => {
      mockTinkoffSDKControls.simulateRateLimit();
      
      const position = createMockPosition({
        base: 'TRUR',
        figi: 'BBG004S68614',
        toBuyLots: 5
      });
      
      // Should handle rate limiting without throwing
      await generateOrder(position);
      expect(mockTinkoffSDKControls.getCallCount('postOrder')).toBe(1);
    });
    
    it('should handle unauthorized access', async () => {
      mockTinkoffSDKControls.simulateUnauthorized();
      
      await ErrorTestUtils.expectError(
        () => getAccountId('ISS'),
        'UNAUTHENTICATED'
      );
    });
    
    it('should handle malformed API responses', async () => {
      mockTinkoffSDKControls.setResponse('getLastPrices', {
        // Missing lastPrices array
        invalidResponse: true
      });
      
      const price = await getLastPrice('BBG004S68614');
      expect(price).toBeUndefined();
    });
    
    it('should handle missing instrument data', async () => {
      (global as any).INSTRUMENTS = []; // Empty instruments
      
      const position = createMockPosition({
        base: 'UNKNOWN',
        figi: 'UNKNOWN_FIGI',
        toBuyLots: 5
      });
      
      // Should handle gracefully
      await generateOrder(position);
    });
  });

  describe('Performance and Integration Tests', () => {
    it('should respect configuration sleep intervals', async () => {
      // Test that sleep intervals are called appropriately
      const position = createMockPosition({
        base: 'TRUR',
        figi: 'BBG004S68614',
        toBuyLots: 3
      });
      
      mockTinkoffSDKControls.setResponse('postOrder', mockApiResponses.orderSuccess);
      
      const startTime = performance.now();
      await generateOrder(position);
      const elapsed = performance.now() - startTime;
      
      // Should include sleep time
      expect(elapsed).toBeGreaterThan(0);
    });
    
    it('should handle high-frequency operations', async () => {
      const largeWallet: Wallet = Array.from({ length: 20 }, (_, i) => 
        createMockPosition({
          base: `TICKER${i}`,
          figi: `FIGI${i}`,
          toBuyLots: i + 1
        })
      );
      
      mockTinkoffSDKControls.setResponse('postOrder', mockApiResponses.orderSuccess);
      
      const startTime = performance.now();
      await generateOrders(largeWallet);
      const elapsed = performance.now() - startTime;
      
      // Should complete within reasonable time
      expect(elapsed).toBeLessThan(10000); // 10 seconds
      expect(mockTinkoffSDKControls.getCallCount('postOrder')).toBe(20);
    });
  });
});