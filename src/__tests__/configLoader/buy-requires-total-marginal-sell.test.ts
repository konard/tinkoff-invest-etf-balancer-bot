import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ConfigLoader } from "../../configLoader";
import { ProjectConfig } from "../../types.d";
import { testSuite } from '../test-utils';

testSuite('Buy Requires Total Marginal Sell Configuration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Set NODE_ENV to test
    process.env.NODE_ENV = 'test';
    
    // Reset ConfigLoader instance to ensure clean state
    ConfigLoader.resetInstance();
  });
  
  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Reset ConfigLoader instance
    ConfigLoader.resetInstance();
  });

  describe('Configuration Validation', () => {
    it('should validate correct buy_requires_total_marginal_sell configuration', () => {
      const config: ProjectConfig = {
        accounts: [
          {
            id: "test_account",
            name: "Test Account",
            t_invest_token: "test_token",
            account_id: "BROKER",
            desired_wallet: {
              "TMON": 50,
              "TGLD": 50
            },
            desired_mode: "manual",
            balance_interval: 3600000,
            sleep_between_orders: 3000,
            exchange_closure_behavior: {
              mode: "dry_run",
              update_iteration_result: true
            },
            margin_trading: {
              enabled: false,
              multiplier: 4,
              free_threshold: 5000,
              max_margin_size: 5000,
              balancing_strategy: "keep_if_small"
            },
            buy_requires_total_marginal_sell: {
              enabled: true,
              instruments: ["TMON"],
              allow_to_sell_others_positions_to_buy_non_marginal_positions: {
                mode: "only_positive_positions_sell"
              },
              min_buy_rebalance_percent: 0.5
            }
          }
        ]
      };

      // This should not throw an error
      expect(() => {
        const loader = new ConfigLoader('');
        (loader as any).validateConfig(config);
      }).not.toThrow();
    });

    it('should reject invalid enabled field', () => {
      const config: ProjectConfig = {
        accounts: [
          {
            id: "test_account",
            name: "Test Account",
            t_invest_token: "test_token",
            account_id: "BROKER",
            desired_wallet: {
              "TMON": 50,
              "TGLD": 50
            },
            desired_mode: "manual",
            balance_interval: 3600000,
            sleep_between_orders: 3000,
            exchange_closure_behavior: {
              mode: "dry_run",
              update_iteration_result: true
            },
            margin_trading: {
              enabled: false,
              multiplier: 4,
              free_threshold: 5000,
              max_margin_size: 5000,
              balancing_strategy: "keep_if_small"
            },
            buy_requires_total_marginal_sell: {
              enabled: "true" as any, // Invalid type
              instruments: ["TMON"],
              allow_to_sell_others_positions_to_buy_non_marginal_positions: {
                mode: "only_positive_positions_sell"
              },
              min_buy_rebalance_percent: 0.5
            }
          }
        ]
      };

      expect(() => {
        const loader = new ConfigLoader('');
        (loader as any).validateConfig(config);
      }).toThrow(/enabled must be a boolean/);
    });

    it('should reject invalid instruments field', () => {
      const config: ProjectConfig = {
        accounts: [
          {
            id: "test_account",
            name: "Test Account",
            t_invest_token: "test_token",
            account_id: "BROKER",
            desired_wallet: {
              "TMON": 50,
              "TGLD": 50
            },
            desired_mode: "manual",
            balance_interval: 3600000,
            sleep_between_orders: 3000,
            exchange_closure_behavior: {
              mode: "dry_run",
              update_iteration_result: true
            },
            margin_trading: {
              enabled: false,
              multiplier: 4,
              free_threshold: 5000,
              max_margin_size: 5000,
              balancing_strategy: "keep_if_small"
            },
            buy_requires_total_marginal_sell: {
              enabled: true,
              instruments: "TMON" as any, // Invalid type
              allow_to_sell_others_positions_to_buy_non_marginal_positions: {
                mode: "only_positive_positions_sell"
              },
              min_buy_rebalance_percent: 0.5
            }
          }
        ]
      };

      expect(() => {
        const loader = new ConfigLoader('');
        (loader as any).validateConfig(config);
      }).toThrow(/instruments must be an array/);
    });

    it('should accept instruments not in desired_wallet (they represent non-margin assets on exchange)', () => {
      const config: ProjectConfig = {
        accounts: [
          {
            id: "test_account",
            name: "Test Account",
            t_invest_token: "test_token",
            account_id: "BROKER",
            desired_wallet: {
              "TMON": 50,
              "TGLD": 50
            },
            desired_mode: "manual",
            balance_interval: 3600000,
            sleep_between_orders: 3000,
            exchange_closure_behavior: {
              mode: "dry_run",
              update_iteration_result: true
            },
            margin_trading: {
              enabled: false,
              multiplier: 4,
              free_threshold: 5000,
              max_margin_size: 5000,
              balancing_strategy: "keep_if_small"
            },
            buy_requires_total_marginal_sell: {
              enabled: true,
              instruments: ["LQDT"], // Not in desired_wallet, but that's OK - it's a non-margin asset on exchange
              allow_to_sell_others_positions_to_buy_non_marginal_positions: {
                mode: "only_positive_positions_sell"
              },
              min_buy_rebalance_percent: 0.5
            }
          }
        ]
      };

      // This should NOT throw an error
      expect(() => {
        const loader = new ConfigLoader('');
        (loader as any).validateConfig(config);
      }).not.toThrow();
    });

    it('should reject invalid mode', () => {
      const config: ProjectConfig = {
        accounts: [
          {
            id: "test_account",
            name: "Test Account",
            t_invest_token: "test_token",
            account_id: "BROKER",
            desired_wallet: {
              "TMON": 50,
              "TGLD": 50
            },
            desired_mode: "manual",
            balance_interval: 3600000,
            sleep_between_orders: 3000,
            exchange_closure_behavior: {
              mode: "dry_run",
              update_iteration_result: true
            },
            margin_trading: {
              enabled: false,
              multiplier: 4,
              free_threshold: 5000,
              max_margin_size: 5000,
              balancing_strategy: "keep_if_small"
            },
            buy_requires_total_marginal_sell: {
              enabled: true,
              instruments: ["TMON"],
              allow_to_sell_others_positions_to_buy_non_marginal_positions: {
                mode: "invalid_mode" as any
              },
              min_buy_rebalance_percent: 0.5
            }
          }
        ]
      };

      expect(() => {
        const loader = new ConfigLoader('');
        (loader as any).validateConfig(config);
      }).toThrow(/mode must be one of/);
    });

    it('should reject invalid min_buy_rebalance_percent', () => {
      const config: ProjectConfig = {
        accounts: [
          {
            id: "test_account",
            name: "Test Account",
            t_invest_token: "test_token",
            account_id: "BROKER",
            desired_wallet: {
              "TMON": 50,
              "TGLD": 50
            },
            desired_mode: "manual",
            balance_interval: 3600000,
            sleep_between_orders: 3000,
            exchange_closure_behavior: {
              mode: "dry_run",
              update_iteration_result: true
            },
            margin_trading: {
              enabled: false,
              multiplier: 4,
              free_threshold: 5000,
              max_margin_size: 5000,
              balancing_strategy: "keep_if_small"
            },
            buy_requires_total_marginal_sell: {
              enabled: true,
              instruments: ["TMON"],
              allow_to_sell_others_positions_to_buy_non_marginal_positions: {
                mode: "only_positive_positions_sell"
              },
              min_buy_rebalance_percent: 150 // Invalid value
            }
          }
        ]
      };

      expect(() => {
        const loader = new ConfigLoader('');
        (loader as any).validateConfig(config);
      }).toThrow(/must be between 0 and 100/);
    });
  });
});