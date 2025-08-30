import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { configLoader } from "../../configLoader";
import { ProjectConfig } from "../../types.d";

// Mock file system state
let mockFileSystem = new Map<string, string>();
let shouldThrowError = false;
let errorToThrow: any = null;

// Mock fs module
const originalReadFileSync = require('fs').readFileSync;
const mockReadFileSync = (filePath: string, encoding?: any) => {
  console.log('mockReadFileSync called with:', filePath);  // Debug log
  console.log('mockFileSystem size:', mockFileSystem.size);  // Debug log
  console.log('mockFileSystem keys:', Array.from(mockFileSystem.keys()));  // Debug log
  
  if (shouldThrowError && errorToThrow) {
    throw errorToThrow;
  }
  
  if (mockFileSystem.has(filePath)) {
    console.log('Found file in mock file system');  // Debug log
    return mockFileSystem.get(filePath);
  }
  
  console.log('File not found in mock, falling back to original');  // Debug log
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

describe('Three Easiest ConfigLoader Tests to Fix', () => {
  beforeEach(() => {
    console.log('Current working directory:', process.cwd());  // Debug log
    console.log('NODE_ENV:', process.env.NODE_ENV);  // Debug log
    
    // Clear any existing config cache
    (configLoader as any).config = null;
    
    // Setup file system mocks
    const fs = require('fs');
    fs.readFileSync = mockReadFileSync;
    clearMockError();
    clearMockFiles();
    
    // Set NODE_ENV to test
    process.env.NODE_ENV = 'test';
    
    // Mock valid CONFIG.test.json
    const mockConfig: ProjectConfig = {
      accounts: [
        {
          id: "test-account-1",
          name: "Test Account 1",
          t_invest_token: "t.test_token_123",
          account_id: "123456789",
          desired_wallet: {
            TRUR: 25,
            TMOS: 25,
            TGLD: 25,
            RUB: 25,
          },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          margin_trading: {
            enabled: false,
            multiplier: 1,
            free_threshold: 10000,
            max_margin_size: 0,
            balancing_strategy: 'remove',
          },
          exchange_closure_behavior: {
            mode: 'skip_iteration',
            update_iteration_result: false,
          },
        },
        {
          id: "test-account-2",
          name: "Test Account 2",
          t_invest_token: "t.test_token_456",
          account_id: "987654321",
          desired_wallet: {
            TRUR: 30,
            TMOS: 30,
            TGLD: 20,
            RUB: 20,
          },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          margin_trading: {
            enabled: false,
            multiplier: 1,
            free_threshold: 10000,
            max_margin_size: 0,
            balancing_strategy: 'remove',
          },
          exchange_closure_behavior: {
            mode: 'skip_iteration',
            update_iteration_result: false,
          },
        },
        {
          id: "test-account-3",
          name: "Test Account 3",
          t_invest_token: "t.test_token_789",
          account_id: "456789123",
          desired_wallet: {
            TRUR: 40,
            TMOS: 30,
            TGLD: 20,
            RUB: 10,
          },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          margin_trading: {
            enabled: false,
            multiplier: 1,
            free_threshold: 10000,
            max_margin_size: 0,
            balancing_strategy: 'remove',
          },
          exchange_closure_behavior: {
            mode: 'skip_iteration',
            update_iteration_result: false,
          },
        }
      ]
    };
    
    const configPath = '/test/workspace/CONFIG.test.json';
    console.log('Setting mock file at:', configPath);  // Debug log
    setMockFile(configPath, JSON.stringify(mockConfig, null, 2));
    
    // Mock current working directory
    process.cwd = () => '/test/workspace';
    console.log('Mocked cwd to:', process.cwd());  // Debug log
  });
  
  afterEach(() => {
    // Restore original functions
    const fs = require('fs');
    fs.readFileSync = originalReadFileSync;
    
    // Clean up mocks and environment
    clearMockFiles();
    clearMockError();
    delete process.env.NODE_ENV;
    delete process.env.TEST_TOKEN;
    process.cwd = () => process.env.ORIGINAL_CWD || '/';
  });

  // Test 1: Account Retrieval by ID Test (Easiest - Data Mismatch)
  it('should get account by ID', () => {
    const account = configLoader.getAccountById('test-account-1');
    
    expect(account).toBeDefined();
    expect(account?.id).toBe('test-account-1');
    expect(account?.name).toBe('Test Account 1');
  });

  // Test 2: Token Management Test (Easiest - Direct Fix)
  it('should get direct token value', () => {
    const token = configLoader.getAccountToken('test-account-1');
    
    expect(token).toBe('t.test_token_123');
  });

  // Test 3: Account ID Management Test (Easiest - Direct Fix)
  it('should get account_id by account ID', () => {
    const accountId = configLoader.getAccountAccountId('test-account-1');
    
    expect(accountId).toBe('123456789');
  });
});