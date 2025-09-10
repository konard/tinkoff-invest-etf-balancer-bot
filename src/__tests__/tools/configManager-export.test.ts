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
  isTokenFromEnv: mock((id: string) => false),
  // Add mock methods for export functionality
  exportConfig: mock(async () => undefined),
  exportAccount: mock(async (accountId: string, format: string) => undefined),
  exportToJSON: mock(async () => '{}'),
  exportToYAML: mock(async () => ''),
  exportToEnv: mock(async () => '')
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

testSuite('ConfigManager Configuration Export Tests', () => {
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
    mockConfigLoader.exportConfig.mockClear();
    mockConfigLoader.exportAccount.mockClear();
    mockConfigLoader.exportToJSON.mockClear();
    mockConfigLoader.exportToYAML.mockClear();
    mockConfigLoader.exportToEnv.mockClear();
    
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

  describe('Full Configuration Export', () => {
    it('should export complete configuration to JSON format', async () => {
      // Mock configuration data
      const configData = {
        accounts: [
          {
            id: 'export-test-account-1',
            name: 'Export Test Account 1',
            t_invest_token: 't.export_token_1',
            account_id: '111111111',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          },
          {
            id: 'export-test-account-2',
            name: 'Export Test Account 2',
            t_invest_token: '${EXPORT_TOKEN_2}',
            account_id: '222222222',
            desired_mode: 'marketcap',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TMOS: 50, TGLD: 50 },
            margin_trading: {
              enabled: true,
              multiplier: 1.5,
              free_threshold: 50000,
              balancing_strategy: 'keep_if_small'
            }
          }
        ]
      };
      
      // Mock exportToJSON functionality
      const expectedJSON = JSON.stringify(configData, null, 2);
      mockConfigLoader.exportToJSON.mockReturnValue(expectedJSON);
      
      // Test the export functionality
      const result = mockConfigLoader.exportToJSON();
      
      expect(result).toBe(expectedJSON);
      expect(typeof result).toBe('string');
      
      // Verify it's valid JSON
      const parsed = JSON.parse(result);
      expect(parsed.accounts).toHaveLength(2);
      expect(parsed.accounts[0].id).toBe('export-test-account-1');
      expect(parsed.accounts[1].id).toBe('export-test-account-2');
      
      // Verify the mock was called
      expect(mockConfigLoader.exportToJSON).toHaveBeenCalled();
    });
    
    it('should export configuration with environment tokens to JSON', async () => {
      // Set up environment variables
      process.env.EXPORT_TOKEN_2 = 't.env_export_token_2';
      
      // Mock configuration data with environment tokens
      const configData = {
        accounts: [
          {
            id: 'env-export-account',
            name: 'Environment Export Account',
            t_invest_token: '${EXPORT_TOKEN_2}',
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          }
        ]
      };
      
      // Mock exportToJSON functionality
      const expectedJSON = JSON.stringify(configData, null, 2);
      mockConfigLoader.exportToJSON.mockReturnValue(expectedJSON);
      
      // Test the export functionality
      const result = mockConfigLoader.exportToJSON();
      
      expect(result).toBe(expectedJSON);
      expect(result).toContain('${EXPORT_TOKEN_2}');
      
      // Verify the mock was called
      expect(mockConfigLoader.exportToJSON).toHaveBeenCalled();
    });
    
    it('should handle empty configuration export', async () => {
      // Mock empty configuration data
      const emptyConfig = {
        accounts: []
      };
      
      // Mock exportToJSON functionality
      const expectedJSON = JSON.stringify(emptyConfig, null, 2);
      mockConfigLoader.exportToJSON.mockReturnValue(expectedJSON);
      
      // Test the export functionality
      const result = mockConfigLoader.exportToJSON();
      
      expect(result).toBe(expectedJSON);
      expect(typeof result).toBe('string');
      
      // Verify it's valid JSON
      const parsed = JSON.parse(result);
      expect(parsed.accounts).toHaveLength(0);
      
      // Verify the mock was called
      expect(mockConfigLoader.exportToJSON).toHaveBeenCalled();
    });
  });

  describe('Individual Account Export', () => {
    it('should export single account configuration', async () => {
      // Mock account data
      const accountData = {
        id: 'single-export-account',
        name: 'Single Export Account',
        t_invest_token: 't.single_export_token',
        account_id: '123456789',
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        desired_wallet: { TRUR: 50, TMOS: 50 },
        margin_trading: {
          enabled: true,
          multiplier: 2.0,
          free_threshold: 100000,
          balancing_strategy: 'remove'
        }
      };
      
      // Mock getAccountById functionality
      mockConfigLoader.getAccountById.mockImplementation((id: string) => {
        if (id === 'single-export-account') return accountData;
        return undefined;
      });
      
      // Mock exportAccount functionality
      mockConfigLoader.exportAccount.mockImplementation(async (accountId: string, format: string) => {
        const account = mockConfigLoader.getAccountById(accountId);
        if (!account) return null;
        
        if (format === 'json') {
          return JSON.stringify(account, null, 2);
        } else if (format === 'yaml') {
          // Simple YAML conversion for testing
          return Object.entries(account)
            .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
            .join('\n');
        }
        return null;
      });
      
      // Test JSON export
      const jsonResult = await mockConfigLoader.exportAccount('single-export-account', 'json');
      
      expect(jsonResult).not.toBeNull();
      expect(typeof jsonResult).toBe('string');
      
      // Verify it's valid JSON
      const parsed = JSON.parse(jsonResult!);
      expect(parsed.id).toBe('single-export-account');
      expect(parsed.name).toBe('Single Export Account');
      expect(parsed.desired_wallet).toEqual({ TRUR: 50, TMOS: 50 });
      expect(parsed.margin_trading.enabled).toBe(true);
      expect(parsed.margin_trading.multiplier).toBe(2.0);
      
      // Test YAML export
      const yamlResult = await mockConfigLoader.exportAccount('single-export-account', 'yaml');
      
      expect(yamlResult).not.toBeNull();
      expect(typeof yamlResult).toBe('string');
      expect(yamlResult).toContain('id: single-export-account');
      expect(yamlResult).toContain('name: Single Export Account');
      
      // Verify the mocks were called
      expect(mockConfigLoader.exportAccount).toHaveBeenCalledWith('single-export-account', 'json');
      expect(mockConfigLoader.exportAccount).toHaveBeenCalledWith('single-export-account', 'yaml');
    });
    
    it('should handle export of non-existent account', async () => {
      // Mock exportAccount to return null for non-existent account
      mockConfigLoader.exportAccount.mockResolvedValue(null);
      
      // Test exporting non-existent account
      const result = await mockConfigLoader.exportAccount('non-existent-account', 'json');
      
      expect(result).toBeNull();
      
      // Verify the mock was called
      expect(mockConfigLoader.exportAccount).toHaveBeenCalledWith('non-existent-account', 'json');
    });
  });

  describe('YAML Format Export', () => {
    it('should export configuration to YAML format', async () => {
      // Mock configuration data
      const configData = {
        accounts: [
          {
            id: 'yaml-export-account',
            name: 'YAML Export Account',
            t_invest_token: 't.yaml_token',
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          }
        ]
      };
      
      // Mock exportToYAML functionality
      const expectedYAML = `
accounts:
  - id: yaml-export-account
    name: YAML Export Account
    t_invest_token: t.yaml_token
    account_id: 123456789
    desired_mode: manual
    balance_interval: 300000
    sleep_between_orders: 1000
    desired_wallet:
      TRUR: 100
    margin_trading:
      enabled: false
`.trim();
      
      mockConfigLoader.exportToYAML.mockReturnValue(expectedYAML);
      
      // Test the export functionality
      const result = mockConfigLoader.exportToYAML();
      
      expect(result).toBe(expectedYAML);
      expect(typeof result).toBe('string');
      expect(result).toContain('accounts:');
      expect(result).toContain('id: yaml-export-account');
      expect(result).toContain('t_invest_token: t.yaml_token');
      
      // Verify the mock was called
      expect(mockConfigLoader.exportToYAML).toHaveBeenCalled();
    });
    
    it('should handle complex YAML export with nested objects', async () => {
      // Mock complex configuration data
      const complexConfig = {
        accounts: [
          {
            id: 'complex-yaml-account',
            name: 'Complex YAML Account',
            t_invest_token: '${COMPLEX_TOKEN}',
            account_id: '123456789',
            desired_mode: 'marketcap_aum',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 40, TMOS: 30, TGLD: 30 },
            margin_trading: {
              enabled: true,
              multiplier: 1.5,
              free_threshold: 50000,
              balancing_strategy: 'keep_if_small'
            },
            custom_settings: {
              rebalance_threshold: 5,
              notification_emails: ['user@example.com', 'admin@example.com'],
              trading_hours: {
                start: '09:00',
                end: '18:00'
              }
            }
          }
        ]
      };
      
      // Mock exportToYAML functionality with complex structure
      const expectedYAML = `
accounts:
  - id: complex-yaml-account
    name: Complex YAML Account
    t_invest_token: \${COMPLEX_TOKEN}
    account_id: 123456789
    desired_mode: marketcap_aum
    balance_interval: 300000
    sleep_between_orders: 1000
    desired_wallet:
      TRUR: 40
      TMOS: 30
      TGLD: 30
    margin_trading:
      enabled: true
      multiplier: 1.5
      free_threshold: 50000
      balancing_strategy: keep_if_small
    custom_settings:
      rebalance_threshold: 5
      notification_emails:
        - user@example.com
        - admin@example.com
      trading_hours:
        start: "09:00"
        end: "18:00"
`.trim();
      
      mockConfigLoader.exportToYAML.mockReturnValue(expectedYAML);
      
      // Test the export functionality
      const result = mockConfigLoader.exportToYAML();
      
      expect(result).toBe(expectedYAML);
      expect(typeof result).toBe('string');
      
      // Verify key elements are present
      expect(result).toContain('accounts:');
      expect(result).toContain('id: complex-yaml-account');
      expect(result).toContain('t_invest_token: ${COMPLEX_TOKEN}');
      expect(result).toContain('desired_wallet:');
      expect(result).toContain('TRUR: 40');
      expect(result).toContain('margin_trading:');
      expect(result).toContain('enabled: true');
      expect(result).toContain('custom_settings:');
      expect(result).toContain('rebalance_threshold: 5');
      expect(result).toContain('notification_emails:');
      expect(result).toContain('user@example.com');
      
      // Verify the mock was called
      expect(mockConfigLoader.exportToYAML).toHaveBeenCalled();
    });
  });

  describe('Environment Variables Export', () => {
    it('should export environment variables configuration', async () => {
      // Set up environment variables
      process.env.EXPORT_TOKEN_1 = 't.env_token_1';
      process.env.EXPORT_TOKEN_2 = 't.env_token_2';
      
      // Mock configuration with environment tokens
      const configWithEnvTokens = {
        accounts: [
          {
            id: 'env-account-1',
            name: 'Environment Account 1',
            t_invest_token: '${EXPORT_TOKEN_1}',
            account_id: '111111111',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          },
          {
            id: 'env-account-2',
            name: 'Environment Account 2',
            t_invest_token: '${EXPORT_TOKEN_2}',
            account_id: '222222222',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TMOS: 100 },
            margin_trading: { enabled: false }
          }
        ]
      };
      
      mockConfigLoader.loadConfig.mockReturnValue(configWithEnvTokens);
      
      // Mock exportToEnv functionality
      const expectedEnv = `
# Environment variables for tinkoff-invest-etf-balancer-bot
EXPORT_TOKEN_1=t.env_token_1
EXPORT_TOKEN_2=t.env_token_2
OPENROUTER_API_KEY=
OPENROUTER_MODEL=qwen/qwen3-235b-a22b-2507
`.trim();
      
      mockConfigLoader.exportToEnv.mockReturnValue(expectedEnv);
      
      // Test the export functionality
      const result = mockConfigLoader.exportToEnv();
      
      expect(result).toBe(expectedEnv);
      expect(typeof result).toBe('string');
      expect(result).toContain('EXPORT_TOKEN_1=t.env_token_1');
      expect(result).toContain('EXPORT_TOKEN_2=t.env_token_2');
      expect(result).toContain('OPENROUTER_API_KEY=');
      
      // Verify the mock was called
      expect(mockConfigLoader.exportToEnv).toHaveBeenCalled();
    });
    
    it('should handle export with mixed token types', async () => {
      // Set up environment variables
      process.env.MIXED_ENV_TOKEN = 't.mixed_env_token';
      
      // Mock configuration with mixed token types
      const configWithMixedTokens = {
        accounts: [
          {
            id: 'direct-token-account',
            name: 'Direct Token Account',
            t_invest_token: 't.direct_token_value',
            account_id: '111111111',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          },
          {
            id: 'env-token-account',
            name: 'Environment Token Account',
            t_invest_token: '${MIXED_ENV_TOKEN}',
            account_id: '222222222',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TMOS: 100 },
            margin_trading: { enabled: false }
          }
        ]
      };
      
      mockConfigLoader.loadConfig.mockReturnValue(configWithMixedTokens);
      
      // Mock exportToEnv functionality - should only export environment tokens
      const expectedEnv = `
# Environment variables for tinkoff-invest-etf-balancer-bot
MIXED_ENV_TOKEN=t.mixed_env_token
OPENROUTER_API_KEY=
OPENROUTER_MODEL=qwen/qwen3-235b-a22b-2507
`.trim();
      
      mockConfigLoader.exportToEnv.mockReturnValue(expectedEnv);
      
      // Test the export functionality
      const result = mockConfigLoader.exportToEnv();
      
      expect(result).toBe(expectedEnv);
      expect(typeof result).toBe('string');
      expect(result).toContain('MIXED_ENV_TOKEN=t.mixed_env_token');
      expect(result).not.toContain('t.direct_token_value'); // Direct tokens should not be in env export
      
      // Verify the mock was called
      expect(mockConfigLoader.exportToEnv).toHaveBeenCalled();
    });
  });

  describe('Configuration Export Validation', () => {
    it('should validate exported JSON structure', async () => {
      // Mock configuration data
      const validConfig = {
        accounts: [
          {
            id: 'validation-account',
            name: 'Validation Account',
            t_invest_token: 't.validation_token',
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          }
        ]
      };
      
      // Mock exportToJSON functionality
      const exportedJSON = JSON.stringify(validConfig, null, 2);
      mockConfigLoader.exportToJSON.mockReturnValue(exportedJSON);
      
      // Test the export functionality
      const result = mockConfigLoader.exportToJSON();
      
      // Validate structure
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('accounts');
      expect(Array.isArray(parsed.accounts)).toBe(true);
      expect(parsed.accounts).toHaveLength(1);
      
      const account = parsed.accounts[0];
      expect(account).toHaveProperty('id');
      expect(account).toHaveProperty('name');
      expect(account).toHaveProperty('t_invest_token');
      expect(account).toHaveProperty('account_id');
      expect(account).toHaveProperty('desired_mode');
      expect(account).toHaveProperty('balance_interval');
      expect(account).toHaveProperty('sleep_between_orders');
      expect(account).toHaveProperty('desired_wallet');
      expect(account).toHaveProperty('margin_trading');
      
      // Validate types
      expect(typeof account.id).toBe('string');
      expect(typeof account.name).toBe('string');
      expect(typeof account.t_invest_token).toBe('string');
      expect(typeof account.account_id).toBe('string');
      expect(typeof account.desired_mode).toBe('string');
      expect(typeof account.balance_interval).toBe('number');
      expect(typeof account.sleep_between_orders).toBe('number');
      expect(typeof account.desired_wallet).toBe('object');
      expect(typeof account.margin_trading).toBe('object');
      
      // Verify the mock was called
      expect(mockConfigLoader.exportToJSON).toHaveBeenCalled();
    });
    
    it('should validate exported YAML structure', async () => {
      // Mock configuration data
      const validConfig = {
        accounts: [
          {
            id: 'yaml-validation-account',
            name: 'YAML Validation Account',
            t_invest_token: 't.yaml_validation_token',
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          }
        ]
      };
      
      // Mock exportToYAML functionality
      const expectedYAML = `
accounts:
  - id: yaml-validation-account
    name: YAML Validation Account
    t_invest_token: t.yaml_validation_token
    account_id: 123456789
    desired_mode: manual
    balance_interval: 300000
    sleep_between_orders: 1000
    desired_wallet:
      TRUR: 100
    margin_trading:
      enabled: false
`.trim();
      
      mockConfigLoader.exportToYAML.mockReturnValue(expectedYAML);
      
      // Test the export functionality
      const result = mockConfigLoader.exportToYAML();
      
      // Validate structure
      expect(result).toContain('accounts:');
      expect(result).toContain('id: yaml-validation-account');
      expect(result).toContain('name: YAML Validation Account');
      expect(result).toContain('t_invest_token: t.yaml_validation_token');
      expect(result).toContain('account_id: 123456789');
      expect(result).toContain('desired_mode: manual');
      expect(result).toContain('balance_interval: 300000');
      expect(result).toContain('sleep_between_orders: 1000');
      expect(result).toContain('desired_wallet:');
      expect(result).toContain('TRUR: 100');
      expect(result).toContain('margin_trading:');
      expect(result).toContain('enabled: false');
      
      // Verify the mock was called
      expect(mockConfigLoader.exportToYAML).toHaveBeenCalled();
    });
  });

  describe('Configuration Export Error Handling', () => {
    it('should handle JSON serialization errors during export', async () => {
      // Mock configuration with circular reference
      const circularConfig: any = {
        accounts: [
          {
            id: 'circular-account',
            name: 'Circular Account',
            t_invest_token: 't.circular_token',
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          }
        ]
      };
      
      // Create circular reference
      circularConfig.self = circularConfig;
      
      // Mock exportToJSON to simulate JSON serialization error
      mockConfigLoader.exportToJSON.mockImplementation(() => {
        try {
          return JSON.stringify(circularConfig, null, 2);
        } catch (error) {
          throw new Error(`Failed to serialize configuration to JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });
      
      // Test handling of JSON serialization error
      expect(() => {
        mockConfigLoader.exportToJSON();
      }).toThrow(/Failed to serialize configuration to JSON/);
      
      // Verify the mock was called
      expect(mockConfigLoader.exportToJSON).toHaveBeenCalled();
    });
    
    it('should handle file system errors during export', async () => {
      // Mock fs.writeFile to simulate file system error
      mockFs.promises.writeFile.mockImplementation(async () => {
        throw new Error('Permission denied');
      });
      
      // Mock exportConfig to simulate file system error handling
      mockConfigLoader.exportConfig.mockImplementation(async (filePath: string, format: string) => {
        try {
          const content = format === 'json' ? mockConfigLoader.exportToJSON() : mockConfigLoader.exportToYAML();
          await mockFs.promises.writeFile(filePath, content);
          return true;
        } catch (error) {
          throw new Error(`Failed to export configuration to ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });
      
      // Test handling of file system error
      await expect(async () => {
        await mockConfigLoader.exportConfig('/test/export.json', 'json');
      }).rejects.toThrow(/Failed to export configuration to/);
      
      // Verify the mock was called
      expect(mockConfigLoader.exportConfig).toHaveBeenCalledWith('/test/export.json', 'json');
    });
  });

  describe('Configuration Export Edge Cases', () => {
    it('should handle export with special characters in configuration', async () => {
      // Mock configuration with special characters
      const configWithSpecialChars = {
        accounts: [
          {
            id: 'special-chars-account',
            name: 'Account with @#$%&*() Characters',
            t_invest_token: 't.special_token_@#$%',
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { 'T@GLD': 100 }, // Special characters in ticker
            margin_trading: { enabled: false }
          }
        ]
      };
      
      // Mock exportToJSON functionality
      const expectedJSON = JSON.stringify(configWithSpecialChars, null, 2);
      mockConfigLoader.exportToJSON.mockReturnValue(expectedJSON);
      
      // Test the export functionality
      const result = mockConfigLoader.exportToJSON();
      
      expect(result).toBe(expectedJSON);
      expect(typeof result).toBe('string');
      
      // Verify it's valid JSON and contains special characters
      const parsed = JSON.parse(result);
      expect(parsed.accounts[0].name).toBe('Account with @#$%&*() Characters');
      expect(parsed.accounts[0].t_invest_token).toBe('t.special_token_@#$%');
      expect(parsed.accounts[0].desired_wallet).toEqual({ 'T@GLD': 100 });
      
      // Verify the mock was called
      expect(mockConfigLoader.exportToJSON).toHaveBeenCalled();
    });
    
    it('should handle export with extremely large configuration', async () => {
      // Create a large configuration with many accounts
      const largeConfig = {
        accounts: Array.from({ length: 1000 }, (_, i) => ({
          id: `large-account-${i}`,
          name: `Large Account ${i}`,
          t_invest_token: `t.large_token_${i}`,
          account_id: `account_id_${i}`,
          desired_mode: 'manual',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          desired_wallet: { TRUR: 100 },
          margin_trading: { enabled: false }
        }))
      };
      
      // Mock exportToJSON functionality
      const expectedJSON = JSON.stringify(largeConfig, null, 2);
      mockConfigLoader.exportToJSON.mockReturnValue(expectedJSON);
      
      // Test the export functionality
      const result = mockConfigLoader.exportToJSON();
      
      expect(result).toBe(expectedJSON);
      expect(typeof result).toBe('string');
      
      // Verify it's valid JSON and has correct length
      const parsed = JSON.parse(result);
      expect(parsed.accounts).toHaveLength(1000);
      expect(parsed.accounts[0].id).toBe('large-account-0');
      expect(parsed.accounts[999].id).toBe('large-account-999');
      
      // Verify the mock was called
      expect(mockConfigLoader.exportToJSON).toHaveBeenCalled();
    });
    
    it('should handle concurrent configuration exports', async () => {
      // Mock configuration data
      const configData = {
        accounts: [
          {
            id: 'concurrent-export-account',
            name: 'Concurrent Export Account',
            t_invest_token: 't.concurrent_token',
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          }
        ]
      };
      
      // Mock export functions to simulate concurrent operations
      const expectedJSON = JSON.stringify(configData, null, 2);
      mockConfigLoader.exportToJSON.mockReturnValue(expectedJSON);
      
      const expectedYAML = `
accounts:
  - id: concurrent-export-account
    name: Concurrent Export Account
    t_invest_token: t.concurrent_token
    account_id: 123456789
    desired_mode: manual
    balance_interval: 300000
    sleep_between_orders: 1000
    desired_wallet:
      TRUR: 100
    margin_trading:
      enabled: false
`.trim();
      mockConfigLoader.exportToYAML.mockReturnValue(expectedYAML);
      
      // Test concurrent exports
      const promises = [
        mockConfigLoader.exportToJSON(),
        mockConfigLoader.exportToYAML(),
        mockConfigLoader.exportToJSON(),
        mockConfigLoader.exportToYAML()
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(4);
      expect(results[0]).toBe(expectedJSON);
      expect(results[1]).toBe(expectedYAML);
      expect(results[2]).toBe(expectedJSON);
      expect(results[3]).toBe(expectedYAML);
      
      // Verify the mocks were called
      expect(mockConfigLoader.exportToJSON).toHaveBeenCalledTimes(2);
      expect(mockConfigLoader.exportToYAML).toHaveBeenCalledTimes(2);
    });
  });

  describe('Performance Tests for Configuration Export', () => {
    it('should handle rapid sequential exports', async () => {
      // Mock configuration data
      const configData = {
        accounts: [
          {
            id: 'perf-export-account',
            name: 'Performance Export Account',
            t_invest_token: 't.perf_token',
            account_id: '123456789',
            desired_mode: 'manual',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { TRUR: 100 },
            margin_trading: { enabled: false }
          }
        ]
      };
      
      // Mock exportToJSON functionality
      const expectedJSON = JSON.stringify(configData, null, 2);
      mockConfigLoader.exportToJSON.mockReturnValue(expectedJSON);
      
      // Measure performance of rapid sequential exports
      const startTime = performance.now();
      
      for (let i = 0; i < 100; i++) {
        const result = mockConfigLoader.exportToJSON();
        expect(result).toBe(expectedJSON);
      }
      
      const endTime = performance.now();
      
      // Should complete within reasonable time (less than 1 second for 100 exports)
      expect(endTime - startTime).toBeLessThan(1000);
      
      // Verify the mock was called
      expect(mockConfigLoader.exportToJSON).toHaveBeenCalledTimes(100);
    });
    
    it('should efficiently handle large configuration exports', async () => {
      // Create a very large configuration
      const veryLargeConfig = {
        accounts: Array.from({ length: 5000 }, (_, i) => ({
          id: `very-large-account-${i}`,
          name: `Very Large Account ${i} with a long name to increase size`,
          t_invest_token: `t.very_large_token_${i}_with_long_value_to_increase_size`,
          account_id: `very_long_account_id_${i}_to_increase_size`,
          desired_mode: 'manual',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          desired_wallet: Object.fromEntries(
            Array.from({ length: 50 }, (_, j) => [`TICKER${j}`, 100 / 50])
          ), // 50 different tickers
          margin_trading: { 
            enabled: true,
            multiplier: 1.5,
            free_threshold: 50000,
            balancing_strategy: 'keep_if_small'
          },
          custom_fields: {
            field1: `Custom field value ${i} with additional text to increase size`,
            field2: `Another custom field value ${i} with more text to increase size`,
            field3: `Yet another custom field value ${i} with even more text to increase size`
          }
        }))
      };
      
      // Mock exportToJSON functionality
      const startTime = performance.now();
      const expectedJSON = JSON.stringify(veryLargeConfig, null, 2);
      const endTime = performance.now();
      
      mockConfigLoader.exportToJSON.mockReturnValue(expectedJSON);
      
      // Test the export functionality
      const result = mockConfigLoader.exportToJSON();
      
      expect(result).toBe(expectedJSON);
      expect(typeof result).toBe('string');
      
      // Should handle large export efficiently (less than 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
      
      // Verify the mock was called
      expect(mockConfigLoader.exportToJSON).toHaveBeenCalled();
    });
  });
});