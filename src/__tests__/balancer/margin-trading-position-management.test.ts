import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";

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
    if (id === 'test-margin-account') {
      return {
        id: 'test-margin-account',
        name: 'Test Margin Account',
        t_invest_token: 't.test_token_margin',
        account_id: '123456789',
        desired_wallet: { TRUR: 40, TMOS: 30, TGLD: 20, RUB: 10 },
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
  }),
  loadConfig: mock(() => ({
    accounts: []
  })),
  getAllAccounts: mock(() => []),
  getAccountToken: mock(() => 't.test_token_margin')
};

mock.module('../../configLoader', () => ({
  configLoader: mockConfigLoader
}));

// Mock dotenv
mock.module('dotenv', () => ({
  config: mock(() => undefined)
}));

// Store original process values
const originalProcessEnv = process.env;
const originalProcessArgv = process.argv;

// Import test utilities
import { testSuite } from '../test-utils';
import { MarginPosition, Position, MarginConfig } from '../../types.d';

testSuite('Margin Trading Position Management Tests', () => {
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
    
    // Set up test environment
    process.env = {
      ...originalProcessEnv,
      ACCOUNT_ID: 'test-margin-account',
      T_INVEST_TOKEN: 't.test_token_margin'
    };
    
    process.argv = ['node', 'index.ts'];
  });

  afterEach(() => {
    // Restore original process values
    process.env = originalProcessEnv;
    process.argv = originalProcessArgv;
  });

  describe('Margin Position Identification', () => {
    it('should correctly identify margin positions in portfolio', async () => {
      // Dynamically import the balancer module
      const balancerModule = await import('../../balancer');
      
      // Create a mock wallet with mixed positions
      const mockWallet: Position[] = [
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
        },
        {
          pair: 'TMOS/RUB',
          base: 'TMOS',
          quote: 'RUB',
          figi: 'BBG004S68705',
          amount: 50,
          lotSize: 1,
          price: { units: 2000, nano: 0 },
          priceNumber: 2000,
          lotPrice: { units: 2000, nano: 0 },
          lotPriceNumber: 2000,
          totalPrice: { units: 100000, nano: 0 },
          totalPriceNumber: 100000 // With 2x margin, base value is 50000
        },
        {
          pair: 'RUB/RUB',
          base: 'RUB',
          quote: 'RUB',
          figi: undefined,
          amount: 20000,
          lotSize: 1,
          price: { units: 1, nano: 0 },
          priceNumber: 1,
          lotPrice: { units: 1, nano: 0 },
          lotPriceNumber: 1,
          totalPrice: { units: 20000, nano: 0 },
          totalPriceNumber: 20000
        }
      ];
      
      // Identify margin positions
      const marginPositions = balancerModule.identifyMarginPositions(mockWallet);
      
      // Verify margin positions are correctly identified
      expect(marginPositions).toHaveLength(2);
      
      // Check first margin position (TRUR)
      const trurPosition = marginPositions.find(p => p.base === 'TRUR');
      expect(trurPosition).toBeDefined();
      expect(trurPosition?.isMargin).toBe(true);
      expect(trurPosition?.marginValue).toBe(60000); // 120000 - 60000 (base)
      expect(trurPosition?.leverage).toBe(2);
      expect(trurPosition?.marginCall).toBe(false);
      
      // Check second margin position (TMOS)
      const tmosPosition = marginPositions.find(p => p.base === 'TMOS');
      expect(tmosPosition).toBeDefined();
      expect(tmosPosition?.isMargin).toBe(true);
      expect(tmosPosition?.marginValue).toBe(50000); // 100000 - 50000 (base)
      expect(tmosPosition?.leverage).toBe(2);
      expect(tmosPosition?.marginCall).toBe(false);
      
      // Currency positions should not be margin positions
      const rubPosition = marginPositions.find(p => p.base === 'RUB');
      expect(rubPosition).toBeUndefined();
    });
    
    it('should handle positions without margin correctly', async () => {
      // Dynamically import the balancer module
      const balancerModule = await import('../../balancer');
      
      // Create a mock wallet with no margin positions (multiplier = 1)
      const mockWallet: Position[] = [
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
          totalPriceNumber: 120000
        }
      ];
      
      // Temporarily disable margin trading in config
      mockConfigLoader.getAccountById.mockImplementation((id: string) => {
        if (id === 'test-no-margin-account') {
          return {
            id: 'test-no-margin-account',
            name: 'Test No Margin Account',
            t_invest_token: 't.test_token_no_margin',
            account_id: '987654321',
            desired_wallet: { TRUR: 100 },
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
      });
      
      process.env.ACCOUNT_ID = 'test-no-margin-account';
      
      // Identify margin positions
      const marginPositions = balancerModule.identifyMarginPositions(mockWallet);
      
      // Should return empty array when margin trading is disabled
      expect(marginPositions).toHaveLength(0);
    });
    
    it('should handle positions with zero or negative values', async () => {
      // Dynamically import the balancer module
      const balancerModule = await import('../../balancer');
      
      // Create a mock wallet with invalid positions
      const mockWallet: Position[] = [
        {
          pair: 'TRUR/RUB',
          base: 'TRUR',
          quote: 'RUB',
          figi: 'BBG004S68614',
          amount: 0, // Zero amount
          lotSize: 1,
          price: { units: 1200, nano: 0 },
          priceNumber: 1200,
          lotPrice: { units: 1200, nano: 0 },
          lotPriceNumber: 1200,
          totalPrice: { units: 0, nano: 0 },
          totalPriceNumber: 0
        },
        {
          pair: 'TMOS/RUB',
          base: 'TMOS',
          quote: 'RUB',
          figi: 'BBG004S68705',
          amount: 50,
          lotSize: 1,
          price: { units: 2000, nano: 0 },
          priceNumber: 2000,
          lotPrice: { units: 2000, nano: 0 },
          lotPriceNumber: 2000,
          totalPrice: { units: -50000, nano: 0 }, // Negative value
          totalPriceNumber: -50000
        }
      ];
      
      // Identify margin positions
      const marginPositions = balancerModule.identifyMarginPositions(mockWallet);
      
      // Should only include valid positions with positive values
      expect(marginPositions).toHaveLength(0);
    });
  });

  describe('Margin Position Management Strategies', () => {
    it('should apply remove strategy correctly', async () => {
      // Dynamically import the balancer module
      const balancerModule = await import('../../balancer');
      
      // Create margin positions
      const marginPositions: MarginPosition[] = [
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
          totalPriceNumber: 120000,
          isMargin: true,
          marginValue: 60000,
          leverage: 2,
          marginCall: false
        }
      ];
      
      // Apply remove strategy
      const strategyResult = balancerModule.applyMarginStrategy(marginPositions);
      
      // Verify strategy result
      expect(strategyResult).toBeDefined();
      expect(strategyResult.shouldRemoveMargin).toBe(false); // Not time to apply strategy
      expect(typeof strategyResult.reason).toBe('string');
      expect(typeof strategyResult.transferCost).toBe('number');
    });
    
    it('should apply keep strategy correctly', async () => {
      // Dynamically import the balancer module
      const balancerModule = await import('../../balancer');
      
      // Create margin positions
      const marginPositions: MarginPosition[] = [
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
          totalPriceNumber: 120000,
          isMargin: true,
          marginValue: 60000,
          leverage: 2,
          marginCall: false
        }
      ];
      
      // Temporarily change config to use 'keep' strategy
      mockConfigLoader.getAccountById.mockImplementation((id: string) => {
        if (id === 'test-keep-margin-account') {
          return {
            id: 'test-keep-margin-account',
            name: 'Test Keep Margin Account',
            t_invest_token: 't.test_token_keep',
            account_id: '111111111',
            desired_wallet: { TRUR: 100 },
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            margin_trading: { 
              enabled: true,
              multiplier: 2,
              free_threshold: 10000,
              max_margin_size: 100000,
              balancing_strategy: 'keep'
            },
            exchange_closure_behavior: {
              mode: 'skip_iteration',
              update_iteration_result: false
            }
          };
        }
        return undefined;
      });
      
      process.env.ACCOUNT_ID = 'test-keep-margin-account';
      
      // Apply keep strategy
      const strategyResult = balancerModule.applyMarginStrategy(marginPositions);
      
      // Verify strategy result
      expect(strategyResult).toBeDefined();
      expect(typeof strategyResult.shouldRemoveMargin).toBe('boolean');
      expect(typeof strategyResult.reason).toBe('string');
      expect(typeof strategyResult.transferCost).toBe('number');
    });
    
    it('should apply keep_if_small strategy correctly', async () => {
      // Dynamically import the balancer module
      const balancerModule = await import('../../balancer');
      
      // Create small margin positions
      const smallMarginPositions: MarginPosition[] = [
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
          totalPriceNumber: 60000,
          isMargin: true,
          marginValue: 30000,
          leverage: 2,
          marginCall: false
        }
      ];
      
      // Temporarily change config to use 'keep_if_small' strategy
      mockConfigLoader.getAccountById.mockImplementation((id: string) => {
        if (id === 'test-keep-if-small-account') {
          return {
            id: 'test-keep-if-small-account',
            name: 'Test Keep If Small Account',
            t_invest_token: 't.test_token_small',
            account_id: '222222222',
            desired_wallet: { TRUR: 100 },
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
      
      process.env.ACCOUNT_ID = 'test-keep-if-small-account';
      
      // Apply keep_if_small strategy
      const strategyResult = balancerModule.applyMarginStrategy(smallMarginPositions);
      
      // Verify strategy result
      expect(strategyResult).toBeDefined();
      expect(typeof strategyResult.shouldRemoveMargin).toBe('boolean');
      expect(typeof strategyResult.reason).toBe('string');
      expect(typeof strategyResult.transferCost).toBe('number');
    });
  });

  describe('Margin Position Transfer Costs', () => {
    it('should calculate transfer costs correctly for positions above threshold', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create margin config
      const marginConfig: MarginConfig = {
        enabled: true,
        multiplier: 2,
        free_threshold: 10000,
        max_margin_size: 100000,
        strategy: 'keep_if_small'
      };
      
      const marginCalculator = new MarginCalculator(marginConfig);
      
      // Create margin positions above threshold
      const marginPositions: MarginPosition[] = [
        {
          base: 'TRUR',
          totalPriceNumber: 50000, // Above threshold
          isMargin: true,
          marginValue: 25000,
          leverage: 2
        } as MarginPosition,
        {
          base: 'TMOS',
          totalPriceNumber: 30000, // Above threshold
          isMargin: true,
          marginValue: 15000,
          leverage: 2
        } as MarginPosition
      ];
      
      // Calculate transfer costs
      const transferCost = marginCalculator.calculateTransferCost(marginPositions);
      
      // Verify transfer costs
      expect(transferCost.totalCost).toBe(800); // (50000 + 30000) * 0.01
      expect(transferCost.freeTransfers).toBe(0);
      expect(transferCost.paidTransfers).toBe(2);
      expect(transferCost.costBreakdown).toHaveLength(2);
      
      // Verify cost breakdown
      expect(transferCost.costBreakdown[0].ticker).toBe('TRUR');
      expect(transferCost.costBreakdown[0].cost).toBe(500); // 50000 * 0.01
      expect(transferCost.costBreakdown[0].isFree).toBe(false);
      
      expect(transferCost.costBreakdown[1].ticker).toBe('TMOS');
      expect(transferCost.costBreakdown[1].cost).toBe(300); // 30000 * 0.01
      expect(transferCost.costBreakdown[1].isFree).toBe(false);
    });
    
    it('should identify free transfers for positions below threshold', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create margin config
      const marginConfig: MarginConfig = {
        enabled: true,
        multiplier: 2,
        free_threshold: 10000,
        max_margin_size: 100000,
        strategy: 'keep_if_small'
      };
      
      const marginCalculator = new MarginCalculator(marginConfig);
      
      // Create margin positions below threshold
      const marginPositions: MarginPosition[] = [
        {
          base: 'SMALL1',
          totalPriceNumber: 5000, // Below threshold
          isMargin: true,
          marginValue: 2500,
          leverage: 2
        } as MarginPosition,
        {
          base: 'SMALL2',
          totalPriceNumber: 8000, // Below threshold
          isMargin: true,
          marginValue: 4000,
          leverage: 2
        } as MarginPosition
      ];
      
      // Calculate transfer costs
      const transferCost = marginCalculator.calculateTransferCost(marginPositions);
      
      // Verify transfer costs
      expect(transferCost.totalCost).toBe(0);
      expect(transferCost.freeTransfers).toBe(2);
      expect(transferCost.paidTransfers).toBe(0);
      expect(transferCost.costBreakdown).toHaveLength(2);
      
      // Verify cost breakdown
      transferCost.costBreakdown.forEach(breakdown => {
        expect(breakdown.cost).toBe(0);
        expect(breakdown.isFree).toBe(true);
      });
    });
  });

  describe('Margin Position Risk Management', () => {
    it('should correctly assess margin risk levels', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create margin config
      const marginConfig: MarginConfig = {
        enabled: true,
        multiplier: 2,
        free_threshold: 10000,
        max_margin_size: 100000,
        strategy: 'keep_if_small'
      };
      
      const marginCalculator = new MarginCalculator(marginConfig);
      
      // Create a portfolio
      const portfolio: Position[] = [
        {
          base: 'TRUR',
          totalPriceNumber: 50000
        } as Position,
        {
          base: 'TMOS',
          totalPriceNumber: 30000
        } as Position,
        {
          base: 'RUB',
          totalPriceNumber: 20000
        } as Position
      ];
      
      // Create margin positions with low usage
      const lowRiskPositions: MarginPosition[] = [
        {
          base: 'TRUR',
          totalPriceNumber: 60000,
          isMargin: true,
          marginValue: 10000,
          leverage: 2
        } as MarginPosition
      ];
      
      // Check margin limits
      const marginLimits = marginCalculator.checkMarginLimits(portfolio, lowRiskPositions);
      
      // Verify risk assessment
      expect(marginLimits.isValid).toBe(true);
      expect(marginLimits.availableMargin).toBe(100000); // (50000 + 30000 + 20000) * (2 - 1)
      expect(marginLimits.usedMargin).toBe(10000);
      expect(marginLimits.remainingMargin).toBe(90000);
      expect(marginLimits.riskLevel).toBe('low'); // 10% usage
    });
    
    it('should detect high risk margin positions', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create margin config
      const marginConfig: MarginConfig = {
        enabled: true,
        multiplier: 2,
        free_threshold: 10000,
        max_margin_size: 100000,
        strategy: 'keep_if_small'
      };
      
      const marginCalculator = new MarginCalculator(marginConfig);
      
      // Create a portfolio
      const portfolio: Position[] = [
        {
          base: 'TRUR',
          totalPriceNumber: 50000
        } as Position
      ];
      
      // Create margin positions with high usage
      const highRiskPositions: MarginPosition[] = [
        {
          base: 'TRUR',
          totalPriceNumber: 95000,
          isMargin: true,
          marginValue: 85000,
          leverage: 2
        } as MarginPosition
      ];
      
      // Check margin limits
      const marginLimits = marginCalculator.checkMarginLimits(portfolio, highRiskPositions);
      
      // Verify risk assessment
      expect(marginLimits.isValid).toBe(true);
      expect(marginLimits.usedMargin).toBe(85000);
      expect(marginLimits.riskLevel).toBe('high'); // 85% usage > 80%
    });
  });

  describe('Margin Position Integration with Balancer', () => {
    it('should integrate margin positions with balancer calculations', async () => {
      // Dynamically import the balancer module
      const balancerModule = await import('../../balancer');
      
      // Create a mock wallet with margin positions
      const mockWallet: Position[] = [
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
          totalPriceNumber: 120000
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
      
      const desiredWallet = { TRUR: 70, RUB: 30 };
      
      // Execute balancer with margin trading
      const result = await balancerModule.balancer(
        mockWallet,
        desiredWallet,
        [],
        'manual',
        true // dry run
      );
      
      // Verify balancer result includes margin info
      expect(result).toBeDefined();
      expect(result.marginInfo).toBeDefined();
      expect(typeof result.marginInfo?.totalMarginUsed).toBe('number');
      expect(Array.isArray(result.marginInfo?.marginPositions)).toBe(true);
      expect(typeof result.marginInfo?.withinLimits).toBe('boolean');
    });
    
    it('should handle margin position validation during balancing', async () => {
      // Dynamically import the balancer module
      const balancerModule = await import('../../balancer');
      
      // Create a mock wallet with margin positions that exceed limits
      const mockWallet: Position[] = [
        {
          pair: 'TRUR/RUB',
          base: 'TRUR',
          quote: 'RUB',
          figi: 'BBG004S68614',
          amount: 200,
          lotSize: 1,
          price: { units: 1200, nano: 0 },
          priceNumber: 1200,
          lotPrice: { units: 1200, nano: 0 },
          lotPriceNumber: 1200,
          totalPrice: { units: 240000, nano: 0 },
          totalPriceNumber: 240000
        }
      ];
      
      const desiredWallet = { TRUR: 100 };
      
      // Temporarily change config to use low max margin size
      mockConfigLoader.getAccountById.mockImplementation((id: string) => {
        if (id === 'test-low-margin-account') {
          return {
            id: 'test-low-margin-account',
            name: 'Test Low Margin Account',
            t_invest_token: 't.test_token_low',
            account_id: '333333333',
            desired_wallet: { TRUR: 100 },
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            margin_trading: { 
              enabled: true,
              multiplier: 2,
              free_threshold: 10000,
              max_margin_size: 50000, // Low limit
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
      
      process.env.ACCOUNT_ID = 'test-low-margin-account';
      
      // Execute balancer
      const result = await balancerModule.balancer(
        mockWallet,
        desiredWallet,
        [],
        'manual',
        true // dry run
      );
      
      // Verify margin validation
      expect(result).toBeDefined();
      expect(result.marginInfo).toBeDefined();
      expect(typeof result.marginInfo?.withinLimits).toBe('boolean');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty margin positions gracefully', async () => {
      // Dynamically import the balancer module
      const balancerModule = await import('../../balancer');
      
      // Create empty margin positions array
      const emptyMarginPositions: MarginPosition[] = [];
      
      // Apply margin strategy to empty positions
      const strategyResult = balancerModule.applyMarginStrategy(emptyMarginPositions);
      
      // Should handle gracefully
      expect(strategyResult).toBeDefined();
      expect(strategyResult.shouldRemoveMargin).toBe(false);
    });
    
    it('should handle undefined position values', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create margin config
      const marginConfig: MarginConfig = {
        enabled: true,
        multiplier: 2
      };
      
      const marginCalculator = new MarginCalculator(marginConfig);
      
      // Create margin positions with undefined values
      const undefinedPositions: MarginPosition[] = [
        {
          base: 'UNDEFINED',
          totalPriceNumber: undefined,
          isMargin: true,
          marginValue: undefined
        } as MarginPosition
      ];
      
      // Calculate transfer costs
      const transferCost = marginCalculator.calculateTransferCost(undefinedPositions);
      
      // Should handle gracefully
      expect(transferCost.totalCost).toBe(0);
      expect(transferCost.freeTransfers).toBe(1); // Should be free due to undefined value
    });
    
    it('should handle extreme multiplier values', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create margin config with extreme multiplier
      const extremeConfig: MarginConfig = {
        enabled: true,
        multiplier: 10 // Very high multiplier
      };
      
      const marginCalculator = new MarginCalculator(extremeConfig);
      
      // Create a portfolio
      const portfolio: Position[] = [
        {
          base: 'TRUR',
          totalPriceNumber: 10000
        } as Position
      ];
      
      // Calculate available margin
      const availableMargin = marginCalculator.calculateAvailableMargin(portfolio);
      
      // Should calculate correctly
      expect(availableMargin).toBe(90000); // 10000 * (10 - 1)
    });
  });

  describe('Performance Tests', () => {
    it('should handle large numbers of margin positions efficiently', async () => {
      // Dynamically import the balancer module
      const balancerModule = await import('../../balancer');
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create a large number of margin positions
      const largeMarginPositions: MarginPosition[] = [];
      const numPositions = 50;
      
      for (let i = 0; i < numPositions; i++) {
        largeMarginPositions.push({
          base: `ETF${i.toString().padStart(3, '0')}`,
          totalPriceNumber: 10000 + i * 1000,
          isMargin: true,
          marginValue: 5000 + i * 500,
          leverage: 2
        } as MarginPosition);
      }
      
      // Measure performance of margin strategy application
      const startTime = performance.now();
      
      // Apply margin strategy
      const strategyResult = balancerModule.applyMarginStrategy(largeMarginPositions);
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      
      // Verify result
      expect(strategyResult).toBeDefined();
      expect(typeof strategyResult.shouldRemoveMargin).toBe('boolean');
      
      // Should complete within reasonable time (less than 100ms for 50 positions)
      expect(executionTime).toBeLessThan(100);
    });
    
    it('should handle concurrent margin calculations', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create margin config
      const marginConfig: MarginConfig = {
        enabled: true,
        multiplier: 2,
        free_threshold: 10000,
        max_margin_size: 100000,
        strategy: 'keep_if_small'
      };
      
      const marginCalculator = new MarginCalculator(marginConfig);
      
      // Create multiple portfolios for concurrent processing
      const portfolios = Array.from({ length: 5 }, (_, i) => {
        const baseValue = 50000 + i * 10000;
        return [
          {
            base: 'TRUR',
            totalPriceNumber: baseValue
          } as Position
        ];
      });
      
      // Measure concurrent execution
      const startTime = performance.now();
      
      // Execute multiple calculations concurrently
      const results = await Promise.all(
        portfolios.map(portfolio => marginCalculator.calculateAvailableMargin(portfolio))
      );
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      
      // Verify all calculations completed
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(typeof result).toBe('number');
        expect(result).toBeGreaterThanOrEqual(0);
      });
      
      // Should complete efficiently
      expect(executionTime).toBeLessThan(50);
    });
  });
});