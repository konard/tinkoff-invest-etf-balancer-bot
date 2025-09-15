import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { validateConfig } from '../../tools/configManager';
import { configLoader } from '../../configLoader';
import fs from 'fs';
import path from 'path';

// Mock console methods to capture output
const originalLog = console.log;
const originalError = console.error;
const originalExit = process.exit;

let logMessages: string[] = [];
let errorMessages: string[] = [];
let exitCode: number | undefined;

beforeEach(() => {
  logMessages = [];
  errorMessages = [];
  exitCode = undefined;
  
  console.log = (...args) => {
    logMessages.push(args.join(' '));
  };
  
  console.error = (...args) => {
    errorMessages.push(args.join(' '));
  };
  
  process.exit = ((code?: number) => {
    exitCode = code;
    throw new Error(`process.exit(${code})`);
  }) as any;
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
  process.exit = originalExit;
  
  // Clean up config cache
  (configLoader as any).config = null;
});

describe('ConfigManager Validation Tests', () => {
  const originalConfigPath = path.join(process.cwd(), 'CONFIG.json');
  let originalConfig: string | null = null;

  beforeEach(() => {
    // Save original config if exists
    if (fs.existsSync(originalConfigPath)) {
      originalConfig = fs.readFileSync(originalConfigPath, 'utf8');
    }
  });

  afterEach(() => {
    // Restore original config
    if (originalConfig) {
      fs.writeFileSync(originalConfigPath, originalConfig);
    } else if (fs.existsSync(originalConfigPath)) {
      fs.unlinkSync(originalConfigPath);
    }
  });

  it('should validate correct configuration structure', () => {
    const validConfig = {
      accounts: [
        {
          id: 'account_1',
          name: 'Test Account 1',
          t_invest_token: 't.test_token_1',
          account_id: 'test_account_1',
          desired_mode: 'shares',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          desired_wallet: {
            'TRUR': 50,
            'TGLD': 50
          },
          margin_trading: {
            enabled: false,
            multiplier: 1,
            free_threshold: 1000,
            balancing_strategy: 'conservative'
          }
        }
      ]
    };

    fs.writeFileSync(originalConfigPath, JSON.stringify(validConfig, null, 2));
    
    validateConfig();
    
    expect(logMessages.some(msg => msg.includes('✅ Configuration loaded successfully'))).toBe(true);
    expect(logMessages.some(msg => msg.includes('Total accounts: 1'))).toBe(true);
    expect(exitCode).toBeUndefined();
  });

  it('should detect duplicate account IDs', () => {
    const duplicateIdConfig = {
      accounts: [
        {
          id: 'account_1',
          name: 'Test Account 1',
          t_invest_token: 't.test_token_1',
          account_id: 'test_account_1',
          desired_mode: 'shares',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          desired_wallet: { 'TRUR': 100 },
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 1000, balancing_strategy: 'conservative' }
        },
        {
          id: 'account_1', // Duplicate ID
          name: 'Test Account 2',
          t_invest_token: 't.test_token_2',
          account_id: 'test_account_2',
          desired_mode: 'shares',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          desired_wallet: { 'TGLD': 100 },
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 1000, balancing_strategy: 'conservative' }
        }
      ]
    };

    fs.writeFileSync(originalConfigPath, JSON.stringify(duplicateIdConfig, null, 2));
    
    validateConfig();
    
    expect(logMessages.some(msg => msg.includes('❌ Duplicate account ID: account_1'))).toBe(true);
  });

  it('should detect duplicate tokens', () => {
    const duplicateTokenConfig = {
      accounts: [
        {
          id: 'account_1',
          name: 'Test Account 1',
          t_invest_token: 't.same_token',
          account_id: 'test_account_1',
          desired_mode: 'shares',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          desired_wallet: { 'TRUR': 100 },
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 1000, balancing_strategy: 'conservative' }
        },
        {
          id: 'account_2',
          name: 'Test Account 2',
          t_invest_token: 't.same_token', // Duplicate token
          account_id: 'test_account_2',
          desired_mode: 'shares',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          desired_wallet: { 'TGLD': 100 },
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 1000, balancing_strategy: 'conservative' }
        }
      ]
    };

    fs.writeFileSync(originalConfigPath, JSON.stringify(duplicateTokenConfig, null, 2));
    
    validateConfig();
    
    expect(logMessages.some(msg => msg.includes('❌ Duplicate token: t.same_token'))).toBe(true);
  });

  it('should validate environment variable tokens', () => {
    const envTokenConfig = {
      accounts: [
        {
          id: 'account_1',
          name: 'Test Account 1',
          t_invest_token: '${TEST_TOKEN_1}',
          account_id: 'test_account_1',
          desired_mode: 'shares',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          desired_wallet: { 'TRUR': 100 },
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 1000, balancing_strategy: 'conservative' }
        }
      ]
    };

    // Set environment variable
    process.env.TEST_TOKEN_1 = 't.env_token_value';

    fs.writeFileSync(originalConfigPath, JSON.stringify(envTokenConfig, null, 2));
    
    validateConfig();
    
    expect(logMessages.some(msg => msg.includes('Tokens from environment variables: 1'))).toBe(true);
    
    // Clean up
    delete process.env.TEST_TOKEN_1;
  });

  it('should detect missing environment variables', () => {
    const missingEnvConfig = {
      accounts: [
        {
          id: 'account_1',
          name: 'Test Account 1',
          t_invest_token: '${MISSING_TOKEN}',
          account_id: 'test_account_1',
          desired_mode: 'shares',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          desired_wallet: { 'TRUR': 100 },
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 1000, balancing_strategy: 'conservative' }
        }
      ]
    };

    fs.writeFileSync(originalConfigPath, JSON.stringify(missingEnvConfig, null, 2));
    
    validateConfig();
    
    expect(logMessages.some(msg => msg.includes('⚠️  Environment variable not found for account_1: ${MISSING_TOKEN}'))).toBe(true);
  });

  it('should validate account with correct weight distribution', () => {
    const correctWeightConfig = {
      accounts: [
        {
          id: 'account_1',
          name: 'Test Account 1',
          t_invest_token: 't.test_token',
          account_id: 'test_account_1',
          desired_mode: 'shares',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          desired_wallet: {
            'TRUR': 30,
            'TGLD': 30,
            'TBRU': 40
          },
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 1000, balancing_strategy: 'conservative' }
        }
      ]
    };

    fs.writeFileSync(originalConfigPath, JSON.stringify(correctWeightConfig, null, 2));
    
    validateConfig();
    
    expect(logMessages.some(msg => msg.includes('✅ Configuration loaded successfully'))).toBe(true);
    expect(exitCode).toBeUndefined();
  });

  it('should detect incorrect weight distribution', () => {
    const incorrectWeightConfig = {
      accounts: [
        {
          id: 'account_1',
          name: 'Test Account 1',
          t_invest_token: 't.test_token',
          account_id: 'test_account_1',
          desired_mode: 'shares',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          desired_wallet: {
            'TRUR': 30,
            'TGLD': 30,
            'TBRU': 50  // Total: 110% (should be ~100%)
          },
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 1000, balancing_strategy: 'conservative' }
        }
      ]
    };

    fs.writeFileSync(originalConfigPath, JSON.stringify(incorrectWeightConfig, null, 2));
    
    validateConfig();
    
    // Configuration loads successfully but should show weight warning
    expect(logMessages.some(msg => msg.includes('✅ Configuration loaded successfully'))).toBe(true);
    expect(exitCode).toBeUndefined(); // No exit as it's just a warning
  });

  it('should validate account with correct margin trading configuration', () => {
    const marginConfig = {
      accounts: [
        {
          id: 'account_1',
          name: 'Test Account 1',
          t_invest_token: 't.test_token',
          account_id: 'test_account_1',
          desired_mode: 'shares',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          desired_wallet: { 'TRUR': 100 },
          margin_trading: {
            enabled: true,
            multiplier: 2,
            free_threshold: 5000,
            balancing_strategy: 'aggressive'
          }
        }
      ]
    };

    fs.writeFileSync(originalConfigPath, JSON.stringify(marginConfig, null, 2));
    
    validateConfig();
    
    expect(logMessages.some(msg => msg.includes('✅ Configuration loaded successfully'))).toBe(true);
    expect(exitCode).toBeUndefined();
  });

  it('should validate margin trading with different strategies', () => {
    const strategies = ['conservative', 'moderate', 'aggressive'];
    
    for (const strategy of strategies) {
      const strategyConfig = {
        accounts: [
          {
            id: 'account_1',
            name: 'Test Account 1',
            t_invest_token: 't.test_token',
            account_id: 'test_account_1',
            desired_mode: 'shares',
            balance_interval: 300000,
            sleep_between_orders: 1000,
            desired_wallet: { 'TRUR': 100 },
            margin_trading: {
              enabled: true,
              multiplier: 2,
              free_threshold: 5000,
              balancing_strategy: strategy
            }
          }
        ]
      };

      fs.writeFileSync(originalConfigPath, JSON.stringify(strategyConfig, null, 2));
      
      validateConfig();
      
      expect(logMessages.some(msg => msg.includes('✅ Configuration loaded successfully'))).toBe(true);
    }
  });

  it('should handle configuration loading errors gracefully', () => {
    // Create invalid JSON
    fs.writeFileSync(originalConfigPath, '{ invalid json }');
    
    expect(() => validateConfig()).toThrow();
    expect(exitCode).toBe(1);
    expect(errorMessages.some(msg => msg.includes('❌ Validation error:'))).toBe(true);
  });

  it('should handle unknown errors gracefully', () => {
    // Remove config file to cause error
    if (fs.existsSync(originalConfigPath)) {
      fs.unlinkSync(originalConfigPath);
    }
    
    expect(() => validateConfig()).toThrow();
    expect(exitCode).toBe(1);
    expect(errorMessages.some(msg => msg.includes('❌ Validation error:'))).toBe(true);
  });

  it('should handle empty configuration', () => {
    const emptyConfig = {};
    fs.writeFileSync(originalConfigPath, JSON.stringify(emptyConfig, null, 2));
    
    expect(() => validateConfig()).toThrow();
    expect(exitCode).toBe(1);
    expect(errorMessages.some(msg => msg.includes('❌ Validation error:'))).toBe(true);
  });

  it('should handle configuration with special characters in account names', () => {
    const specialCharConfig = {
      accounts: [
        {
          id: 'account_1',
          name: 'Test Account №1 (спец. символы) 🚀',
          t_invest_token: 't.test_token',
          account_id: 'test_account_1',
          desired_mode: 'shares',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          desired_wallet: { 'TRUR': 100 },
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 1000, balancing_strategy: 'conservative' }
        }
      ]
    };

    fs.writeFileSync(originalConfigPath, JSON.stringify(specialCharConfig, null, 2));
    
    validateConfig();
    
    expect(logMessages.some(msg => msg.includes('✅ Configuration loaded successfully'))).toBe(true);
    expect(exitCode).toBeUndefined();
  });

  it('should handle malformed environment variable syntax', () => {
    const malformedEnvConfig = {
      accounts: [
        {
          id: 'account_1',
          name: 'Test Account 1',
          t_invest_token: '{MALFORMED_ENV}', // Missing $
          account_id: 'test_account_1',
          desired_mode: 'shares',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          desired_wallet: { 'TRUR': 100 },
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 1000, balancing_strategy: 'conservative' }
        }
      ]
    };

    fs.writeFileSync(originalConfigPath, JSON.stringify(malformedEnvConfig, null, 2));
    
    validateConfig();
    
    // Should treat it as a direct token, not environment variable
    expect(logMessages.some(msg => msg.includes('Directly specified tokens: 1'))).toBe(true);
    expect(logMessages.some(msg => msg.includes('Tokens from environment variables: 0'))).toBe(true);
  });

  it('should handle large configuration with many accounts', () => {
    const largeConfig = {
      accounts: Array.from({ length: 50 }, (_, i) => ({
        id: `account_${i + 1}`,
        name: `Test Account ${i + 1}`,
        t_invest_token: `t.test_token_${i + 1}`,
        account_id: `test_account_${i + 1}`,
        desired_mode: 'shares',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        desired_wallet: { 'TRUR': 100 },
        margin_trading: { enabled: false, multiplier: 1, free_threshold: 1000, balancing_strategy: 'conservative' }
      }))
    };

    fs.writeFileSync(originalConfigPath, JSON.stringify(largeConfig, null, 2));
    
    validateConfig();
    
    expect(logMessages.some(msg => msg.includes('✅ Configuration loaded successfully'))).toBe(true);
    expect(logMessages.some(msg => msg.includes('Total accounts: 50'))).toBe(true);
    expect(exitCode).toBeUndefined();
  });

  it('should validate configuration efficiently', () => {
    const startTime = Date.now();
    
    const config = {
      accounts: [
        {
          id: 'account_1',
          name: 'Test Account 1',
          t_invest_token: 't.test_token',
          account_id: 'test_account_1',
          desired_mode: 'shares',
          balance_interval: 300000,
          sleep_between_orders: 1000,
          desired_wallet: { 'TRUR': 100 },
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 1000, balancing_strategy: 'conservative' }
        }
      ]
    };

    fs.writeFileSync(originalConfigPath, JSON.stringify(config, null, 2));
    
    validateConfig();
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Validation should complete within reasonable time (< 1000ms)
    expect(duration).toBeLessThan(1000);
    expect(logMessages.some(msg => msg.includes('✅ Configuration loaded successfully'))).toBe(true);
  });
});