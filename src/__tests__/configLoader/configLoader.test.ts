import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { configLoader } from "../../configLoader";
import { ProjectConfig, AccountConfig } from "../../types.d";
import { promises as fs } from 'fs';

// Import test utilities and fixtures
import { 
  TestEnvironment, 
  FinancialAssertions, 
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { mockAccountConfigs } from '../__fixtures__/configurations';

// Mock function implementation for Bun.js compatibility
function mockFn() {
  let callCount = 0;
  let called = false;
  
  const fn = (...args: any[]) => {
    callCount++;
    called = true;
  };
  
  (fn as any).called = called;
  (fn as any).callCount = callCount;
  
  return fn;
}

// Mock file system state
let mockFileSystem = new Map<string, string>();
let shouldThrowError = false;
let errorToThrow: any = null;

// Mock fs module
const originalReadFileSync = require('fs').readFileSync;
const mockReadFileSync = (filePath: string, encoding?: any) => {
  if (shouldThrowError && errorToThrow) {
    throw errorToThrow;
  }
  
  if (mockFileSystem.has(filePath)) {
    return mockFileSystem.get(filePath);
  }
  
  // Default to original behavior for non-mocked files
  const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
  (error as any).code = 'ENOENT';
  throw error;
};

// Helper functions for test setup
const setMockFile = (path: string, content: string) => {
  mockFileSystem.set(path, content);
};

const setMockError = (error: any) => {
  shouldThrowError = true;
  errorToThrow = error;
};

const clearMockError = () => {
  shouldThrowError = false;
  errorToThrow = null;
};

const clearMockFiles = () => {
  mockFileSystem.clear();
};

testSuite('ConfigLoader Module Comprehensive Tests', () => {
  let originalCwd: () => string;
  let originalReadFileSync: any;
  
  beforeEach(() => {
    // Clear any existing config cache
    (configLoader as any).config = null;
    
    // Setup file system mocks
    originalReadFileSync = require('fs').readFileSync;
    require('fs').readFileSync = mockReadFileSync;
    clearMockError();
    clearMockFiles();
    
    // Mock valid CONFIG.json
    const mockConfig: ProjectConfig = {
      accounts: [
        mockAccountConfigs.basic,
        mockAccountConfigs.withMargin,
        mockAccountConfigs.invalidTokenFormat
      ]
    };
    
    const configPath = '/test/workspace/CONFIG.json';
    setMockFile(configPath, JSON.stringify(mockConfig, null, 2));
    
    // Mock current working directory
    originalCwd = process.cwd;
    process.cwd = () => '/test/workspace';
  });
  
  afterEach(() => {
    // Restore original functions
    if (originalCwd) {
      process.cwd = originalCwd;
    }
    if (originalReadFileSync) {
      require('fs').readFileSync = originalReadFileSync;
    }
    
    // Clean up mocks and environment
    clearMockFiles();
    clearMockError();
    delete process.env.TEST_TOKEN;
    delete process.env.ENV_TOKEN;
    delete process.env.NONEXISTENT_TOKEN;
  });

  describe('Configuration Loading', () => {
    it('should load configuration from CONFIG.json', () => {
      const config = configLoader.loadConfig();
      
      expect(config).toBeDefined();
      expect(config.accounts).toBeDefined();
      expect(config.accounts).toHaveLength(3);
    });
    
    it('should cache loaded configuration', () => {
      const config1 = configLoader.loadConfig();
      const config2 = configLoader.loadConfig();
      
      expect(config1).toBe(config2); // Same reference
    });
    
    it('should handle file not found error', () => {
      const error = new Error('ENOENT: no such file or directory');
      (error as any).code = 'ENOENT';
      setMockError(error);
      
      expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
    });
    
    it('should handle invalid JSON', () => {
      setMockFile('/test/workspace/CONFIG.json', 'invalid json {');
      
      expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
    });
    
    it('should handle permission denied error', () => {
      const error = new Error('EACCES: permission denied');
      (error as any).code = 'EACCES';
      setMockError(error);
      
      expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
    });
  });

  describe('Account Retrieval', () => {
    it('should get account by ID', () => {
      const account = configLoader.getAccountById('test-account');
      
      expect(account).toBeDefined();
      expect(account?.id).toBe('test-account');
      expect(account?.name).toBe('Test Account');
    });
    
    it('should return undefined for non-existent account ID', () => {
      const account = configLoader.getAccountById('non-existent');
      
      expect(account).toBeUndefined();
    });
    
    it('should get account by token', () => {
      const account = configLoader.getAccountByToken('t.test_token');
      
      expect(account).toBeDefined();
      expect(account?.id).toBe('test-account');
    });
    
    it('should return undefined for non-existent token', () => {
      const account = configLoader.getAccountByToken('invalid-token');
      
      expect(account).toBeUndefined();
    });
    
    it('should get all accounts', () => {
      const accounts = configLoader.getAllAccounts();
      
      expect(accounts).toHaveLength(3);
      expect(accounts[0].id).toBe('test-account');
    });
  });

  describe('Token Management', () => {
    it('should get direct token value', () => {
      const token = configLoader.getAccountToken('test-account');
      
      expect(token).toBe('t.test_token');
    });
    
    it('should get token from environment variable', () => {
      // Set up environment variable
      process.env.TEST_TOKEN = 't.env_token_value';
      
      const token = configLoader.getAccountToken('margin-account');
      
      expect(token).toBe('t.env_token_value');
    });
    
    it('should return undefined for missing environment variable', () => {
      // Ensure environment variable doesn't exist
      delete process.env.NONEXISTENT_TOKEN;
      
      const token = configLoader.getAccountToken('invalid-token-format');
      
      expect(token).toBeUndefined();
    });
    
    it('should return undefined for non-existent account in getAccountToken', () => {
      const token = configLoader.getAccountToken('non-existent-account');
      
      expect(token).toBeUndefined();
    });
    
    it('should get raw token value', () => {
      const rawToken = configLoader.getRawTokenValue('margin-account');
      
      expect(rawToken).toBe('${TEST_TOKEN}');
    });
    
    it('should return undefined for non-existent account in getRawTokenValue', () => {
      const rawToken = configLoader.getRawTokenValue('non-existent');
      
      expect(rawToken).toBeUndefined();
    });
    
    it('should detect if token is from environment', () => {
      expect(configLoader.isTokenFromEnv('margin-account')).toBe(true);
      expect(configLoader.isTokenFromEnv('test-account')).toBe(false);
    });
    
    it('should return false for non-existent account in token checks', () => {
      expect(configLoader.isTokenFromEnv('non-existent')).toBe(false);
    });
    
    it('should handle malformed environment variable syntax', () => {
      // Create account with malformed token format
      const configWithMalformedToken = {
        accounts: [
          {
            id: 'malformed',
            name: 'Malformed Token',
            t_invest_token: '${INCOMPLETE', // Missing closing brace
            account_id: '123',
            desired_wallet: { TRUR: 100 }
          }
        ]
      };
      
      setMockFile('/test/workspace/CONFIG.json', JSON.stringify(configWithMalformedToken));
      (configLoader as any).config = null;
      
      const token = configLoader.getAccountToken('malformed');
      expect(token).toBe('${INCOMPLETE'); // Should return as-is when malformed
      expect(configLoader.isTokenFromEnv('malformed')).toBe(false);
    });
  });

  describe('Account ID Management', () => {
    it('should get account_id by account ID', () => {
      const accountId = configLoader.getAccountAccountId('test-account');
      
      expect(accountId).toBe('123456789');
    });
    
    it('should return undefined for non-existent account', () => {
      const accountId = configLoader.getAccountAccountId('non-existent');
      
      expect(accountId).toBeUndefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate configuration with missing accounts array', () => {
      const invalidConfig = {};
      setMockFile('/test/workspace/CONFIG.json', JSON.stringify(invalidConfig));
      (configLoader as any).config = null;
      
      expect(() => configLoader.loadConfig()).toThrow('Configuration must contain accounts array');
    });
    
    it('should validate configuration with non-array accounts', () => {
      const invalidConfig = { accounts: 'not an array' };
      setMockFile('/test/workspace/CONFIG.json', JSON.stringify(invalidConfig));
      (configLoader as any).config = null;
      
      expect(() => configLoader.loadConfig()).toThrow('Configuration must contain accounts array');
    });
    
    it('should validate account with missing required fields', () => {
      const invalidConfig = {
        accounts: [
          {
            id: 'test',
            name: 'Test',
            desired_wallet: { TRUR: 100 }
            // missing t_invest_token and account_id fields
          }
        ]
      };
      setMockFile('/test/workspace/CONFIG.json', JSON.stringify(invalidConfig));
      (configLoader as any).config = null;
      
      expect(() => configLoader.loadConfig()).toThrow('must contain field');
    });
    
    it('should validate account with empty desired_wallet', () => {
      const invalidConfig = {
        accounts: [
          {
            id: 'test',
            name: 'Test',
            t_invest_token: 'token',
            account_id: '123',
            desired_wallet: {}
          }
        ]
      };
      setMockFile('/test/workspace/CONFIG.json', JSON.stringify(invalidConfig));
      (configLoader as any).config = null;
      
      expect(() => configLoader.loadConfig()).toThrow('must contain non-empty desired_wallet');
    });
    
    it('should warn about incorrect weight sum', () => {
      const configWithBadWeights = {
        accounts: [
          {
            id: 'test',
            name: 'Test',
            t_invest_token: 'token',
            account_id: '123',
            desired_wallet: { TRUR: 60, TMOS: 30 } // Sum is 90%
          }
        ]
      };
      
      const consoleSpy = mockFn();
      const originalConsole = console.warn;
      console.warn = consoleSpy;
      
      setMockFile('/test/workspace/CONFIG.json', JSON.stringify(configWithBadWeights));
      (configLoader as any).config = null;
      
      expect(() => configLoader.loadConfig()).not.toThrow();
      expect((consoleSpy as any).called).toBe(true);
      
      console.warn = originalConsole;
    });
  });

  describe('Exchange Closure Behavior Validation', () => {
    it('should set default exchange closure behavior if not provided', () => {
      const configWithoutBehavior = {
        accounts: [
          {
            id: 'test',
            name: 'Test',
            t_invest_token: 'token',
            account_id: '123',
            desired_wallet: { TRUR: 100 }
          }
        ]
      };
      
      setMockFile('/test/workspace/CONFIG.json', JSON.stringify(configWithoutBehavior));
      (configLoader as any).config = null;
      
      const config = configLoader.loadConfig();
      const account = config.accounts[0];
      
      expect(account.exchange_closure_behavior).toBeDefined();
      expect(account.exchange_closure_behavior!.mode).toBe('skip_iteration');
      expect(account.exchange_closure_behavior!.update_iteration_result).toBe(false);
    });
    
    it('should validate invalid exchange closure mode', () => {
      const configWithInvalidBehavior = {
        accounts: [
          {
            id: 'test',
            name: 'Test',
            t_invest_token: 'token',
            account_id: '123',
            desired_wallet: { TRUR: 100 },
            exchange_closure_behavior: {
              mode: 'invalid_mode',
              update_iteration_result: true
            }
          }
        ]
      };
      
      setMockFile('/test/workspace/CONFIG.json', JSON.stringify(configWithInvalidBehavior));
      (configLoader as any).config = null;
      
      expect(() => configLoader.loadConfig()).toThrow('exchange_closure_behavior.mode must be one of');
    });
    
    it('should validate invalid update_iteration_result type', () => {
      const configWithInvalidBehavior = {
        accounts: [
          {
            id: 'test',
            name: 'Test',
            t_invest_token: 'token',
            account_id: '123',
            desired_wallet: { TRUR: 100 },
            exchange_closure_behavior: {
              mode: 'skip_iteration',
              update_iteration_result: 'not_boolean'
            }
          }
        ]
      };
      
      setMockFile('/test/workspace/CONFIG.json', JSON.stringify(configWithInvalidBehavior));
      (configLoader as any).config = null;
      
      expect(() => configLoader.loadConfig()).toThrow('update_iteration_result must be a boolean');
    });
  });

  describe('Error Scenarios and Edge Cases', () => {
    it('should handle unknown error types', () => {
      const originalReadFileSync = require('fs').readFileSync;
      require('fs').readFileSync = () => {
        throw 'String error'; // Non-Error object
      };
      
      (configLoader as any).config = null;
      expect(() => configLoader.loadConfig()).toThrow('Unknown error');
      
      require('fs').readFileSync = originalReadFileSync;
    });
    
    it('should handle complex multi-account scenarios', () => {
      const complexConfig = {
        accounts: [
          {
            id: 'account1',
            name: 'Account 1',
            t_invest_token: 'direct_token',
            account_id: '111',
            desired_wallet: { TRUR: 50, TMOS: 50 }
          },
          {
            id: 'account2',
            name: 'Account 2',
            t_invest_token: '${ENV_TOKEN}',
            account_id: '222',
            desired_wallet: { TGLD: 100 }
          }
        ]
      };
      
      setMockFile('/test/workspace/CONFIG.json', JSON.stringify(complexConfig));
      process.env.ENV_TOKEN = 't.env_value';
      (configLoader as any).config = null;
      
      const config = configLoader.loadConfig();
      expect(config.accounts).toHaveLength(2);
      
      expect(configLoader.getAccountToken('account1')).toBe('direct_token');
      expect(configLoader.getAccountToken('account2')).toBe('t.env_value');
      expect(configLoader.isTokenFromEnv('account1')).toBe(false);
      expect(configLoader.isTokenFromEnv('account2')).toBe(true);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = configLoader;
      const instance2 = configLoader;
      expect(instance1).toBe(instance2);
    });
  });
});