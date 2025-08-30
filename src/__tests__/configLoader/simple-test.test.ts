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

describe('Simple ConfigLoader Test', () => {
  beforeEach(() => {
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
        }
      ]
    };
    
    const configPath = '/test/workspace/CONFIG.test.json';
    setMockFile(configPath, JSON.stringify(mockConfig, null, 2));
    
    // Mock current working directory
    process.cwd = () => '/test/workspace';
  });
  
  afterEach(() => {
    // Restore original functions
    const fs = require('fs');
    fs.readFileSync = originalReadFileSync;
    
    // Clean up mocks and environment
    clearMockFiles();
    clearMockError();
    delete process.env.NODE_ENV;
    process.cwd = () => process.env.ORIGINAL_CWD || '/';
  });

  it('should get account by ID', () => {
    const account = configLoader.getAccountById('test-account-1');
    
    expect(account).toBeDefined();
    expect(account?.id).toBe('test-account-1');
    expect(account?.name).toBe('Test Account 1');
  });
});