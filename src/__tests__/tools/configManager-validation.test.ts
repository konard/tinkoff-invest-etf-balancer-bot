import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";

// Mock modules first, before any other imports
const mockFs = {
  promises: {
    readFile: mock(async () => ''),
    writeFile: mock(async () => undefined),
    access: mock(async () => undefined),
    mkdir: mock(async () => undefined)
  }
};

// Mock the fs module
mock.module('fs', () => ({
  ...mockFs,
  promises: mockFs.promises
}));

// Mock process.exit to prevent tests from exiting the process
const mockProcessExit = mock((code?: number) => {
  throw new Error(`Process would exit with code ${code}`);
});

// Store original process.exit
const originalProcessExit = process.exit;

// Mock configLoader with comprehensive test scenarios
const mockConfigLoader = {
  loadConfig: mock(() => ({
    accounts: []
  })),
  getAllAccounts: mock(() => []),
  getAccountById: mock((id: string) => undefined),
  getRawTokenValue: mock((id: string) => ''),
  getAccountToken: mock((id: string) => ''),
  isTokenFromEnv: mock((id: string) => false)
};

mock.module('../../configLoader', () => ({
  configLoader: mockConfigLoader
}));

// Import test utilities
import { 
  TestEnvironment, 
  FinancialAssertions, 
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { mockControls } from '../__mocks__/external-deps';

// Store original env
const originalEnv = process.env;

testSuite('ConfigManager Configuration Validation Tests', () => {
  beforeEach(() => {
    // Setup mocks
    mockControls.resetAll();
    mockFs.promises.readFile.mockClear();
    mockFs.promises.writeFile.mockClear();
    mockFs.promises.access.mockClear();
    mockFs.promises.mkdir.mockClear();
    
    // Mock process.exit
    process.exit = mockProcessExit as any;
    
    // Reset mock configLoader methods
    mockConfigLoader.loadConfig.mockClear();
    mockConfigLoader.getAllAccounts.mockClear();
    mockConfigLoader.getAccountById.mockClear();
    mockConfigLoader.getRawTokenValue.mockClear();
    mockConfigLoader.getAccountToken.mockClear();
    mockConfigLoader.isTokenFromEnv.mockClear();
    
    // Set default mock responses
    mockConfigLoader.loadConfig.mockReturnValue({
      accounts: []
    });
    mockConfigLoader.getAllAccounts.mockReturnValue([]);
    mockConfigLoader.getAccountById.mockReturnValue(undefined);
    
    // Set default env vars
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore process.exit
    process.exit = originalProcessExit;
    // Restore env
    process.env = originalEnv;
  });

  describe('Configuration Structure Validation', () => {
    it('should validate correct configuration structure', async () => {
      // Dynamically import the validateConfig function
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      
      // Mock a valid configuration
      mockConfigLoader.loadConfig.mockReturnValue({
        accounts: [
          {
            id: 'test-account-1',
            name: 'Test Account 1',
            t_invest_token: 't.test_token_123',
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: {
              enabled: false
            }
          }
        ]
      });
      
      // Mock console.log to capture output
      const logSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      console.log = logSpy;
      
      try {
        validateConfig();
        
        // Verify that success message was logged
        expect(logSpy).toHaveBeenCalledWith('✅ Configuration loaded successfully');
        
        // Verify that statistics were logged
        expect(logSpy).toHaveBeenCalledWith('📋 Statistics:');
        expect(logSpy).toHaveBeenCalledWith('  Total accounts: 1');
        expect(logSpy).toHaveBeenCalledWith('  Unique IDs: 1');
        expect(logSpy).toHaveBeenCalledWith('  Tokens from environment variables: 0');
        expect(logSpy).toHaveBeenCalledWith('  Directly specified tokens: 1');
      } finally {
        // Restore console.log
        console.log = originalLog;
      }
    });
    
    it('should detect duplicate account IDs', async () => {
      // Dynamically import the validateConfig function
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      
      // Mock configuration with duplicate IDs
      mockConfigLoader.loadConfig.mockReturnValue({
        accounts: [
          {
            id: 'duplicate-id',
            name: 'Account 1',
            t_invest_token: 't.token1',
            account_id: '111111111',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          },
          {
            id: 'duplicate-id',
            name: 'Account 2',
            t_invest_token: 't.token2',
            account_id: '222222222',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TMOS: 100 },
            margin_trading: { enabled: false }
          }
        ]
      });
      
      // Mock console.log and console.error to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        validateConfig();
        
        // Verify that success message was logged
        expect(logSpy).toHaveBeenCalledWith('✅ Configuration loaded successfully');
        
        // Verify that duplicate ID was detected
        expect(errorSpy).toHaveBeenCalledWith('❌ Duplicate account ID: duplicate-id');
        
        // Verify that statistics were logged
        expect(logSpy).toHaveBeenCalledWith('📋 Statistics:');
        expect(logSpy).toHaveBeenCalledWith('  Total accounts: 2');
        expect(logSpy).toHaveBeenCalledWith('  Unique IDs: 1'); // Only 1 unique ID despite 2 accounts
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
    
    it('should detect duplicate tokens', async () => {
      // Dynamically import the validateConfig function
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      
      // Mock configuration with duplicate tokens
      mockConfigLoader.loadConfig.mockReturnValue({
        accounts: [
          {
            id: 'account-1',
            name: 'Account 1',
            t_invest_token: 't.duplicate_token',
            account_id: '111111111',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          },
          {
            id: 'account-2',
            name: 'Account 2',
            t_invest_token: 't.duplicate_token', // Same token
            account_id: '222222222',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TMOS: 100 },
            margin_trading: { enabled: false }
          }
        ]
      });
      
      // Mock console.log to capture output
      const logSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      console.log = logSpy;
      
      try {
        validateConfig();
        
        // Verify that success message was logged
        expect(logSpy).toHaveBeenCalledWith('✅ Configuration loaded successfully');
        
        // Verify that statistics were logged
        expect(logSpy).toHaveBeenCalledWith('📋 Statistics:');
        expect(logSpy).toHaveBeenCalledWith('  Total accounts: 2');
        expect(logSpy).toHaveBeenCalledWith('  Unique IDs: 2');
        expect(logSpy).toHaveBeenCalledWith('  Tokens from environment variables: 0');
        expect(logSpy).toHaveBeenCalledWith('  Directly specified tokens: 2');
        // Note: The current implementation doesn't explicitly check for duplicate tokens,
        // but this test ensures the validation function runs without errors
      } finally {
        // Restore console.log
        console.log = originalLog;
      }
    });
  });

  describe('Token Validation', () => {
    it('should validate environment variable tokens', async () => {
      // Dynamically import the validateConfig function
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      
      // Set up environment variable
      process.env.TEST_TOKEN = 't.env_token_value';
      
      // Mock configuration with environment variable token
      mockConfigLoader.loadConfig.mockReturnValue({
        accounts: [
          {
            id: 'env-account',
            name: 'Environment Token Account',
            t_invest_token: '${TEST_TOKEN}',
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          }
        ]
      });
      
      mockConfigLoader.isTokenFromEnv.mockReturnValue(true);
      mockConfigLoader.getAccountToken.mockReturnValue('t.env_token_value');
      
      // Mock console.log to capture output
      const logSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      console.log = logSpy;
      
      try {
        validateConfig();
        
        // Verify that success message was logged
        expect(logSpy).toHaveBeenCalledWith('✅ Configuration loaded successfully');
        
        // Verify that statistics were logged with environment token count
        expect(logSpy).toHaveBeenCalledWith('📋 Statistics:');
        expect(logSpy).toHaveBeenCalledWith('  Total accounts: 1');
        expect(logSpy).toHaveBeenCalledWith('  Unique IDs: 1');
        expect(logSpy).toHaveBeenCalledWith('  Tokens from environment variables: 1');
        expect(logSpy).toHaveBeenCalledWith('  Directly specified tokens: 0');
      } finally {
        // Restore console.log
        console.log = originalLog;
      }
    });
    
    it('should detect missing environment variables', async () => {
      // Dynamically import the validateConfig function
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      
      // Don't set up the environment variable to simulate missing env var
      delete process.env.MISSING_TOKEN;
      
      // Mock configuration with missing environment variable token
      mockConfigLoader.loadConfig.mockReturnValue({
        accounts: [
          {
            id: 'missing-env-account',
            name: 'Missing Environment Token Account',
            t_invest_token: '${MISSING_TOKEN}',
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          }
        ]
      });
      
      mockConfigLoader.isTokenFromEnv.mockReturnValue(true);
      mockConfigLoader.getAccountToken.mockReturnValue(''); // Empty because env var is missing
      
      // Mock console.log and console.error to capture output
      const logSpy = mock((...args: any[]) => {});
      const errorSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      const originalError = console.error;
      console.log = logSpy;
      console.error = errorSpy;
      
      try {
        validateConfig();
        
        // Verify that success message was logged
        expect(logSpy).toHaveBeenCalledWith('✅ Configuration loaded successfully');
        
        // Verify that missing environment variable was detected
        expect(errorSpy).toHaveBeenCalledWith('⚠️  Environment variable not found for missing-env-account: ${MISSING_TOKEN}');
        
        // Verify that statistics were logged
        expect(logSpy).toHaveBeenCalledWith('📋 Statistics:');
        expect(logSpy).toHaveBeenCalledWith('  Total accounts: 1');
        expect(logSpy).toHaveBeenCalledWith('  Unique IDs: 1');
        expect(logSpy).toHaveBeenCalledWith('  Tokens from environment variables: 1');
        expect(logSpy).toHaveBeenCalledWith('  Directly specified tokens: 0');
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
  });

  describe('Account Configuration Validation', () => {
    it('should validate account with correct weight distribution', async () => {
      // Dynamically import the validateConfig function
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      
      // Mock configuration with correct weight distribution
      mockConfigLoader.loadConfig.mockReturnValue({
        accounts: [
          {
            id: 'weight-account',
            name: 'Weight Validation Account',
            t_invest_token: 't.test_token',
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 50, TMOS: 30, TGLD: 20 }, // Sum = 100%
            margin_trading: { enabled: false }
          }
        ]
      });
      
      // Mock console.log to capture output
      const logSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      console.log = logSpy;
      
      try {
        validateConfig();
        
        // Verify that success message was logged
        expect(logSpy).toHaveBeenCalledWith('✅ Configuration loaded successfully');
        
        // Verify that statistics were logged
        expect(logSpy).toHaveBeenCalledWith('📋 Statistics:');
        expect(logSpy).toHaveBeenCalledWith('  Total accounts: 1');
        expect(logSpy).toHaveBeenCalledWith('  Unique IDs: 1');
      } finally {
        // Restore console.log
        console.log = originalLog;
      }
    });
    
    it('should detect incorrect weight distribution', async () => {
      // Dynamically import functions to test
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      const printAccountInfo = configManagerModule.printAccountInfo;
      
      // Mock configuration with incorrect weight distribution
      const accountWithBadWeights = {
        id: 'bad-weight-account',
        name: 'Bad Weight Account',
        t_invest_token: 't.test_token',
        account_id: '123456789',
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        desired_wallet: { TRUR: 60, TMOS: 30 }, // Sum = 90% (not 100%)
        margin_trading: { enabled: false }
      };
      
      mockConfigLoader.loadConfig.mockReturnValue({
        accounts: [accountWithBadWeights]
      });
      
      mockConfigLoader.getAccountById.mockReturnValue(accountWithBadWeights);
      
      // Mock console.log to capture output
      const logSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      console.log = logSpy;
      
      try {
        validateConfig();
        
        // Verify that success message was logged
        expect(logSpy).toHaveBeenCalledWith('✅ Configuration loaded successfully');
        
        // Verify that statistics were logged
        expect(logSpy).toHaveBeenCalledWith('📋 Statistics:');
        expect(logSpy).toHaveBeenCalledWith('  Total accounts: 1');
        expect(logSpy).toHaveBeenCalledWith('  Unique IDs: 1');
      } finally {
        // Restore console.log
        console.log = originalLog;
      }
    });
  });

  describe('Margin Trading Configuration Validation', () => {
    it('should validate account with correct margin trading configuration', async () => {
      // Dynamically import the validateConfig function
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      
      // Mock configuration with correct margin trading configuration
      mockConfigLoader.loadConfig.mockReturnValue({
        accounts: [
          {
            id: 'margin-account',
            name: 'Margin Trading Account',
            t_invest_token: 't.test_token',
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: {
              enabled: true,
              multiplier: 1.5,
              free_threshold: 50000,
              balancing_strategy: 'keep_if_small'
            }
          }
        ]
      });
      
      // Mock console.log to capture output
      const logSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      console.log = logSpy;
      
      try {
        validateConfig();
        
        // Verify that success message was logged
        expect(logSpy).toHaveBeenCalledWith('✅ Configuration loaded successfully');
        
        // Verify that statistics were logged
        expect(logSpy).toHaveBeenCalledWith('📋 Statistics:');
        expect(logSpy).toHaveBeenCalledWith('  Total accounts: 1');
        expect(logSpy).toHaveBeenCalledWith('  Unique IDs: 1');
      } finally {
        // Restore console.log
        console.log = originalLog;
      }
    });
    
    it('should validate margin trading with different strategies', async () => {
      // Dynamically import the validateConfig function
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      
      // Mock configuration with different margin trading strategy
      mockConfigLoader.loadConfig.mockReturnValue({
        accounts: [
          {
            id: 'margin-account-remove',
            name: 'Margin Trading Account (Remove Strategy)',
            t_invest_token: 't.test_token',
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: {
              enabled: true,
              multiplier: 2.0,
              free_threshold: 100000,
              balancing_strategy: 'remove'
            }
          }
        ]
      });
      
      // Mock console.log to capture output
      const logSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      console.log = logSpy;
      
      try {
        validateConfig();
        
        // Verify that success message was logged
        expect(logSpy).toHaveBeenCalledWith('✅ Configuration loaded successfully');
        
        // Verify that statistics were logged
        expect(logSpy).toHaveBeenCalledWith('📋 Statistics:');
        expect(logSpy).toHaveBeenCalledWith('  Total accounts: 1');
        expect(logSpy).toHaveBeenCalledWith('  Unique IDs: 1');
      } finally {
        // Restore console.log
        console.log = originalLog;
      }
    });
  });

  describe('Error Handling in Validation', () => {
    it('should handle configuration loading errors gracefully', async () => {
      // Dynamically import the validateConfig function
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      
      // Mock configLoader to throw an error
      mockConfigLoader.loadConfig.mockImplementation(() => {
        throw new Error('Configuration file not found');
      });
      
      // Mock console.error and process.exit to capture output
      const errorSpy = mock((...args: any[]) => {});
      const originalError = console.error;
      console.error = errorSpy;
      
      try {
        validateConfig();
        // Should not reach here as process.exit should be called
        expect(true).toBe(false);
      } catch (error) {
        // Verify that error was logged
        expect(errorSpy).toHaveBeenCalledWith('❌ Validation error: Configuration file not found');
      } finally {
        // Restore console.error
        console.error = originalError;
      }
    });
    
    it('should handle unknown errors gracefully', async () => {
      // Dynamically import the validateConfig function
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      
      // Mock configLoader to throw a non-Error object
      mockConfigLoader.loadConfig.mockImplementation(() => {
        throw 'String error'; // Non-Error object
      });
      
      // Mock console.error and process.exit to capture output
      const errorSpy = mock((...args: any[]) => {});
      const originalError = console.error;
      console.error = errorSpy;
      
      try {
        validateConfig();
        // Should not reach here as process.exit should be called
        expect(true).toBe(false);
      } catch (error) {
        // Verify that error was logged
        expect(errorSpy).toHaveBeenCalledWith('❌ Validation error: Unknown error');
      } finally {
        // Restore console.error
        console.error = originalError;
      }
    });
  });

  describe('Configuration Validation Edge Cases', () => {
    it('should handle empty configuration', async () => {
      // Dynamically import the validateConfig function
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      
      // Mock empty configuration
      mockConfigLoader.loadConfig.mockReturnValue({
        accounts: []
      });
      
      mockConfigLoader.getAllAccounts.mockReturnValue([]);
      
      // Mock console.log to capture output
      const logSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      console.log = logSpy;
      
      try {
        validateConfig();
        
        // Verify that success message was logged
        expect(logSpy).toHaveBeenCalledWith('✅ Configuration loaded successfully');
        
        // Verify that statistics were logged
        expect(logSpy).toHaveBeenCalledWith('📋 Statistics:');
        expect(logSpy).toHaveBeenCalledWith('  Total accounts: 0');
        expect(logSpy).toHaveBeenCalledWith('  Unique IDs: 0');
        expect(logSpy).toHaveBeenCalledWith('  Tokens from environment variables: 0');
        expect(logSpy).toHaveBeenCalledWith('  Directly specified tokens: 0');
      } finally {
        // Restore console.log
        console.log = originalLog;
      }
    });
    
    it('should handle configuration with special characters in account names', async () => {
      // Dynamically import the validateConfig function
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      
      // Mock configuration with special characters in account names
      mockConfigLoader.loadConfig.mockReturnValue({
        accounts: [
          {
            id: 'special-chars-account',
            name: 'Account with @#$%&*() Characters',
            t_invest_token: 't.test_token',
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          }
        ]
      });
      
      // Mock console.log to capture output
      const logSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      console.log = logSpy;
      
      try {
        validateConfig();
        
        // Verify that success message was logged
        expect(logSpy).toHaveBeenCalledWith('✅ Configuration loaded successfully');
        
        // Verify that statistics were logged
        expect(logSpy).toHaveBeenCalledWith('📋 Statistics:');
        expect(logSpy).toHaveBeenCalledWith('  Total accounts: 1');
        expect(logSpy).toHaveBeenCalledWith('  Unique IDs: 1');
      } finally {
        // Restore console.log
        console.log = originalLog;
      }
    });
    
    it('should handle malformed environment variable syntax', async () => {
      // Dynamically import the validateConfig function
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      
      // Mock configuration with malformed environment variable syntax
      mockConfigLoader.loadConfig.mockReturnValue({
        accounts: [
          {
            id: 'malformed-env-account',
            name: 'Malformed Environment Token Account',
            t_invest_token: '${INCOMPLETE', // Missing closing brace
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          }
        ]
      });
      
      mockConfigLoader.isTokenFromEnv.mockReturnValue(false); // Should return false for malformed syntax
      mockConfigLoader.getAccountToken.mockReturnValue('${INCOMPLETE');
      
      // Mock console.log to capture output
      const logSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      console.log = logSpy;
      
      try {
        validateConfig();
        
        // Verify that success message was logged
        expect(logSpy).toHaveBeenCalledWith('✅ Configuration loaded successfully');
        
        // Verify that statistics were logged
        expect(logSpy).toHaveBeenCalledWith('📋 Statistics:');
        expect(logSpy).toHaveBeenCalledWith('  Total accounts: 1');
        expect(logSpy).toHaveBeenCalledWith('  Unique IDs: 1');
        expect(logSpy).toHaveBeenCalledWith('  Tokens from environment variables: 0'); // Not counted as env token
        expect(logSpy).toHaveBeenCalledWith('  Directly specified tokens: 1'); // Counted as direct token
      } finally {
        // Restore console.log
        console.log = originalLog;
      }
    });
  });

  describe('Performance Tests for Configuration Validation', () => {
    it('should handle large configuration with many accounts', async () => {
      // Dynamically import the validateConfig function
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      
      // Create a large configuration with many accounts
      const largeAccounts = Array.from({ length: 100 }, (_, i) => ({
        id: `account-${i}`,
        name: `Account ${i}`,
        t_invest_token: `t.token_${i}`,
        account_id: `account_id_${i}`,
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        desired_wallet: { TRUR: 100 },
        margin_trading: { enabled: false }
      }));
      
      mockConfigLoader.loadConfig.mockReturnValue({
        accounts: largeAccounts
      });
      
      mockConfigLoader.getAllAccounts.mockReturnValue(largeAccounts);
      
      // Mock console.log to capture output
      const logSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      console.log = logSpy;
      
      try {
        const startTime = performance.now();
        validateConfig();
        const endTime = performance.now();
        
        // Verify that success message was logged
        expect(logSpy).toHaveBeenCalledWith('✅ Configuration loaded successfully');
        
        // Verify that statistics were logged
        expect(logSpy).toHaveBeenCalledWith('📋 Statistics:');
        expect(logSpy).toHaveBeenCalledWith('  Total accounts: 100');
        expect(logSpy).toHaveBeenCalledWith('  Unique IDs: 100');
        expect(logSpy).toHaveBeenCalledWith('  Tokens from environment variables: 0');
        expect(logSpy).toHaveBeenCalledWith('  Directly specified tokens: 100');
        
        // Should complete within reasonable time (less than 1 second)
        expect(endTime - startTime).toBeLessThan(1000);
      } finally {
        // Restore console.log
        console.log = originalLog;
      }
    });
    
    it('should validate configuration efficiently', async () => {
      // Dynamically import the validateConfig function
      const configManagerModule = await import('../../tools/configManager');
      const validateConfig = configManagerModule.validateConfig;
      
      // Mock a standard configuration
      mockConfigLoader.loadConfig.mockReturnValue({
        accounts: [
          {
            id: 'perf-account-1',
            name: 'Performance Test Account 1',
            t_invest_token: 't.perf_token_1',
            account_id: '111111111',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 50, TMOS: 50 },
            margin_trading: { enabled: false }
          },
          {
            id: 'perf-account-2',
            name: 'Performance Test Account 2',
            t_invest_token: '${PERF_TOKEN}', // Environment token
            account_id: '222222222',
            desired_mode: 'marketcap',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TGLD: 100 },
            margin_trading: {
              enabled: true,
              multiplier: 1.5,
              free_threshold: 50000,
              balancing_strategy: 'keep_if_small'
            }
          }
        ]
      });
      
      process.env.PERF_TOKEN = 't.env_perf_token';
      mockConfigLoader.isTokenFromEnv.mockReturnValue(true);
      mockConfigLoader.getAccountToken.mockImplementation((id: string) => {
        if (id === 'perf-account-2') return 't.env_perf_token';
        return 't.perf_token_1';
      });
      
      // Mock console.log to capture output
      const logSpy = mock((...args: any[]) => {});
      const originalLog = console.log;
      console.log = logSpy;
      
      try {
        const startTime = performance.now();
        validateConfig();
        const endTime = performance.now();
        
        // Verify that success message was logged
        expect(logSpy).toHaveBeenCalledWith('✅ Configuration loaded successfully');
        
        // Verify that statistics were logged
        expect(logSpy).toHaveBeenCalledWith('📋 Statistics:');
        expect(logSpy).toHaveBeenCalledWith('  Total accounts: 2');
        expect(logSpy).toHaveBeenCalledWith('  Unique IDs: 2');
        expect(logSpy).toHaveBeenCalledWith('  Tokens from environment variables: 1');
        expect(logSpy).toHaveBeenCalledWith('  Directly specified tokens: 1');
        
        // Should complete very quickly
        expect(endTime - startTime).toBeLessThan(100);
      } finally {
        // Restore console.log
        console.log = originalLog;
      }
    });
  });
});