/**
 * Enhanced test coverage for configLoader.ts
 * Using actual CONFIG.test.json file for realistic testing
 * Targeting uncovered lines: 86-92,96-123,128-142
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync } from 'fs';
import { join } from 'path';
import { ConfigLoader } from '../../configLoader';
import { ProjectConfig, AccountConfig, ExchangeClosureBehavior } from '../../types.d';
import { TestEnvironment, TestDataFactory, ErrorTestUtils } from '../test-utils';

describe('ConfigLoader Enhanced Coverage', () => {
  let configLoader: any;
  let originalProcessCwd: any;
  let originalConsoleWarn: any;
  let originalConsoleLog: any;
  let originalEnv: any;
  let testConfig: ProjectConfig;

  beforeEach(() => {
    TestEnvironment.setup();
    
    // Set NODE_ENV to test to ensure test config is used
    process.env.NODE_ENV = 'test';
    
    // Save original environment
    originalEnv = { ...process.env };
    
    // Set mock environment variables for token resolution
    process.env.T_INVEST_TOKEN = 'test-token-from-env';
    
    // Keep actual cwd since we're using real config file
    originalProcessCwd = process.cwd;
    
    // Mock console methods to capture warnings/logs
    const mockLogs: string[] = [];
    const mockWarns: string[] = [];
    
    originalConsoleWarn = console.warn;
    originalConsoleLog = console.log;
    console.warn = (msg: string) => mockWarns.push(msg);
    console.log = (msg: string) => mockLogs.push(msg);
    
    // Load actual test config
    const configPath = join(process.cwd(), 'CONFIG.test.json');
    const configData = readFileSync(configPath, 'utf8');
    testConfig = JSON.parse(configData);
    
    // Reset ConfigLoader instance and create test instance
    (ConfigLoader as any).resetInstance();
    configLoader = (ConfigLoader as any).getInstance();
  });

  afterEach(() => {
    TestEnvironment.teardown();
    
    // Restore environment
    process.env = originalEnv;
    process.cwd = originalProcessCwd;
    
    // Restore console methods
    console.warn = originalConsoleWarn;
    console.log = originalConsoleLog;
    
    // Reset ConfigLoader state
    (ConfigLoader as any).resetInstance();
  });

  describe('Configuration loading with actual test config', () => {
    it('should load actual test configuration successfully', () => {
      const config = configLoader.loadConfig();
      
      expect(config).toBeDefined();
      expect(config.accounts).toBeDefined();
      expect(config.accounts).toHaveLength(1);
      expect(config.accounts[0].id).toBe('0');
      expect(config.accounts[0].name).toBe('Основной брокерский счет');
    });

    it('should cache loaded configuration', () => {
      const config1 = configLoader.loadConfig();
      const config2 = configLoader.loadConfig();
      
      expect(config1).toBe(config2); // Same reference
    });

    it('should resolve environment variable tokens', () => {
      const token = configLoader.getAccountToken('0');
      
      expect(token).toBe('test-token-from-env');
    });

    it('should identify environment variable tokens correctly', () => {
      const isFromEnv = configLoader.isTokenFromEnv('0');
      
      expect(isFromEnv).toBe(true);
    });

    it('should get raw token value', () => {
      const rawToken = configLoader.getRawTokenValue('0');
      
      expect(rawToken).toBe('${T_INVEST_TOKEN}');
    });

    it('should handle missing environment variable', () => {
      delete process.env.T_INVEST_TOKEN;
      
      const token = configLoader.getAccountToken('0');
      
      expect(token).toBeUndefined();
    });
  });

  describe('Configuration validation with test scenarios', () => {
    it('should validate account with all required fields from test config', () => {
      const config = configLoader.loadConfig();
      
      expect(config.accounts[0]).toHaveProperty('id');
      expect(config.accounts[0]).toHaveProperty('name');
      expect(config.accounts[0]).toHaveProperty('t_invest_token');
      expect(config.accounts[0]).toHaveProperty('account_id');
      expect(config.accounts[0]).toHaveProperty('desired_wallet');
      expect(Object.keys(config.accounts[0].desired_wallet).length).toBeGreaterThan(0);
    });

    it('should validate desired_wallet weights sum to approximately 100%', () => {
      const config = configLoader.loadConfig();
      const account = config.accounts[0];
      
      const totalWeight = Object.values(account.desired_wallet).reduce((sum, weight) => sum + weight, 0);
      expect(Math.abs(totalWeight - 100)).toBeLessThan(1);
    });

    it('should validate exchange_closure_behavior exists and is valid', () => {
      const config = configLoader.loadConfig();
      const account = config.accounts[0];
      
      expect(account.exchange_closure_behavior).toBeDefined();
      expect(['skip_iteration', 'force_orders', 'dry_run']).toContain(account.exchange_closure_behavior.mode);
      expect(typeof account.exchange_closure_behavior.update_iteration_result).toBe('boolean');
    });

    it('should validate margin trading configuration', () => {
      const config = configLoader.loadConfig();
      const account = config.accounts[0];
      
      expect(account.margin_trading).toBeDefined();
      expect(typeof account.margin_trading.enabled).toBe('boolean');
      expect(typeof account.margin_trading.multiplier).toBe('number');
      expect(typeof account.margin_trading.free_threshold).toBe('number');
      expect(typeof account.margin_trading.max_margin_size).toBe('number');
      expect(account.margin_trading.balancing_strategy).toBeDefined();
    });
  });

  describe('Token resolution and environment variables with test config', () => {
    it('should resolve token from environment variable using test config', () => {
      const token = configLoader.getAccountToken('0');
      
      expect(token).toBe('test-token-from-env');
    });

    it('should return undefined for missing environment variable', () => {
      delete process.env.T_INVEST_TOKEN;
      
      // Reset to force re-reading
      (configLoader as any).config = null;
      
      const token = configLoader.getAccountToken('0');
      
      expect(token).toBeUndefined();
    });

    it('should return raw token value from test config', () => {
      const rawToken = configLoader.getRawTokenValue('0');
      
      expect(rawToken).toBe('${T_INVEST_TOKEN}');
    });

    it('should return undefined for non-existent account in getAccountToken', () => {
      const resolvedToken = configLoader.getAccountToken('non-existent');
      
      expect(resolvedToken).toBeUndefined();
    });

    it('should return undefined for non-existent account in getRawTokenValue', () => {
      const rawToken = configLoader.getRawTokenValue('non-existent');
      
      expect(rawToken).toBeUndefined();
    });

    it('should correctly identify tokens from environment variables', () => {
      expect(configLoader.isTokenFromEnv('0')).toBe(true);
      expect(configLoader.isTokenFromEnv('non-existent')).toBe(false);
    });

    it('should return account_id for existing account', () => {
      const accountId = configLoader.getAccountAccountId('0');
      
      expect(accountId).toBe('0');
    });

    it('should return undefined for non-existent account in getAccountAccountId', () => {
      const accountId = configLoader.getAccountAccountId('non-existent');
      
      expect(accountId).toBeUndefined();
    });
  });

  describe('Account retrieval methods with test config', () => {
    it('should find account by ID', () => {
      const account = configLoader.getAccountById('0');
      
      expect(account).toBeDefined();
      expect(account!.id).toBe('0');
      expect(account!.name).toBe('Основной брокерский счет');
    });

    it('should return undefined for non-existent account ID', () => {
      const account = configLoader.getAccountById('non-existent');
      
      expect(account).toBeUndefined();
    });

    it('should find account by token (environment variable format)', () => {
      const account = configLoader.getAccountByToken('${T_INVEST_TOKEN}');
      
      expect(account).toBeDefined();
      expect(account!.id).toBe('0');
      expect(account!.t_invest_token).toBe('${T_INVEST_TOKEN}');
    });

    it('should return undefined for non-existent token', () => {
      const account = configLoader.getAccountByToken('t.non_existent');
      
      expect(account).toBeUndefined();
    });

    it('should return all accounts', () => {
      const allAccounts = configLoader.getAllAccounts();
      
      expect(allAccounts).toHaveLength(1);
      expect(allAccounts[0].id).toBe('0');
    });
  });

  describe('Configuration loading and caching with real config', () => {
    it('should cache configuration after first load', () => {
      // First call
      const result1 = configLoader.loadConfig();
      // Second call
      const result2 = configLoader.loadConfig();
      
      expect(result1).toBe(result2); // Same reference, indicating caching
    });

    it('should handle missing config file by using singleton pattern', () => {
      // Reset to force new instance with invalid path
      (ConfigLoader as any).resetInstance();
      const invalidConfigLoader = (ConfigLoader as any).getInstance('nonexistent.json');
      
      expect(() => {
        invalidConfigLoader.loadConfig();
      }).toThrow(/Configuration loading error:/);
    });
  });

  describe('Singleton pattern with test environment', () => {
    it('should return same instance when using default factory', () => {
      const instance1 = require('../../configLoader').configLoader;
      const instance2 = require('../../configLoader').configLoader;
      
      expect(instance1).toBe(instance2);
    });

    it('should support test config loader factory', () => {
      const testConfigLoader = require('../../configLoader').getTestConfigLoader();
      
      expect(testConfigLoader).toBeDefined();
      expect(() => testConfigLoader.loadConfig()).not.toThrow();
    });
  });

  describe('Edge cases and realistic scenarios', () => {
    it('should handle missing environment variables gracefully', () => {
      const originalToken = process.env.T_INVEST_TOKEN;
      delete process.env.T_INVEST_TOKEN;
      
      // Reset to force re-reading
      (configLoader as any).config = null;
      
      const token = configLoader.getAccountToken('0');
      expect(token).toBeUndefined();
      
      // Restore for other tests
      if (originalToken) {
        process.env.T_INVEST_TOKEN = originalToken;
      }
    });

    it('should validate token format detection correctly', () => {
      // Test with environment variable format
      expect(configLoader.isTokenFromEnv('0')).toBe(true);
      
      // Test with non-existent account
      expect(configLoader.isTokenFromEnv('non-existent')).toBe(false);
    });

    it('should handle configuration structure validation', () => {
      const config = configLoader.loadConfig();
      
      // Validate structure
      expect(config.accounts).toBeDefined();
      expect(Array.isArray(config.accounts)).toBe(true);
      expect(config.accounts.length).toBeGreaterThan(0);
      
      // Validate account structure
      const account = config.accounts[0];
      expect(account.id).toBeDefined();
      expect(account.name).toBeDefined();
      expect(account.t_invest_token).toBeDefined();
      expect(account.account_id).toBeDefined();
      expect(account.desired_wallet).toBeDefined();
    });

    it('should validate desired_wallet contains valid ETF tickers', () => {
      const config = configLoader.loadConfig();
      const account = config.accounts[0];
      const expectedTickers = ['TRAY', 'TGLD', 'TRUR', 'TRND', 'TBRU', 'TDIV', 'TITR', 'TLCB', 'TMON', 'TMOS', 'TOFZ', 'TPAY'];
      
      const walletTickers = Object.keys(account.desired_wallet);
      
      // Check that all wallet tickers are in expected list
      walletTickers.forEach(ticker => {
        expect(expectedTickers).toContain(ticker);
      });
      
      // Check weights are valid numbers
      Object.values(account.desired_wallet).forEach(weight => {
        expect(typeof weight).toBe('number');
        expect(weight).toBeGreaterThan(0);
        expect(weight).toBeLessThanOrEqual(100);
      });
    });
  });
});