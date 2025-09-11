import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";

// Import test utilities
import { testSuite } from '../test-utils';
import { MarginPosition, Position, MarginConfig, MarginBalancingStrategy } from '../../types.d';
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
    // Return different configurations based on the test account ID
    if (id === 'test-remove-strategy-account') {
      return {
        id: 'test-remove-strategy-account',
        name: 'Test Remove Strategy Account',
        t_invest_token: 't.test_token_remove',
        account_id: '123456789',
        desired_wallet: { TRUR: 50, TMOS: 50 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { 
          enabled: true,
          multiplier: 2,
          free_threshold: 10000,
          max_margin_size: 100000,
          balancing_strategy: 'remove' // Remove strategy
        },
        exchange_closure_behavior: {
          mode: 'skip_iteration',
          update_iteration_result: false
        }
      };
    } else if (id === 'test-keep-strategy-account') {
      return {
        id: 'test-keep-strategy-account',
        name: 'Test Keep Strategy Account',
        t_invest_token: 't.test_token_keep',
        account_id: '987654321',
        desired_wallet: { TRUR: 50, TMOS: 50 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { 
          enabled: true,
          multiplier: 2,
          free_threshold: 10000,
          max_margin_size: 100000,
          balancing_strategy: 'keep' // Keep strategy
        },
        exchange_closure_behavior: {
          mode: 'skip_iteration',
          update_iteration_result: false
        }
      };
    } else if (id === 'test-keep-if-small-strategy-account') {
      return {
        id: 'test-keep-if-small-strategy-account',
        name: 'Test Keep If Small Strategy Account',
        t_invest_token: 't.test_token_keep_if_small',
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
          balancing_strategy: 'keep_if_small' // Keep if small strategy
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
  getAccountToken: mock((id: string) => {
    if (id === 'test-remove-strategy-account') return 't.test_token_remove';
    if (id === 'test-keep-strategy-account') return 't.test_token_keep';
    if (id === 'test-keep-if-small-strategy-account') return 't.test_token_keep_if_small';
    return 't.test_token_default';
  })
};

mock.module('../../configLoader', () => ({
  configLoader: mockConfigLoader
}));

// Mock dotenv
mock.module('dotenv', () => ({
  config: mock(() => undefined)
}));

testSuite('Margin Trading Strategies Tests', () => {
  let originalEnv: any;
  let originalProcessArgv: any;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    originalProcessArgv = [...process.argv];
    
    // Setup default test environment
    process.env.ACCOUNT_ID = 'test-remove-strategy-account';
    process.env.TOKEN = 'test_token_remove';
    process.argv = ['node', 'index.ts'];
    
    // Reset all mocks
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
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    process.argv = originalProcessArgv;
  });

  describe('Remove Strategy Tests', () => {
    beforeEach(() => {
      process.env.ACCOUNT_ID = 'test-remove-strategy-account';
      process.env.TOKEN = 'test_token_remove';
    });
    
    it('should always remove margin positions when using remove strategy', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create configuration with remove strategy
      const config: MarginConfig = {
        multiplier: 2.0,
        freeThreshold: 10000,
        maxMarginSize: 100000,
        strategy: 'remove'
      };
      
      const calculator = new MarginCalculator(config);
      
      // Create mock margin positions
      const marginPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 50000
          }),
          isMargin: true,
          marginValue: 25000,
          leverage: 2.0,
          marginCall: false
        },
        {
          ...createMockPosition({
            base: 'TMOS',
            totalPriceNumber: 30000
          }),
          isMargin: true,
          marginValue: 15000,
          leverage: 2.0,
          marginCall: false
        }
      ];
      
      // Apply margin strategy - should always recommend removal with remove strategy
      const result = calculator.applyMarginStrategy(marginPositions, 'remove');
      
      expect(result.shouldRemoveMargin).toBe(true);
      expect(result.reason).toContain('remove margin');
      expect(result.transferCost).toBeGreaterThan(0);
    });
    
    it('should calculate correct transfer costs for remove strategy', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create configuration with remove strategy
      const config: MarginConfig = {
        multiplier: 2.0,
        freeThreshold: 10000,
        maxMarginSize: 100000,
        strategy: 'remove'
      };
      
      const calculator = new MarginCalculator(config);
      
      // Create mock margin positions with different values
      const marginPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 15000 // Below free threshold
          }),
          isMargin: true,
          marginValue: 7500,
          leverage: 2.0,
          marginCall: false
        },
        {
          ...createMockPosition({
            base: 'TMOS',
            totalPriceNumber: 25000 // Above free threshold
          }),
          isMargin: true,
          marginValue: 12500,
          leverage: 2.0,
          marginCall: false
        }
      ];
      
      // Calculate transfer costs
      const transferInfo = calculator.calculateTransferCost(marginPositions);
      
      // Verify cost calculation
      expect(transferInfo.totalCost).toBe(250); // 25000 * 0.01 (only TMOS has cost, TRUR is free)
      expect(transferInfo.freeTransfers).toBe(1); // TRUR is free
      expect(transferInfo.paidTransfers).toBe(1); // TMOS has cost
      expect(transferInfo.costBreakdown).toHaveLength(2);
      
      // Check individual costs
      const trurCost = transferInfo.costBreakdown.find(item => item.ticker === 'TRUR');
      const tmosCost = transferInfo.costBreakdown.find(item => item.ticker === 'TMOS');
      
      expect(trurCost?.cost).toBe(0);
      expect(trurCost?.isFree).toBe(true);
      expect(tmosCost?.cost).toBe(250);
      expect(tmosCost?.isFree).toBe(false);
    });
  });

  describe('Keep Strategy Tests', () => {
    beforeEach(() => {
      process.env.ACCOUNT_ID = 'test-keep-strategy-account';
      process.env.TOKEN = 'test_token_keep';
    });
    
    it('should never remove margin positions when using keep strategy', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create configuration with keep strategy
      const config: MarginConfig = {
        multiplier: 2.0,
        freeThreshold: 10000,
        maxMarginSize: 100000,
        strategy: 'keep'
      };
      
      const calculator = new MarginCalculator(config);
      
      // Create mock margin positions (even large ones)
      const marginPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 150000 // Large position
          }),
          isMargin: true,
          marginValue: 75000,
          leverage: 2.0,
          marginCall: false
        }
      ];
      
      // Apply margin strategy - should never recommend removal with keep strategy
      const result = calculator.applyMarginStrategy(marginPositions, 'keep');
      
      expect(result.shouldRemoveMargin).toBe(false);
      expect(result.reason).toContain('keep margin');
      expect(result.transferCost).toBe(0);
    });
    
    it('should keep margin positions even when exceeding limits with keep strategy', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create configuration with keep strategy and low max margin size
      const config: MarginConfig = {
        multiplier: 2.0,
        freeThreshold: 10000,
        maxMarginSize: 1000, // Very low limit
        strategy: 'keep'
      };
      
      const calculator = new MarginCalculator(config);
      
      // Create mock margin positions that exceed the limit
      const marginPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 50000
          }),
          isMargin: true,
          marginValue: 25000,
          leverage: 2.0,
          marginCall: false
        }
      ];
      
      // Validate margin limits - should show as invalid
      const validation = calculator.validateMarginLimits(marginPositions);
      expect(validation.isValid).toBe(false);
      expect(validation.exceededAmount).toBeGreaterThan(0);
      
      // But apply strategy should still recommend keeping
      const result = calculator.applyMarginStrategy(marginPositions, 'keep');
      expect(result.shouldRemoveMargin).toBe(false);
      expect(result.reason).toContain('keep margin');
    });
  });

  describe('Keep If Small Strategy Tests', () => {
    beforeEach(() => {
      process.env.ACCOUNT_ID = 'test-keep-if-small-strategy-account';
      process.env.TOKEN = 'test_token_keep_if_small';
    });
    
    it('should keep margin positions when they are below the maximum size limit', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create configuration with keep_if_small strategy
      const config: MarginConfig = {
        multiplier: 2.0,
        freeThreshold: 10000,
        maxMarginSize: 100000, // 100,000 RUB limit
        strategy: 'keep_if_small'
      };
      
      const calculator = new MarginCalculator(config);
      
      // Create mock margin positions that are below the limit
      const marginPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 50000 // Below limit
          }),
          isMargin: true,
          marginValue: 25000,
          leverage: 2.0,
          marginCall: false
        }
      ];
      
      // Apply margin strategy - should recommend keeping small positions
      const result = calculator.applyMarginStrategy(marginPositions, 'keep_if_small');
      
      expect(result.shouldRemoveMargin).toBe(false);
      expect(result.reason).toContain('keep margin');
      expect(result.reason).toContain('sum 50000.00 rub <= max 100000 rub');
      expect(result.transferCost).toBe(0);
    });
    
    it('should remove margin positions when they exceed the maximum size limit', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create configuration with keep_if_small strategy
      const config: MarginConfig = {
        multiplier: 2.0,
        freeThreshold: 10000,
        maxMarginSize: 100000, // 100,000 RUB limit
        strategy: 'keep_if_small'
      };
      
      const calculator = new MarginCalculator(config);
      
      // Create mock margin positions that exceed the limit
      const marginPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 150000 // Above limit
          }),
          isMargin: true,
          marginValue: 75000,
          leverage: 2.0,
          marginCall: false
        }
      ];
      
      // Apply margin strategy - should recommend removing large positions
      const result = calculator.applyMarginStrategy(marginPositions, 'keep_if_small');
      
      expect(result.shouldRemoveMargin).toBe(true);
      expect(result.reason).toContain('remove margin');
      expect(result.reason).toContain('sum 150000.00 rub > max 100000 rub');
      expect(result.transferCost).toBeGreaterThan(0);
    });
    
    it('should handle edge case with exactly at limit', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create configuration with keep_if_small strategy
      const config: MarginConfig = {
        multiplier: 2.0,
        freeThreshold: 10000,
        maxMarginSize: 100000, // 100,000 RUB limit
        strategy: 'keep_if_small'
      };
      
      const calculator = new MarginCalculator(config);
      
      // Create mock margin positions exactly at the limit
      const marginPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 100000 // Exactly at limit
          }),
          isMargin: true,
          marginValue: 50000,
          leverage: 2.0,
          marginCall: false
        }
      ];
      
      // Apply margin strategy - should recommend keeping positions at limit
      const result = calculator.applyMarginStrategy(marginPositions, 'keep_if_small');
      
      expect(result.shouldRemoveMargin).toBe(false);
      expect(result.reason).toContain('keep margin');
      expect(result.reason).toContain('sum 100000.00 rub <= max 100000 rub');
      expect(result.transferCost).toBe(0);
    });
  });

  describe('Strategy Integration Tests', () => {
    it('should correctly read and apply different margin trading strategies from configuration', async () => {
      // Test remove strategy account
      process.env.ACCOUNT_ID = 'test-remove-strategy-account';
      let accountConfig = mockConfigLoader.getAccountById('test-remove-strategy-account');
      expect(accountConfig?.margin_trading.balancing_strategy).toBe('remove');
      
      // Test keep strategy account
      process.env.ACCOUNT_ID = 'test-keep-strategy-account';
      accountConfig = mockConfigLoader.getAccountById('test-keep-strategy-account');
      expect(accountConfig?.margin_trading.balancing_strategy).toBe('keep');
      
      // Test keep_if_small strategy account
      process.env.ACCOUNT_ID = 'test-keep-if-small-strategy-account';
      accountConfig = mockConfigLoader.getAccountById('test-keep-if-small-strategy-account');
      expect(accountConfig?.margin_trading.balancing_strategy).toBe('keep_if_small');
    });
    
    it('should handle missing or undefined strategy gracefully', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create configuration without strategy
      const config: MarginConfig = {
        multiplier: 2.0,
        freeThreshold: 10000
        // No strategy specified
      };
      
      const calculator = new MarginCalculator(config);
      
      // Create mock margin positions
      const marginPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 50000
          }),
          isMargin: true,
          marginValue: 25000,
          leverage: 2.0,
          marginCall: false
        }
      ];
      
      // Apply margin strategy without specifying strategy - should use default behavior
      const result = calculator.applyMarginStrategy(marginPositions);
      
      // Should have a defined result even without explicit strategy
      expect(result).toBeDefined();
      expect(typeof result.shouldRemoveMargin).toBe('boolean');
      expect(typeof result.reason).toBe('string');
      expect(typeof result.transferCost).toBe('number');
    });
    
    it('should handle unknown strategy gracefully', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create configuration with default settings
      const config: MarginConfig = {
        multiplier: 2.0,
        freeThreshold: 10000
      };
      
      const calculator = new MarginCalculator(config);
      
      // Create mock margin positions
      const marginPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 50000
          }),
          isMargin: true,
          marginValue: 25000,
          leverage: 2.0,
          marginCall: false
        }
      ];
      
      // Apply margin strategy with unknown strategy
      const result = calculator.applyMarginStrategy(
        marginPositions,
        'unknown_strategy' as MarginBalancingStrategy
      );
      
      // Should handle gracefully with default behavior
      expect(result.shouldRemoveMargin).toBe(false);
      expect(result.reason).toBe('Unknown strategy');
      expect(result.transferCost).toBe(0);
    });
  });

  describe('Time-Based Strategy Application', () => {
    it('should apply strategies based on time proximity to market close', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create configuration with remove strategy
      const config: MarginConfig = {
        multiplier: 2.0,
        freeThreshold: 10000,
        maxMarginSize: 100000,
        strategy: 'remove'
      };
      
      const calculator = new MarginCalculator(config);
      
      // Create mock margin positions
      const marginPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 50000
          }),
          isMargin: true,
          marginValue: 25000,
          leverage: 2.0,
          marginCall: false
        }
      ];
      
      // Test time close to market close
      const closeTime = new Date();
      closeTime.setHours(18, 30, 0, 0); // 18:30, 15 minutes before close
      
      const result = calculator.applyMarginStrategy(
        marginPositions,
        'remove',
        closeTime,
        60000 * 60, // 1 hour interval
        '18:45' // Market close time
      );
      
      // Should apply strategy when close to market close
      expect(result.shouldRemoveMargin).toBe(true);
      expect(result.reason).toContain('remove margin at market close');
      expect(result.timeInfo.timeToClose).toBe(15); // 15 minutes to close
      expect(result.timeInfo.isLastBalance).toBe(true);
    });
    
    it('should not apply strategies when not close to market close', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create configuration with remove strategy
      const config: MarginConfig = {
        multiplier: 2.0,
        freeThreshold: 10000,
        maxMarginSize: 100000,
        strategy: 'remove'
      };
      
      const calculator = new MarginCalculator(config);
      
      // Create mock margin positions
      const marginPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 50000
          }),
          isMargin: true,
          marginValue: 25000,
          leverage: 2.0,
          marginCall: false
        }
      ];
      
      // Test time far from market close
      const earlyTime = new Date();
      earlyTime.setHours(10, 0, 0, 0); // 10:00 AM
      
      const result = calculator.applyMarginStrategy(
        marginPositions,
        'remove',
        earlyTime,
        60000 * 60, // 1 hour interval
        '18:45' // Market close time
      );
      
      // Should not apply strategy when far from market close
      expect(result.shouldRemoveMargin).toBe(false);
      expect(result.reason).toContain('Not time to apply margin strategy');
      expect(result.transferCost).toBe(0);
    });
  });

  describe('Strategy Performance and Edge Cases', () => {
    it('should handle empty margin positions with all strategies', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create configuration with each strategy
      const strategies: MarginBalancingStrategy[] = ['remove', 'keep', 'keep_if_small'];
      const config: MarginConfig = {
        multiplier: 2.0,
        freeThreshold: 10000,
        maxMarginSize: 100000
      };
      
      const calculator = new MarginCalculator(config);
      
      // Test with empty margin positions
      const emptyPositions: MarginPosition[] = [];
      
      strategies.forEach(strategy => {
        const result = calculator.applyMarginStrategy(emptyPositions, strategy);
        
        // Should handle gracefully
        expect(result.shouldRemoveMargin).toBe(false);
        expect(result.transferCost).toBe(0);
      });
    });
    
    it('should handle large portfolios with all strategies', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create configuration with remove strategy
      const config: MarginConfig = {
        multiplier: 2.0,
        freeThreshold: 10000,
        maxMarginSize: 1000000, // 1M RUB limit
        strategy: 'remove'
      };
      
      const calculator = new MarginCalculator(config);
      
      // Create large portfolio with many margin positions
      const largePortfolio: Position[] = [];
      const largeMarginPositions: MarginPosition[] = [];
      
      for (let i = 0; i < 50; i++) {
        largePortfolio.push(
          createMockPosition({
            base: `TICKER${i}`,
            totalPriceNumber: 10000 * (i + 1)
          })
        );
        
        largeMarginPositions.push({
          ...createMockPosition({
            base: `TICKER${i}`,
            totalPriceNumber: 10000 * (i + 1)
          }),
          isMargin: true,
          marginValue: 5000 * (i + 1),
          leverage: 2.0,
          marginCall: false
        });
      }
      
      // Should handle large portfolios efficiently
      const startTime = Date.now();
      const result = calculator.applyMarginStrategy(largeMarginPositions, 'remove');
      const endTime = Date.now();
      
      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second
      
      // Should have valid result
      expect(result.shouldRemoveMargin).toBe(true);
      expect(result.transferCost).toBeGreaterThan(0);
    });
    
    it('should handle extreme values in margin calculations', async () => {
      // Dynamically import the margin calculator
      const { MarginCalculator } = await import('../../utils/marginCalculator');
      
      // Create configuration with extreme values
      const config: MarginConfig = {
        multiplier: 100, // Extreme multiplier
        freeThreshold: 0, // No free threshold
        maxMarginSize: Number.MAX_SAFE_INTEGER, // Maximum possible size
        strategy: 'keep_if_small'
      };
      
      const calculator = new MarginCalculator(config);
      
      // Create margin positions with extreme values
      const extremePositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'EXTREME',
            totalPriceNumber: 1000000000 // 1 billion RUB
          }),
          isMargin: true,
          marginValue: 990000000, // 990 million RUB margin
          leverage: 100,
          marginCall: false
        }
      ];
      
      // Should handle extreme values without errors
      const validation = calculator.validateMarginLimits(extremePositions);
      expect(validation.isValid).toBe(true); // Within max safe integer
      
      const result = calculator.applyMarginStrategy(extremePositions, 'keep_if_small');
      expect(typeof result.shouldRemoveMargin).toBe('boolean');
      expect(typeof result.transferCost).toBe('number');
    });
  });
});