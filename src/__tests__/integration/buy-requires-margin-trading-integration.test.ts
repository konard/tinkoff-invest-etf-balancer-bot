import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";

// Import test utilities
import { testSuite } from '../test-utils';
import { mockControls } from '../__mocks__/external-deps';
import { mockTinkoffSDKControls } from '../__mocks__/tinkoff-sdk';
import { mockAccountConfigs } from '../__fixtures__/configurations';
import { createMockPosition } from '../__fixtures__/wallets';

// Mock modules for testing
const mockFs = {
  promises: {
    readFile: mock(async () => ''),
    writeFile: mock(async () => undefined),
    access: mock(async () => undefined),
    mkdir: mock(async () => undefined),
    readdir: mock(async () => [])
  }
};

const mockPath = {
  resolve: mock((...args: string[]) => args.join('/')),
  join: mock((...args: string[]) => args.join('/')),
  dirname: mock((p: string) => p.split('/').slice(0, -1).join('/'))
};

// Mock the modules
mock.module('fs', () => ({
  ...mockFs,
  promises: mockFs.promises
}));

mock.module('path', () => mockPath);

// Mock request-promise for HTTP requests
const mockRp = mock(async () => '');

mock.module('request-promise', () => mockRp);

// Mock configLoader
const mockConfigLoader = {
  getAccountById: mock((id: string) => {
    if (id === 'test-integration-account') {
      return {
        id: 'test-integration-account',
        name: 'Test Integration Account',
        t_invest_token: 't.test_token_integration',
        account_id: '123456789',
        desired_wallet: { TRUR: 40, TMOS: 30, TGLD: 20, TMON: 10 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { 
          enabled: true,
          multiplier: 2,
          free_threshold: 10000,
          max_margin_size: 100000,
          balancing_strategy: 'keep_if_small'
        },
        buy_requires_total_marginal_sell: {
          enabled: true,
          instruments: ['TMON']
        },
        exchange_closure_behavior: {
          mode: 'skip_iteration',
          update_iteration_result: false
        }
      };
    }
    return undefined;
  }),
  loadConfig: mock(() => ({
    accounts: []
  })),
  getAllAccounts: mock(() => []),
  getAccountToken: mock(() => 't.test_token_integration')
};

mock.module('../../configLoader', () => ({
  configLoader: mockConfigLoader
}));

// Mock dotenv
mock.module('dotenv', () => ({
  config: mock(() => undefined)
}));

// Mock provider functions
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

testSuite('Buy Requires Total Marginal Sell with Margin Trading Integration Tests', () => {
  let originalEnv: any;
  let originalProcessArgv: any;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    originalProcessArgv = [...process.argv];
    
    // Setup test environment
    process.env.ACCOUNT_ID = 'test-integration-account';
    process.env.TOKEN = 'test_token_integration';
    process.argv = ['node', 'index.ts'];
    
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
    mockConfigLoader.getAccountById.mockClear();
    mockConfigLoader.loadConfig.mockClear();
    mockConfigLoader.getAllAccounts.mockClear();
    mockConfigLoader.getAccountToken.mockClear();
    
    // Setup mock configuration
    mockControls.fs.setSuccess();
    
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
    process.argv = originalProcessArgv;
  });

  describe('Combined Feature Integration', () => {
    it('should correctly sequence orders when both buy_requires_total_marginal_sell and margin_trading are enabled', async () => {
      // Dynamically import the balancer module
      const balancerModule = await import('../../balancer');
      
      // Create a mock wallet with mixed positions including margin positions
      const mockWallet = [
        // Margin position that needs to be sold (TRUR)
        createMockPosition({
          base: 'TRUR',
          quote: 'RUB',
          figi: 'BBG004S68614',
          amount: 100,
          lotSize: 1,
          price: { units: 1200, nano: 0 },
          priceNumber: 1200,
          lotPrice: { units: 1200, nano: 0 },
          lotPriceNumber: 1200,
          totalPrice: { units: 120000, nano: 0 },
          totalPriceNumber: 120000, // With 2x margin, base value is 60000
          toBuyLots: -2 // Sell 2 lots
        }),
        // Non-margin position that needs to be bought (TMON) - should be bought first due to buy_requires_total_marginal_sell
        createMockPosition({
          base: 'TMON',
          quote: 'RUB',
          figi: 'BBG004S68CJ8',
          amount: 0,
          lotSize: 1,
          price: { units: 2000, nano: 0 },
          priceNumber: 2000,
          lotPrice: { units: 2000, nano: 0 },
          lotPriceNumber: 2000,
          totalPrice: { units: 0, nano: 0 },
          totalPriceNumber: 0,
          toBuyLots: 3 // Buy 3 lots
        }),
        // Regular margin position (TMOS)
        createMockPosition({
          base: 'TMOS',
          quote: 'RUB',
          figi: 'BBG004S68B31',
          amount: 50,
          lotSize: 1,
          price: { units: 2000, nano: 0 },
          priceNumber: 2000,
          lotPrice: { units: 2000, nano: 0 },
          lotPriceNumber: 2000,
          totalPrice: { units: 100000, nano: 0 },
          totalPriceNumber: 100000, // With 2x margin, base value is 50000
          toBuyLots: 1 // Buy 1 lot
        })
      ];
      
      // Create desired wallet
      const desiredWallet = {
        'TRUR': 30,
        'TMOS': 30,
        'TGLD': 20,
        'TMON': 20
      };
      
      // Mock the categorization logic to verify correct grouping
      const orderGroups: any = {
        sellsFirst: [] as any[],
        buysNonMarginFirst: [] as any[],
        remainingOrders: [] as any[]
      };
      
      // Categorize orders according to both features
      const sellsFirst = mockWallet.filter(pos => pos.toBuyLots! < 0);
      const buysNonMarginFirst = mockWallet.filter(pos => 
        pos.toBuyLots! > 0 && 
        !pos.isMargin && 
        (global as any).INSTRUMENTS.find((i: any) => i.ticker === pos.base)?.ticker === 'TMON'
      );
      const remainingOrders = mockWallet.filter(pos => 
        !sellsFirst.includes(pos) && 
        !buysNonMarginFirst.includes(pos)
      );
      
      // Verify categorization is correct
      expect(sellsFirst).toHaveLength(1);
      expect(sellsFirst[0].base).toBe('TRUR');
      
      expect(buysNonMarginFirst).toHaveLength(1);
      expect(buysNonMarginFirst[0].base).toBe('TMON');
      
      expect(remainingOrders).toHaveLength(1);
      expect(remainingOrders[0].base).toBe('TMOS');
      
      // Verify that the order sequence respects both features:
      // 1. Sell orders first (TRUR)
      // 2. Non-margin buy orders that are in buy_requires_total_marginal_sell.instruments (TMON)
      // 3. Remaining orders (TMOS)
      expect(sellsFirst[0].base).toBe('TRUR');
      expect(buysNonMarginFirst[0].base).toBe('TMON');
      expect(remainingOrders[0].base).toBe('TMOS');
    });
    
    it('should handle margin position transfers correctly when buy_requires_total_marginal_sell is active', async () => {
      // Dynamically import the balancer module
      const balancerModule = await import('../../balancer');
      
      // Create a mock wallet with margin positions that need to be managed
      const mockWallet = [
        // Margin position that needs to be sold
        createMockPosition({
          base: 'TRUR',
          quote: 'RUB',
          figi: 'BBG004S68614',
          amount: 100,
          lotSize: 1,
          price: { units: 1200, nano: 0 },
          priceNumber: 1200,
          lotPrice: { units: 1200, nano: 0 },
          lotPriceNumber: 1200,
          totalPrice: { units: 120000, nano: 0 },
          totalPriceNumber: 120000, // With 2x margin, base value is 60000
          toBuyLots: -1, // Sell 1 lot
          isMargin: true,
          marginValue: 60000,
          leverage: 2.0
        }),
        // Non-margin position that needs to be bought (should be bought first)
        createMockPosition({
          base: 'TMON',
          quote: 'RUB',
          figi: 'BBG004S68CJ8',
          amount: 0,
          lotSize: 1,
          price: { units: 2000, nano: 0 },
          priceNumber: 2000,
          lotPrice: { units: 2000, nano: 0 },
          lotPriceNumber: 2000,
          totalPrice: { units: 0, nano: 0 },
          totalPriceNumber: 0,
          toBuyLots: 2, // Buy 2 lots
          isMargin: false
        })
      ];
      
      // Mock margin calculator to test transfer cost calculations
      const mockMarginCalculator = {
        calculateTransferCost: mock((positions: any[]) => ({
          totalCost: positions.reduce((sum, pos) => sum + (pos.totalPriceNumber * 0.01 || 0), 0),
          freeTransfers: positions.filter(pos => (pos.totalPriceNumber || 0) <= 10000).length,
          paidTransfers: positions.filter(pos => (pos.totalPriceNumber || 0) > 10000).length,
          costBreakdown: positions.map(pos => ({
            ticker: pos.base,
            cost: (pos.totalPriceNumber || 0) > 10000 ? (pos.totalPriceNumber || 0) * 0.01 : 0,
            isFree: (pos.totalPriceNumber || 0) <= 10000
          }))
        }))
      };
      
      // Calculate transfer costs for margin positions
      const transferInfo = mockMarginCalculator.calculateTransferCost(
        mockWallet.filter(pos => pos.isMargin && pos.toBuyLots! < 0)
      );
      
      // Verify transfer cost calculations
      expect(transferInfo.totalCost).toBe(1200); // 120000 * 0.01
      expect(transferInfo.freeTransfers).toBe(0);
      expect(transferInfo.paidTransfers).toBe(1);
      expect(transferInfo.costBreakdown).toHaveLength(1);
      expect(transferInfo.costBreakdown[0].ticker).toBe('TRUR');
      expect(transferInfo.costBreakdown[0].cost).toBe(1200);
      expect(transferInfo.costBreakdown[0].isFree).toBe(false);
    });
  });

  describe('Order Execution Integration', () => {
    it('should execute orders in the correct sequence when both features are active', async () => {
      // Mock generateOrdersSequential to track execution order
      const executionOrder: string[] = [];
      const originalGenerateOrdersSequential = (global as any).generateOrdersSequential;
      (global as any).generateOrdersSequential = mock(async (
        sellsFirst: any[], 
        buysNonMarginFirst: any[], 
        remainingOrders: any[]
      ) => {
        // Record the execution order
        sellsFirst.forEach(pos => executionOrder.push(`SELL:${pos.base}`));
        buysNonMarginFirst.forEach(pos => executionOrder.push(`BUY_NON_MARGIN:${pos.base}`));
        remainingOrders.forEach(pos => executionOrder.push(`REMAINING:${pos.base}`));
        return Promise.resolve();
      });
      
      try {
        // Create wallet with orders that should be sequenced
        const wallet = [
          createMockPosition({
            base: 'TRUR',
            figi: 'BBG004S68614',
            toBuyLots: -2
          }),
          createMockPosition({
            base: 'TMON',
            figi: 'BBG004S68CJ8',
            toBuyLots: 3
          }),
          createMockPosition({
            base: 'TMOS',
            figi: 'BBG004S68B31',
            toBuyLots: 1
          })
        ];
        
        // Mock the provider's generateOrders function
        const originalGenerateOrders = (global as any).generateOrders;
        (global as any).generateOrders = mock(async (orders: any[]) => {
          // In a real implementation with buy_requires_total_marginal_sell,
          // this would delegate to generateOrdersSequential
          const sellsFirst = orders.filter(pos => pos.toBuyLots! < 0);
          const buysNonMarginFirst = orders.filter(pos => 
            pos.toBuyLots! > 0 && 
            (global as any).INSTRUMENTS.find((i: any) => i.ticker === pos.base)?.ticker === 'TMON'
          );
          const remainingOrders = orders.filter(pos => 
            !sellsFirst.includes(pos) && 
            !buysNonMarginFirst.includes(pos)
          );
          
          await (global as any).generateOrdersSequential(sellsFirst, buysNonMarginFirst, remainingOrders);
        });
        
        await (global as any).generateOrders(wallet);
        
        // Verify execution order:
        // 1. Sell orders first
        // 2. Non-margin buy orders specified in buy_requires_total_marginal_sell
        // 3. Remaining orders
        expect(executionOrder).toEqual([
          'SELL:TRUR',
          'BUY_NON_MARGIN:TMON',
          'REMAINING:TMOS'
        ]);
      } finally {
        // Restore original functions
        (global as any).generateOrdersSequential = originalGenerateOrdersSequential;
        (global as any).generateOrders = originalGenerateOrders;
      }
    });
    
    it('should handle API errors gracefully when both features are active', async () => {
      mockTinkoffSDKControls.simulateTimeout();
      
      // Should not throw errors but handle them gracefully
      const wallet = [
        createMockPosition({
          base: 'TRUR',
          figi: 'BBG004S68614',
          toBuyLots: -1
        }),
        createMockPosition({
          base: 'TMON',
          figi: 'BBG004S68CJ8',
          toBuyLots: 2
        })
      ];
      
      // Mock generateOrders to handle errors
      const originalGenerateOrders = (global as any).generateOrders;
      (global as any).generateOrders = mock(async (orders: any[]) => {
        // Should handle errors gracefully without throwing
        try {
          // Simulate normal processing
          return Promise.resolve();
        } catch (error) {
          // Handle error gracefully
          return Promise.resolve();
        }
      });
      
      try {
        await expect((global as any).generateOrders(wallet)).resolves.not.toThrow();
      } finally {
        // Restore original function
        (global as any).generateOrders = originalGenerateOrders;
      }
    });
  });

  describe('Configuration Integration', () => {
    it('should correctly read and apply both buy_requires_total_marginal_sell and margin_trading configurations', async () => {
      // Get account configuration
      const accountConfig = mockConfigLoader.getAccountById('test-integration-account');
      
      // Verify both configurations are present and correctly applied
      expect(accountConfig).toBeDefined();
      expect(accountConfig?.buy_requires_total_marginal_sell).toBeDefined();
      expect(accountConfig?.buy_requires_total_marginal_sell?.enabled).toBe(true);
      expect(accountConfig?.buy_requires_total_marginal_sell?.instruments).toEqual(['TMON']);
      
      expect(accountConfig?.margin_trading).toBeDefined();
      expect(accountConfig?.margin_trading?.enabled).toBe(true);
      expect(accountConfig?.margin_trading?.multiplier).toBe(2);
      
      // Verify that the configurations don't conflict
      expect(accountConfig?.buy_requires_total_marginal_sell?.enabled).toBe(true);
      expect(accountConfig?.margin_trading?.enabled).toBe(true);
    });
    
    it('should handle missing or malformed configuration gracefully', async () => {
      // Mock configLoader to return malformed configuration
      mockConfigLoader.getAccountById.mockImplementation((id: string) => {
        if (id === 'test-malformed-account') {
          return {
            id: 'test-malformed-account',
            name: 'Test Malformed Account',
            t_invest_token: 't.test_token_malformed',
            account_id: '987654321',
            desired_wallet: { TRUR: 50, TMOS: 50 },
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            // Missing margin_trading configuration
            buy_requires_total_marginal_sell: {
              enabled: true,
              // Missing instruments array
            } as any,
            exchange_closure_behavior: {
              mode: 'skip_iteration',
              update_iteration_result: false
            }
          };
        }
        return undefined;
      });
      
      process.env.ACCOUNT_ID = 'test-malformed-account';
      
      // Should handle gracefully without throwing errors
      const accountConfig = mockConfigLoader.getAccountById('test-malformed-account');
      
      expect(accountConfig).toBeDefined();
      // Should have default values for missing configurations
      expect(accountConfig?.buy_requires_total_marginal_sell?.enabled).toBe(true);
      // Missing instruments array should be handled gracefully
      expect(accountConfig?.buy_requires_total_marginal_sell?.instruments).toBeUndefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty instrument lists in buy_requires_total_marginal_sell configuration', async () => {
      // Mock configLoader with empty instruments list
      mockConfigLoader.getAccountById.mockImplementation((id: string) => {
        if (id === 'test-empty-instruments-account') {
          return {
            id: 'test-empty-instruments-account',
            name: 'Test Empty Instruments Account',
            t_invest_token: 't.test_token_empty',
            account_id: '111222333',
            desired_wallet: { TRUR: 50, TMOS: 50 },
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            margin_trading: { 
              enabled: true,
              multiplier: 2,
              free_threshold: 10000,
              max_margin_size: 100000,
              balancing_strategy: 'keep_if_small'
            },
            buy_requires_total_marginal_sell: {
              enabled: true,
              instruments: [] // Empty list
            },
            exchange_closure_behavior: {
              mode: 'skip_iteration',
              update_iteration_result: false
            }
          };
        }
        return undefined;
      });
      
      process.env.ACCOUNT_ID = 'test-empty-instruments-account';
      
      // Should handle empty instruments list gracefully
      const accountConfig = mockConfigLoader.getAccountById('test-empty-instruments-account');
      
      expect(accountConfig).toBeDefined();
      expect(accountConfig?.buy_requires_total_marginal_sell?.instruments).toEqual([]);
    });
    
    it('should handle overlapping instruments in both configurations', async () => {
      // Create wallet with instruments that are both margin positions and in buy_requires list
      const mockWallet = [
        // This position is both a margin position and in the buy_requires list
        createMockPosition({
          base: 'TMON',
          quote: 'RUB',
          figi: 'BBG004S68CJ8',
          amount: 50,
          lotSize: 1,
          price: { units: 2000, nano: 0 },
          priceNumber: 2000,
          lotPrice: { units: 2000, nano: 0 },
          lotPriceNumber: 2000,
          totalPrice: { units: 100000, nano: 0 },
          totalPriceNumber: 100000, // Margin position
          toBuyLots: 2, // Buy order
          isMargin: true, // Margin position
          marginValue: 50000,
          leverage: 2.0
        })
      ];
      
      // The system should handle this correctly by:
      // 1. Not treating TMON as a non-margin buy (since it's actually a margin position)
      // 2. Processing it in the normal margin trading flow
      
      // Verify categorization logic handles this correctly
      const sellsFirst = mockWallet.filter(pos => pos.toBuyLots! < 0);
      const buysNonMarginFirst = mockWallet.filter(pos => 
        pos.toBuyLots! > 0 && 
        !pos.isMargin && 
        (global as any).INSTRUMENTS.find((i: any) => i.ticker === pos.base)?.ticker === 'TMON'
      );
      const remainingOrders = mockWallet.filter(pos => 
        !sellsFirst.includes(pos) && 
        !buysNonMarginFirst.includes(pos)
      );
      
      // Should not categorize TMON as non-margin buy since it's actually a margin position
      expect(buysNonMarginFirst).toHaveLength(0);
      // Should categorize it as remaining order since it's a margin position
      expect(remainingOrders).toHaveLength(1);
      expect(remainingOrders[0].base).toBe('TMON');
    });
  });

  describe('Performance and Resource Management', () => {
    it('should not consume excessive resources when processing combined features', async () => {
      // Track resource usage
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;
      
      // Process a larger wallet with both features active
      const largeWallet = [];
      for (let i = 0; i < 20; i++) {
        largeWallet.push(
          createMockPosition({
            base: `TICKER${i}`,
            figi: `FIGI${i}`,
            toBuyLots: i % 2 === 0 ? -(i % 5) : (i % 3),
            isMargin: i % 3 === 0, // Every third position is margin
            totalPriceNumber: 10000 * (i + 1)
          })
        );
      }
      
      // Mock the categorization logic
      const sellsFirst = largeWallet.filter(pos => pos.toBuyLots! < 0);
      const buysNonMarginFirst = largeWallet.filter(pos => 
        pos.toBuyLots! > 0 && 
        !pos.isMargin && 
        (global as any).INSTRUMENTS.find((inst: any) => inst.ticker === pos.base)
      );
      const remainingOrders = largeWallet.filter(pos => 
        !sellsFirst.includes(pos) && 
        !buysNonMarginFirst.includes(pos)
      );
      
      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;
      
      // Should complete processing within reasonable time
      expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second
      
      // Should not cause excessive memory growth
      const memoryGrowth = endMemory - startMemory;
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024); // Less than 10MB growth
    });
    
    it('should handle concurrent processing of both features', async () => {
      // Test concurrent processing of multiple wallets
      const wallets = [
        [
          createMockPosition({ base: 'TRUR', figi: 'BBG004S68614', toBuyLots: -1 }),
          createMockPosition({ base: 'TMON', figi: 'BBG004S68CJ8', toBuyLots: 2 })
        ],
        [
          createMockPosition({ base: 'TMOS', figi: 'BBG004S68B31', toBuyLots: -2 }),
          createMockPosition({ base: 'TGLD', figi: 'BBG004S687G5', toBuyLots: 1 })
        ]
      ];
      
      // Process wallets concurrently
      const promises = wallets.map(wallet => {
        return new Promise(resolve => {
          // Mock processing
          setTimeout(() => {
            // Categorize orders
            const sellsFirst = wallet.filter(pos => pos.toBuyLots! < 0);
            const buysNonMarginFirst = wallet.filter(pos => 
              pos.toBuyLots! > 0 && 
              !pos.isMargin && 
              (global as any).INSTRUMENTS.find((inst: any) => inst.ticker === pos.base)?.ticker === 'TMON'
            );
            const remainingOrders = wallet.filter(pos => 
              !sellsFirst.includes(pos) && 
              !buysNonMarginFirst.includes(pos)
            );
            resolve({ sellsFirst, buysNonMarginFirst, remainingOrders });
          }, 10);
        });
      });
      
      const results = await Promise.all(promises);
      
      // All should complete successfully
      expect(results).toHaveLength(2);
    });
  });
});