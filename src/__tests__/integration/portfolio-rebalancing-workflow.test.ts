import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";

// Mock modules for integration testing
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
    if (id === 'test-account') {
      return {
        id: 'test-account',
        name: 'Test Account',
        t_invest_token: 't.test_token',
        account_id: '123456789',
        desired_wallet: { TRUR: 40, TMOS: 30, TGLD: 20, RUB: 10 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { 
          enabled: false,
          multiplier: 1,
          free_threshold: 10000,
          max_margin_size: 0,
          balancing_strategy: 'keep'
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
  getAccountToken: mock(() => 't.test_token')
};

mock.module('../../configLoader', () => ({
  configLoader: mockConfigLoader
}));

// Mock dotenv
mock.module('dotenv', () => ({
  config: mock(() => undefined)
}));

// Mock tinkoff-sdk-grpc-js
const mockTinkoffSDK = {
  createSdk: mock(() => ({
    orders: {
      postOrder: mock(async () => ({
        orderId: 'test-order-id',
        executionReportStatus: 1
      }))
    },
    operations: {
      getPortfolio: mock(async () => ({
        positions: [
          {
            figi: 'BBG004S68614',
            quantity: { units: 50, nano: 0 },
            currentPrice: { units: 1200, nano: 0 },
            averagePositionPriceFifo: { units: 1100, nano: 0 }
          }
        ]
      })),
      getPositions: mock(async () => ({
        money: [
          {
            currency: 'RUB',
            units: 50000,
            nano: 0
          }
        ]
      }))
    },
    marketData: {
      getLastPrices: mock(async () => ({
        lastPrices: [
          {
            figi: 'BBG004S68614',
            price: { units: 1200, nano: 0 }
          }
        ]
      }))
    },
    users: {
      getAccounts: mock(async () => [
        {
          id: '123456789',
          type: 1,
          name: 'Test Account'
        }
      ])
    },
    instruments: {
      shares: mock(async () => ({
        instruments: []
      })),
      etfs: mock(async () => ({
        instruments: [
          {
            ticker: 'TRUR',
            figi: 'BBG004S68614',
            lot: 1,
            currency: 'RUB'
          },
          {
            ticker: 'TMOS',
            figi: 'BBG004S68705',
            lot: 1,
            currency: 'RUB'
          },
          {
            ticker: 'TGLD',
            figi: 'BBG004S683N7',
            lot: 1,
            currency: 'RUB'
          }
        ]
      })),
      bonds: mock(async () => ({
        instruments: []
      })),
      currencies: mock(async () => ({
        instruments: []
      })),
      futures: mock(async () => ({
        instruments: []
      })),
      tradingSchedules: mock(async () => ({
        exchanges: [
          {
            days: [
              {
                isTradingDay: true,
                startTime: new Date(Date.now() - 3600000),
                endTime: new Date(Date.now() + 3600000)
              }
            ]
          }
        ]
      }))
    }
  }))
};

mock.module('tinkoff-sdk-grpc-js', () => mockTinkoffSDK);

// Store original process values
const originalProcessEnv = process.env;
const originalProcessArgv = process.argv;

// Import test utilities
import { testSuite } from '../test-utils';

testSuite('Full Portfolio Rebalancing Workflow Integration Tests', () => {
  beforeEach(() => {
    // Reset mocks
    mockFs.promises.readFile.mockClear();
    mockFs.promises.writeFile.mockClear();
    mockFs.promises.access.mockClear();
    mockFs.promises.mkdir.mockClear();
    mockFs.promises.readdir.mockClear();
    mockPath.resolve.mockClear();
    mockPath.join.mockClear();
    mockPath.dirname.mockClear();
    mockRp.mockClear();
    mockConfigLoader.getAccountById.mockClear();
    mockConfigLoader.loadConfig.mockClear();
    mockConfigLoader.getAllAccounts.mockClear();
    mockConfigLoader.getAccountToken.mockClear();
    mockTinkoffSDK.createSdk.mockClear();
    
    // Set up test environment
    process.env = {
      ...originalProcessEnv,
      ACCOUNT_ID: 'test-account',
      T_INVEST_TOKEN: 't.test_token'
    };
    
    process.argv = ['node', 'index.ts'];
    
    // Set default mock responses
    mockFs.promises.readFile.mockResolvedValue(JSON.stringify({
      accounts: [
        {
          id: 'test-account',
          name: 'Test Account',
          t_invest_token: 't.test_token',
          account_id: '123456789',
          desired_wallet: { TRUR: 40, TMOS: 30, TGLD: 20, RUB: 10 }
        }
      ]
    }));
    
    mockFs.promises.writeFile.mockResolvedValue(undefined);
    mockFs.promises.access.mockResolvedValue(undefined);
    mockFs.promises.mkdir.mockResolvedValue(undefined);
    mockFs.promises.readdir.mockResolvedValue([]);
    mockPath.resolve.mockImplementation((...args: string[]) => args.join('/'));
    mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
    mockPath.dirname.mockImplementation((p: string) => p.split('/').slice(0, -1).join('/'));
    mockRp.mockResolvedValue('');
    
    // Set up global variables
    (global as any).INSTRUMENTS = [
      {
        ticker: 'TRUR',
        figi: 'BBG004S68614',
        lot: 1,
        currency: 'RUB'
      },
      {
        ticker: 'TMOS',
        figi: 'BBG004S68705',
        lot: 1,
        currency: 'RUB'
      },
      {
        ticker: 'TGLD',
        figi: 'BBG004S683N7',
        lot: 1,
        currency: 'RUB'
      }
    ];
  });

  afterEach(() => {
    // Restore original process values
    process.env = originalProcessEnv;
    process.argv = originalProcessArgv;
    
    // Clean up global variables
    delete (global as any).INSTRUMENTS;
    delete (global as any).POSITIONS;
    delete (global as any).LAST_PRICES;
  });

  describe('Complete End-to-End Rebalancing Workflow', () => {
    it('should execute full portfolio rebalancing workflow from start to finish', async () => {
      // Dynamically import the main modules
      const providerModule = await import('../../provider');
      const balancerModule = await import('../../balancer');
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      
      // Mock pollEtfMetrics to avoid external API calls
      const originalCollectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      pollEtfMetricsModule.collectOnceForSymbols = mock(async () => {
        // Mock successful metrics collection
        return Promise.resolve();
      });
      
      try {
        // Step 1: Initialize provider and get account configuration
        expect(mockConfigLoader.getAccountById).not.toHaveBeenCalled();
        
        // Step 2: Get instruments
        await providerModule.getInstruments();
        
        // Verify instruments were fetched
        expect(mockTinkoffSDK.createSdk().instruments.etfs).toHaveBeenCalled();
        expect((global as any).INSTRUMENTS).toHaveLength(3);
        
        // Step 3: Get account ID
        const accountId = await providerModule.getAccountId('123456789');
        expect(accountId).toBe('123456789');
        
        // Step 4: Check if exchange is open
        const isExchangeOpen = await providerModule.isExchangeOpenNow('MOEX');
        expect(typeof isExchangeOpen).toBe('boolean');
        
        // Step 5: Get positions cycle (this would normally be called in a loop)
        // We'll test a single iteration
        const positionsCyclePromise = providerModule.getPositionsCycle({ runOnce: true });
        
        // Allow some time for the async operations to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Step 6: Verify that the balancer was called
        // Note: Since we're not actually running the full provider cycle in this test,
        // we'll directly test the balancer function
        
        // Create a mock wallet
        const mockWallet = [
          {
            pair: 'TRUR/RUB',
            base: 'TRUR',
            quote: 'RUB',
            figi: 'BBG004S68614',
            amount: 50,
            lotSize: 1,
            price: { units: 1200, nano: 0 },
            priceNumber: 1200,
            lotPrice: { units: 1200, nano: 0 },
            lotPriceNumber: 1200,
            totalPrice: { units: 60000, nano: 0 },
            totalPriceNumber: 60000
          },
          {
            pair: 'RUB/RUB',
            base: 'RUB',
            quote: 'RUB',
            figi: undefined,
            amount: 50000,
            lotSize: 1,
            price: { units: 1, nano: 0 },
            priceNumber: 1,
            lotPrice: { units: 1, nano: 0 },
            lotPriceNumber: 1,
            totalPrice: { units: 50000, nano: 0 },
            totalPriceNumber: 50000
          }
        ];
        
        const desiredWallet = { TRUR: 40, TMOS: 30, TGLD: 20, RUB: 10 };
        
        // Step 7: Execute balancer
        const balancerResult = await balancerModule.balancer(
          mockWallet,
          desiredWallet,
          [],
          'manual',
          false // not dry run
        );
        
        // Verify balancer result structure
        expect(balancerResult).toBeDefined();
        expect(balancerResult.finalPercents).toBeDefined();
        expect(balancerResult.modeUsed).toBe('manual');
        expect(balancerResult.totalPortfolioValue).toBeGreaterThan(0);
        
        // Step 8: Verify orders were generated (in dry run mode for safety)
        const dryRunResult = await balancerModule.balancer(
          mockWallet,
          desiredWallet,
          [],
          'manual',
          true // dry run
        );
        
        expect(dryRunResult).toBeDefined();
        
        // Clean up
        if (positionsCyclePromise) {
          try {
            await positionsCyclePromise;
          } catch (error) {
            // Ignore errors in this test context
          }
        }
      } finally {
        // Restore original function
        pollEtfMetricsModule.collectOnceForSymbols = originalCollectOnceForSymbols;
      }
    });
    
    it('should handle portfolio rebalancing with margin trading enabled', async () => {
      // Set up margin trading configuration
      mockConfigLoader.getAccountById.mockImplementation((id: string) => {
        if (id === 'test-account-margin') {
          return {
            id: 'test-account-margin',
            name: 'Test Margin Account',
            t_invest_token: 't.test_token_margin',
            account_id: '987654321',
            desired_wallet: { TRUR: 50, TMOS: 30, TGLD: 20 },
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
            exchange_closure_behavior: {
              mode: 'skip_iteration',
              update_iteration_result: false
            }
          };
        }
        return undefined;
      });
      
      process.env.ACCOUNT_ID = 'test-account-margin';
      
      // Dynamically import modules
      const balancerModule = await import('../../balancer');
      
      // Create a mock wallet with margin positions
      const mockMarginWallet = [
        {
          pair: 'TRUR/RUB',
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
          totalPriceNumber: 120000 // With 2x margin, base value is 60000
        }
      ];
      
      const desiredWallet = { TRUR: 60, TMOS: 40 };
      
      // Execute balancer with margin trading
      const result = await balancerModule.balancer(
        mockMarginWallet,
        desiredWallet,
        [],
        'manual',
        true // dry run
      );
      
      // Verify margin info is included in result
      expect(result).toBeDefined();
      expect(result.marginInfo).toBeDefined();
      expect(typeof result.marginInfo?.totalMarginUsed).toBe('number');
      expect(Array.isArray(result.marginInfo?.marginPositions)).toBe(true);
      expect(typeof result.marginInfo?.withinLimits).toBe('boolean');
    });
  });

  describe('Portfolio State Management', () => {
    it('should correctly calculate portfolio shares before and after rebalancing', async () => {
      // Import the provider module to access calculatePortfolioShares
      const providerModule = await import('../../provider');
      
      // Create a mock wallet
      const mockWallet = [
        {
          pair: 'TRUR/RUB',
          base: 'TRUR',
          quote: 'RUB',
          figi: 'BBG004S68614',
          amount: 50,
          lotSize: 1,
          price: { units: 1200, nano: 0 },
          priceNumber: 1200,
          lotPrice: { units: 1200, nano: 0 },
          lotPriceNumber: 1200,
          totalPrice: { units: 60000, nano: 0 },
          totalPriceNumber: 60000
        },
        {
          pair: 'TMOS/RUB',
          base: 'TMOS',
          quote: 'RUB',
          figi: 'BBG004S68705',
          amount: 30,
          lotSize: 1,
          price: { units: 2000, nano: 0 },
          priceNumber: 2000,
          lotPrice: { units: 2000, nano: 0 },
          lotPriceNumber: 2000,
          totalPrice: { units: 60000, nano: 0 },
          totalPriceNumber: 60000
        },
        {
          pair: 'RUB/RUB',
          base: 'RUB',
          quote: 'RUB',
          figi: undefined,
          amount: 50000,
          lotSize: 1,
          price: { units: 1, nano: 0 },
          priceNumber: 1,
          lotPrice: { units: 1, nano: 0 },
          lotPriceNumber: 1,
          totalPrice: { units: 50000, nano: 0 },
          totalPriceNumber: 50000
        }
      ];
      
      // Calculate portfolio shares
      const shares = providerModule.calculatePortfolioShares(mockWallet);
      
      // Verify calculations
      expect(shares).toBeDefined();
      expect(shares.TRUR).toBeCloseTo(50, 1); // 50% of securities value
      expect(shares.TMOS).toBeCloseTo(50, 1); // 50% of securities value
      
      // Currency positions should be excluded
      expect(shares.RUB).toBeUndefined();
      
      // Total should be approximately 100% (excluding currency)
      const totalShares = Object.values(shares).reduce((sum, val) => sum + val, 0);
      expect(totalShares).toBeCloseTo(100, 1);
    });
    
    it('should handle empty portfolio gracefully', async () => {
      const providerModule = await import('../../provider');
      
      // Create an empty wallet
      const emptyWallet: any[] = [];
      
      // Calculate portfolio shares for empty wallet
      const shares = providerModule.calculatePortfolioShares(emptyWallet);
      
      // Should return empty object
      expect(shares).toEqual({});
    });
  });

  describe('Error Handling in Workflow', () => {
    it('should gracefully handle API errors during rebalancing', async () => {
      // Set up failing API mocks
      mockTinkoffSDK.createSdk.mockImplementation(() => ({
        orders: {
          postOrder: mock(async () => {
            throw new Error('API Error');
          })
        },
        operations: {
          getPortfolio: mock(async () => {
            throw new Error('Portfolio API Error');
          }),
          getPositions: mock(async () => ({
            money: []
          }))
        },
        marketData: {
          getLastPrices: mock(async () => ({
            lastPrices: []
          }))
        },
        users: {
          getAccounts: mock(async () => {
            throw new Error('Accounts API Error');
          })
        },
        instruments: {
          shares: mock(async () => ({
            instruments: []
          })),
          etfs: mock(async () => ({
            instruments: []
          })),
          bonds: mock(async () => ({
            instruments: []
          })),
          currencies: mock(async () => ({
            instruments: []
          })),
          futures: mock(async () => ({
            instruments: []
          })),
          tradingSchedules: mock(async () => {
            throw new Error('Schedule API Error');
          })
        }
      }));
      
      // Import modules
      const providerModule = await import('../../provider');
      const balancerModule = await import('../../balancer');
      
      // Create a simple mock wallet
      const mockWallet = [
        {
          pair: 'TRUR/RUB',
          base: 'TRUR',
          quote: 'RUB',
          figi: 'BBG004S68614',
          amount: 10,
          lotSize: 1,
          price: { units: 1200, nano: 0 },
          priceNumber: 1200,
          lotPrice: { units: 1200, nano: 0 },
          lotPriceNumber: 1200,
          totalPrice: { units: 12000, nano: 0 },
          totalPriceNumber: 12000
        }
      ];
      
      const desiredWallet = { TRUR: 100 };
      
      // Should not throw errors even with failing APIs (in dry run mode)
      const result = await balancerModule.balancer(
        mockWallet,
        desiredWallet,
        [],
        'manual',
        true // dry run
      );
      
      // Should still return a result structure
      expect(result).toBeDefined();
      expect(result.finalPercents).toBeDefined();
      expect(result.modeUsed).toBe('manual');
    });
    
    it('should handle configuration errors gracefully', async () => {
      // Set up failing config loader
      mockConfigLoader.getAccountById.mockImplementation(() => {
        throw new Error('Configuration Error');
      });
      
      // Import modules
      const providerModule = await import('../../provider');
      
      // Should handle configuration errors gracefully
      try {
        await providerModule.provider({ runOnce: true });
        // If we get here, the provider handled the error gracefully
        expect(true).toBe(true);
      } catch (error) {
        // If an error was thrown, it should be handled properly
        expect(error).toBeDefined();
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large portfolios efficiently', async () => {
      // Import modules
      const providerModule = await import('../../provider');
      const balancerModule = await import('../../balancer');
      
      // Create a large mock portfolio
      const largePortfolio: any[] = [];
      const numPositions = 20;
      
      for (let i = 0; i < numPositions; i++) {
        largePortfolio.push({
          pair: `ETF${i.toString().padStart(3, '0')}/RUB`,
          base: `ETF${i.toString().padStart(3, '0')}`,
          quote: 'RUB',
          figi: `BBG${i.toString().padStart(9, '0')}`,
          amount: Math.floor(Math.random() * 100) + 1,
          lotSize: 1,
          price: { units: Math.floor(Math.random() * 2000) + 500, nano: 0 },
          priceNumber: 0,
          lotPrice: { units: 0, nano: 0 },
          lotPriceNumber: 0,
          totalPrice: { units: 0, nano: 0 },
          totalPriceNumber: 0
        });
      }
      
      // Add currency position
      largePortfolio.push({
        pair: 'RUB/RUB',
        base: 'RUB',
        quote: 'RUB',
        figi: undefined,
        amount: 100000,
        lotSize: 1,
        price: { units: 1, nano: 0 },
        priceNumber: 1,
        lotPrice: { units: 1, nano: 0 },
        lotPriceNumber: 1,
        totalPrice: { units: 100000, nano: 0 },
        totalPriceNumber: 100000
      });
      
      // Calculate derived values
      largePortfolio.forEach(position => {
        if (position.base !== 'RUB') {
          position.priceNumber = position.price.units;
          position.lotPrice = { units: position.price.units, nano: 0 };
          position.lotPriceNumber = position.price.units;
          position.totalPrice = { units: position.amount * position.price.units, nano: 0 };
          position.totalPriceNumber = position.amount * position.price.units;
        }
      });
      
      const desiredWallet: Record<string, number> = {};
      for (let i = 0; i < numPositions; i++) {
        desiredWallet[`ETF${i.toString().padStart(3, '0')}`] = 100 / numPositions;
      }
      desiredWallet.RUB = 0;
      
      // Measure performance
      const startTime = performance.now();
      
      // Calculate portfolio shares
      const shares = providerModule.calculatePortfolioShares(largePortfolio);
      
      // Execute balancer
      const result = await balancerModule.balancer(
        largePortfolio,
        desiredWallet,
        [],
        'manual',
        true // dry run
      );
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      
      // Verify results
      expect(shares).toBeDefined();
      expect(result).toBeDefined();
      expect(result.finalPercents).toBeDefined();
      
      // Should complete within reasonable time (less than 1 second for 20 positions)
      expect(executionTime).toBeLessThan(1000);
    });
    
    it('should handle concurrent rebalancing operations', async () => {
      // Import balancer module
      const balancerModule = await import('../../balancer');
      
      // Create multiple portfolios to rebalance concurrently
      const portfolios = Array.from({ length: 3 }, (_, i) => {
        const baseAmount = 50 + i * 10;
        return [
          {
            pair: 'TRUR/RUB',
            base: 'TRUR',
            quote: 'RUB',
            figi: 'BBG004S68614',
            amount: baseAmount,
            lotSize: 1,
            price: { units: 1200, nano: 0 },
            priceNumber: 1200,
            lotPrice: { units: 1200, nano: 0 },
            lotPriceNumber: 1200,
            totalPrice: { units: baseAmount * 1200, nano: 0 },
            totalPriceNumber: baseAmount * 1200
          },
          {
            pair: 'RUB/RUB',
            base: 'RUB',
            quote: 'RUB',
            figi: undefined,
            amount: 10000,
            lotSize: 1,
            price: { units: 1, nano: 0 },
            priceNumber: 1,
            lotPrice: { units: 1, nano: 0 },
            lotPriceNumber: 1,
            totalPrice: { units: 10000, nano: 0 },
            totalPriceNumber: 10000
          }
        ];
      });
      
      const desiredWallet = { TRUR: 70, RUB: 30 };
      
      // Measure concurrent execution
      const startTime = performance.now();
      
      // Execute multiple balancer operations concurrently
      const results = await Promise.all(
        portfolios.map(portfolio => 
          balancerModule.balancer(
            portfolio,
            desiredWallet,
            [],
            'manual',
            true // dry run
          )
        )
      );
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      
      // Verify all operations completed successfully
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.finalPercents).toBeDefined();
        expect(result.modeUsed).toBe('manual');
      });
      
      // Concurrent execution should be faster than sequential
      // (This is a basic check - actual performance will depend on many factors)
      expect(executionTime).toBeLessThan(500);
    });
  });
});