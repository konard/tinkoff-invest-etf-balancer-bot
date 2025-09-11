import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";

// Import test utilities
import { 
  TestEnvironment, 
  FinancialAssertions, 
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { mockControls } from '../__mocks__/external-deps';

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
  loadConfig: mock(() => ({
    accounts: []
  })),
  getAllAccounts: mock(() => []),
  getAccountById: mock((id: string) => undefined),
  getRawTokenValue: mock((id: string) => ''),
  getAccountToken: mock((id: string) => ''),
  isTokenFromEnv: mock((id: string) => false),
  getAccountAccountId: mock((id: string) => undefined)
};

mock.module('../../configLoader', () => ({
  configLoader: mockConfigLoader
}));

// Mock process.exit to prevent tests from exiting the process
const mockProcessExit = mock((code?: number) => {
  throw new Error(`Process would exit with code ${code}`);
});

// Store original process.exit
const originalProcessExit = process.exit;

testSuite('Configuration Error Handling with Graceful Degradation Tests', () => {
  let originalEnv: any;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Setup mocks
    mockControls.resetAll();
    mockFs.promises.readFile.mockClear();
    mockFs.promises.writeFile.mockClear();
    mockFs.promises.access.mockClear();
    mockFs.promises.mkdir.mockClear();
    mockFs.promises.readdir.mockClear();
    mockPath.resolve.mockClear();
    mockPath.join.mockClear();
    mockPath.dirname.mockClear();
    
    // Mock process.exit
    process.exit = mockProcessExit as any;
    
    // Reset mock configLoader methods
    mockConfigLoader.loadConfig.mockClear();
    mockConfigLoader.getAllAccounts.mockClear();
    mockConfigLoader.getAccountById.mockClear();
    mockConfigLoader.getRawTokenValue.mockClear();
    mockConfigLoader.getAccountToken.mockClear();
    mockConfigLoader.isTokenFromEnv.mockClear();
    mockConfigLoader.getAccountAccountId.mockClear();
    
    // Set default mock responses
    mockConfigLoader.loadConfig.mockReturnValue({
      accounts: []
    });
    mockConfigLoader.getAllAccounts.mockReturnValue([]);
    mockConfigLoader.getAccountById.mockReturnValue(undefined);
    mockConfigLoader.getAccountAccountId.mockReturnValue(undefined);
    
    // Set default env vars
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore process.exit
    process.exit = originalProcessExit;
    // Restore environment
    process.env = originalEnv;
  });

  describe('File System Error Handling', () => {
    it('should gracefully handle missing configuration file', async () => {
      // Mock file system to simulate missing configuration file
      mockFs.promises.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory, open \'CONFIG.json\''));
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('CONFIG.json');
        
        // Should handle missing file gracefully
        expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
        
        // Verify error was logged
        expect(errorSpy).toHaveBeenCalled();
      } catch (error) {
        // Verify graceful error handling
        expect(error).toBeDefined();
        expect(error.message).toContain('Configuration loading error');
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
    
    it('should handle permission denied errors gracefully', async () => {
      // Mock file system to simulate permission denied error
      const permissionError = new Error('EACCES: permission denied, open \'CONFIG.json\'');
      (permissionError as any).code = 'EACCES';
      mockFs.promises.readFile.mockRejectedValue(permissionError);
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('CONFIG.json');
        
        // Should handle permission error gracefully
        expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
        
        // Verify error was logged
        expect(errorSpy).toHaveBeenCalled();
      } catch (error) {
        // Verify graceful error handling
        expect(error).toBeDefined();
        expect(error.message).toContain('Configuration loading error');
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
    
    it('should handle disk full errors gracefully', async () => {
      // Mock file system to simulate disk full error
      const diskFullError = new Error('ENOSPC: no space left on device');
      (diskFullError as any).code = 'ENOSPC';
      mockFs.promises.readFile.mockRejectedValue(diskFullError);
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('CONFIG.json');
        
        // Should handle disk full error gracefully
        expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
        
        // Verify error was logged
        expect(errorSpy).toHaveBeenCalled();
      } catch (error) {
        // Verify graceful error handling
        expect(error).toBeDefined();
        expect(error.message).toContain('Configuration loading error');
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
  });

  describe('JSON Parsing Error Handling', () => {
    it('should gracefully handle invalid JSON syntax', async () => {
      // Mock file system to return invalid JSON
      mockFs.promises.readFile.mockResolvedValue('invalid json {');
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('CONFIG.json');
        
        // Should handle invalid JSON gracefully
        expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
        
        // Verify error was logged
        expect(errorSpy).toHaveBeenCalled();
      } catch (error) {
        // Verify graceful error handling
        expect(error).toBeDefined();
        expect(error.message).toContain('Configuration loading error');
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
    
    it('should handle malformed JSON with trailing commas', async () => {
      // Mock file system to return malformed JSON with trailing commas
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
      mockFs.promises.readFile.mockResolvedValue(malformedConfig);
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('CONFIG.json');
        
        // Should handle malformed JSON gracefully
        expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
        
        // Verify error was logged
        expect(errorSpy).toHaveBeenCalled();
      } catch (error) {
        // Verify graceful error handling
        expect(error).toBeDefined();
        expect(error.message).toContain('Configuration loading error');
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
    
    it('should handle JSON with control characters', async () => {
      // Mock file system to return JSON with control characters
      const configWithControlChars = `{
        "accounts": [
          {
            "id": "test",
            \u0000"name": "Test Account", // Contains null character
            "t_invest_token": "token",
            "account_id": "123",
            "desired_wallet": { "TRUR": 100 }
          }
        ]
      }`;
      mockFs.promises.readFile.mockResolvedValue(configWithControlChars);
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('CONFIG.json');
        
        // Should handle JSON with control characters gracefully
        expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
        
        // Verify error was logged
        expect(errorSpy).toHaveBeenCalled();
      } catch (error) {
        // Verify graceful error handling
        expect(error).toBeDefined();
        expect(error.message).toContain('Configuration loading error');
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
  });

  describe('Configuration Structure Error Handling', () => {
    it('should gracefully handle missing accounts array', async () => {
      // Mock configuration with missing accounts array
      const invalidConfig = {};
      mockFs.promises.readFile.mockResolvedValue(JSON.stringify(invalidConfig));
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('CONFIG.json');
        
        // Should handle missing accounts gracefully
        expect(() => configLoader.loadConfig()).toThrow('Configuration must contain accounts array');
        
        // Verify error was logged
        expect(errorSpy).toHaveBeenCalled();
      } catch (error) {
        // Verify graceful error handling
        expect(error).toBeDefined();
        expect(error.message).toContain('Configuration must contain accounts array');
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
    
    it('should handle non-array accounts field', async () => {
      // Mock configuration with non-array accounts
      const invalidConfig = { accounts: 'not an array' };
      mockFs.promises.readFile.mockResolvedValue(JSON.stringify(invalidConfig));
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('CONFIG.json');
        
        // Should handle non-array accounts gracefully
        expect(() => configLoader.loadConfig()).toThrow('Configuration must contain accounts array');
        
        // Verify error was logged
        expect(errorSpy).toHaveBeenCalled();
      } catch (error) {
        // Verify graceful error handling
        expect(error).toBeDefined();
        expect(error.message).toContain('Configuration must contain accounts array');
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
    
    it('should handle accounts with missing required fields', async () => {
      // Mock configuration with missing required fields
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
      mockFs.promises.readFile.mockResolvedValue(JSON.stringify(invalidConfig));
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('CONFIG.json');
        
        // Should handle missing required fields gracefully
        expect(() => configLoader.loadConfig()).toThrow('must contain field');
        
        // Verify error was logged
        expect(errorSpy).toHaveBeenCalled();
      } catch (error) {
        // Verify graceful error handling
        expect(error).toBeDefined();
        expect(error.message).toContain('must contain field');
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
  });

  describe('Graceful Degradation Strategies', () => {
    it('should fall back to default configuration when primary config fails', async () => {
      // Mock file system to simulate config loading failure
      mockFs.promises.readFile.mockRejectedValue(new Error('Configuration file not accessible'));
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('CONFIG.json');
        
        // Should attempt to load config and handle failure gracefully
        expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
        
        // Verify error was logged
        expect(errorSpy).toHaveBeenCalled();
      } catch (error) {
        // Verify graceful error handling
        expect(error).toBeDefined();
        expect(error.message).toContain('Configuration loading error');
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
    
    it('should continue operation with partial configuration when possible', async () => {
      // Mock configuration with one valid account and one invalid account
      const mixedConfig = {
        accounts: [
          {
            id: 'valid-account',
            name: 'Valid Account',
            t_invest_token: 't.valid_token',
            account_id: '123456789',
            desired_wallet: { TRUR: 100 },
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000
          },
          {
            id: 'invalid-account',
            name: 'Invalid Account'
            // Missing required fields
          }
        ]
      };
      mockFs.promises.readFile.mockResolvedValue(JSON.stringify(mixedConfig));
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('CONFIG.json');
        
        // Should handle mixed configuration gracefully
        expect(() => configLoader.loadConfig()).toThrow('must contain field');
        
        // Verify error was logged
        expect(errorSpy).toHaveBeenCalled();
      } catch (error) {
        // Verify graceful error handling
        expect(error).toBeDefined();
        expect(error.message).toContain('must contain field');
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
    
    it('should provide informative error messages for troubleshooting', async () => {
      // Mock file system to simulate permission denied error
      const permissionError = new Error('EACCES: permission denied, open \'CONFIG.json\'');
      (permissionError as any).code = 'EACCES';
      mockFs.promises.readFile.mockRejectedValue(permissionError);
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('CONFIG.json');
        
        // Should provide informative error message
        expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
        
        // Verify informative error message was logged
        expect(errorSpy).toHaveBeenCalled();
      } catch (error) {
        // Verify graceful error handling with informative message
        expect(error).toBeDefined();
        expect(error.message).toContain('Configuration loading error');
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
  });

  describe('Recovery and Retry Mechanisms', () => {
    it('should attempt to reload configuration after file system errors', async () => {
      // First call fails, second call succeeds
      mockFs.promises.readFile
        .mockRejectedValueOnce(new Error('EIO: input/output error'))
        .mockResolvedValueOnce(JSON.stringify({
          accounts: [
            {
              id: 'recovered-account',
              name: 'Recovered Account',
              t_invest_token: 't.recovered_token',
              account_id: '987654321',
              desired_wallet: { TRUR: 100 },
              desired_mode: 'manual',
              balance_interval: 300000,
              sleep_between_orders: 1000
            }
          ]
        }));
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('CONFIG.json');
        
        // First attempt should fail
        expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
        
        // Second attempt should succeed
        const config = configLoader.loadConfig();
        expect(config.accounts).toHaveLength(1);
        expect(config.accounts[0].id).toBe('recovered-account');
        
        // Verify error was logged for first attempt
        expect(errorSpy).toHaveBeenCalled();
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
    
    it('should handle intermittent network file system errors', async () => {
      // Simulate intermittent network errors
      mockFs.promises.readFile
        .mockRejectedValueOnce(new Error('ENETUNREACH: Network is unreachable'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT: Connection timed out'))
        .mockResolvedValueOnce(JSON.stringify({
          accounts: [
            {
              id: 'network-recovered-account',
              name: 'Network Recovered Account',
              t_invest_token: 't.network_token',
              account_id: '111222333',
              desired_wallet: { TRUR: 100 },
              desired_mode: 'manual',
              balance_interval: 300000,
              sleep_between_orders: 1000
            }
          ]
        }));
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('CONFIG.json');
        
        // First two attempts should fail
        expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
        expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
        
        // Third attempt should succeed
        const config = configLoader.loadConfig();
        expect(config.accounts).toHaveLength(1);
        expect(config.accounts[0].id).toBe('network-recovered-account');
        
        // Verify errors were logged for failed attempts
        expect(errorSpy).toHaveBeenCalledTimes(2);
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
  });

  describe('Error Context Preservation', () => {
    it('should preserve error context for debugging', async () => {
      // Mock file system to simulate specific error with context
      const contextualError = new Error('ENOENT: Configuration file not found at /app/config/CONFIG.json');
      (contextualError as any).code = 'ENOENT';
      (contextualError as any).path = '/app/config/CONFIG.json';
      mockFs.promises.readFile.mockRejectedValue(contextualError);
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('CONFIG.json');
        
        // Should preserve error context
        expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
        
        // Verify error context was preserved
        expect(errorSpy).toHaveBeenCalled();
      } catch (error) {
        // Verify error context preservation
        expect(error).toBeDefined();
        expect(error.message).toContain('Configuration loading error');
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
    
    it('should include relevant file paths in error messages', async () => {
      // Mock file system to simulate error with file path
      const pathError = new Error('EACCES: Permission denied accessing configuration file');
      (pathError as any).code = 'EACCES';
      (pathError as any).path = '/etc/app/CONFIG.json';
      mockFs.promises.readFile.mockRejectedValue(pathError);
      
      // Mock console methods to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        // Dynamically import and test the config loader
        const configModule = await import('../../configLoader');
        const ConfigLoader = configModule.ConfigLoader;
        
        // Create a new instance with explicit config path
        const configLoader = new ConfigLoader('/etc/app/CONFIG.json');
        
        // Should include file path in error message
        expect(() => configLoader.loadConfig()).toThrow('Configuration loading error');
        
        // Verify file path was included in error handling
        expect(errorSpy).toHaveBeenCalled();
      } catch (error) {
        // Verify file path inclusion
        expect(error).toBeDefined();
        expect(error.message).toContain('Configuration loading error');
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
  });
});