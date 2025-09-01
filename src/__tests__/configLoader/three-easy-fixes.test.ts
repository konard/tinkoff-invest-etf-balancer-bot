import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { configLoader, ConfigLoader } from "../../configLoader";
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
    // Reset ConfigLoader instance to ensure clean state
    ConfigLoader.resetInstance();
    
    // Clear any existing config cache
    (configLoader as any).config = null;
    
    // Set NODE_ENV to test so it loads CONFIG.test.json
    process.env.NODE_ENV = 'test';
    
    // Set up the environment variable that CONFIG.test.json expects
    process.env.T_INVEST_TOKEN = 'test-token-value';
  });
  
  afterEach(() => {
    // Clean up environment
    delete process.env.NODE_ENV;
    delete process.env.T_INVEST_TOKEN;
  });

  // Test 1: Account Retrieval by ID Test - use actual config structure
  it('should get account by ID', () => {
    // CONFIG.test.json has account with id "0"
    const account = configLoader.getAccountById('0');
    
    expect(account).toBeDefined();
    expect(account?.id).toBe('0');
    expect(account?.name).toBe('Основной брокерский счет');
  });

  // Test 2: Token Management Test - use actual config structure
  it('should get direct token value', () => {
    // CONFIG.test.json has account with id "0" and token from env variable
    const token = configLoader.getAccountToken('0');
    
    expect(token).toBe('test-token-value');
  });

  // Test 3: Account ID Management Test - use actual config structure
  it('should get account_id by account ID', () => {
    // CONFIG.test.json has account with id "0" and account_id "0"
    const accountId = configLoader.getAccountAccountId('0');
    
    expect(accountId).toBe('0');
  });
});