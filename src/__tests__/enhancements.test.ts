import { describe, it, expect, beforeEach } from 'bun:test';
import { buildDesiredWalletByMode } from '../balancer/desiredBuilder';
import { MarginCalculator } from '../utils/marginCalculator';
import { BalancingDataError, DesiredMode, DesiredWallet, MarginPosition, AccountMarginConfig } from '../types.d';

describe('ETF Balancer Enhancements', () => {
  
  describe('Manual/Default Mode Selection', () => {
    const baseDesiredWallet: DesiredWallet = {
      'TPAY': 25,
      'TGLD': 25,
      'TRUR': 25,
      'TRND': 25
    };

    it('should return enhanced result for manual mode', async () => {
      const result = await buildDesiredWalletByMode('manual', baseDesiredWallet);
      expect(result.wallet).toEqual(baseDesiredWallet);
      expect(result.modeApplied).toBe('manual');
      expect(result.metrics).toEqual([]);
    });

    it('should return enhanced result for default mode', async () => {
      const result = await buildDesiredWalletByMode('default', baseDesiredWallet);
      expect(result.wallet).toEqual(baseDesiredWallet);
      expect(result.modeApplied).toBe('default');
      expect(result.metrics).toEqual([]);
    });
  });

  describe('Enhanced Margin Trading Configuration', () => {
    let marginCalculator: MarginCalculator;

    beforeEach(() => {
      const config = {
        multiplier: 4,
        freeThreshold: 5000,
        maxMarginSize: 10000,
        strategy: 'keep_if_small' as const
      };
      marginCalculator = new MarginCalculator(config);
    });

    it('should validate margin limits with max_margin_size', () => {
      const mockMarginPositions: MarginPosition[] = [
        {
          base: 'TPAY',
          quote: 'RUB',
          isMargin: true,
          marginValue: 8000,
          leverage: 4,
          marginCall: false
        }
      ];

      const result = marginCalculator.validateMarginLimits(mockMarginPositions);
      
      expect(result.isValid).toBe(true);
      expect(result.totalMarginUsed).toBe(8000);
      expect(result.maxMarginAllowed).toBe(10000);
      expect(result.exceededAmount).toBeUndefined();
    });

    it('should detect margin limit exceeded', () => {
      const mockMarginPositions: MarginPosition[] = [
        {
          base: 'TPAY',
          quote: 'RUB',
          isMargin: true,
          marginValue: 12000,
          leverage: 4,
          marginCall: false
        }
      ];

      const result = marginCalculator.validateMarginLimits(mockMarginPositions);
      
      expect(result.isValid).toBe(false);
      expect(result.totalMarginUsed).toBe(12000);
      expect(result.maxMarginAllowed).toBe(10000);
      expect(result.exceededAmount).toBe(2000);
    });

    it('should apply keep_if_small strategy with max_margin_size', () => {
      const mockMarginPositions: MarginPosition[] = [
        {
          base: 'TPAY',
          quote: 'RUB',
          totalPriceNumber: 15000,
          isMargin: true,
          marginValue: 12000,
          leverage: 4,
          marginCall: false
        }
      ];

      const result = marginCalculator.applyMarginStrategy(
        mockMarginPositions,
        'keep_if_small',
        new Date('2023-01-01T18:30:00'),  // Near market close
        3600000, // 1 hour interval
        '18:45'
      );

      expect(result.shouldRemoveMargin).toBe(true);
      expect(result.reason).toContain('remove margin');
      expect(result.reason).toContain('15000.00 rub > max 10000 rub');
    });

    it('should use default max_margin_size when not configured', () => {
      const configWithoutMax = {
        multiplier: 4,
        freeThreshold: 5000,
        strategy: 'keep_if_small' as const
      };
      const calculator = new MarginCalculator(configWithoutMax);

      const mockMarginPositions: MarginPosition[] = [
        {
          base: 'TPAY',
          quote: 'RUB',
          isMargin: true,
          marginValue: 3000,
          leverage: 4,
          marginCall: false
        }
      ];

      const result = calculator.validateMarginLimits(mockMarginPositions);
      
      expect(result.maxMarginAllowed).toBe(5000); // Default value
      expect(result.isValid).toBe(true);
    });
  });

  describe('Configuration Integration', () => {
    it('should handle AccountMarginConfig with max_margin_size', () => {
      const config: AccountMarginConfig = {
        enabled: true,
        multiplier: 4,
        free_threshold: 5000,
        max_margin_size: 15000,
        balancing_strategy: 'keep_if_small'
      };

      expect(config.max_margin_size).toBe(15000);
      expect(config.enabled).toBe(true);
      expect(config.balancing_strategy).toBe('keep_if_small');
    });
  });

  describe('Error Handling', () => {
    it('should create BalancingDataError with correct properties', () => {
      const error = new BalancingDataError(
        'marketcap',
        ['market cap data'],
        ['TPAY', 'TGLD']
      );

      expect(error.name).toBe('BalancingDataError');
      expect(error.mode).toBe('marketcap');
      expect(error.missingData).toEqual(['market cap data']);
      expect(error.affectedTickers).toEqual(['TPAY', 'TGLD']);
      expect(error.message).toContain('Balancing halted');
      expect(error.message).toContain('marketcap mode');
      expect(error.message).toContain('TPAY, TGLD');
    });
  });

  describe('Enhanced Result Structure', () => {
    it('should verify buildDesiredWalletByMode returns enhanced structure', async () => {
      const baseDesiredWallet: DesiredWallet = {
        'TPAY': 50,
        'TGLD': 50
      };

      const result = await buildDesiredWalletByMode('manual', baseDesiredWallet);
      
      // Verify enhanced return structure
      expect(result).toHaveProperty('wallet');
      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('modeApplied');
      
      expect(Array.isArray(result.metrics)).toBe(true);
      expect(typeof result.modeApplied).toBe('string');
      expect(typeof result.wallet).toBe('object');
    });
  });
});