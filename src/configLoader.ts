import { readFileSync } from 'fs';
import { join } from 'path';
import { ProjectConfig, AccountConfig, GlobalSettings } from './types.d';

export class ConfigLoader {
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
      
      // Валидация конфигурации
      this.validateConfig(this.config);
      
      return this.config;
    } catch (error) {
      throw new Error(`Ошибка загрузки конфигурации: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
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
    
    // Если токен в формате ${VARIABLE_NAME}, извлекаем из переменных окружения
    if (tokenValue.startsWith('${') && tokenValue.endsWith('}')) {
      const envVarName = tokenValue.slice(2, -1);
      return process.env[envVarName];
    }
    
    // Иначе возвращаем токен как есть (прямо указанный)
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
      throw new Error('Конфигурация должна содержать массив accounts');
    }

    for (const account of config.accounts) {
      this.validateAccount(account);
    }
  }

  private validateAccount(account: AccountConfig): void {
    const requiredFields = ['id', 'name', 't_invest_token', 'account_id', 'desired_wallet'];
    
    for (const field of requiredFields) {
      if (!(field in account)) {
        throw new Error(`Аккаунт ${account.id || 'unknown'} должен содержать поле ${field}`);
      }
    }

    if (!account.desired_wallet || Object.keys(account.desired_wallet).length === 0) {
      throw new Error(`Аккаунт ${account.id} должен содержать непустой desired_wallet`);
    }

    // Проверка, что сумма весов равна 100 (или близко к 100)
    const totalWeight = Object.values(account.desired_wallet).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(totalWeight - 100) > 1) {
      console.warn(`Предупреждение: сумма весов для аккаунта ${account.id} равна ${totalWeight}%, а не 100%`);
    }
  }

}

// Экспорт синглтона для удобства
export const configLoader = ConfigLoader.getInstance();
