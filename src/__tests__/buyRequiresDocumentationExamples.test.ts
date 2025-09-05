import { describe, it, expect } from 'bun:test';
import { BuyRequiresTotalMarginalSellConfig } from '../types.d';

/**
 * These tests serve as living documentation and examples for the
 * buy_requires_total_marginal_sell configuration parameters.
 * 
 * Each test demonstrates a specific use case and expected behavior.
 */
describe('buy_requires_total_marginal_sell Documentation Examples', () => {

  describe('📚 Basic Configuration Examples', () => {
    it('Example 1: Disabled Configuration (Default Safe Mode)', () => {
      /**
       * Use Case: Conservative approach, disable special handling
       * When: You want standard balancing without special selling logic
       * Result: Normal balancing behavior, no special selling for non-margin instruments
       */
      const disabledConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: false,
        instruments: [],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'none'
        },
        min_buy_rebalance_percent: 0
      };

      expect(disabledConfig.enabled).toBe(false);
      
      // Documentation: When enabled=false, all other settings are ignored
      // and the system uses standard balancing logic
    });

    it('Example 2: Basic TMON Gold ETF Configuration', () => {
      /**
       * Use Case: Add gold ETF (TMON) to portfolio by selling profitable positions
       * When: You want to diversify into gold but TMON is non-margin instrument
       * Result: System will sell profitable positions to fund TMON purchases
       */
      const goldConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'], // TMON is non-margin gold ETF
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell' // Only sell profitable positions
        },
        min_buy_rebalance_percent: 0.5 // Only for purchases > 0.5% of portfolio
      };

      expect(goldConfig.enabled).toBe(true);
      expect(goldConfig.instruments).toContain('TMON');
      expect(goldConfig.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode).toBe('only_positive_positions_sell');
      
      // Documentation: This is the most common production configuration
      // for adding TMON gold ETF to an existing portfolio
    });

    it('Example 3: Multiple Non-Margin Instruments', () => {
      /**
       * Use Case: Portfolio with multiple non-margin instruments
       * When: You have several ETFs that require special purchase handling
       * Result: System handles all specified instruments with same selling strategy
       */
      const multiInstrumentConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON', 'CUSTOM_ETF', 'BOND_FUND'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'equal_in_percents'
        },
        min_buy_rebalance_percent: 1.0
      };

      expect(multiInstrumentConfig.instruments).toHaveLength(3);
      expect(multiInstrumentConfig.instruments).toEqual(['TMON', 'CUSTOM_ETF', 'BOND_FUND']);
      
      // Documentation: All instruments in the list will be treated as non-margin
      // and trigger the special selling logic when they need to be purchased
    });
  });

  describe('🎯 Selling Mode Examples', () => {
    it('Example 4: Conservative Selling - Only Profitable Positions', () => {
      /**
       * Use Case: Risk-averse approach, only sell positions with gains
       * When: You don't want to realize losses to fund new purchases
       * Result: Only positions with profit will be sold to raise funds
       * 
       * Behavior:
       * - Positions bought at 90 RUB, now worth 100 RUB → Will be sold
       * - Positions bought at 120 RUB, now worth 100 RUB → Will NOT be sold
       */
      const conservativeConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell'
        },
        min_buy_rebalance_percent: 0.5
      };

      expect(conservativeConfig.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode)
        .toBe('only_positive_positions_sell');
      
      // Documentation: This mode protects against realizing losses
      // but may limit the ability to fully fund purchases if few positions are profitable
    });

    it('Example 5: Proportional Selling - Equal Distribution', () => {
      /**
       * Use Case: Balanced approach, sell proportionally from all positions
       * When: You want to maintain relative position sizes while funding purchases
       * Result: All positions (except target instruments) are reduced proportionally
       * 
       * Example:
       * - TPAY: 1000 RUB (50% of sellable) → Sell 250 RUB (25%)
       * - TMOS: 1000 RUB (50% of sellable) → Sell 250 RUB (25%)
       * - Total raised: 500 RUB for TMON purchase
       */
      const proportionalConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'equal_in_percents'
        },
        min_buy_rebalance_percent: 1.0
      };

      expect(proportionalConfig.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode)
        .toBe('equal_in_percents');
      
      // Documentation: This mode maintains portfolio balance while raising funds
      // but may force selling of loss positions
    });

    it('Example 6: Cash-Only Mode - No Selling', () => {
      /**
       * Use Case: Ultra-conservative, only use available cash
       * When: You never want to sell existing positions
       * Result: Only available RUB balance is used for purchases
       * 
       * Behavior:
       * - Available cash: 500 RUB → Can buy 500 RUB worth of TMON
       * - Negative balance: -100 RUB → Cannot buy anything
       * - Existing positions: Never touched
       */
      const cashOnlyConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'none'
        },
        min_buy_rebalance_percent: 0.1
      };

      expect(cashOnlyConfig.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode)
        .toBe('none');
      
      // Documentation: This mode is safest but may severely limit rebalancing ability
      // especially in margin trading scenarios with negative cash balances
    });
  });

  describe('⚖️ Threshold Examples', () => {
    it('Example 7: High Threshold - Major Changes Only', () => {
      /**
       * Use Case: Only trigger special selling for significant rebalancing
       * When: You want to avoid frequent small trades and their costs
       * Result: Only large purchases (>5% of portfolio) trigger selling
       * 
       * Example with 10,000 RUB portfolio:
       * - TMON purchase: 400 RUB (4%) → No special selling (below 5% threshold)
       * - TMON purchase: 600 RUB (6%) → Special selling triggered
       */
      const highThresholdConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell'
        },
        min_buy_rebalance_percent: 5.0 // 5% threshold
      };

      expect(highThresholdConfig.min_buy_rebalance_percent).toBe(5.0);
      
      // Documentation: Higher thresholds reduce trading frequency but may miss
      // smaller rebalancing opportunities
    });

    it('Example 8: Low Threshold - Sensitive Rebalancing', () => {
      /**
       * Use Case: Trigger special selling for even small purchases
       * When: You want precise portfolio management and don't mind frequent trades
       * Result: Even small purchases (>0.1% of portfolio) trigger selling
       * 
       * Example with 10,000 RUB portfolio:
       * - TMON purchase: 15 RUB (0.15%) → Special selling triggered
       * - TMON purchase: 5 RUB (0.05%) → No special selling (below 0.1% threshold)
       */
      const lowThresholdConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'equal_in_percents'
        },
        min_buy_rebalance_percent: 0.1 // 0.1% threshold
      };

      expect(lowThresholdConfig.min_buy_rebalance_percent).toBe(0.1);
      
      // Documentation: Lower thresholds enable precise rebalancing but increase
      // trading frequency and associated costs
    });

    it('Example 9: Zero Threshold - All Purchases Trigger Selling', () => {
      /**
       * Use Case: Maximum sensitivity, every purchase triggers selling logic
       * When: You want the system to always optimize funding for non-margin instruments
       * Result: Any TMON purchase, no matter how small, triggers selling
       */
      const zeroThresholdConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell'
        },
        min_buy_rebalance_percent: 0 // No threshold
      };

      expect(zeroThresholdConfig.min_buy_rebalance_percent).toBe(0);
      
      // Documentation: Zero threshold means maximum responsiveness but highest
      // trading frequency
    });
  });

  describe('🏭 Production Scenarios', () => {
    it('Example 10: Conservative Production Setup', () => {
      /**
       * Use Case: Production environment with risk management
       * When: You want to add gold exposure but minimize risks
       * Result: Only sell profitable positions, only for significant purchases
       */
      const productionConservative: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'], // Only TMON gold ETF
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell' // Conservative selling
        },
        min_buy_rebalance_percent: 1.0 // 1% threshold to avoid small trades
      };

      expect(productionConservative.enabled).toBe(true);
      expect(productionConservative.instruments).toEqual(['TMON']);
      expect(productionConservative.min_buy_rebalance_percent).toBe(1.0);
      
      // Documentation: This setup balances functionality with risk management
      // Suitable for most production environments
    });

    it('Example 11: Aggressive Rebalancing Setup', () => {
      /**
       * Use Case: Active portfolio management with frequent rebalancing
       * When: You want maximum flexibility and don't mind frequent trades
       * Result: Proportional selling for any significant purchase
       */
      const productionAggressive: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON', 'TGLD', 'CUSTOM_BOND'], // Multiple instruments
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'equal_in_percents' // Aggressive selling
        },
        min_buy_rebalance_percent: 0.2 // Low threshold for frequent rebalancing
      };

      expect(productionAggressive.instruments).toHaveLength(3);
      expect(productionAggressive.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode)
        .toBe('equal_in_percents');
      expect(productionAggressive.min_buy_rebalance_percent).toBe(0.2);
      
      // Documentation: This setup maximizes rebalancing flexibility but increases
      // trading costs and complexity
    });

    it('Example 12: Gradual Migration Setup', () => {
      /**
       * Use Case: Gradually introducing new instruments to existing portfolio
       * When: You want to test the feature before full deployment
       * Result: High threshold limits activation to major rebalancing events
       */
      const migrationSetup: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'], // Start with just one instrument
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell' // Conservative approach
        },
        min_buy_rebalance_percent: 10.0 // Very high threshold for testing
      };

      expect(migrationSetup.min_buy_rebalance_percent).toBe(10.0);
      
      // Documentation: High threshold ensures feature only activates for major
      // portfolio changes, allowing safe testing in production
    });
  });

  describe('🧪 Testing and Development Scenarios', () => {
    it('Example 13: Development Environment Setup', () => {
      /**
       * Use Case: Testing environment with maximum visibility
       * When: You want to test all aspects of the feature
       * Result: Low threshold triggers feature frequently for testing
       */
      const developmentConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TEST_INSTRUMENT'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'equal_in_percents'
        },
        min_buy_rebalance_percent: 0.01 // Very low for testing
      };

      expect(developmentConfig.instruments).toContain('TEST_INSTRUMENT');
      expect(developmentConfig.min_buy_rebalance_percent).toBe(0.01);
      
      // Documentation: Development setup prioritizes feature testing over
      // production safety
    });

    it('Example 14: A/B Testing Configuration', () => {
      /**
       * Use Case: Compare different selling strategies
       * When: You want to evaluate which mode works best for your portfolio
       * Result: Easy switching between modes for comparison
       */
      const abTestConfigs = {
        strategyA: {
          enabled: true,
          instruments: ['TMON'],
          allow_to_sell_others_positions_to_buy_non_marginal_positions: {
            mode: 'only_positive_positions_sell' as const
          },
          min_buy_rebalance_percent: 0.5
        },
        strategyB: {
          enabled: true,
          instruments: ['TMON'],
          allow_to_sell_others_positions_to_buy_non_marginal_positions: {
            mode: 'equal_in_percents' as const
          },
          min_buy_rebalance_percent: 0.5
        }
      };

      expect(abTestConfigs.strategyA.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode)
        .toBe('only_positive_positions_sell');
      expect(abTestConfigs.strategyB.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode)
        .toBe('equal_in_percents');
      
      // Documentation: Identical configs except for selling mode enable
      // clean A/B testing of strategies
    });
  });

  describe('⚠️ Common Pitfalls and Solutions', () => {
    it('Example 15: Avoiding Infinite Selling Loop', () => {
      /**
       * Pitfall: Setting threshold too low with volatile positions
       * Problem: Constant small rebalancing triggers excessive selling
       * Solution: Use appropriate threshold based on portfolio size and volatility
       */
      const problematicConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'equal_in_percents'
        },
        min_buy_rebalance_percent: 0.001 // TOO LOW - will trigger constantly
      };

      const betterConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'equal_in_percents'
        },
        min_buy_rebalance_percent: 0.5 // Better threshold
      };

      expect(problematicConfig.min_buy_rebalance_percent).toBe(0.001);
      expect(betterConfig.min_buy_rebalance_percent).toBe(0.5);
      
      // Documentation: Threshold should be set based on expected portfolio
      // volatility and desired trading frequency
    });

    it('Example 16: Handling Insufficient Profitable Positions', () => {
      /**
       * Pitfall: Using only_positive_positions_sell when most positions are at loss
       * Problem: Cannot raise enough funds for purchases
       * Solution: Consider equal_in_percents mode or increase cash reserves
       */
      const limitedConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell' // May be too restrictive
        },
        min_buy_rebalance_percent: 0.5
      };

      const flexibleConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'equal_in_percents' // More flexible
        },
        min_buy_rebalance_percent: 0.5
      };

      expect(limitedConfig.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode)
        .toBe('only_positive_positions_sell');
      expect(flexibleConfig.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode)
        .toBe('equal_in_percents');
      
      // Documentation: Consider portfolio composition when choosing selling mode
      // Portfolios with many loss positions may need more flexible selling
    });
  });
});
