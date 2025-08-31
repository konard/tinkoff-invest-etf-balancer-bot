import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { configLoader, ConfigLoader } from "../../configLoader";

describe('ConfigLoader with Actual Config File', () => {
  beforeEach(() => {
    // Reset the singleton instance to ensure clean state
    ConfigLoader.resetInstance();
    
    // Set NODE_ENV to test
    process.env.NODE_ENV = 'test';
    
    // Set environment variable that the config file expects
    process.env.T_INVEST_TOKEN = 'test-token-value';
    
    // Clear any existing config cache
    (configLoader as any).config = null;
  });
  
  afterEach(() => {
    // Clean up environment
    delete process.env.NODE_ENV;
    delete process.env.T_INVEST_TOKEN;
  });

  it('should load configuration from actual CONFIG.test.json', () => {
    const config = configLoader.loadConfig();
    
    expect(config).toBeDefined();
    expect(config.accounts).toBeDefined();
    expect(config.accounts.length).toBeGreaterThan(0);
  });

  it('should get account by ID from actual config', () => {
    const account = configLoader.getAccountById('0');
    
    expect(account).toBeDefined();
    expect(account?.id).toBe('0');
  });

  it('should get account token from actual config', () => {
    const token = configLoader.getAccountToken('0');
    
    expect(token).toBe('test-token-value');
  });

  it('should get account_id from actual config', () => {
    const accountId = configLoader.getAccountAccountId('0');
    
    expect(accountId).toBe('0');
  });
});