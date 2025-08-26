import { readFileSync } from 'fs';
import { join } from 'path';
import { ProjectConfig, AccountConfig, ExchangeClosureBehavior } from './types.d';

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

    // Check that sum of weights equals 100 (or close to 100)
    const totalWeight = Object.values(account.desired_wallet).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(totalWeight - 100) > 1) {
      console.warn(`Warning: sum of weights for account ${account.id} equals ${totalWeight}%, not 100%`);
    }

    // Set default exchange_closure_behavior if not provided (backward compatibility)
    if (!account.exchange_closure_behavior) {
      account.exchange_closure_behavior = {
        mode: 'skip_iteration',
        update_iteration_result: false
      };
      console.log(`Info: Using default exchange closure behavior (skip_iteration) for account ${account.id}`);
    } else {
      // Validate exchange_closure_behavior configuration
      this.validateExchangeClosureBehavior(account.exchange_closure_behavior, account.id);
    }
  }

  private validateExchangeClosureBehavior(behavior: ExchangeClosureBehavior, accountId: string): void {
    const validModes = ['skip_iteration', 'force_orders', 'dry_run'];
    
    if (!behavior.mode || !validModes.includes(behavior.mode)) {
      throw new Error(
        `Account ${accountId}: exchange_closure_behavior.mode must be one of: ${validModes.join(', ')}. ` +
        `Got: ${behavior.mode}`
      );
    }
    
    if (typeof behavior.update_iteration_result !== 'boolean') {
      throw new Error(
        `Account ${accountId}: exchange_closure_behavior.update_iteration_result must be a boolean. ` +
        `Got: ${typeof behavior.update_iteration_result}`
      );
    }
  }

}

// Export singleton for convenience
export const configLoader = ConfigLoader.getInstance();
