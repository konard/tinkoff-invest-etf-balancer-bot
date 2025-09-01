import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { configLoader, ConfigLoader } from "../../configLoader";
import { ProjectConfig } from "../../types.d";

// Mock file system state
let mockFileSystem = new Map<string, string>();
let shouldThrowError = false;
let errorToThrow: any = null;

// Mock fs module
const fs = require('fs');
const originalReadFileSync = fs.readFileSync;

const mockReadFileSync = (filePath: string, encoding?: any) => {
  console.log('mockReadFileSync called with:', filePath);
  if (shouldThrowError && errorToThrow) {
    throw errorToThrow;
  }
  
  // Check if this is the config file we're looking for
  if (filePath.endsWith('CONFIG.test.json')) {
    console.log('Looking for config file in mock file system');
    // Look in our mock file system
    for (const [mockPath, content] of mockFileSystem.entries()) {
      console.log('Checking mock path:', mockPath);
      if (mockPath.endsWith('CONFIG.test.json')) {
        console.log('Found mock config file');
        return content;
      }
    }
    console.log('Config file not found in mock file system');
  }
  
  // For all other files, use the original function
  console.log('Using original readFileSync for:', filePath);
  return originalReadFileSync(filePath, encoding);
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
    // Reset the singleton instance to ensure clean state
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

  it('should get account by ID', () => {
    // CONFIG.test.json has account with id "0"
    const account = configLoader.getAccountById('0');
    
    expect(account).toBeDefined();
    expect(account?.id).toBe('0');
    expect(account?.name).toBe('Основной брокерский счет');
  });
});