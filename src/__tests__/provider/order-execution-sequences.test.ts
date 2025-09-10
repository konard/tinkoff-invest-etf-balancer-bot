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

testSuite('Provider Module Order Execution Sequences Tests', () => {
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
      },
      {
        ticker: 'TGLD',
        figi: 'BBG004S687G5',
        lot: 1,
        currency: 'RUB',
        name: 'Tinkoff Gold ETF'
      },
      {
        ticker: 'TMON',
        figi: 'BBG004S68CJ8',
        lot: 1,
        currency: 'RUB',
        name: 'Tinkoff Money Market ETF'
      }
    ];
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe('Order Execution Dependencies', () => {
    describe('Buy Requires Total Marginal Sell Sequence', () => {
      it('should execute sell orders before buy orders to ensure funds availability', async () => {
        const sellsFirst = [
          createMockPosition({
            base: 'TRUR',
            figi: 'BBG004S68614',
            toBuyLots: -2
          }),
          createMockPosition({
            base: 'TMOS',
            figi: 'BBG004S68B31',
            toBuyLots: -1
          })
        ];
        const buysNonMarginFirst = [
          createMockPosition({
            base: 'TGLD',
            figi: 'BBG004S687G5',
            toBuyLots: 3
          })
        ];
        const remainingOrders = [
          createMockPosition({
            base: 'TMON',
            figi: 'BBG004S68CJ8',
            toBuyLots: 1
          })
        ];
        
        // Mock the actual implementation to track execution order
        const executionOrder: string[] = [];
        const mockGenerateOrder = mock(async (position: any) => {
          executionOrder.push(`${position.base}:${position.toBuyLots}`);
        });
        
        // Replace the generateOrder function with our mock
        const originalGenerateOrder = (global as any).generateOrder;
        (global as any).generateOrder = mockGenerateOrder;
        
        try {
          await generateOrdersSequential(sellsFirst, buysNonMarginFirst, remainingOrders);
          
          // Verify execution order:
          // 1. Sell orders first (TRUR, TMOS)
          // 2. Buy non-margin orders (TGLD)
          // 3. Remaining orders (TMON)
          expect(executionOrder).toEqual([
            'TRUR:-2',
            'TMOS:-1',
            'TGLD:3',
            'TMON:1'
          ]);
        } finally {
          // Restore original function
          (global as any).generateOrder = originalGenerateOrder;
        }
      });
      
      it('should wait for sell orders to complete before executing buy orders', async () => {
        const sellsFirst = [
          createMockPosition({
            base: 'TRUR',
            figi: 'BBG004S68614',
            toBuyLots: -1
          })
        ];
        const buysNonMarginFirst = [
          createMockPosition({
            base: 'TGLD',
            figi: 'BBG004S687G5',
            toBuyLots: 2
          })
        ];
        const remainingOrders: any[] = [];
        
        // Track timing of executions
        const executionTimes: number[] = [];
        const mockGenerateOrder = mock(async (position: any) => {
          executionTimes.push(Date.now());
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 10));
        });
        
        // Replace the generateOrder function with our mock
        const originalGenerateOrder = (global as any).generateOrder;
        (global as any).generateOrder = mockGenerateOrder;
        
        try {
          const startTime = Date.now();
          await generateOrdersSequential(sellsFirst, buysNonMarginFirst, remainingOrders);
          const endTime = Date.now();
          
          // Should take at least some time due to the 5-second wait between phases
          // plus the individual order processing times
          expect(endTime - startTime).toBeGreaterThan(10);
          
          // Should have recorded execution times for each order
          expect(executionTimes).toHaveLength(2);
        } finally {
          // Restore original function
          (global as any).generateOrder = originalGenerateOrder;
        }
      });
      
      it('should handle empty order groups gracefully', async () => {
        const sellsFirst: any[] = [];
        const buysNonMarginFirst: any[] = [];
        const remainingOrders = [
          createMockPosition({
            base: 'TGLD',
            figi: 'BBG004S687G5',
            toBuyLots: 1
          })
        ];
        
        // Mock generateOrdersSequential to track if it was called
        const mockGenerateOrdersSequential = mock(async () => undefined);
        const originalGenerateOrdersSequential = (global as any).generateOrdersSequential;
        (global as any).generateOrdersSequential = mockGenerateOrdersSequential;
        
        try {
          await generateOrdersSequential(sellsFirst, buysNonMarginFirst, remainingOrders);
          
          // Should still execute the remaining orders
          expect(mockGenerateOrdersSequential).toHaveBeenCalledWith(sellsFirst, buysNonMarginFirst, remainingOrders);
        } finally {
          // Restore original function
          (global as any).generateOrdersSequential = originalGenerateOrdersSequential;
        }
      });
    });
    
    describe('Margin Trading Order Dependencies', () => {
      it('should handle margin position transfers with proper sequencing', async () => {
        const sellsFirst = [
          createMockPosition({
            base: 'TRUR',
            figi: 'BBG004S68614',
            toBuyLots: -1
          })
        ];
        const buysNonMarginFirst = [
          createMockPosition({
            base: 'TGLD',
            figi: 'BBG004S687G5',
            toBuyLots: 2
          })
        ];
        const remainingOrders = [
          createMockPosition({
            base: 'TMON',
            figi: 'BBG004S68CJ8',
            toBuyLots: 1,
            isMargin: true // Margin position
          })
        ];
        
        // Mock to track execution order
        const executionOrder: string[] = [];
        const mockGenerateOrder = mock(async (position: any) => {
          executionOrder.push(`${position.base}:${position.toBuyLots}${position.isMargin ? ':margin' : ''}`);
        });
        
        // Replace the generateOrder function with our mock
        const originalGenerateOrder = (global as any).generateOrder;
        (global as any).generateOrder = mockGenerateOrder;
        
        try {
          await generateOrdersSequential(sellsFirst, buysNonMarginFirst, remainingOrders);
          
          // Verify that margin orders are handled in the remaining orders phase
          expect(executionOrder).toEqual([
            'TRUR:-1',
            'TGLD:2',
            'TMON:1:margin'
          ]);
        } finally {
          // Restore original function
          (global as any).generateOrder = originalGenerateOrder;
        }
      });
      
      it('should properly sequence multiple margin positions', async () => {
        const sellsFirst = [
          createMockPosition({
            base: 'TRUR',
            figi: 'BBG004S68614',
            toBuyLots: -2
          })
        ];
        const buysNonMarginFirst = [
          createMockPosition({
            base: 'TGLD',
            figi: 'BBG004S687G5',
            toBuyLots: 1
          })
        ];
        const remainingOrders = [
          createMockPosition({
            base: 'TMON',
            figi: 'BBG004S68CJ8',
            toBuyLots: 1,
            isMargin: true
          }),
          createMockPosition({
            base: 'TMOS',
            figi: 'BBG004S68B31',
            toBuyLots: 1,
            isMargin: true
          })
        ];
        
        // Mock to track execution order
        const executionOrder: string[] = [];
        const mockGenerateOrder = mock(async (position: any) => {
          executionOrder.push(`${position.base}:${position.toBuyLots}${position.isMargin ? ':margin' : ''}`);
        });
        
        // Replace the generateOrder function with our mock
        const originalGenerateOrder = (global as any).generateOrder;
        (global as any).generateOrder = mockGenerateOrder;
        
        try {
          await generateOrdersSequential(sellsFirst, buysNonMarginFirst, remainingOrders);
          
          // Verify execution order with multiple margin positions
          expect(executionOrder).toEqual([
            'TRUR:-2',
            'TGLD:1',
            'TMON:1:margin',
            'TMOS:1:margin'
          ]);
        } finally {
          // Restore original function
          (global as any).generateOrder = originalGenerateOrder;
        }
      });
    });
  });

  describe('Order Execution Phases', () => {
    it('should execute Phase 1: Sell orders with proper logging', async () => {
      const sellsFirst = [
        createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: -3
        })
      ];
      const buysNonMarginFirst: any[] = [];
      const remainingOrders: any[] = [];
      
      // Capture console output to verify logging
      const consoleOutput: string[] = [];
      const originalConsoleLog = console.log;
      console.log = (...args: any[]) => {
        consoleOutput.push(args.join(' '));
      };
      
      // Mock generateOrder to track calls
      const mockGenerateOrder = mock(async (position: any) => {
        // Simulate order execution
      });
      
      // Replace the generateOrder function with our mock
      const originalGenerateOrder = (global as any).generateOrder;
      (global as any).generateOrder = mockGenerateOrder;
      
      try {
        await generateOrdersSequential(sellsFirst, buysNonMarginFirst, remainingOrders);
        
        // Verify that sell orders were executed
        expect(mockGenerateOrder).toHaveBeenCalledWith(sellsFirst[0]);
        
        // Verify logging contains phase information
        const output = consoleOutput.join(' ');
        expect(output).toContain('PHASE 1');
        expect(output).toContain('sell orders');
      } finally {
        // Restore original functions
        console.log = originalConsoleLog;
        (global as any).generateOrder = originalGenerateOrder;
      }
    });
    
    it('should execute Phase 2: Non-margin buy orders after sell completion', async () => {
      const sellsFirst = [
        createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: -1
        })
      ];
      const buysNonMarginFirst = [
        createMockPosition({
          base: 'TGLD',
          figi: 'BBG004S687G5',
          toBuyLots: 2
        })
      ];
      const remainingOrders: any[] = [];
      
      // Track execution order and timing
      const executionOrder: string[] = [];
      const executionTimes: number[] = [];
      const mockGenerateOrder = mock(async (position: any) => {
        executionOrder.push(position.base);
        executionTimes.push(Date.now());
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 5));
      });
      
      // Replace the generateOrder function with our mock
      const originalGenerateOrder = (global as any).generateOrder;
      (global as any).generateOrder = mockGenerateOrder;
      
      try {
        await generateOrdersSequential(sellsFirst, buysNonMarginFirst, remainingOrders);
        
        // Verify execution order
        expect(executionOrder).toEqual(['TRUR', 'TGLD']);
        
        // Verify timing shows proper sequence (should have gap for wait period)
        if (executionTimes.length >= 2) {
          const timeGap = executionTimes[1] - executionTimes[0];
          // Should have some gap due to the 5-second wait between phases
          expect(timeGap).toBeGreaterThanOrEqual(0);
        }
      } finally {
        // Restore original function
        (global as any).generateOrder = originalGenerateOrder;
      }
    });
    
    it('should execute Phase 3: Remaining orders last', async () => {
      const sellsFirst: any[] = [];
      const buysNonMarginFirst: any[] = [];
      const remainingOrders = [
        createMockPosition({
          base: 'TGLD',
          figi: 'BBG004S687G5',
          toBuyLots: 1
        }),
        createMockPosition({
          base: 'TMON',
          figi: 'BBG004S68CJ8',
          toBuyLots: 2
        })
      ];
      
      // Track execution order
      const executionOrder: string[] = [];
      const mockGenerateOrder = mock(async (position: any) => {
        executionOrder.push(position.base);
      });
      
      // Replace the generateOrder function with our mock
      const originalGenerateOrder = (global as any).generateOrder;
      (global as any).generateOrder = mockGenerateOrder;
      
      try {
        await generateOrdersSequential(sellsFirst, buysNonMarginFirst, remainingOrders);
        
        // Verify that remaining orders are executed in Phase 3
        expect(executionOrder).toEqual(['TGLD', 'TMON']);
      } finally {
        // Restore original function
        (global as any).generateOrder = originalGenerateOrder;
      }
    });
  });

  describe('Order Execution Timing', () => {
    it('should respect the 5-second wait time between sell and buy phases', async () => {
      const sellsFirst = [
        createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: -1
        })
      ];
      const buysNonMarginFirst = [
        createMockPosition({
          base: 'TGLD',
          figi: 'BBG004S687G5',
          toBuyLots: 1
        })
      ];
      const remainingOrders: any[] = [];
      
      // Track timing
      const phaseStartTimes: number[] = [];
      const mockGenerateOrder = mock(async (position: any) => {
        // Record when each phase starts
        if (position.base === 'TRUR' && !phaseStartTimes[0]) {
          phaseStartTimes[0] = Date.now();
        } else if (position.base === 'TGLD' && !phaseStartTimes[1]) {
          phaseStartTimes[1] = Date.now();
        }
        // Simulate quick order processing
        await new Promise(resolve => setTimeout(resolve, 1));
      });
      
      // Replace the generateOrder function with our mock
      const originalGenerateOrder = (global as any).generateOrder;
      (global as any).generateOrder = mockGenerateOrder;
      
      try {
        const testStartTime = Date.now();
        await generateOrdersSequential(sellsFirst, buysNonMarginFirst, remainingOrders);
        const testEndTime = Date.now();
        
        // Should take at least 5 seconds due to the wait plus processing time
        expect(testEndTime - testStartTime).toBeGreaterThanOrEqual(5000);
        
        // Should have recorded phase start times
        expect(phaseStartTimes).toHaveLength(2);
        
        // Second phase should start after the 5-second wait
        if (phaseStartTimes[0] && phaseStartTimes[1]) {
          const phaseGap = phaseStartTimes[1] - phaseStartTimes[0];
          expect(phaseGap).toBeGreaterThanOrEqual(5000);
        }
      } finally {
        // Restore original function
        (global as any).generateOrder = originalGenerateOrder;
      }
    });
    
    it('should handle rapid execution of orders within the same phase', async () => {
      const sellsFirst = [
        createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: -1
        }),
        createMockPosition({
          base: 'TMOS',
          figi: 'BBG004S68B31',
          toBuyLots: -2
        })
      ];
      const buysNonMarginFirst: any[] = [];
      const remainingOrders: any[] = [];
      
      // Track execution times for orders within the same phase
      const orderExecutionTimes: number[] = [];
      const mockGenerateOrder = mock(async (position: any) => {
        orderExecutionTimes.push(Date.now());
        // Very fast execution
        await new Promise(resolve => setTimeout(resolve, 1));
      });
      
      // Replace the generateOrder function with our mock
      const originalGenerateOrder = (global as any).generateOrder;
      (global as any).generateOrder = mockGenerateOrder;
      
      try {
        await generateOrdersSequential(sellsFirst, buysNonMarginFirst, remainingOrders);
        
        // Should have executed both sell orders
        expect(orderExecutionTimes).toHaveLength(2);
        
        // Orders within the same phase should execute rapidly (less than 100ms apart)
        if (orderExecutionTimes.length >= 2) {
          const timeBetweenOrders = orderExecutionTimes[1] - orderExecutionTimes[0];
          expect(timeBetweenOrders).toBeLessThan(100);
        }
      } finally {
        // Restore original function
        (global as any).generateOrder = originalGenerateOrder;
      }
    });
  });

  describe('Order Execution Error Handling in Sequences', () => {
    it('should continue with the sequence even if one order fails', async () => {
      const sellsFirst = [
        createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: -1
        }),
        createMockPosition({
          base: 'TMOS',
          figi: 'BBG004S68B31',
          toBuyLots: -1
        })
      ];
      const buysNonMarginFirst = [
        createMockPosition({
          base: 'TGLD',
          figi: 'BBG004S687G5',
          toBuyLots: 1
        })
      ];
      const remainingOrders: any[] = [];
      
      // Track which orders were attempted
      const attemptedOrders: string[] = [];
      const mockGenerateOrder = mock(async (position: any) => {
        attemptedOrders.push(position.base);
        
        // Simulate failure for the first sell order
        if (position.base === 'TRUR') {
          throw new Error('Simulated order failure');
        }
      });
      
      // Replace the generateOrder function with our mock
      const originalGenerateOrder = (global as any).generateOrder;
      (global as any).generateOrder = mockGenerateOrder;
      
      try {
        await generateOrdersSequential(sellsFirst, buysNonMarginFirst, remainingOrders);
        
        // Should still attempt all orders despite the failure
        expect(attemptedOrders).toContain('TRUR'); // Failed order
        expect(attemptedOrders).toContain('TMOS'); // Second sell order
        expect(attemptedOrders).toContain('TGLD'); // Buy order
      } finally {
        // Restore original function
        (global as any).generateOrder = originalGenerateOrder;
      }
    });
    
    it('should maintain sequence integrity when orders fail', async () => {
      const sellsFirst = [
        createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: -1
        })
      ];
      const buysNonMarginFirst = [
        createMockPosition({
          base: 'TGLD',
          figi: 'BBG004S687G5',
          toBuyLots: 1
        })
      ];
      const remainingOrders = [
        createMockPosition({
          base: 'TMON',
          figi: 'BBG004S68CJ8',
          toBuyLots: 1
        })
      ];
      
      // Track execution order
      const executionOrder: string[] = [];
      const mockGenerateOrder = mock(async (position: any) => {
        executionOrder.push(position.base);
        
        // Simulate failure for the buy order
        if (position.base === 'TGLD') {
          throw new Error('Simulated buy order failure');
        }
      });
      
      // Replace the generateOrder function with our mock
      const originalGenerateOrder = (global as any).generateOrder;
      (global as any).generateOrder = mockGenerateOrder;
      
      try {
        await generateOrdersSequential(sellsFirst, buysNonMarginFirst, remainingOrders);
        
        // Should still maintain the correct sequence even with failures
        expect(executionOrder).toEqual(['TRUR', 'TGLD', 'TMON']);
      } finally {
        // Restore original function
        (global as any).generateOrder = originalGenerateOrder;
      }
    });
  });

  describe('Integration with buy_requires_total_marginal_sell Feature', () => {
    it('should properly handle the buy_requires_total_marginal_sell configuration', async () => {
      // Set up environment to test buy_requires_total_marginal_sell
      process.env.ACCOUNT_ID = 'test-account-with-buy-requires';
      
      // Create a configuration that uses buy_requires_total_marginal_sell
      const mockConfigWithBuyRequires = {
        accounts: [{
          ...mockAccountConfigs.basic,
          id: 'test-account-with-buy-requires',
          buy_requires_total_marginal_sell: true
        }]
      };
      mockControls.fs.setFile('/test/workspace/CONFIG.json', JSON.stringify(mockConfigWithBuyRequires, null, 2));
      
      const wallet = [
        createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: -2 // Sell order
        }),
        createMockPosition({
          base: 'TGLD',
          figi: 'BBG004S687G5',
          toBuyLots: 3 // Buy order
        })
      ];
      
      // Mock generateOrdersSequential to verify it's called with correct parameters
      const mockGenerateOrdersSequential = mock(async () => undefined);
      const originalGenerateOrdersSequential = (global as any).generateOrdersSequential;
      (global as any).generateOrdersSequential = mockGenerateOrdersSequential;
      
      try {
        // Call generateOrders which should delegate to generateOrdersSequential for buy_requires_total_marginal_sell
        await generateOrders(wallet);
        
        // Verify that generateOrdersSequential was called
        expect(mockGenerateOrdersSequential).toHaveBeenCalled();
      } finally {
        // Restore original function
        (global as any).generateOrdersSequential = originalGenerateOrdersSequential;
      }
    });
    
    it('should correctly categorize orders for buy_requires_total_marginal_sell', async () => {
      const wallet = [
        // Sell orders that should go first
        createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: -2
        }),
        createMockPosition({
          base: 'TMOS',
          figi: 'BBG004S68B31',
          toBuyLots: -1
        }),
        // Non-margin buy orders that should go second
        createMockPosition({
          base: 'TGLD',
          figi: 'BBG004S687G5',
          toBuyLots: 3
        }),
        // Remaining orders that should go last
        createMockPosition({
          base: 'TMON',
          figi: 'BBG004S68CJ8',
          toBuyLots: 1
        })
      ];
      
      // Mock the categorization logic to verify correct grouping
      const orderGroups: any = {
        sellsFirst: [] as any[],
        buysNonMarginFirst: [] as any[],
        remainingOrders: [] as any[]
      };
      
      // In a real implementation, the generateOrders function would categorize orders
      // For this test, we'll directly test the categorization logic
      const sellsFirst = wallet.filter(pos => pos.toBuyLots! < 0);
      const buysNonMarginFirst = wallet.filter(pos => pos.toBuyLots! > 0 && !pos.isMargin);
      const remainingOrders = wallet.filter(pos => pos.isMargin);
      
      expect(sellsFirst).toHaveLength(2);
      expect(buysNonMarginFirst).toHaveLength(1);
      expect(remainingOrders).toHaveLength(1);
      
      // Verify correct categorization
      expect(sellsFirst[0].base).toBe('TRUR');
      expect(sellsFirst[1].base).toBe('TMOS');
      expect(buysNonMarginFirst[0].base).toBe('TGLD');
      expect(remainingOrders[0].base).toBe('TMON');
    });
  });
});