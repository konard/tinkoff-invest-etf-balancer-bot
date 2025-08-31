// Set NODE_ENV before importing anything
process.env.NODE_ENV = 'test';

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ConfigLoader } from "./src/configLoader";

describe('Debug Mock Test', () => {
  let originalReadFileSync: any;
  let mockFileSystem = new Map<string, string>();
  let shouldThrowError = false;
  let errorToThrow: any = null;

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

  beforeEach(() => {
    console.log('Before each called');
    // Override NODE_ENV again after test environment setup
    process.env.NODE_ENV = 'development';
    
    // Setup file system mocks (like the working test does)
    const fs = require('fs');
    originalReadFileSync = fs.readFileSync;
    console.log('Original readFileSync saved');
    fs.readFileSync = mockReadFileSync;
    console.log('Mock readFileSync set');
    clearMockError();
    clearMockFiles();
    
    // Mock current working directory
    const originalCwd = process.cwd;
    process.cwd = () => '/test/workspace';
    
    console.log('Before each setup complete');
  });
  
  afterEach(() => {
    console.log('After each called');
    // Restore original functions
    if (originalReadFileSync) {
      const fs = require('fs');
      fs.readFileSync = originalReadFileSync;
      console.log('Original readFileSync restored');
    }
    
    // Clean up mocks and environment
    clearMockFiles();
    clearMockError();
    delete process.env.NODE_ENV;
  });

  it('should load configuration from mocked file', () => {
    console.log('Test running');
    // This is the key - we need to match exactly what ConfigLoader will look for
    const configPath = '/test/workspace/CONFIG.test.json';  // Direct path
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
    console.log('Mock file system size:', mockFileSystem.size);
    console.log('Mock file system keys:', Array.from(mockFileSystem.keys()));
    
    // Create a new instance with explicit config path to avoid singleton issues
    const configLoader = ConfigLoader.getInstance('CONFIG.test.json');
    console.log('ConfigLoader instance created');
    const config = configLoader.loadConfig();
    console.log('Config loaded');
    expect(config.accounts).toHaveLength(1);
  });
});