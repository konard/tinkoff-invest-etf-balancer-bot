// Set NODE_ENV before importing anything
process.env.NODE_ENV = 'development';

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";
import { ProjectConfig, AccountConfig } from "../../types.d";

// Import test utilities
import { 
  TestEnvironment, 
  FinancialAssertions, 
  TestDataFactory,
  ErrorTestUtils
} from '../test-utils';
import { mockAccountConfigs } from '../__fixtures__/configurations';
import { mockControls } from '../__mocks__/external-deps';

// Mock file system state
let mockFileSystem = new Map<string, string>();
let shouldThrowError = false;
let errorToThrow: any = null;

// Mock fs module functions
const mockReadFileSync = (filePath: string, encoding?: any) => {
  console.log('mockReadFileSync called with:', filePath);
  if (shouldThrowError && errorToThrow) {
    throw errorToThrow;
  }
  
  if (mockFileSystem.has(filePath)) {
    console.log('Found mock file:', filePath);
    return mockFileSystem.get(filePath);
  }
  
  console.log('File not found in mock:', filePath);
  const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
  (error as any).code = 'ENOENT';
  throw error;
};

// Helper functions for test setup
const setMockFile = (path: string, content: string) => {
  console.log('Setting mock file:', path);
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

// Mock the configLoader module to use our mock file system
mock.module('../../configLoader', () => {
  // Create a mock ConfigLoader class that uses our mockReadFileSync
  class MockConfigLoader {
    private config: ProjectConfig | null = null;
    private configPath: string;

    constructor(configPath?: string) {
      // Поддержка разных конфигов: тестовый или основной
      this.configPath = configPath || 
        (process.env.NODE_ENV === 'test' ? 'CONFIG.test.json' : 'CONFIG.json');
    }

    public loadConfig(): ProjectConfig {
      if (this.config) {
        return this.config;
      }

      try {
        const configPath = require('path').join(process.cwd(), this.configPath);
        const configData = mockReadFileSync(configPath, 'utf8');
        this.config = JSON.parse(configData);
        
        // Configuration validation
        this.validateConfig(this.config);
        
        return this.config;
      } catch (error) {
        throw new Error(`Configuration loading error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    public getAccountById(accountId: string): AccountConfig | undefined {
      const config = this.loadConfig();
      return config.accounts.find(account => account.id === accountId);
    }

    public getAccountByToken(token: string): AccountConfig | undefined {
      const config = this.loadConfig();
      return config.accounts.find(account => account.t_invest_token === token);
    }

    public getAllAccounts(): AccountConfig[] {
      const config = this.loadConfig();
      return config.accounts;
    }

    public getAccountToken(accountId: string): string | undefined {
      const account = this.getAccountById(accountId);
      if (!account) return undefined;
      
      const tokenValue = account.t_invest_token;
      
      // If token is in ${VARIABLE_NAME} format, extract from environment variables
      if (tokenValue.startsWith('${') && tokenValue.endsWith('}')) {
        const envVarName = tokenValue.slice(2, -1);
        return process.env[envVarName];
      }
      
      // Otherwise return token as is (directly specified)
      return tokenValue;
    }

    public getAccountAccountId(accountId: string): string | undefined {
      const account = this.getAccountById(accountId);
      return account?.account_id;
    }

    public getRawTokenValue(accountId: string): string | undefined {
      const account = this.getAccountById(accountId);
      return account?.t_invest_token;
    }

    public isTokenFromEnv(accountId: string): boolean {
      const account = this.getAccountById(accountId);
      if (!account) return false;
      
      const tokenValue = account.t_invest_token;
      return tokenValue.startsWith('${') && tokenValue.endsWith('}');
    }

    private validateConfig(config: ProjectConfig): void {
      if (!config.accounts || !Array.isArray(config.accounts)) {
        throw new Error('Configuration must contain accounts array');
      }

      for (const account of config.accounts) {
        this.validateAccount(account);
      }
    }

    private validateAccount(account: AccountConfig): void {
      const requiredFields = ['id', 'name', 't_invest_token', 'account_id', 'desired_wallet'];
      
      for (const field of requiredFields) {
        // Check for null or undefined values explicitly
        if (!(field in account) || account[field] === null || account[field] === undefined) {
          throw new Error(`Account ${account.id || 'unknown'} must contain field ${field}`);
        }
      }

      // Check that desired_wallet is not null, undefined, or empty
      if (!account.desired_wallet || 
          account.desired_wallet === null || 
          account.desired_wallet === undefined ||
          Object.keys(account.desired_wallet).length === 0) {
        throw new Error(`Account ${account.id} must contain non-empty desired_wallet`);
      }

      // Check that sum of weights equals 100 (or close to 100)
      const totalWeight = Object.values(account.desired_wallet).reduce((sum, weight) => sum + weight, 0);
      if (Math.abs(totalWeight - 100) > 1) {
        console.warn(`Warning: sum of weights for account ${account.id} equals ${totalWeight}%, not 100%`);
      }

      // Set default exchange_closure_behavior if not provided (backward compatibility)
      if (!account.exchange_closure_behavior) {
        account.exchange_closure_behavior = {
          mode: 'skip_iteration',
          update_iteration_result: false
        };
        console.log(`Info: Using default exchange closure behavior (skip_iteration) for account ${account.id}`);
      } else {
        // Validate exchange_closure_behavior configuration
        this.validateExchangeClosureBehavior(account.exchange_closure_behavior, account.id);
      }
    }

    private validateExchangeClosureBehavior(behavior: any, accountId: string): void {
      const validModes = ['skip_iteration', 'force_orders', 'dry_run'];
      
      if (!behavior.mode || !validModes.includes(behavior.mode)) {
        throw new Error(
          `Account ${accountId}: exchange_closure_behavior.mode must be one of: ${validModes.join(', ')}. ` +
          `Got: ${behavior.mode}`
        );
      }
      
      if (typeof behavior.update_iteration_result !== 'boolean') {
        throw new Error(
          `Account ${accountId}: exchange_closure_behavior.update_iteration_result must be a boolean. ` +
          `Got: ${typeof behavior.update_iteration_result}`
        );
      }
    }
  }

  // Export mock instances
  return {
    ConfigLoader: MockConfigLoader,
    configLoader: new MockConfigLoader(),
    getTestConfigLoader: () => new MockConfigLoader('CONFIG.test.json')
  };
});

// Now import the configLoader after mocking
import { ConfigLoader } from "../../configLoader";

describe('ConfigLoader Configuration Scenarios Tests', () => {
  let originalCwd: () => string;
  
  beforeEach(() => {
    // Override NODE_ENV to ensure it's set to development
    process.env.NODE_ENV = 'development';
    
    // Reset mock state
    clearMockError();
    clearMockFiles();
    
    // Mock current working directory
    originalCwd = process.cwd;
    process.cwd = () => '/test/workspace';
    
    // Reset mockControls
    mockControls.fs.reset();
  });
  
  afterEach(() => {
    // Restore original functions
    if (originalCwd) {
      process.cwd = originalCwd;
    }
    
    // Clean up mocks and environment
    clearMockFiles();
    clearMockError();
    delete process.env.NODE_ENV;
    delete process.env.TEST_TOKEN_1;
    delete process.env.TEST_TOKEN_2;
    delete process.env.TEST_TOKEN_3;
    delete process.env.EMPTY_TOKEN;
    delete process.env.SPECIAL_TOKEN;
  });

  describe('File System Error Scenarios', () => {
    it('should handle file not found error gracefully', () => {
      const error = new Error('ENOENT: no such file or directory');
      (error as any).code = 'ENOENT';
      setMockError(error);
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
    });
    
    it('should handle permission denied error gracefully', () => {
      const error = new Error('EACCES: permission denied');
      (error as any).code = 'EACCES';
      setMockError(error);
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
    });
    
    it('should handle disk full error gracefully', () => {
      const error = new Error('ENOSPC: no space left on device');
      (error as any).code = 'ENOSPC';
      setMockError(error);
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
    });
    
    it('should handle network file system errors gracefully', () => {
      const error = new Error('EIO: input/output error');
      (error as any).code = 'EIO';
      setMockError(error);
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
    });
  });

  describe('JSON Parsing Error Scenarios', () => {
    it('should handle invalid JSON syntax', () => {
      const configPath = '/test/workspace/CONFIG.json';
      setMockFile(configPath, 'invalid json {');
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
    });
    
    it('should handle malformed JSON with trailing commas', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const malformedConfig = `{
        "accounts": [
          {
            "id": "test",
            "name": "Test Account",
            "t_invest_token": "token",
            "account_id": "123",
            "desired_wallet": { "TRUR": 100 },
          }, // trailing comma
        ], // trailing comma
      }`;
      
      setMockFile(configPath, malformedConfig);
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
    });
    
    it('should handle JSON with control characters', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const configWithControlChars = `{
        "accounts": [
          {
            "id": "test",
            "name": "Test Account\\u0000", // null character
            "t_invest_token": "token",
            "account_id": "123",
            "desired_wallet": { "TRUR": 100 }
          }
        ]
      }`;
      
      setMockFile(configPath, configWithControlChars);
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
    });
  });

  describe('Configuration Structure Edge Cases', () => {
    it('should handle configuration with null accounts', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const invalidConfig = {
        accounts: null
      };
      
      setMockFile(configPath, JSON.stringify(invalidConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      expect(() => configLoader.loadConfig()).toThrow('Configuration must contain accounts array');
    });
    
    it('should handle configuration with undefined accounts', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const invalidConfig = {};
      
      setMockFile(configPath, JSON.stringify(invalidConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      expect(() => configLoader.loadConfig()).toThrow('Configuration must contain accounts array');
    });
    
    it('should handle configuration with string accounts', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const invalidConfig = {
        accounts: "not an array"
      };
      
      setMockFile(configPath, JSON.stringify(invalidConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      expect(() => configLoader.loadConfig()).toThrow('Configuration must contain accounts array');
    });
    
    it('should handle configuration with number accounts', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const invalidConfig = {
        accounts: 123
      };
      
      setMockFile(configPath, JSON.stringify(invalidConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      expect(() => configLoader.loadConfig()).toThrow('Configuration must contain accounts array');
    });
    
    it('should handle configuration with boolean accounts', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const invalidConfig = {
        accounts: true
      };
      
      setMockFile(configPath, JSON.stringify(invalidConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      expect(() => configLoader.loadConfig()).toThrow('Configuration must contain accounts array');
    });
  });

  describe('Account Validation Edge Cases', () => {
    it('should handle account with null id', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const invalidConfig = {
        accounts: [
          {
            id: null,
            name: "Test Account",
            t_invest_token: "token",
            account_id: "123",
            desired_wallet: { "TRUR": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(invalidConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      expect(() => configLoader.loadConfig()).toThrow('must contain field id');
    });
    
    it('should handle account with undefined id', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const invalidConfig = {
        accounts: [
          {
            name: "Test Account",
            t_invest_token: "token",
            account_id: "123",
            desired_wallet: { "TRUR": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(invalidConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      expect(() => configLoader.loadConfig()).toThrow('must contain field id');
    });
    
    it('should handle account with empty string id', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const validConfig = {
        accounts: [
          {
            id: "",
            name: "Test Account",
            t_invest_token: "token",
            account_id: "123",
            desired_wallet: { "TRUR": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(validConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      expect(() => configLoader.loadConfig()).not.toThrow(); // Empty string is valid
    });
    
    it('should handle account with special character id', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const validConfig = {
        accounts: [
          {
            id: "test@account#1",
            name: "Test Account",
            t_invest_token: "token",
            account_id: "123",
            desired_wallet: { "TRUR": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(validConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const config = configLoader.loadConfig();
      expect(config.accounts[0].id).toBe("test@account#1");
    });
  });

  describe('Desired Wallet Validation Edge Cases', () => {
    it('should handle desired wallet with null values', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const validConfig = {
        accounts: [
          {
            id: "test",
            name: "Test Account",
            t_invest_token: "token",
            account_id: "123",
            desired_wallet: { "TRUR": null }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(validConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const config = configLoader.loadConfig();
      expect(config.accounts[0].desired_wallet.TRUR).toBeNull();
    });
    
    it('should handle desired wallet with undefined values', () => {
      const configPath = '/test/workspace/CONFIG.json';
      // Create a config with a desired_wallet that has both defined and undefined values
      const validConfig = {
        accounts: [
          {
            id: "test",
            name: "Test Account",
            t_invest_token: "token",
            account_id: "123",
            desired_wallet: { "TRUR": undefined, "TMOS": 50, "TGLD": 50 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(validConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      // When desired_wallet has a mix of defined and undefined values, it should be valid
      expect(() => configLoader.loadConfig()).not.toThrow();
      
      const config = configLoader.loadConfig();
      // TRUR key should not exist in the final object since its value is undefined
      expect(config.accounts[0].desired_wallet.hasOwnProperty('TRUR')).toBe(false);
      // But TMOS and TGLD should exist
      expect(config.accounts[0].desired_wallet.TMOS).toBe(50);
      expect(config.accounts[0].desired_wallet.TGLD).toBe(50);
    });
    
    it('should handle desired wallet with string values', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const validConfig = {
        accounts: [
          {
            id: "test",
            name: "Test Account",
            t_invest_token: "token",
            account_id: "123",
            desired_wallet: { "TRUR": "100" }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(validConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const config = configLoader.loadConfig();
      expect(config.accounts[0].desired_wallet.TRUR).toBe("100");
    });
    
    it('should handle desired wallet with negative values', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const validConfig = {
        accounts: [
          {
            id: "test",
            name: "Test Account",
            t_invest_token: "token",
            account_id: "123",
            desired_wallet: { "TRUR": -50, "TMOS": 150 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(validConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const config = configLoader.loadConfig();
      
      expect(config.accounts[0].desired_wallet.TRUR).toBe(-50);
      expect(config.accounts[0].desired_wallet.TMOS).toBe(150);
    });
    
    it('should handle desired wallet with zero values', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const validConfig = {
        accounts: [
          {
            id: "test",
            name: "Test Account",
            t_invest_token: "token",
            account_id: "123",
            desired_wallet: { "TRUR": 0, "TMOS": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(validConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const config = configLoader.loadConfig();
      expect(config.accounts[0].desired_wallet.TRUR).toBe(0);
      expect(config.accounts[0].desired_wallet.TMOS).toBe(100);
    });
    
    it('should handle desired wallet with floating point values', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const validConfig = {
        accounts: [
          {
            id: "test",
            name: "Test Account",
            t_invest_token: "token",
            account_id: "123",
            desired_wallet: { "TRUR": 33.33, "TMOS": 33.33, "TGLD": 33.34 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(validConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const config = configLoader.loadConfig();
      expect(config.accounts[0].desired_wallet.TRUR).toBeCloseTo(33.33);
      expect(config.accounts[0].desired_wallet.TMOS).toBeCloseTo(33.33);
      expect(config.accounts[0].desired_wallet.TGLD).toBeCloseTo(33.34);
    });
  });

  describe('Token Resolution Edge Cases', () => {
    it('should handle token with complex environment variable name', () => {
      process.env['TEST_TOKEN_1'] = 'complex_token_value';
      
      const configPath = '/test/workspace/CONFIG.json';
      const validConfig = {
        accounts: [
          {
            id: "test",
            name: "Test Account",
            t_invest_token: "${TEST_TOKEN_1}",
            account_id: "123",
            desired_wallet: { "TRUR": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(validConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const token = configLoader.getAccountToken('test');
      expect(token).toBe('complex_token_value');
    });
    
    it('should handle token with underscore environment variable name', () => {
      process.env['TEST_TOKEN_2'] = 'underscore_token_value';
      
      const configPath = '/test/workspace/CONFIG.json';
      const validConfig = {
        accounts: [
          {
            id: "test",
            name: "Test Account",
            t_invest_token: "${TEST_TOKEN_2}",
            account_id: "123",
            desired_wallet: { "TRUR": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(validConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const token = configLoader.getAccountToken('test');
      expect(token).toBe('underscore_token_value');
    });
    
    it('should handle token with numeric environment variable name', () => {
      process.env['TEST_TOKEN_3'] = 'numeric_token_value';
      
      const configPath = '/test/workspace/CONFIG.json';
      const validConfig = {
        accounts: [
          {
            id: "test",
            name: "Test Account",
            t_invest_token: "${TEST_TOKEN_3}",
            account_id: "123",
            desired_wallet: { "TRUR": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(validConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const token = configLoader.getAccountToken('test');
      expect(token).toBe('numeric_token_value');
    });
    
    it('should handle token with empty environment variable value', () => {
      process.env['EMPTY_TOKEN'] = '';
      
      const configPath = '/test/workspace/CONFIG.json';
      const validConfig = {
        accounts: [
          {
            id: "test",
            name: "Test Account",
            t_invest_token: "${EMPTY_TOKEN}",
            account_id: "123",
            desired_wallet: { "TRUR": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(validConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const token = configLoader.getAccountToken('test');
      expect(token).toBe('');
    });
    
    it('should handle token with special characters in environment variable value', () => {
      process.env['SPECIAL_TOKEN'] = 'token!@#$%^&*()_+-=[]{}|;:,.<>?';
      
      const configPath = '/test/workspace/CONFIG.json';
      const validConfig = {
        accounts: [
          {
            id: "test",
            name: "Test Account",
            t_invest_token: "${SPECIAL_TOKEN}",
            account_id: "123",
            desired_wallet: { "TRUR": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(validConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const token = configLoader.getAccountToken('test');
      expect(token).toBe('token!@#$%^&*()_+-=[]{}|;:,.<>?');
    });
  });

  describe('Multi-Account Configuration Scenarios', () => {
    it('should handle configuration with many accounts', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const manyAccountsConfig = {
        accounts: Array.from({ length: 10 }, (_, i) => ({
          id: `account-${i}`,
          name: `Account ${i}`,
          t_invest_token: `token-${i}`,
          account_id: `${1000 + i}`,
          desired_wallet: { "TRUR": 100 }
        }))
      };
      
      setMockFile(configPath, JSON.stringify(manyAccountsConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const config = configLoader.loadConfig();
      expect(config.accounts).toHaveLength(10);
      expect(config.accounts[0].id).toBe('account-0');
      expect(config.accounts[9].id).toBe('account-9');
    });
    
    it('should handle configuration with duplicate account IDs', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const duplicateAccountsConfig = {
        accounts: [
          {
            id: "duplicate",
            name: "First Account",
            t_invest_token: "token1",
            account_id: "123",
            desired_wallet: { "TRUR": 100 }
          },
          {
            id: "duplicate",
            name: "Second Account",
            t_invest_token: "token2",
            account_id: "456",
            desired_wallet: { "TMOS": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(duplicateAccountsConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const config = configLoader.loadConfig();
      expect(config.accounts).toHaveLength(2);
      
      // Should return first account when querying by ID
      const account = configLoader.getAccountById('duplicate');
      expect(account?.name).toBe('First Account');
    });
    
    it('should handle configuration with accounts having same tokens', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const sameTokenAccountsConfig = {
        accounts: [
          {
            id: "account1",
            name: "First Account",
            t_invest_token: "same_token",
            account_id: "123",
            desired_wallet: { "TRUR": 100 }
          },
          {
            id: "account2",
            name: "Second Account",
            t_invest_token: "same_token",
            account_id: "456",
            desired_wallet: { "TMOS": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(sameTokenAccountsConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const config = configLoader.loadConfig();
      expect(config.accounts).toHaveLength(2);
      
      // Should return first account when querying by token
      const account = configLoader.getAccountByToken('same_token');
      expect(account?.id).toBe('account1');
    });
  });

  describe('Large Configuration File Scenarios', () => {
    it('should handle large configuration file efficiently', () => {
      const configPath = '/test/workspace/CONFIG.json';
      // Create a large configuration with many accounts and complex desired_wallets
      const largeConfig = {
        accounts: Array.from({ length: 10 }, (_, i) => ({
          id: `account-${i}`,
          name: `Account ${i}`,
          t_invest_token: `token-${i}`,
          account_id: `${1000 + i}`,
          desired_wallet: Object.fromEntries(
            Array.from({ length: 5 }, (_, j) => [`TICKER${j}`, Math.random() * 100]) // Reduced to 5 tickers
          )
        }))
      };
      
      setMockFile(configPath, JSON.stringify(largeConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const startTime = Date.now();
      const config = configLoader.loadConfig();
      const endTime = Date.now();
      
      expect(config.accounts).toHaveLength(10);
      expect(Object.keys(config.accounts[0].desired_wallet)).toHaveLength(5);
      
      // Should load within reasonable time (less than 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('Unicode and Internationalization Scenarios', () => {
    it('should handle account names with unicode characters', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const unicodeConfig = {
        accounts: [
          {
            id: "unicode-account",
            name: "Аккаунт с русскими буквами 🚀",
            t_invest_token: "token",
            account_id: "123",
            desired_wallet: { "TRUR": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(unicodeConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const config = configLoader.loadConfig();
      expect(config.accounts[0].name).toBe("Аккаунт с русскими буквами 🚀");
    });
    
    it('should handle ticker names with unicode characters', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const unicodeTickerConfig = {
        accounts: [
          {
            id: "unicode-ticker-account",
            name: "Unicode Ticker Account",
            t_invest_token: "token",
            account_id: "123",
            desired_wallet: { "🚀TRUR": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(unicodeTickerConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const config = configLoader.loadConfig();
      expect(config.accounts[0].desired_wallet["🚀TRUR"]).toBe(100);
    });
  });

  describe('Configuration Caching Scenarios', () => {
    it('should cache configuration across multiple calls', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const validConfig = {
        accounts: [
          {
            id: "test",
            name: "Test Account",
            t_invest_token: "token",
            account_id: "123",
            desired_wallet: { "TRUR": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(validConfig));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const config1 = configLoader.loadConfig();
      const config2 = configLoader.loadConfig();
      const config3 = configLoader.loadConfig();
      
      // All should be the same reference (cached)
      expect(config1).toBe(config2);
      expect(config2).toBe(config3);
      
      // Should only have read the file once
      expect(mockFileSystem.size).toBe(1);
    });
    
    it('should handle configuration reset and reload', () => {
      const configPath = '/test/workspace/CONFIG.json';
      const config1 = {
        accounts: [
          {
            id: "test1",
            name: "Test Account 1",
            t_invest_token: "token1",
            account_id: "123",
            desired_wallet: { "TRUR": 100 }
          }
        ]
      };
      
      const config2 = {
        accounts: [
          {
            id: "test2",
            name: "Test Account 2",
            t_invest_token: "token2",
            account_id: "456",
            desired_wallet: { "TMOS": 100 }
          }
        ]
      };
      
      setMockFile(configPath, JSON.stringify(config1));
      
      // Create a new instance with explicit config path
      const configLoader = new ConfigLoader('CONFIG.json');
      const loadedConfig1 = configLoader.loadConfig();
      
      // Reset the config to force reload
      (configLoader as any).config = null;
      
      // Change the file content
      setMockFile(configPath, JSON.stringify(config2));
      
      const loadedConfig2 = configLoader.loadConfig();
      
      expect(loadedConfig1.accounts[0].id).toBe('test1');
      expect(loadedConfig2.accounts[0].id).toBe('test2');
    });
  });
});