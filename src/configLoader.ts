import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ProjectConfig, AccountConfig } from './types.d';

class ConfigLoader {
  private static instance: ConfigLoader;
  private config: ProjectConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  public loadConfig(): ProjectConfig {
    if (this.config) {
      return this.config;
    }

    try {
      const configPath = join(process.cwd(), 'CONFIG.json');
      const configData = readFileSync(configPath, 'utf8');
      this.config = JSON.parse(configData);
      
      // Configuration validation
      this.validateConfig(this.config);
      
      return this.config;
    } catch (error) {
      throw new Error(`Configuration loading error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public getAccountById(accountId: string): AccountConfig | undefined {
    const config = this.loadConfig();
    return config.accounts.find(account => account.id === accountId);
  }

  public getAccountByToken(token: string): AccountConfig | undefined {
    const config = this.loadConfig();
    return config.accounts.find(account => account.t_invest_token === token);
  }

  public getAllAccounts(): AccountConfig[] {
    const config = this.loadConfig();
    return config.accounts;
  }

  public getAccountToken(accountId: string): string | undefined {
    const account = this.getAccountById(accountId);
    if (!account) return undefined;
    
    const tokenValue = account.t_invest_token;
    
    // If token is in ${VARIABLE_NAME} format, extract from environment variables
    if (tokenValue.startsWith('${') && tokenValue.endsWith('}')) {
      const envVarName = tokenValue.slice(2, -1);
      return process.env[envVarName];
    }
    
    // Otherwise return token as is (directly specified)
    return tokenValue;
  }

  public getAccountAccountId(accountId: string): string | undefined {
    const account = this.getAccountById(accountId);
    return account?.account_id;
  }

  public getRawTokenValue(accountId: string): string | undefined {
    const account = this.getAccountById(accountId);
    return account?.t_invest_token;
  }

  public isTokenFromEnv(accountId: string): boolean {
    const account = this.getAccountById(accountId);
    if (!account) return false;
    
    const tokenValue = account.t_invest_token;
    return tokenValue.startsWith('${') && tokenValue.endsWith('}');
  }

  private validateConfig(config: ProjectConfig): void {
    if (!config.accounts || !Array.isArray(config.accounts)) {
      throw new Error('Configuration must contain accounts array');
    }

    for (const account of config.accounts) {
      this.validateAccount(account);
    }
  }

  private validateAccount(account: AccountConfig): void {
    const requiredFields = ['id', 'name', 't_invest_token', 'account_id', 'desired_wallet'];
    
    for (const field of requiredFields) {
      if (!(field in account)) {
        throw new Error(`Account ${account.id || 'unknown'} must contain field ${field}`);
      }
    }

    if (!account.desired_wallet || Object.keys(account.desired_wallet).length === 0) {
      throw new Error(`Account ${account.id} must contain non-empty desired_wallet`);
    }

    // Validate individual wallet percentages first
    for (const [ticker, percentage] of Object.entries(account.desired_wallet)) {
      if (typeof percentage !== 'number' || isNaN(percentage)) {
        throw new Error(`Invalid percentage for ticker ${ticker}: must be a number`);
      }
      if (!isFinite(percentage) || percentage > Number.MAX_SAFE_INTEGER) {
        throw new Error(`Invalid percentage for ticker ${ticker}: value too large`);
      }
      if (percentage < 0 || percentage > 100) {
        throw new Error(`Invalid percentage for ticker ${ticker}: must be between 0 and 100`);
      }
    }

    // Check that sum of weights equals 100 (or close to 100)
    const totalWeight = Object.values(account.desired_wallet).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(totalWeight - 100) > 1) {
      throw new Error(`Wallet validation failed: sum of weights for account ${account.id} equals ${totalWeight}%, expected 100%`);
    }
  }

  public async updateAccountConfig(accountId: string, updates: Partial<AccountConfig>): Promise<void> {
    const config = this.loadConfig();
    const accountIndex = config.accounts.findIndex(account => account.id === accountId);
    
    if (accountIndex === -1) {
      throw new Error(`Account with ID '${accountId}' not found`);
    }

    // Create updated account config
    const updatedAccount = { ...config.accounts[accountIndex], ...updates };
    
    // Validate the updated account
    this.validateAccount(updatedAccount);
    
    // Update the config
    config.accounts[accountIndex] = updatedAccount;
    
    // Save to file
    await this.saveConfig(config);
    
    // Update cached config
    this.config = config;
  }

  public async updateConfig(config: ProjectConfig): Promise<void> {
    // Validate the entire config
    this.validateConfig(config);
    
    // Save to file
    await this.saveConfig(config);
    
    // Update cached config
    this.config = config;
  }

  private async saveConfig(config: ProjectConfig): Promise<void> {
    try {
      const configPath = join(process.cwd(), 'CONFIG.json');
      const configData = JSON.stringify(config, null, 2);
      writeFileSync(configPath, configData, 'utf8');
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

}

// Export singleton for convenience
export const configLoader = ConfigLoader.getInstance();
