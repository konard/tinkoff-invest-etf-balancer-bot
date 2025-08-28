import { describe, it, expect } from "bun:test";
import type { 
  ProjectConfig, 
  AccountConfig, 
  Wallet, 
  Position, 
  DesiredWallet,
  ExchangeClosureBehavior,
  ExchangeClosureMode,
  BalancingDataError,
  MarginConfig,
  AccountMarginConfig
} from "../types.d";

describe('Type Definitions Validation', () => {
  describe('ProjectConfig Type', () => {
    it('should validate ProjectConfig structure', () => {
      const validConfig: ProjectConfig = {
        accounts: [
          {
            id: 'test-account',
            name: 'Test Account',
            t_invest_token: 't.test_token',
            account_id: '123456789',
            desired_wallet: { TRUR: 50, TMOS: 50 }
          }
        ]
      };
      
      expect(validConfig.accounts).toBeDefined();
      expect(Array.isArray(validConfig.accounts)).toBe(true);
      expect(validConfig.accounts).toHaveLength(1);
    });
    
    it('should enforce required accounts array', () => {
      // This test validates that accounts is required
      const config = {} as ProjectConfig;
      
      // In TypeScript, this would be a compile-time error
      // At runtime, we validate the structure
      expect(config.accounts).toBeUndefined();
    });
    
    it('should allow optional properties on ProjectConfig', () => {
      const configWithOptionals: ProjectConfig = {
        accounts: [],
        // Could have additional optional properties in future
      };
      
      expect(configWithOptionals.accounts).toBeDefined();
    });
  });

  describe('AccountConfig Type', () => {
    it('should validate AccountConfig required fields', () => {
      const validAccount: AccountConfig = {
        id: 'test-account',
        name: 'Test Account', 
        t_invest_token: 't.test_token',
        account_id: '123456789',
        desired_wallet: { TRUR: 100 }
      };
      
      expect(validAccount.id).toBe('test-account');
      expect(validAccount.name).toBe('Test Account');
      expect(validAccount.t_invest_token).toBe('t.test_token');
      expect(validAccount.account_id).toBe('123456789');
      expect(validAccount.desired_wallet).toBeDefined();
    });
    
    it('should handle environment variable token format', () => {
      const accountWithEnvToken: AccountConfig = {
        id: 'env-account',
        name: 'Environment Token Account',
        t_invest_token: '${T_INVEST_TOKEN}',
        account_id: '987654321',
        desired_wallet: { TGLD: 100 }
      };
      
      expect(accountWithEnvToken.t_invest_token).toBe('${T_INVEST_TOKEN}');
      expect(accountWithEnvToken.t_invest_token.startsWith('${')).toBe(true);
      expect(accountWithEnvToken.t_invest_token.endsWith('}')).toBe(true);
    });
    
    it('should validate desired_wallet structure', () => {
      const account: AccountConfig = {
        id: 'test',
        name: 'Test',
        t_invest_token: 'token',
        account_id: '123',
        desired_wallet: {
          TRUR: 40,
          TMOS: 30,
          TGLD: 20,
          RUB: 10
        }
      };
      
      const walletKeys = Object.keys(account.desired_wallet);
      const walletValues = Object.values(account.desired_wallet);
      
      expect(walletKeys).toHaveLength(4);
      expect(walletValues.every(value => typeof value === 'number')).toBe(true);
      expect(walletValues.reduce((sum, val) => sum + val, 0)).toBe(100);
    });
    
    it('should handle optional margin configuration', () => {
      const accountWithMargin: AccountConfig = {
        id: 'margin-account',
        name: 'Margin Account',
        t_invest_token: 'token',
        account_id: '123',
        desired_wallet: { TRUR: 100 },
        margin: {
          enabled: true,
          strategy: 'keep_if_small',
          max_margin_size: 1000000
        }
      };
      
      expect(accountWithMargin.margin).toBeDefined();
      expect(accountWithMargin.margin?.enabled).toBe(true);
      expect(accountWithMargin.margin?.strategy).toBe('keep_if_small');
      expect(accountWithMargin.margin?.max_margin_size).toBe(1000000);
    });
    
    it('should handle optional exchange closure behavior', () => {
      const accountWithBehavior: AccountConfig = {
        id: 'behavior-account',
        name: 'Behavior Account',
        t_invest_token: 'token',
        account_id: '123',
        desired_wallet: { TRUR: 100 },
        exchange_closure_behavior: {
          mode: 'dry_run',
          update_iteration_result: true
        }
      };
      
      expect(accountWithBehavior.exchange_closure_behavior).toBeDefined();
      expect(accountWithBehavior.exchange_closure_behavior?.mode).toBe('dry_run');
      expect(accountWithBehavior.exchange_closure_behavior?.update_iteration_result).toBe(true);
    });
    
    it('should handle optional sleep_between_orders', () => {
      const accountWithSleep: AccountConfig = {
        id: 'sleep-account',
        name: 'Sleep Account',
        t_invest_token: 'token',
        account_id: '123',
        desired_wallet: { TRUR: 100 },
        sleep_between_orders: 5000
      };
      
      expect(accountWithSleep.sleep_between_orders).toBe(5000);
      expect(typeof accountWithSleep.sleep_between_orders).toBe('number');
    });
  });

  describe('ExchangeClosureBehavior Type', () => {
    it('should validate ExchangeClosureMode enum values', () => {
      const validModes: ExchangeClosureMode[] = [
        'skip_iteration',
        'force_orders', 
        'dry_run'
      ];
      
      for (const mode of validModes) {
        const behavior: ExchangeClosureBehavior = {
          mode,
          update_iteration_result: false
        };
        
        expect(behavior.mode).toBe(mode);
        expect(typeof behavior.update_iteration_result).toBe('boolean');
      }
    });
    
    it('should validate update_iteration_result boolean type', () => {
      const behaviorTrue: ExchangeClosureBehavior = {
        mode: 'skip_iteration',
        update_iteration_result: true
      };
      
      const behaviorFalse: ExchangeClosureBehavior = {
        mode: 'force_orders',
        update_iteration_result: false
      };
      
      expect(behaviorTrue.update_iteration_result).toBe(true);
      expect(behaviorFalse.update_iteration_result).toBe(false);
    });
    
    it('should handle all exchange closure modes', () => {
      const modes: ExchangeClosureMode[] = ['skip_iteration', 'force_orders', 'dry_run'];
      
      modes.forEach(mode => {
        const behavior: ExchangeClosureBehavior = {
          mode,
          update_iteration_result: Math.random() > 0.5
        };
        
        expect(['skip_iteration', 'force_orders', 'dry_run']).toContain(behavior.mode);
      });
    });
  });

  describe('Position Type', () => {
    it('should validate Position structure', () => {
      const position: Position = {
        ticker: 'TRUR',
        figi: 'BBG00XXXXXXX',
        quantity: 100,
        price: 1250.5,
        totalPrice: 125050,
        currency: 'RUB',
        type: 'etf',
        name: 'T-RU',
        lots: 10,
        balance: 100,
        blocked: 0,
        quote: 'RUB',
        base: 'TRUR',
        totalPriceNumber: 125050
      };
      
      expect(position.ticker).toBe('TRUR');
      expect(position.figi).toBe('BBG00XXXXXXX');
      expect(typeof position.quantity).toBe('number');
      expect(typeof position.price).toBe('number');
      expect(typeof position.totalPrice).toBe('number');
      expect(position.currency).toBe('RUB');
    });
    
    it('should handle optional Position fields', () => {
      const minimalPosition: Position = {
        ticker: 'TMOS',
        figi: 'BBG00YYYYYYY',
        quantity: 50,
        price: 2000,
        totalPrice: 100000,
        currency: 'RUB',
        type: 'etf',
        name: 'T-MOS',
        lots: 5,
        balance: 50,
        blocked: 0,
        quote: 'RUB',
        base: 'TMOS',
        totalPriceNumber: 100000,
        // Optional fields
        toBuyLots: 5,
        currentPercent: 45.5,
        desiredPercent: 50.0,
        diffPercent: -4.5
      };
      
      expect(minimalPosition.toBuyLots).toBe(5);
      expect(minimalPosition.currentPercent).toBe(45.5);
      expect(minimalPosition.desiredPercent).toBe(50.0);
      expect(minimalPosition.diffPercent).toBe(-4.5);
    });
    
    it('should handle currency positions', () => {
      const rubPosition: Position = {
        ticker: 'RUB',
        figi: '',
        quantity: 50000,
        price: 1,
        totalPrice: 50000,
        currency: 'RUB',
        type: 'currency',
        name: 'Российский рубль',
        lots: 1,
        balance: 50000,
        blocked: 0,
        quote: 'RUB',
        base: 'RUB',
        totalPriceNumber: 50000
      };
      
      expect(rubPosition.base).toBe(rubPosition.quote);
      expect(rubPosition.type).toBe('currency');
      expect(rubPosition.price).toBe(1);
    });
  });

  describe('Wallet Type', () => {
    it('should validate Wallet as array of Position', () => {
      const wallet: Wallet = [
        {
          ticker: 'TRUR',
          figi: 'BBG00XXXXXXX',
          quantity: 100,
          price: 1250,
          totalPrice: 125000,
          currency: 'RUB',
          type: 'etf',
          name: 'T-RU',
          lots: 10,
          balance: 100,
          blocked: 0,
          quote: 'RUB',
          base: 'TRUR',
          totalPriceNumber: 125000
        },
        {
          ticker: 'RUB',
          figi: '',
          quantity: 25000,
          price: 1,
          totalPrice: 25000,
          currency: 'RUB',
          type: 'currency',
          name: 'Российский рубль',
          lots: 1,
          balance: 25000,
          blocked: 0,
          quote: 'RUB',
          base: 'RUB',
          totalPriceNumber: 25000
        }
      ];
      
      expect(Array.isArray(wallet)).toBe(true);
      expect(wallet).toHaveLength(2);
      expect(wallet[0].type).toBe('etf');
      expect(wallet[1].type).toBe('currency');
    });
    
    it('should handle empty wallet', () => {
      const emptyWallet: Wallet = [];
      
      expect(Array.isArray(emptyWallet)).toBe(true);
      expect(emptyWallet).toHaveLength(0);
    });
  });

  describe('DesiredWallet Type', () => {
    it('should validate DesiredWallet structure', () => {
      const desiredWallet: DesiredWallet = {
        TRUR: 40,
        TMOS: 30,
        TGLD: 20,
        RUB: 10
      };
      
      const keys = Object.keys(desiredWallet);
      const values = Object.values(desiredWallet);
      
      expect(keys.every(key => typeof key === 'string')).toBe(true);
      expect(values.every(value => typeof value === 'number')).toBe(true);
      expect(values.reduce((sum, val) => sum + val, 0)).toBe(100);
    });
    
    it('should handle various ticker formats', () => {
      const desiredWallet: DesiredWallet = {
        'TRUR': 25,
        'TMOS@MOEX': 25,
        'TGLD_OLD': 25,
        'RUB': 25
      };
      
      expect(Object.keys(desiredWallet)).toHaveLength(4);
      expect(desiredWallet['TRUR']).toBe(25);
      expect(desiredWallet['TMOS@MOEX']).toBe(25);
      expect(desiredWallet['TGLD_OLD']).toBe(25);
    });
    
    it('should handle decimal percentages', () => {
      const desiredWallet: DesiredWallet = {
        TRUR: 33.33,
        TMOS: 33.33,
        TGLD: 33.34
      };
      
      const total = Object.values(desiredWallet).reduce((sum, val) => sum + val, 0);
      expect(Math.abs(total - 100)).toBeLessThan(0.01);
    });
  });

  describe('MarginConfig Type', () => {
    it('should validate MarginConfig structure', () => {
      const marginConfig: MarginConfig = {
        enabled: true,
        strategy: 'keep_if_small',
        max_margin_size: 500000
      };
      
      expect(typeof marginConfig.enabled).toBe('boolean');
      expect(typeof marginConfig.strategy).toBe('string');
      expect(typeof marginConfig.max_margin_size).toBe('number');
    });
    
    it('should handle margin strategies', () => {
      const strategies = ['keep_if_small', 'aggressive', 'conservative'];
      
      strategies.forEach(strategy => {
        const config: MarginConfig = {
          enabled: true,
          strategy,
          max_margin_size: 1000000
        };
        
        expect(config.strategy).toBe(strategy);
      });
    });
    
    it('should handle disabled margin', () => {
      const disabledMargin: MarginConfig = {
        enabled: false,
        strategy: 'keep_if_small',
        max_margin_size: 0
      };
      
      expect(disabledMargin.enabled).toBe(false);
      expect(disabledMargin.max_margin_size).toBe(0);
    });
  });

  describe('AccountMarginConfig Type', () => {
    it('should validate AccountMarginConfig extends MarginConfig', () => {
      const accountMargin: AccountMarginConfig = {
        enabled: true,
        strategy: 'keep_if_small',
        max_margin_size: 750000
      };
      
      // AccountMarginConfig should have all MarginConfig properties
      expect(accountMargin.enabled).toBeDefined();
      expect(accountMargin.strategy).toBeDefined();
      expect(accountMargin.max_margin_size).toBeDefined();
    });
  });

  describe('BalancingDataError Type', () => {
    it('should validate BalancingDataError structure', () => {
      const error: BalancingDataError = {
        message: 'Test error message',
        ticker: 'TRUR',
        type: 'missing_data'
      };
      
      expect(typeof error.message).toBe('string');
      expect(typeof error.ticker).toBe('string');
      expect(typeof error.type).toBe('string');
    });
    
    it('should handle various error types', () => {
      const errorTypes = ['missing_data', 'invalid_price', 'api_error', 'calculation_error'];
      
      errorTypes.forEach(type => {
        const error: BalancingDataError = {
          message: `Error of type ${type}`,
          ticker: 'TEST',
          type
        };
        
        expect(error.type).toBe(type);
        expect(error.message).toContain(type);
      });
    });
    
    it('should handle optional error properties', () => {
      const detailedError: BalancingDataError = {
        message: 'Detailed error',
        ticker: 'TRUR',
        type: 'api_error',
        // Additional properties that might be added
        code: 'E001',
        timestamp: new Date().toISOString()
      };
      
      expect(detailedError.message).toBe('Detailed error');
      expect((detailedError as any).code).toBe('E001');
      expect((detailedError as any).timestamp).toBeDefined();
    });
  });

  describe('Type Compatibility', () => {
    it('should ensure Position can be used in Wallet', () => {
      const position: Position = {
        ticker: 'TRUR',
        figi: 'BBG00XXXXXXX',
        quantity: 100,
        price: 1250,
        totalPrice: 125000,
        currency: 'RUB',
        type: 'etf',
        name: 'T-RU',
        lots: 10,
        balance: 100,
        blocked: 0,
        quote: 'RUB',
        base: 'TRUR',
        totalPriceNumber: 125000
      };
      
      const wallet: Wallet = [position];
      
      expect(wallet).toHaveLength(1);
      expect(wallet[0]).toBe(position);
    });
    
    it('should ensure AccountConfig can be used in ProjectConfig', () => {
      const account: AccountConfig = {
        id: 'test-account',
        name: 'Test Account',
        t_invest_token: 't.test_token',
        account_id: '123456789',
        desired_wallet: { TRUR: 100 }
      };
      
      const config: ProjectConfig = {
        accounts: [account]
      };
      
      expect(config.accounts).toHaveLength(1);
      expect(config.accounts[0]).toBe(account);
    });
  });

  describe('Type Guards and Validation', () => {
    it('should validate numeric types for prices and quantities', () => {
      const position: Position = {
        ticker: 'TRUR',
        figi: 'BBG00XXXXXXX',
        quantity: 100.5,
        price: 1250.75,
        totalPrice: 125125.125,
        currency: 'RUB',
        type: 'etf',
        name: 'T-RU',
        lots: 10,
        balance: 100.5,
        blocked: 0,
        quote: 'RUB',
        base: 'TRUR',
        totalPriceNumber: 125125.125
      };
      
      expect(Number.isFinite(position.quantity)).toBe(true);
      expect(Number.isFinite(position.price)).toBe(true);
      expect(Number.isFinite(position.totalPrice)).toBe(true);
      expect(Number.isFinite(position.balance)).toBe(true);
    });
    
    it('should validate string types for identifiers', () => {
      const position: Position = {
        ticker: 'TRUR',
        figi: 'BBG00XXXXXXX',
        quantity: 100,
        price: 1250,
        totalPrice: 125000,
        currency: 'RUB',
        type: 'etf',
        name: 'T-RU',
        lots: 10,
        balance: 100,
        blocked: 0,
        quote: 'RUB',
        base: 'TRUR',
        totalPriceNumber: 125000
      };
      
      expect(typeof position.ticker).toBe('string');
      expect(typeof position.figi).toBe('string');
      expect(typeof position.currency).toBe('string');
      expect(typeof position.type).toBe('string');
      expect(typeof position.name).toBe('string');
    });
  });
});