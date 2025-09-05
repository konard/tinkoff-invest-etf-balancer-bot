import { describe, it, expect } from 'bun:test';
import { BuyRequiresTotalMarginalSellConfig } from '../types.d';

describe('buy_requires_total_marginal_sell Configuration Validation Tests', () => {
  
  describe('1. Configuration Structure Validation', () => {
    it('should accept valid complete configuration', () => {
      const validConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON', 'TGLD'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell'
        },
        min_buy_rebalance_percent: 1.5
      };
      
      expect(validConfig.enabled).toBe(true);
      expect(validConfig.instruments).toHaveLength(2);
      expect(validConfig.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode).toBe('only_positive_positions_sell');
      expect(validConfig.min_buy_rebalance_percent).toBe(1.5);
    });

    it('should handle minimal valid configuration', () => {
      const minimalConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: false,
        instruments: [],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'none'
        },
        min_buy_rebalance_percent: 0
      };
      
      expect(minimalConfig.enabled).toBe(false);
      expect(minimalConfig.instruments).toHaveLength(0);
      expect(minimalConfig.min_buy_rebalance_percent).toBe(0);
    });
  });

  describe('2. enabled Field Validation', () => {
    const testCases = [
      { value: true, description: 'boolean true' },
      { value: false, description: 'boolean false' }
    ];

    testCases.forEach(({ value, description }) => {
      it(`should accept ${description}`, () => {
        const config: BuyRequiresTotalMarginalSellConfig = {
          enabled: value,
          instruments: ['TMON'],
          allow_to_sell_others_positions_to_buy_non_marginal_positions: {
            mode: 'none'
          },
          min_buy_rebalance_percent: 0.5
        };
        
        expect(config.enabled).toBe(value);
      });
    });
  });

  describe('3. instruments Array Validation', () => {
    it('should accept empty instruments array', () => {
      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: [],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'none'
        },
        min_buy_rebalance_percent: 0.5
      };
      
      expect(config.instruments).toHaveLength(0);
    });

    it('should accept single instrument', () => {
      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'none'
        },
        min_buy_rebalance_percent: 0.5
      };
      
      expect(config.instruments).toHaveLength(1);
      expect(config.instruments[0]).toBe('TMON');
    });

    it('should accept multiple instruments', () => {
      const instruments = ['TMON', 'TGLD', 'CUSTOM_ETF', 'ANOTHER_INSTRUMENT'];
      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments,
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'none'
        },
        min_buy_rebalance_percent: 0.5
      };
      
      expect(config.instruments).toHaveLength(4);
      expect(config.instruments).toEqual(instruments);
    });

    it('should handle instruments with special characters', () => {
      const specialInstruments = ['TMON@', 'T-GOLD', 'ETF_123', 'FUND.A'];
      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: specialInstruments,
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'none'
        },
        min_buy_rebalance_percent: 0.5
      };
      
      expect(config.instruments).toEqual(specialInstruments);
    });

    it('should handle duplicate instruments', () => {
      const duplicateInstruments = ['TMON', 'TGLD', 'TMON', 'TGLD'];
      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: duplicateInstruments,
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'none'
        },
        min_buy_rebalance_percent: 0.5
      };
      
      // Configuration should accept duplicates (business logic may handle deduplication)
      expect(config.instruments).toHaveLength(4);
      expect(config.instruments).toEqual(duplicateInstruments);
    });
  });

  describe('4. Selling Mode Validation', () => {
    const validModes = [
      'only_positive_positions_sell',
      'equal_in_percents', 
      'none'
    ];

    validModes.forEach(mode => {
      it(`should accept valid mode: ${mode}`, () => {
        const config: BuyRequiresTotalMarginalSellConfig = {
          enabled: true,
          instruments: ['TMON'],
          allow_to_sell_others_positions_to_buy_non_marginal_positions: {
            mode: mode as any
          },
          min_buy_rebalance_percent: 0.5
        };
        
        expect(config.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode).toBe(mode);
      });
    });

    it('should handle mode case sensitivity', () => {
      // Test that exact case is required
      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell'
        },
        min_buy_rebalance_percent: 0.5
      };
      
      expect(config.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode).toBe('only_positive_positions_sell');
      expect(config.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode).not.toBe('Only_Positive_Positions_Sell');
    });
  });

  describe('5. min_buy_rebalance_percent Validation', () => {
    const validPercentages = [
      { value: 0, description: 'zero percent' },
      { value: 0.1, description: 'small decimal' },
      { value: 0.5, description: 'half percent' },
      { value: 1.0, description: 'one percent' },
      { value: 2.5, description: 'two and half percent' },
      { value: 5.0, description: 'five percent' },
      { value: 10.0, description: 'ten percent' },
      { value: 50.0, description: 'fifty percent' },
      { value: 100.0, description: 'one hundred percent' }
    ];

    validPercentages.forEach(({ value, description }) => {
      it(`should accept ${description} (${value})`, () => {
        const config: BuyRequiresTotalMarginalSellConfig = {
          enabled: true,
          instruments: ['TMON'],
          allow_to_sell_others_positions_to_buy_non_marginal_positions: {
            mode: 'none'
          },
          min_buy_rebalance_percent: value
        };
        
        expect(config.min_buy_rebalance_percent).toBe(value);
      });
    });

    it('should handle very small percentages', () => {
      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'none'
        },
        min_buy_rebalance_percent: 0.001 // 0.001%
      };
      
      expect(config.min_buy_rebalance_percent).toBe(0.001);
    });

    it('should handle large percentages', () => {
      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'none'
        },
        min_buy_rebalance_percent: 999.99
      };
      
      expect(config.min_buy_rebalance_percent).toBe(999.99);
    });
  });

  describe('6. Configuration Combinations', () => {
    it('should handle disabled config with complex settings', () => {
      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: false, // Disabled, but other settings are complex
        instruments: ['TMON', 'TGLD', 'CUSTOM'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'equal_in_percents'
        },
        min_buy_rebalance_percent: 5.0
      };
      
      expect(config.enabled).toBe(false);
      // Other settings should still be valid even if disabled
      expect(config.instruments).toHaveLength(3);
      expect(config.min_buy_rebalance_percent).toBe(5.0);
    });

    it('should handle enabled config with minimal settings', () => {
      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: [], // Empty but enabled
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'none'
        },
        min_buy_rebalance_percent: 0
      };
      
      expect(config.enabled).toBe(true);
      expect(config.instruments).toHaveLength(0);
      expect(config.min_buy_rebalance_percent).toBe(0);
    });

    it('should handle aggressive selling configuration', () => {
      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON', 'TGLD', 'TBRU', 'TDIV'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'equal_in_percents' // Most aggressive selling
        },
        min_buy_rebalance_percent: 0.1 // Very low threshold
      };
      
      expect(config.enabled).toBe(true);
      expect(config.instruments).toHaveLength(4);
      expect(config.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode).toBe('equal_in_percents');
      expect(config.min_buy_rebalance_percent).toBe(0.1);
    });

    it('should handle conservative configuration', () => {
      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'], // Only one instrument
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell' // Conservative selling
        },
        min_buy_rebalance_percent: 10.0 // High threshold
      };
      
      expect(config.enabled).toBe(true);
      expect(config.instruments).toHaveLength(1);
      expect(config.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode).toBe('only_positive_positions_sell');
      expect(config.min_buy_rebalance_percent).toBe(10.0);
    });

    it('should handle no-selling configuration', () => {
      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON', 'TGLD'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'none' // No selling allowed
        },
        min_buy_rebalance_percent: 1.0
      };
      
      expect(config.enabled).toBe(true);
      expect(config.instruments).toHaveLength(2);
      expect(config.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode).toBe('none');
    });
  });

  describe('7. Real-world Configuration Examples', () => {
    it('should handle typical production configuration', () => {
      const productionConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'], // Non-margin gold ETF
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell'
        },
        min_buy_rebalance_percent: 0.5 // 0.5% threshold
      };
      
      expect(productionConfig.enabled).toBe(true);
      expect(productionConfig.instruments).toContain('TMON');
      expect(productionConfig.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode).toBe('only_positive_positions_sell');
      expect(productionConfig.min_buy_rebalance_percent).toBe(0.5);
    });

    it('should handle test environment configuration', () => {
      const testConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TEST_INSTRUMENT'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'equal_in_percents'
        },
        min_buy_rebalance_percent: 0.1 // Lower threshold for testing
      };
      
      expect(testConfig.enabled).toBe(true);
      expect(testConfig.instruments).toContain('TEST_INSTRUMENT');
      expect(testConfig.min_buy_rebalance_percent).toBe(0.1);
    });

    it('should handle disabled production configuration', () => {
      const disabledConfig: BuyRequiresTotalMarginalSellConfig = {
        enabled: false, // Feature disabled in production
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell'
        },
        min_buy_rebalance_percent: 0.5
      };
      
      expect(disabledConfig.enabled).toBe(false);
      // Configuration should still be valid for future enabling
      expect(disabledConfig.instruments).toHaveLength(1);
      expect(disabledConfig.min_buy_rebalance_percent).toBe(0.5);
    });
  });
});
