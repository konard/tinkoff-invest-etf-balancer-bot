import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mockControls } from '../__mocks__/external-deps';
import { mockAccountConfigs } from '../__fixtures__/configurations';

// Mock console methods
let consoleSpy: any;
let processExitSpy: any;

describe('Configuration Manager Tool', () => {
  beforeEach(() => {
    // Reset mocks
    mockControls.resetAll();
    
    // Setup console spy
    consoleSpy = {
      log: spyOn(console, 'log').mockImplementation(() => {}),
      error: spyOn(console, 'error').mockImplementation(() => {}),
    };
    
    // Setup process.exit spy
    processExitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    
    // Setup successful file system operations
    mockControls.fs.setSuccess();
    
    // Mock CONFIG.json
    const mockConfig = {
      accounts: [
        mockAccountConfigs.basic,
        mockAccountConfigs.withMargin,
        {
          id: 'env-token-account',
          name: 'Environment Token Account',
          account_id: 'env-account-123',
          t_invest_token: '${T_INVEST_TOKEN_ENV}',
          desired_wallet: { TRUR: 50, TMOS: 50 },
          desired_mode: 'manual',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          margin_trading: {
            enabled: false,
            multiplier: 1,
            free_threshold: 10000,
            max_margin_size: 100000,
            balancing_strategy: 'conservative'
          },
          exchange_closure_behavior: {
            mode: 'skip_iteration',
            update_iteration_result: false
          }
        }
      ]
    };
    
    mockControls.fs.setFile('/mock/CONFIG.json', JSON.stringify(mockConfig, null, 2));
    
    // Mock environment variables
    process.env.T_INVEST_TOKEN_ENV = 'env_token_value_123';
    process.env.OPENROUTER_API_KEY = 'test_openrouter_key';
  });
  
  afterEach(() => {
    // Restore spies
    consoleSpy.log.mockRestore();
    consoleSpy.error.mockRestore();
    processExitSpy.mockRestore();
    
    // Clean up environment
    delete process.env.T_INVEST_TOKEN_ENV;
    delete process.env.OPENROUTER_API_KEY;
  });

  describe('Account Information Display', () => {
    it('should display account information correctly', async () => {
      const { showAccountDetails } = await import('../../tools/configManager');
      
      showAccountDetails('test-account');
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('📊 Account: Test Account (ID: test-account)')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('🔑 Token:')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('💼 Account:')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('⚙️  Mode: manual')
      );
    });
    
    it('should display environment token information', async () => {
      const { showAccountDetails } = await import('../../tools/configManager');
      
      showAccountDetails('env-token-account');
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('${T_INVEST_TOKEN_ENV} → env_token_value_123')
      );
    });
    
    it('should warn about missing environment variables', async () => {
      delete process.env.T_INVEST_TOKEN_ENV;
      
      const { showAccountDetails } = await import('../../tools/configManager');
      
      showAccountDetails('env-token-account');
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Environment variable not set!')
      );
    });
    
    it('should display margin trading configuration', async () => {
      const { showAccountDetails } = await import('../../tools/configManager');
      
      showAccountDetails('margin-account');
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('💰 Margin trading:')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Enabled: ✅')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Multiplier: 2x')
      );
    });
    
    it('should warn about unbalanced target weights', async () => {
      // Create config with unbalanced weights
      const unbalancedConfig = {
        accounts: [{
          ...mockAccountConfigs.basic,
          desired_wallet: { TRUR: 60, TMOS: 30 } // Total = 90%
        }]
      };
      
      mockControls.fs.setFile('/mock/CONFIG.json', JSON.stringify(unbalancedConfig, null, 2));
      
      const { showAccountDetails } = await import('../../tools/configManager');
      
      showAccountDetails('test-account');
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Warning: sum of weights is not equal to 100%')
      );
    });
    
    it('should handle missing account ID', async () => {
      const { showAccountDetails } = await import('../../tools/configManager');
      
      expect(() => showAccountDetails('non-existent')).toThrow('process.exit called');
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining("❌ Account with ID 'non-existent' not found")
      );
    });
  });

  describe('Account Listing', () => {
    it('should list all accounts', async () => {
      const { listAccounts } = await import('../../tools/configManager');
      
      listAccounts();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('📋 Found accounts: 3')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('1. Test Account (test-account)')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('2. Margin Account (margin-account)')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('3. Environment Token Account (env-token-account)')
      );
    });
    
    it('should handle empty accounts list', async () => {
      const emptyConfig = { accounts: [] };
      mockControls.fs.setFile('/mock/CONFIG.json', JSON.stringify(emptyConfig, null, 2));
      
      const { listAccounts } = await import('../../tools/configManager');
      
      listAccounts();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '❌ No accounts found in configuration'
      );
    });
    
    it('should show token types in account list', async () => {
      const { listAccounts } = await import('../../tools/configManager');
      
      listAccounts();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('[direct]')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('[${ENV}]')
      );
    });
  });

  describe('Configuration Validation', () => {
    it('should validate valid configuration', async () => {
      const { validateConfig } = await import('../../tools/configManager');
      
      validateConfig();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '✅ Configuration loaded successfully'
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('📋 Statistics:')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Total accounts: 3')
      );
    });
    
    it('should detect duplicate account IDs', async () => {
      const duplicateConfig = {
        accounts: [
          mockAccountConfigs.basic,
          { ...mockAccountConfigs.basic, name: 'Duplicate Account' }
        ]
      };
      
      mockControls.fs.setFile('/mock/CONFIG.json', JSON.stringify(duplicateConfig, null, 2));
      
      const { validateConfig } = await import('../../tools/configManager');
      
      validateConfig();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('❌ Duplicate account ID: test-account')
      );
    });
    
    it('should detect duplicate tokens', async () => {
      const duplicateTokenConfig = {
        accounts: [
          mockAccountConfigs.basic,
          { ...mockAccountConfigs.basic, id: 'duplicate-token', name: 'Duplicate Token' }
        ]
      };
      
      mockControls.fs.setFile('/mock/CONFIG.json', JSON.stringify(duplicateTokenConfig, null, 2));
      
      const { validateConfig } = await import('../../tools/configManager');
      
      validateConfig();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('❌ Duplicate token:')
      );
    });
    
    it('should warn about missing environment variables', async () => {
      delete process.env.T_INVEST_TOKEN_ENV;
      
      const { validateConfig } = await import('../../tools/configManager');
      
      validateConfig();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Environment variable not found for env-token-account')
      );
    });
    
    it('should handle configuration load errors', async () => {
      mockControls.fs.setFileError('/mock/CONFIG.json', 'File not found');
      
      const { validateConfig } = await import('../../tools/configManager');
      
      expect(() => validateConfig()).toThrow('process.exit called');
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Validation error:')
      );
    });
    
    it('should count token types correctly', async () => {
      const { validateConfig } = await import('../../tools/configManager');
      
      validateConfig();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Tokens from environment variables: 1')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Directly specified tokens: 2')
      );
    });
  });

  describe('Environment Setup Display', () => {
    it('should show environment setup instructions', async () => {
      const { showEnvironmentSetup } = await import('../../tools/configManager');
      
      showEnvironmentSetup();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('🔧 Environment variables setup:')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('T_INVEST_TOKEN_ENV=')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('OPENROUTER_API_KEY=your_api_key_here')
      );
    });
    
    it('should handle configurations without environment tokens', async () => {
      const noEnvConfig = {
        accounts: [mockAccountConfigs.basic, mockAccountConfigs.withMargin]
      };
      
      mockControls.fs.setFile('/mock/CONFIG.json', JSON.stringify(noEnvConfig, null, 2));
      
      const { showEnvironmentSetup } = await import('../../tools/configManager');
      
      showEnvironmentSetup();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '(No tokens from environment variables)'
      );
    });
  });

  describe('Token Information Display', () => {
    it('should show token usage information', async () => {
      const { showTokenInfo } = await import('../../tools/configManager');
      
      showTokenInfo();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('🔑 Token information:')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('1️⃣ From environment variables:')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('2️⃣ Directly specified token:')
      );
    });
    
    it('should show current token status', async () => {
      const { showTokenInfo } = await import('../../tools/configManager');
      
      showTokenInfo();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('📋 Current tokens:')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('test-account:')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('env-token-account:')
      );
    });
    
    it('should mark missing environment variables', async () => {
      delete process.env.T_INVEST_TOKEN_ENV;
      
      const { showTokenInfo } = await import('../../tools/configManager');
      
      showTokenInfo();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('❌')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Environment variable not found')
      );
    });
    
    it('should mark available environment variables', async () => {
      const { showTokenInfo } = await import('../../tools/configManager');
      
      showTokenInfo();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('✅')
      );
    });
  });

  describe('Help System', () => {
    it('should display help information', async () => {
      const { printHelp } = await import('../../tools/configManager');
      
      printHelp();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('🔧 Tinkoff Invest ETF Balancer Bot Configuration Manager')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage:')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Commands:')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('list')
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      mockControls.fs.setFileError('/mock/CONFIG.json', 'Permission denied');
      
      const { validateConfig } = await import('../../tools/configManager');
      
      expect(() => validateConfig()).toThrow('process.exit called');
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Validation error:')
      );
    });
    
    it('should handle invalid JSON gracefully', async () => {
      mockControls.fs.setFile('/mock/CONFIG.json', 'invalid json {');
      
      const { validateConfig } = await import('../../tools/configManager');
      
      expect(() => validateConfig()).toThrow('process.exit called');
    });
    
    it('should handle missing configuration file', async () => {
      mockControls.fs.setSuccess(false);
      
      const { listAccounts } = await import('../../tools/configManager');
      
      expect(() => listAccounts()).toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty account names', async () => {
      const configWithEmptyName = {
        accounts: [{
          ...mockAccountConfigs.basic,
          name: ''
        }]
      };
      
      mockControls.fs.setFile('/mock/CONFIG.json', JSON.stringify(configWithEmptyName, null, 2));
      
      const { listAccounts } = await import('../../tools/configManager');
      
      listAccounts();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('1.  (test-account)')
      );
    });
    
    it('should handle very long token names', async () => {
      const longTokenConfig = {
        accounts: [{
          ...mockAccountConfigs.basic,
          t_invest_token: '${VERY_LONG_ENVIRONMENT_VARIABLE_NAME_THAT_EXCEEDS_NORMAL_LIMITS}'
        }]
      };
      
      mockControls.fs.setFile('/mock/CONFIG.json', JSON.stringify(longTokenConfig, null, 2));
      
      const { showEnvironmentSetup } = await import('../../tools/configManager');
      
      showEnvironmentSetup();
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('VERY_LONG_ENVIRONMENT_VARIABLE_NAME_THAT_EXCEEDS_NORMAL_LIMITS=')
      );
    });
    
    it('should handle zero weight portfolios', async () => {
      const zeroWeightConfig = {
        accounts: [{
          ...mockAccountConfigs.basic,
          desired_wallet: { TRUR: 0, TMOS: 0 }
        }]
      };
      
      mockControls.fs.setFile('/mock/CONFIG.json', JSON.stringify(zeroWeightConfig, null, 2));
      
      const { showAccountDetails } = await import('../../tools/configManager');
      
      showAccountDetails('test-account');
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Total: 0%')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Warning: sum of weights is not equal to 100%')
      );
    });
  });
});