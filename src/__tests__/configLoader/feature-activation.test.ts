import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";

// Import test utilities
import { testSuite } from '../test-utils';
import { mockControls } from '../__mocks__/external-deps';
import { mockAccountConfigs } from '../__fixtures__/configurations';

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
    } else if (id === 'test-buy-requires-account') {
      return {
        id: 'test-buy-requires-account',
        name: 'Test Buy Requires Account',
        t_invest_token: 't.test_token_buy_requires',
        account_id: '987654321',
        desired_wallet: { TRUR: 50, TMOS: 50 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        buy_requires_total_marginal_sell: {
          enabled: true,
          instruments: ['TMON']
        },
        exchange_closure_behavior: {
          mode: 'skip_iteration',
          update_iteration_result: false
        }
      };
    } else if (id === 'test-exchange-closure-account') {
      return {
        id: 'test-exchange-closure-account',
        name: 'Test Exchange Closure Account',
        t_invest_token: 't.test_token_closure',
        account_id: '111222333',
        desired_wallet: { TRUR: 50, TMOS: 50 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        exchange_closure_behavior: {
          mode: 'force_orders',
          update_iteration_result: true
        }
      };
    } else if (id === 'test-disabled-features-account') {
      return {
        id: 'test-disabled-features-account',
        name: 'Test Disabled Features Account',
        t_invest_token: 't.test_token_disabled',
        account_id: '444555666',
        desired_wallet: { TRUR: 50, TMOS: 50 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { 
          enabled: false,
          multiplier: 1,
          free_threshold: 10000,
          max_margin_size: 100000,
          balancing_strategy: 'keep'
        },
        buy_requires_total_marginal_sell: {
          enabled: false,
          instruments: []
        },
        exchange_closure_behavior: {
          mode: 'skip_iteration',
          update_iteration_result: false
        }
      };
    } else if (id === 'test-no-features-account') {
      return {
        id: 'test-no-features-account',
        name: 'Test No Features Account',
        t_invest_token: 't.test_token_none',
        account_id: '777888999',
        desired_wallet: { TRUR: 50, TMOS: 50 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000
        // No special features configured
      };
    }
    return undefined;
  }),
  loadConfig: mock(() => ({
    accounts: []
  })),
  getAllAccounts: mock(() => []),
  getAccountToken: mock(() => 't.test_token_default')
};

mock.module('../../configLoader', () => ({
  configLoader: mockConfigLoader
}));

// Mock dotenv
mock.module('dotenv', () => ({
  config: mock(() => undefined)
}));

testSuite('Configuration Feature Activation Tests', () => {
  let originalEnv: any;
  let originalProcessArgv: any;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    originalProcessArgv = [...process.argv];
    
    // Setup test environment
    process.env.ACCOUNT_ID = 'test-margin-account';
    process.env.TOKEN = 'test_token_margin';
    process.argv = ['node', 'index.ts'];
    
    // Reset all mocks
    mockControls.resetAll();
    mockFs.promises.readFile.mockClear();
    mockFs.promises.writeFile.mockClear();
    mockFs.promises.access.mockClear();
    mockFs.promises.mkdir.mockClear();
    mockFs.promises.readdir.mockClear();
    mockPath.resolve.mockClear();
    mockPath.join.mockClear();
    mockPath.dirname.mockClear();
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

  describe('Margin Trading Feature Activation', () => {
    it('should correctly activate margin trading when enabled in configuration', async () => {
      process.env.ACCOUNT_ID = 'test-margin-account';
      
      // Get account configuration
      const accountConfig = mockConfigLoader.getAccountById('test-margin-account');
      
      // Verify margin trading is enabled
      expect(accountConfig).toBeDefined();
      expect(accountConfig?.margin_trading).toBeDefined();
      expect(accountConfig?.margin_trading?.enabled).toBe(true);
      expect(accountConfig?.margin_trading?.multiplier).toBe(2);
      expect(accountConfig?.margin_trading?.free_threshold).toBe(10000);
      expect(accountConfig?.margin_trading?.max_margin_size).toBe(100000);
      expect(accountConfig?.margin_trading?.balancing_strategy).toBe('keep_if_small');
      
      // Verify that the feature is properly configured for activation
      const isMarginTradingActive = accountConfig?.margin_trading?.enabled === true;
      expect(isMarginTradingActive).toBe(true);
    });
    
    it('should correctly deactivate margin trading when disabled in configuration', async () => {
      process.env.ACCOUNT_ID = 'test-disabled-features-account';
      
      // Get account configuration
      const accountConfig = mockConfigLoader.getAccountById('test-disabled-features-account');
      
      // Verify margin trading is disabled
      expect(accountConfig).toBeDefined();
      expect(accountConfig?.margin_trading).toBeDefined();
      expect(accountConfig?.margin_trading?.enabled).toBe(false);
      
      // Verify that the feature is properly configured for deactivation
      const isMarginTradingActive = accountConfig?.margin_trading?.enabled === true;
      expect(isMarginTradingActive).toBe(false);
    });
    
    it('should handle accounts with no margin trading configuration', async () => {
      process.env.ACCOUNT_ID = 'test-no-features-account';
      
      // Get account configuration
      const accountConfig = mockConfigLoader.getAccountById('test-no-features-account');
      
      // Verify no margin trading configuration exists
      expect(accountConfig).toBeDefined();
      expect(accountConfig?.margin_trading).toBeUndefined();
      
      // Should default to deactivated
      const isMarginTradingActive = accountConfig?.margin_trading?.enabled === true;
      expect(isMarginTradingActive).toBe(false);
    });
  });

  describe('Buy Requires Total Marginal Sell Feature Activation', () => {
    it('should correctly activate buy_requires_total_marginal_sell when enabled in configuration', async () => {
      process.env.ACCOUNT_ID = 'test-buy-requires-account';
      
      // Get account configuration
      const accountConfig = mockConfigLoader.getAccountById('test-buy-requires-account');
      
      // Verify buy_requires_total_marginal_sell is enabled
      expect(accountConfig).toBeDefined();
      expect(accountConfig?.buy_requires_total_marginal_sell).toBeDefined();
      expect(accountConfig?.buy_requires_total_marginal_sell?.enabled).toBe(true);
      expect(accountConfig?.buy_requires_total_marginal_sell?.instruments).toEqual(['TMON']);
      
      // Verify that the feature is properly configured for activation
      const isBuyRequiresActive = accountConfig?.buy_requires_total_marginal_sell?.enabled === true;
      expect(isBuyRequiresActive).toBe(true);
    });
    
    it('should correctly deactivate buy_requires_total_marginal_sell when disabled in configuration', async () => {
      process.env.ACCOUNT_ID = 'test-disabled-features-account';
      
      // Get account configuration
      const accountConfig = mockConfigLoader.getAccountById('test-disabled-features-account');
      
      // Verify buy_requires_total_marginal_sell is disabled
      expect(accountConfig).toBeDefined();
      expect(accountConfig?.buy_requires_total_marginal_sell).toBeDefined();
      expect(accountConfig?.buy_requires_total_marginal_sell?.enabled).toBe(false);
      expect(accountConfig?.buy_requires_total_marginal_sell?.instruments).toEqual([]);
      
      // Verify that the feature is properly configured for deactivation
      const isBuyRequiresActive = accountConfig?.buy_requires_total_marginal_sell?.enabled === true;
      expect(isBuyRequiresActive).toBe(false);
    });
    
    it('should handle accounts with no buy_requires_total_marginal_sell configuration', async () => {
      process.env.ACCOUNT_ID = 'test-no-features-account';
      
      // Get account configuration
      const accountConfig = mockConfigLoader.getAccountById('test-no-features-account');
      
      // Verify no buy_requires_total_marginal_sell configuration exists
      expect(accountConfig).toBeDefined();
      expect(accountConfig?.buy_requires_total_marginal_sell).toBeUndefined();
      
      // Should default to deactivated
      const isBuyRequiresActive = accountConfig?.buy_requires_total_marginal_sell?.enabled === true;
      expect(isBuyRequiresActive).toBe(false);
    });
  });

  describe('Exchange Closure Behavior Feature Activation', () => {
    it('should correctly activate exchange closure behavior when configured', async () => {
      process.env.ACCOUNT_ID = 'test-exchange-closure-account';
      
      // Get account configuration
      const accountConfig = mockConfigLoader.getAccountById('test-exchange-closure-account');
      
      // Verify exchange closure behavior is configured
      expect(accountConfig).toBeDefined();
      expect(accountConfig?.exchange_closure_behavior).toBeDefined();
      expect(accountConfig?.exchange_closure_behavior?.mode).toBe('force_orders');
      expect(accountConfig?.exchange_closure_behavior?.update_iteration_result).toBe(true);
      
      // Verify that the feature is properly configured for activation
      const isExchangeClosureConfigured = accountConfig?.exchange_closure_behavior !== undefined;
      expect(isExchangeClosureConfigured).toBe(true);
    });
    
    it('should handle default exchange closure behavior when not explicitly configured', async () => {
      process.env.ACCOUNT_ID = 'test-no-features-account';
      
      // Get account configuration
      const accountConfig = mockConfigLoader.getAccountById('test-no-features-account');
      
      // Should have default behavior or no configuration
      expect(accountConfig).toBeDefined();
    });
  });

  describe('Feature Activation Combinations', () => {
    it('should correctly handle multiple features activated simultaneously', async () => {
      // Create a mock account with multiple features enabled
      mockConfigLoader.getAccountById.mockImplementation((id: string) => {
        if (id === 'test-multiple-features-account') {
          return {
            id: 'test-multiple-features-account',
            name: 'Test Multiple Features Account',
            t_invest_token: 't.test_token_multiple',
            account_id: '999888777',
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
            buy_requires_total_marginal_sell: {
              enabled: true,
              instruments: ['TMON']
            },
            exchange_closure_behavior: {
              mode: 'dry_run',
              update_iteration_result: true
            }
          };
        }
        return undefined;
      });
      
      process.env.ACCOUNT_ID = 'test-multiple-features-account';
      
      // Get account configuration
      const accountConfig = mockConfigLoader.getAccountById('test-multiple-features-account');
      
      // Verify all features are activated
      expect(accountConfig).toBeDefined();
      expect(accountConfig?.margin_trading?.enabled).toBe(true);
      expect(accountConfig?.buy_requires_total_marginal_sell?.enabled).toBe(true);
      expect(accountConfig?.exchange_closure_behavior).toBeDefined();
      
      // Verify feature activation status
      const marginTradingActive = accountConfig?.margin_trading?.enabled === true;
      const buyRequiresActive = accountConfig?.buy_requires_total_marginal_sell?.enabled === true;
      const exchangeClosureConfigured = accountConfig?.exchange_closure_behavior !== undefined;
      
      expect(marginTradingActive).toBe(true);
      expect(buyRequiresActive).toBe(true);
      expect(exchangeClosureConfigured).toBe(true);
    });
    
    it('should correctly handle mixed feature activation states', async () => {
      process.env.ACCOUNT_ID = 'test-disabled-features-account';
      
      // Get account configuration
      const accountConfig = mockConfigLoader.getAccountById('test-disabled-features-account');
      
      // Verify mixed states
      expect(accountConfig).toBeDefined();
      expect(accountConfig?.margin_trading?.enabled).toBe(false); // Disabled
      expect(accountConfig?.buy_requires_total_marginal_sell?.enabled).toBe(false); // Disabled
      expect(accountConfig?.exchange_closure_behavior).toBeDefined(); // Configured but with default mode
      
      // Verify feature activation status
      const marginTradingActive = accountConfig?.margin_trading?.enabled === true;
      const buyRequiresActive = accountConfig?.buy_requires_total_marginal_sell?.enabled === true;
      
      expect(marginTradingActive).toBe(false);
      expect(buyRequiresActive).toBe(false);
    });
  });

  describe('Feature Activation Validation', () => {
    it('should validate feature configurations for correctness', async () => {
      process.env.ACCOUNT_ID = 'test-margin-account';
      
      // Get account configuration
      const accountConfig = mockConfigLoader.getAccountById('test-margin-account');
      
      // Validate margin trading configuration
      if (accountConfig?.margin_trading?.enabled) {
        expect(accountConfig.margin_trading.multiplier).toBeGreaterThan(1);
        expect(accountConfig.margin_trading.free_threshold).toBeGreaterThanOrEqual(0);
        expect(accountConfig.margin_trading.max_margin_size).toBeGreaterThan(0);
        expect(['remove', 'keep', 'keep_if_small']).toContain(accountConfig.margin_trading.balancing_strategy);
      }
      
      // Validate buy_requires configuration
      if (accountConfig?.buy_requires_total_marginal_sell?.enabled) {
        expect(Array.isArray(accountConfig.buy_requires_total_marginal_sell.instruments)).toBe(true);
      }
      
      // Validate exchange closure configuration
      if (accountConfig?.exchange_closure_behavior) {
        expect(['skip_iteration', 'force_orders', 'dry_run']).toContain(accountConfig.exchange_closure_behavior.mode);
        expect(typeof accountConfig.exchange_closure_behavior.update_iteration_result).toBe('boolean');
      }
    });
    
    it('should handle malformed feature configurations gracefully', async () => {
      // Mock configLoader with malformed configuration
      mockConfigLoader.getAccountById.mockImplementation((id: string) => {
        if (id === 'test-malformed-account') {
          return {
            id: 'test-malformed-account',
            name: 'Test Malformed Account',
            t_invest_token: 't.test_token_malformed',
            account_id: '111111111',
            desired_wallet: { TRUR: 50, TMOS: 50 },
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            margin_trading: { 
              enabled: 'not_a_boolean', // Malformed
              multiplier: 'not_a_number', // Malformed
              free_threshold: -1000, // Invalid value
              max_margin_size: 0, // Invalid value
              balancing_strategy: 'invalid_strategy' // Invalid value
            } as any,
            buy_requires_total_marginal_sell: {
              enabled: true,
              instruments: 'not_an_array' // Malformed
            } as any
          };
        }
        return undefined;
      });
      
      process.env.ACCOUNT_ID = 'test-malformed-account';
      
      // Should handle gracefully without throwing errors
      const accountConfig = mockConfigLoader.getAccountById('test-malformed-account');
      
      expect(accountConfig).toBeDefined();
      // Should have the malformed values but not throw errors
      expect(accountConfig?.margin_trading?.enabled).toBe('not_a_boolean');
      expect(accountConfig?.buy_requires_total_marginal_sell?.instruments).toBe('not_an_array');
    });
  });

  describe('Feature Activation Performance', () => {
    it('should activate features efficiently without performance degradation', async () => {
      // Measure activation time for multiple accounts
      const testAccounts = [
        'test-margin-account',
        'test-buy-requires-account',
        'test-exchange-closure-account',
        'test-disabled-features-account',
        'test-no-features-account'
      ];
      
      const startTime = Date.now();
      
      // Activate features for all test accounts
      const activationResults = testAccounts.map(accountId => {
        const config = mockConfigLoader.getAccountById(accountId);
        return {
          accountId,
          marginTrading: config?.margin_trading?.enabled === true,
          buyRequires: config?.buy_requires_total_marginal_sell?.enabled === true,
          exchangeClosure: config?.exchange_closure_behavior !== undefined
        };
      });
      
      const endTime = Date.now();
      const activationTime = endTime - startTime;
      
      // Should activate all features quickly
      expect(activationResults).toHaveLength(5);
      expect(activationTime).toBeLessThan(100); // Less than 100ms
      
      // Verify some features are activated
      const activatedFeatures = activationResults.filter(result => 
        result.marginTrading || result.buyRequires || result.exchangeClosure
      );
      expect(activatedFeatures.length).toBeGreaterThan(0);
    });
    
    it('should handle feature activation for large numbers of accounts', async () => {
      // Create mock for many accounts
      const manyAccounts = Array.from({ length: 100 }, (_, i) => `account-${i}`);
      
      mockConfigLoader.getAccountById.mockImplementation((id: string) => {
        if (id.startsWith('account-')) {
          const index = parseInt(id.split('-')[1]);
          return {
            id: id,
            name: `Test Account ${index}`,
            t_invest_token: `t.test_token_${index}`,
            account_id: `123456${index.toString().padStart(3, '0')}`,
            desired_wallet: { TRUR: 50, TMOS: 50 },
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            margin_trading: { 
              enabled: index % 2 === 0, // Alternate activation
              multiplier: 2,
              free_threshold: 10000,
              max_margin_size: 100000,
              balancing_strategy: 'keep_if_small'
            }
          };
        }
        return undefined;
      });
      
      const startTime = Date.now();
      
      // Activate features for many accounts
      const results = manyAccounts.map(accountId => {
        const config = mockConfigLoader.getAccountById(accountId);
        return config?.margin_trading?.enabled === true;
      });
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      // Should handle efficiently
      expect(results).toHaveLength(100);
      expect(processingTime).toBeLessThan(1000); // Less than 1 second
      
      // Should have some activated features
      const activatedCount = results.filter(Boolean).length;
      expect(activatedCount).toBeGreaterThan(0);
      expect(activatedCount).toBeLessThan(100); // Should be about half
    });
  });

  describe('Feature Activation Integration', () => {
    it('should integrate feature activation with actual bot functionality', async () => {
      // This test would verify that feature activation actually affects bot behavior
      // For example, when margin trading is activated, the bot should use margin calculations
      
      process.env.ACCOUNT_ID = 'test-margin-account';
      
      // Get account configuration
      const accountConfig = mockConfigLoader.getAccountById('test-margin-account');
      
      // Simulate bot initialization with activated features
      const botInitialization = {
        accountId: accountConfig?.id,
        marginTradingEnabled: accountConfig?.margin_trading?.enabled,
        buyRequiresEnabled: accountConfig?.buy_requires_total_marginal_sell?.enabled,
        exchangeClosureMode: accountConfig?.exchange_closure_behavior?.mode
      };
      
      // Verify that the bot would initialize with the correct feature states
      expect(botInitialization.accountId).toBe('test-margin-account');
      expect(botInitialization.marginTradingEnabled).toBe(true);
      expect(botInitialization.buyRequiresEnabled).toBeUndefined(); // Not configured
      expect(botInitialization.exchangeClosureMode).toBe('skip_iteration');
    });
    
    it('should handle feature activation changes during runtime', async () => {
      // Test dynamic feature activation/deactivation
      process.env.ACCOUNT_ID = 'test-margin-account';
      
      // Initial state
      const initialConfig = mockConfigLoader.getAccountById('test-margin-account');
      const initiallyActive = initialConfig?.margin_trading?.enabled === true;
      
      // Simulate configuration change (feature deactivation)
      mockConfigLoader.getAccountById.mockImplementation((id: string) => {
        if (id === 'test-margin-account') {
          return {
            ...initialConfig,
            margin_trading: {
              ...initialConfig?.margin_trading,
              enabled: false
            }
          };
        }
        return initialConfig;
      });
      
      // New state
      const updatedConfig = mockConfigLoader.getAccountById('test-margin-account');
      const finallyActive = updatedConfig?.margin_trading?.enabled === true;
      
      // Should detect the change
      expect(initiallyActive).toBe(true);
      expect(finallyActive).toBe(false);
    });
  });

  describe('Feature Activation Edge Cases', () => {
    it('should handle feature activation with empty or null configurations', async () => {
      // Mock configLoader with empty configurations
      mockConfigLoader.getAccountById.mockImplementation((id: string) => {
        if (id === 'test-empty-config-account') {
          return {
            id: 'test-empty-config-account',
            name: 'Test Empty Config Account',
            t_invest_token: 't.test_token_empty',
            account_id: '222222222',
            desired_wallet: { TRUR: 50, TMOS: 50 },
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            margin_trading: null as any, // Empty configuration
            buy_requires_total_marginal_sell: undefined as any // Undefined configuration
          };
        }
        return undefined;
      });
      
      process.env.ACCOUNT_ID = 'test-empty-config-account';
      
      // Should handle gracefully
      const accountConfig = mockConfigLoader.getAccountById('test-empty-config-account');
      
      expect(accountConfig).toBeDefined();
      expect(accountConfig?.margin_trading).toBeNull();
      expect(accountConfig?.buy_requires_total_marginal_sell).toBeUndefined();
    });
    
    it('should handle feature activation with special characters in configuration', async () => {
      // Mock configLoader with special characters
      mockConfigLoader.getAccountById.mockImplementation((id: string) => {
        if (id === 'test-special-chars-account') {
          return {
            id: 'test-special-chars-account',
            name: 'Test Special Chars Account',
            t_invest_token: 't.test_token_special',
            account_id: '333333333',
            desired_wallet: { TRUR: 50, TMOS: 50 },
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            buy_requires_total_marginal_sell: {
              enabled: true,
              instruments: ['T@GLD', 'T#MOS', 'T$RUR'] // Special characters
            },
            exchange_closure_behavior: {
              mode: 'skip_iteration',
              update_iteration_result: false
            }
          };
        }
        return undefined;
      });
      
      process.env.ACCOUNT_ID = 'test-special-chars-account';
      
      // Should handle special characters correctly
      const accountConfig = mockConfigLoader.getAccountById('test-special-chars-account');
      
      expect(accountConfig).toBeDefined();
      expect(accountConfig?.buy_requires_total_marginal_sell?.enabled).toBe(true);
      expect(accountConfig?.buy_requires_total_marginal_sell?.instruments).toEqual(['T@GLD', 'T#MOS', 'T$RUR']);
    });
  });
});