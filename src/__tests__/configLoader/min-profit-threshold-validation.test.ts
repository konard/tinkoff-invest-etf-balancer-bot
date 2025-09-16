import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { ConfigLoader } from '../../configLoader';
import { AccountConfig, ProjectConfig } from '../../types.d';

describe('ConfigLoader - min_profit_percent_for_close_position Validation', () => {
  let configLoader: ConfigLoader;
  let baseConfig: ProjectConfig;

  beforeEach(() => {
    ConfigLoader.resetInstance();
    configLoader = new ConfigLoader('CONFIG.test.json');

    baseConfig = {
      accounts: [
        {
          id: 'test-account',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account-id',
          desired_wallet: { TRUR: 50, TMOS: 50 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          margin_trading: {
            enabled: false,
            multiplier: 1,
            free_threshold: 10000,
            max_margin_size: 0,
            balancing_strategy: 'keep'
          },
          exchange_closure_behavior: {
            mode: 'skip_iteration',
            update_iteration_result: false
          }
        }
      ]
    };
  });

  afterEach(() => {
    ConfigLoader.resetInstance();
  });

  describe('Valid configurations', () => {
    it('should accept valid positive profit threshold', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: 5
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).not.toThrow();
    });

    it('should accept valid negative profit threshold (maximum loss)', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: -2
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).not.toThrow();
    });

    it('should accept zero profit threshold', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: 0
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).not.toThrow();
    });

    it('should accept boundary values', () => {
      const config1 = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: -100 // Maximum loss
          }
        ]
      };

      const config2 = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: 1000 // Maximum profit
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config1);
      }).not.toThrow();

      expect(() => {
        (configLoader as any).validateConfig(config2);
      }).not.toThrow();
    });

    it('should accept undefined value (feature disabled)', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: undefined
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).not.toThrow();
    });

    it('should accept configuration without the field (backward compatibility)', () => {
      expect(() => {
        (configLoader as any).validateConfig(baseConfig);
      }).not.toThrow();
    });
  });

  describe('Invalid configurations', () => {
    it('should reject non-numeric values', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: 'invalid' as any
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).toThrow('min_profit_percent_for_close_position must be a number');
    });

    it('should reject boolean values', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: true as any
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).toThrow('min_profit_percent_for_close_position must be a number');
    });

    it('should reject object values', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: { value: 5 } as any
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).toThrow('min_profit_percent_for_close_position must be a number');
    });

    it('should reject NaN values', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: NaN
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).toThrow('min_profit_percent_for_close_position must be a finite number');
    });

    it('should reject Infinity values', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: Infinity
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).toThrow('min_profit_percent_for_close_position must be a finite number');
    });

    it('should reject values below minimum bound', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: -101 // Below -100%
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).toThrow('min_profit_percent_for_close_position must be between -100 and 1000');
    });

    it('should reject values above maximum bound', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: 1001 // Above 1000%
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).toThrow('min_profit_percent_for_close_position must be between -100 and 1000');
    });
  });

  describe('Direct validation method tests', () => {
    it('should call validateMinProfitPercentForClosePosition when field is present', () => {
      const validateSpy = spyOn(configLoader as any, 'validateMinProfitPercentForClosePosition');

      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: 10
          }
        ]
      };

      (configLoader as any).validateConfig(config);

      expect(validateSpy).toHaveBeenCalledWith(10, 'test-account');
      validateSpy.mockRestore();
    });

    it('should not call validateMinProfitPercentForClosePosition when field is undefined', () => {
      const validateSpy = spyOn(configLoader as any, 'validateMinProfitPercentForClosePosition');

      (configLoader as any).validateConfig(baseConfig);

      expect(validateSpy).not.toHaveBeenCalled();
      validateSpy.mockRestore();
    });

    it('should provide descriptive error messages with account ID', () => {
      expect(() => {
        (configLoader as any).validateMinProfitPercentForClosePosition('invalid', 'test-account-id');
      }).toThrow('Account test-account-id: min_profit_percent_for_close_position must be a number. Got: string');
    });
  });

  describe('Multiple accounts validation', () => {
    it('should validate all accounts with different thresholds', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            id: 'account-1',
            min_profit_percent_for_close_position: 5
          },
          {
            ...baseConfig.accounts[0],
            id: 'account-2',
            min_profit_percent_for_close_position: -2
          },
          {
            ...baseConfig.accounts[0],
            id: 'account-3'
            // No threshold (undefined)
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).not.toThrow();
    });

    it('should fail validation if any account has invalid threshold', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            id: 'account-1',
            min_profit_percent_for_close_position: 5
          },
          {
            ...baseConfig.accounts[0],
            id: 'account-2',
            min_profit_percent_for_close_position: 'invalid' as any
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).toThrow('Account account-2: min_profit_percent_for_close_position must be a number');
    });
  });

  describe('Real-world scenarios', () => {
    it('should accept typical conservative threshold (3%)', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: 3
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).not.toThrow();
    });

    it('should accept typical aggressive threshold (1%)', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: 1
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).not.toThrow();
    });

    it('should accept stop-loss configuration (-5%)', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: -5
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).not.toThrow();
    });

    it('should accept decimal values', () => {
      const config = {
        ...baseConfig,
        accounts: [
          {
            ...baseConfig.accounts[0],
            min_profit_percent_for_close_position: 2.5
          }
        ]
      };

      expect(() => {
        (configLoader as any).validateConfig(config);
      }).not.toThrow();
    });
  });
});