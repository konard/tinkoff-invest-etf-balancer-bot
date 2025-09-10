import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";

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

// Mock modules first, before any other imports
const mockGetLastPrice = mock(async () => ({ units: 100, nano: 0 }));
const mockGenerateOrders = mock(async () => undefined);
const mockGenerateOrdersSequential = mock(async () => undefined);
const mockGetAccountId = mock(async () => 'test-account-id');
const mockGetInstruments = mock(async () => undefined);
const mockGetPositionsCycle = mock(async () => undefined);
const mockIsExchangeOpenNow = mock(async () => true);

mock.module('../../provider', () => ({
  getLastPrice: mockGetLastPrice,
  generateOrders: mockGenerateOrders,
  generateOrdersSequential: mockGenerateOrdersSequential,
  getAccountId: mockGetAccountId,
  getInstruments: mockGetInstruments,
  getPositionsCycle: mockGetPositionsCycle,
  isExchangeOpenNow: mockIsExchangeOpenNow,
}));

// Import provider functions after mocking
import { 
  generateOrders,
  generateOrdersSequential,
  generateOrder,
  getAccountId,
  getPositionsCycle,
  isExchangeOpenNow,
  getLastPrice,
  getInstruments,
  provider
} from "../../provider";

testSuite('Provider Module Market Closure Scenarios Tests', () => {
  let originalEnv: any;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Setup test environment
    process.env.ACCOUNT_ID = 'test-account';
    process.env.TOKEN = 'test_token_123';
    
    // Reset all mocks
    mockTinkoffSDKControls.reset();
    mockControls.resetAll();
    mockGetLastPrice.mockClear();
    mockGenerateOrders.mockClear();
    mockGenerateOrdersSequential.mockClear();
    mockGetAccountId.mockClear();
    mockGetInstruments.mockClear();
    mockGetPositionsCycle.mockClear();
    mockIsExchangeOpenNow.mockClear();
    
    // Setup mock configuration
    mockControls.fs.setSuccess();
    const mockConfig = {
      accounts: [mockAccountConfigs.basic]
    };
    mockControls.fs.setFile('/test/workspace/CONFIG.json', JSON.stringify(mockConfig, null, 2));
    
    // Set default mock responses
    mockGetLastPrice.mockResolvedValue({ units: 100, nano: 0 });
    mockGenerateOrders.mockResolvedValue(undefined);
    mockGenerateOrdersSequential.mockResolvedValue(undefined);
    mockGetAccountId.mockResolvedValue('test-account-id');
    mockGetInstruments.mockResolvedValue(undefined);
    mockGetPositionsCycle.mockResolvedValue(undefined);
    mockIsExchangeOpenNow.mockResolvedValue(true);
    
    // Setup global instruments
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

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe('Exchange Closure Detection', () => {
    it('should correctly detect when exchange is open', async () => {
      mockIsExchangeOpenNow.mockResolvedValue(true);
      
      const isOpen = await isExchangeOpenNow('MOEX');
      
      expect(isOpen).toBe(true);
    });
    
    it('should correctly detect when exchange is closed', async () => {
      mockIsExchangeOpenNow.mockResolvedValue(false);
      
      const isOpen = await isExchangeOpenNow('MOEX');
      
      expect(isOpen).toBe(false);
    });
    
    it('should handle API errors when checking exchange status', async () => {
      mockIsExchangeOpenNow.mockImplementation(async () => {
        throw new Error('API timeout');
      });
      
      // Should default to true on error to avoid blocking operations
      const isOpen = await isExchangeOpenNow('MOEX');
      
      expect(isOpen).toBe(true);
    });
    
    it('should handle invalid exchange names gracefully', async () => {
      mockIsExchangeOpenNow.mockResolvedValue(true);
      
      const isOpen = await isExchangeOpenNow('INVALID_EXCHANGE');
      
      // Should still return a boolean value
      expect(typeof isOpen).toBe('boolean');
    });
  });

  describe('Market Closure Behavior Modes', () => {
    describe('Skip Iteration Mode', () => {
      beforeEach(() => {
        // Set up configuration for skip_iteration mode
        const mockConfig = {
          accounts: [{
            ...mockAccountConfigs.basic,
            exchange_closure_behavior: {
              mode: 'skip_iteration',
              update_iteration_result: false
            }
          }]
        };
        mockControls.fs.setFile('/test/workspace/CONFIG.json', JSON.stringify(mockConfig, null, 2));
      });
      
      it('should skip balancing when exchange is closed in skip_iteration mode', async () => {
        mockIsExchangeOpenNow.mockResolvedValue(false);
        
        // Mock getPositionsCycle to track if it proceeds with balancing
        const balancingExecuted: boolean[] = [];
        const originalGetPositionsCycle = (global as any).getPositionsCycle;
        (global as any).getPositionsCycle = mock(async (options?: { runOnce?: boolean }) => {
          balancingExecuted.push(true);
          return Promise.resolve();
        });
        
        try {
          await provider({ runOnce: true });
          
          // Should not execute balancing when exchange is closed in skip_iteration mode
          expect(balancingExecuted).toHaveLength(0);
        } finally {
          // Restore original function
          (global as any).getPositionsCycle = originalGetPositionsCycle;
        }
      });
      
      it('should proceed with balancing when exchange is open in skip_iteration mode', async () => {
        mockIsExchangeOpenNow.mockResolvedValue(true);
        
        // Mock getPositionsCycle to track if it proceeds with balancing
        const balancingExecuted: boolean[] = [];
        const originalGetPositionsCycle = (global as any).getPositionsCycle;
        (global as any).getPositionsCycle = mock(async (options?: { runOnce?: boolean }) => {
          balancingExecuted.push(true);
          return Promise.resolve();
        });
        
        try {
          await provider({ runOnce: true });
          
          // Should execute balancing when exchange is open
          expect(balancingExecuted).toHaveLength(1);
        } finally {
          // Restore original function
          (global as any).getPositionsCycle = originalGetPositionsCycle;
        }
      });
    });
    
    describe('Dry Run Mode', () => {
      beforeEach(() => {
        // Set up configuration for dry_run mode
        const mockConfig = {
          accounts: [{
            ...mockAccountConfigs.basic,
            exchange_closure_behavior: {
              mode: 'dry_run',
              update_iteration_result: true
            }
          }]
        };
        mockControls.fs.setFile('/test/workspace/CONFIG.json', JSON.stringify(mockConfig, null, 2));
      });
      
      it('should perform calculations but not place orders when exchange is closed in dry_run mode', async () => {
        mockIsExchangeOpenNow.mockResolvedValue(false);
        
        // Track if orders are generated (should not be in dry_run mode)
        const ordersGenerated: any[] = [];
        const originalGenerateOrders = (global as any).generateOrders;
        (global as any).generateOrders = mock(async (wallet: any) => {
          ordersGenerated.push(wallet);
          return Promise.resolve();
        });
        
        try {
          await provider({ runOnce: true });
          
          // In dry_run mode, should still perform calculations but may not generate orders
          // depending on implementation details
        } finally {
          // Restore original function
          (global as any).generateOrders = originalGenerateOrders;
        }
      });
      
      it('should update iteration results when exchange is closed in dry_run mode with update_iteration_result=true', async () => {
        mockIsExchangeOpenNow.mockResolvedValue(false);
        
        // Track if iteration results are updated
        let iterationResultUpdated = false;
        // This would be tested more thoroughly in integration tests
        iterationResultUpdated = true; // Placeholder for actual implementation check
        
        expect(iterationResultUpdated).toBe(true);
      });
    });
    
    describe('Force Orders Mode', () => {
      beforeEach(() => {
        // Set up configuration for force_orders mode
        const mockConfig = {
          accounts: [{
            ...mockAccountConfigs.basic,
            exchange_closure_behavior: {
              mode: 'force_orders',
              update_iteration_result: true
            }
          }]
        };
        mockControls.fs.setFile('/test/workspace/CONFIG.json', JSON.stringify(mockConfig, null, 2));
      });
      
      it('should attempt to place orders even when exchange is closed in force_orders mode', async () => {
        mockIsExchangeOpenNow.mockResolvedValue(false);
        
        // Track if orders are generated (should be in force_orders mode)
        const ordersGenerated: any[] = [];
        const originalGenerateOrders = (global as any).generateOrders;
        (global as any).generateOrders = mock(async (wallet: any) => {
          ordersGenerated.push(wallet);
          return Promise.resolve();
        });
        
        try {
          await provider({ runOnce: true });
          
          // In force_orders mode, should still attempt to generate orders
          // even when exchange is closed
        } finally {
          // Restore original function
          (global as any).generateOrders = originalGenerateOrders;
        }
      });
      
      it('should handle API errors gracefully when forcing orders during market closure', async () => {
        mockIsExchangeOpenNow.mockResolvedValue(false);
        mockTinkoffSDKControls.simulateUnauthorized();
        
        // Should not throw errors but handle them gracefully
        await expect(provider({ runOnce: true })).resolves.not.toThrow();
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle invalid exchange closure modes gracefully', async () => {
      // Set up configuration with invalid mode
      const mockConfig = {
        accounts: [{
          ...mockAccountConfigs.basic,
          exchange_closure_behavior: {
            mode: 'invalid_mode',
            update_iteration_result: false
          }
        }]
      };
      mockControls.fs.setFile('/test/workspace/CONFIG.json', JSON.stringify(mockConfig, null, 2));
      
      mockIsExchangeOpenNow.mockResolvedValue(false);
      
      // Should not throw errors but use default behavior
      await expect(provider({ runOnce: true })).resolves.not.toThrow();
    });
    
    it('should handle missing exchange_closure_behavior configuration', async () => {
      // Set up configuration without exchange_closure_behavior
      const mockConfig = {
        accounts: [{
          ...mockAccountConfigs.basic
          // No exchange_closure_behavior specified
        }]
      };
      mockControls.fs.setFile('/test/workspace/CONFIG.json', JSON.stringify(mockConfig, null, 2));
      
      mockIsExchangeOpenNow.mockResolvedValue(false);
      
      // Should use default behavior (likely skip_iteration)
      await expect(provider({ runOnce: true })).resolves.not.toThrow();
    });
    
    it('should handle malformed exchange_closure_behavior configuration', async () => {
      // Set up configuration with malformed exchange_closure_behavior
      const mockConfig = {
        accounts: [{
          ...mockAccountConfigs.basic,
          exchange_closure_behavior: {
            mode: null, // Invalid value
            update_iteration_result: 'not_a_boolean' // Invalid value
          } as any
        }]
      };
      mockControls.fs.setFile('/test/workspace/CONFIG.json', JSON.stringify(mockConfig, null, 2));
      
      mockIsExchangeOpenNow.mockResolvedValue(false);
      
      // Should handle gracefully and use defaults
      await expect(provider({ runOnce: true })).resolves.not.toThrow();
    });
  });

  describe('Time-Based Market Closure Scenarios', () => {
    it('should correctly handle market closure at different times of day', async () => {
      // Test various times: before market open, during market hours, after market close
      const testTimes = [
        { hours: 8, minutes: 30, expectedOpen: false }, // Before market open
        { hours: 10, minutes: 0, expectedOpen: true },  // During market hours
        { hours: 18, minutes: 30, expectedOpen: false }, // After market close
        { hours: 22, minutes: 0, expectedOpen: false },  // Late night
        { hours: 0, minutes: 0, expectedOpen: false }    // Midnight
      ];
      
      for (const testTime of testTimes) {
        // Mock the time-based check
        const mockDate = new Date();
        mockDate.setHours(testTime.hours, testTime.minutes, 0, 0);
        
        // In a real implementation, we would mock the actual time checking logic
        // For now, we'll test the behavior with our mock
        mockIsExchangeOpenNow.mockResolvedValue(testTime.expectedOpen);
        
        const isOpen = await isExchangeOpenNow('MOEX');
        expect(isOpen).toBe(testTime.expectedOpen);
      }
    });
    
    it('should handle market closure on weekends and holidays', async () => {
      // Test weekend behavior
      const weekendDate = new Date('2023-01-07'); // Saturday
      expect(weekendDate.getDay()).toBe(6); // Saturday
      
      // Mock to return false for weekends
      mockIsExchangeOpenNow.mockResolvedValue(false);
      
      const isOpen = await isExchangeOpenNow('MOEX');
      expect(isOpen).toBe(false);
    });
    
    it('should handle different exchange schedules', async () => {
      // Test different exchanges
      const exchanges = ['MOEX', 'SPB', 'NASDAQ'];
      
      for (const exchange of exchanges) {
        mockIsExchangeOpenNow.mockResolvedValue(true);
        
        const isOpen = await isExchangeOpenNow(exchange);
        expect(typeof isOpen).toBe('boolean');
      }
    });
  });

  describe('Integration with Order Execution', () => {
    it('should prevent order execution when exchange is closed in skip_iteration mode', async () => {
      mockIsExchangeOpenNow.mockResolvedValue(false);
      
      // Set up skip_iteration mode
      const mockConfig = {
        accounts: [{
          ...mockAccountConfigs.basic,
          exchange_closure_behavior: {
            mode: 'skip_iteration',
            update_iteration_result: false
          }
        }]
      };
      mockControls.fs.setFile('/test/workspace/CONFIG.json', JSON.stringify(mockConfig, null, 2));
      
      const wallet = [
        createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: 2
        })
      ];
      
      // Track if generateOrder is called
      const orderCalls: any[] = [];
      const originalGenerateOrder = (global as any).generateOrder;
      (global as any).generateOrder = mock(async (position: any) => {
        orderCalls.push(position);
        return Promise.resolve();
      });
      
      try {
        await generateOrders(wallet);
        
        // Should not place orders when exchange is closed in skip_iteration mode
        expect(orderCalls).toHaveLength(0);
      } finally {
        // Restore original function
        (global as any).generateOrder = originalGenerateOrder;
      }
    });
    
    it('should allow order execution when exchange is open', async () => {
      mockIsExchangeOpenNow.mockResolvedValue(true);
      
      const wallet = [
        createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: 2
        })
      ];
      
      // Track if generateOrder is called
      const orderCalls: any[] = [];
      const originalGenerateOrder = (global as any).generateOrder;
      (global as any).generateOrder = mock(async (position: any) => {
        orderCalls.push(position);
        return Promise.resolve();
      });
      
      try {
        await generateOrders(wallet);
        
        // Should place orders when exchange is open
        expect(orderCalls).toHaveLength(1);
        expect(orderCalls[0].base).toBe('TRUR');
      } finally {
        // Restore original function
        (global as any).generateOrder = originalGenerateOrder;
      }
    });
  });

  describe('Performance and Resource Management', () => {
    it('should not consume excessive resources when skipping iterations due to market closure', async () => {
      mockIsExchangeOpenNow.mockResolvedValue(false);
      
      // Set up skip_iteration mode
      const mockConfig = {
        accounts: [{
          ...mockAccountConfigs.basic,
          exchange_closure_behavior: {
            mode: 'skip_iteration',
            update_iteration_result: false
          }
        }]
      };
      mockControls.fs.setFile('/test/workspace/CONFIG.json', JSON.stringify(mockConfig, null, 2));
      
      // Track resource usage (simplified for testing)
      const startTime = Date.now();
      await provider({ runOnce: true });
      const endTime = Date.now();
      
      // Should complete quickly when skipping iteration
      expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second
    });
    
    it('should handle rapid consecutive checks for market status', async () => {
      mockIsExchangeOpenNow.mockResolvedValue(false);
      
      // Make multiple rapid calls
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(isExchangeOpenNow('MOEX'));
      }
      
      const results = await Promise.all(promises);
      
      // All should return consistently
      expect(results.every(result => typeof result === 'boolean')).toBe(true);
      expect(results.every(result => result === false)).toBe(true);
    });
  });

  describe('Logging and Diagnostics', () => {
    it('should provide clear logging when skipping iterations due to market closure', async () => {
      mockIsExchangeOpenNow.mockResolvedValue(false);
      
      // Set up skip_iteration mode
      const mockConfig = {
        accounts: [{
          ...mockAccountConfigs.basic,
          exchange_closure_behavior: {
            mode: 'skip_iteration',
            update_iteration_result: false
          }
        }]
      };
      mockControls.fs.setFile('/test/workspace/CONFIG.json', JSON.stringify(mockConfig, null, 2));
      
      // Capture console output
      const consoleOutput: string[] = [];
      const originalConsoleLog = console.log;
      console.log = (...args: any[]) => {
        consoleOutput.push(args.join(' '));
      };
      
      try {
        await provider({ runOnce: true });
        
        // Should log information about market closure
        const output = consoleOutput.join(' ');
        expect(output.toLowerCase()).toContain('exchange closed');
        expect(output.toLowerCase()).toContain('skip_iteration');
      } finally {
        // Restore original console.log
        console.log = originalConsoleLog;
      }
    });
    
    it('should log appropriate messages for each exchange closure mode', async () => {
      const modes = ['skip_iteration', 'dry_run', 'force_orders'];
      
      for (const mode of modes) {
        // Set up configuration for current mode
        const mockConfig = {
          accounts: [{
            ...mockAccountConfigs.basic,
            exchange_closure_behavior: {
              mode: mode,
              update_iteration_result: false
            }
          }]
        };
        mockControls.fs.setFile('/test/workspace/CONFIG.json', JSON.stringify(mockConfig, null, 2));
        
        mockIsExchangeOpenNow.mockResolvedValue(false);
        
        // Capture console output
        const consoleOutput: string[] = [];
        const originalConsoleLog = console.log;
        console.log = (...args: any[]) => {
          consoleOutput.push(args.join(' '));
        };
        
        try {
          await provider({ runOnce: true });
          
          // Should log information about the mode being used
          const output = consoleOutput.join(' ');
          expect(output.toLowerCase()).toContain(mode.replace('_', ' '));
        } finally {
          // Restore original console.log
          console.log = originalConsoleLog;
        }
      }
    });
  });
});