import { describe, it, expect, beforeEach } from 'bun:test';
import { calculatePositionProfit, identifyProfitablePositions, identifyPositionsForSelling } from '../utils/buyRequiresTotalMarginalSell';
import { Position, Wallet, BuyRequiresTotalMarginalSellConfig } from '../types.d';

describe('Minimum Profit Threshold Feature', () => {
  let mockPosition: Position;
  let mockWallet: Wallet;
  let mockConfig: BuyRequiresTotalMarginalSellConfig;

  beforeEach(() => {
    mockPosition = {
      base: 'TMOS',
      quote: 'RUB',
      figi: 'BBG000000001',
      amount: 100,
      lotSize: 1,
      priceNumber: 150,
      lotPriceNumber: 150,
      totalPriceNumber: 15000,
      averagePositionPriceFifoNumber: 120, // Bought at 120, now at 150 = 25% profit
    };

    mockWallet = [mockPosition];

    mockConfig = {
      enabled: true,
      instruments: ['TGLD', 'TMON'],
      allow_to_sell_others_positions_to_buy_non_marginal_positions: {
        mode: 'only_positive_positions_sell'
      },
      min_buy_rebalance_percent: 0.5
    };
  });

  describe('calculatePositionProfit', () => {
    it('should calculate profit correctly without threshold', () => {
      const result = calculatePositionProfit(mockPosition);

      expect(result).toBeDefined();
      expect(result!.profitAmount).toBe(3000); // 15000 - 12000 = 3000
      expect(result!.profitPercent).toBe(25); // (3000/12000) * 100 = 25%
      expect(result!.meetsThreshold).toBe(true); // No threshold specified
    });

    it('should pass threshold check when profit exceeds threshold', () => {
      const result = calculatePositionProfit(mockPosition, 20); // 20% threshold

      expect(result).toBeDefined();
      expect(result!.profitAmount).toBe(3000);
      expect(result!.profitPercent).toBe(25);
      expect(result!.meetsThreshold).toBe(true); // 25% > 20%
    });

    it('should fail threshold check when profit is below threshold', () => {
      const result = calculatePositionProfit(mockPosition, 30); // 30% threshold

      expect(result).toBeDefined();
      expect(result!.profitAmount).toBe(3000);
      expect(result!.profitPercent).toBe(25);
      expect(result!.meetsThreshold).toBe(false); // 25% < 30%
    });

    it('should pass threshold check with negative threshold (allow losses)', () => {
      // Position at loss: bought at 150, now at 120
      const losingPosition = {
        ...mockPosition,
        priceNumber: 120,
        lotPriceNumber: 120,
        totalPriceNumber: 12000,
        averagePositionPriceFifoNumber: 150,
      };

      const result = calculatePositionProfit(losingPosition, -5); // Allow up to 5% loss

      expect(result).toBeDefined();
      expect(result!.profitAmount).toBe(-3000); // 12000 - 15000 = -3000
      expect(result!.profitPercent).toBe(-20); // (-3000/15000) * 100 = -20%
      expect(result!.meetsThreshold).toBe(false); // -20% < -5%
    });

    it('should pass threshold check with negative threshold within allowed loss', () => {
      // Position at small loss: bought at 150, now at 145
      const smallLossPosition = {
        ...mockPosition,
        priceNumber: 145,
        lotPriceNumber: 145,
        totalPriceNumber: 14500,
        averagePositionPriceFifoNumber: 150,
      };

      const result = calculatePositionProfit(smallLossPosition, -5); // Allow up to 5% loss

      expect(result).toBeDefined();
      expect(result!.profitAmount).toBe(-500); // 14500 - 15000 = -500
      expect(result!.profitPercent).toBeCloseTo(-3.33, 2); // (-500/15000) * 100 ≈ -3.33%
      expect(result!.meetsThreshold).toBe(true); // -3.33% > -5%
    });

    it('should return null when position data is insufficient', () => {
      const positionWithoutPrice = {
        ...mockPosition,
        totalPriceNumber: 0,
      };

      const result = calculatePositionProfit(positionWithoutPrice, 10);
      expect(result).toBeNull();
    });

    it('should return null when position has no amount', () => {
      const positionWithoutAmount = {
        ...mockPosition,
        amount: 0,
      };

      const result = calculatePositionProfit(positionWithoutAmount, 10);
      expect(result).toBeNull();
    });

    it('should return null when no purchase price data available', () => {
      const positionWithoutPurchasePrice = {
        ...mockPosition,
        averagePositionPriceFifoNumber: undefined,
        averagePositionPriceNumber: undefined,
      };

      const result = calculatePositionProfit(positionWithoutPurchasePrice, 10);
      expect(result).toBeNull();
    });

    it('should fall back to averagePositionPriceNumber when FIFO not available', () => {
      const positionWithAveragePrice = {
        ...mockPosition,
        averagePositionPriceFifoNumber: undefined,
        averagePositionPriceNumber: 120,
      };

      const result = calculatePositionProfit(positionWithAveragePrice, 20);

      expect(result).toBeDefined();
      expect(result!.profitAmount).toBe(3000);
      expect(result!.profitPercent).toBe(25);
      expect(result!.meetsThreshold).toBe(true);
    });
  });

  describe('identifyProfitablePositions', () => {
    it('should identify profitable positions without threshold', () => {
      const positions = identifyProfitablePositions(mockWallet, mockConfig);

      expect(positions).toHaveLength(1);
      expect(positions[0].base).toBe('TMOS');
    });

    it('should identify profitable positions that meet threshold', () => {
      const positions = identifyProfitablePositions(mockWallet, mockConfig, 20);

      expect(positions).toHaveLength(1);
      expect(positions[0].base).toBe('TMOS');
    });

    it('should exclude positions that do not meet threshold', () => {
      const positions = identifyProfitablePositions(mockWallet, mockConfig, 30);

      expect(positions).toHaveLength(0);
    });

    it('should skip positions in non-margin instruments list', () => {
      const walletWithNonMargin = [
        {
          ...mockPosition,
          base: 'TGLD', // In non-margin instruments list
        }
      ];

      const positions = identifyProfitablePositions(walletWithNonMargin, mockConfig, 20);

      expect(positions).toHaveLength(0);
    });

    it('should return empty array when feature is disabled', () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const positions = identifyProfitablePositions(mockWallet, disabledConfig, 20);

      expect(positions).toHaveLength(0);
    });
  });

  describe('identifyPositionsForSelling', () => {
    it('should identify positions for selling with only_positive_positions_sell mode and threshold', () => {
      const positions = identifyPositionsForSelling(
        mockWallet,
        mockConfig,
        'only_positive_positions_sell',
        20
      );

      expect(positions).toHaveLength(1);
      expect(positions[0].base).toBe('TMOS');
    });

    it('should exclude positions that do not meet threshold in only_positive_positions_sell mode', () => {
      const positions = identifyPositionsForSelling(
        mockWallet,
        mockConfig,
        'only_positive_positions_sell',
        30
      );

      expect(positions).toHaveLength(0);
    });

    it('should apply threshold to equal_in_percents mode', () => {
      const positions = identifyPositionsForSelling(
        mockWallet,
        mockConfig,
        'equal_in_percents',
        20
      );

      expect(positions).toHaveLength(1);
      expect(positions[0].base).toBe('TMOS');
    });

    it('should exclude positions that do not meet threshold in equal_in_percents mode', () => {
      const positions = identifyPositionsForSelling(
        mockWallet,
        mockConfig,
        'equal_in_percents',
        30
      );

      expect(positions).toHaveLength(0);
    });

    it('should not apply threshold in equal_in_percents mode when not specified', () => {
      const positions = identifyPositionsForSelling(
        mockWallet,
        mockConfig,
        'equal_in_percents'
      );

      expect(positions).toHaveLength(1);
      expect(positions[0].base).toBe('TMOS');
    });

    it('should return empty array for none mode regardless of threshold', () => {
      const positions = identifyPositionsForSelling(
        mockWallet,
        mockConfig,
        'none',
        20
      );

      expect(positions).toHaveLength(0);
    });

    it('should skip positions with zero or negative amounts', () => {
      const walletWithZeroAmount = [
        {
          ...mockPosition,
          amount: 0,
        }
      ];

      const positions = identifyPositionsForSelling(
        walletWithZeroAmount,
        mockConfig,
        'only_positive_positions_sell',
        20
      );

      expect(positions).toHaveLength(0);
    });

    it('should skip currency positions', () => {
      const walletWithCurrency = [
        {
          ...mockPosition,
          base: 'RUB',
          quote: 'RUB',
        }
      ];

      const positions = identifyPositionsForSelling(
        walletWithCurrency,
        mockConfig,
        'only_positive_positions_sell',
        20
      );

      expect(positions).toHaveLength(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle positions with missing profit data gracefully', () => {
      const positionWithoutProfitData = {
        ...mockPosition,
        averagePositionPriceFifoNumber: undefined,
        averagePositionPriceNumber: undefined,
      };

      const walletWithBadData = [positionWithoutProfitData];

      const positions = identifyProfitablePositions(walletWithBadData, mockConfig, 10);
      expect(positions).toHaveLength(0);
    });

    it('should handle extreme threshold values', () => {
      // Test with very high threshold
      const result1 = calculatePositionProfit(mockPosition, 1000);
      expect(result1!.meetsThreshold).toBe(false);

      // Test with very low threshold
      const result2 = calculatePositionProfit(mockPosition, -100);
      expect(result2!.meetsThreshold).toBe(true);
    });

    it('should handle zero profit positions', () => {
      const breakEvenPosition = {
        ...mockPosition,
        priceNumber: 120,
        lotPriceNumber: 120,
        totalPriceNumber: 12000,
        averagePositionPriceFifoNumber: 120,
      };

      const result = calculatePositionProfit(breakEvenPosition, 5);

      expect(result).toBeDefined();
      expect(result!.profitAmount).toBe(0);
      expect(result!.profitPercent).toBe(0);
      expect(result!.meetsThreshold).toBe(false); // 0% < 5%
    });

    it('should handle positions with exactly matching threshold', () => {
      // Position with exactly 10% profit
      const exactThresholdPosition = {
        ...mockPosition,
        priceNumber: 132,
        lotPriceNumber: 132,
        totalPriceNumber: 13200,
        averagePositionPriceFifoNumber: 120,
      };

      const result = calculatePositionProfit(exactThresholdPosition, 10);

      expect(result).toBeDefined();
      expect(result!.profitPercent).toBe(10);
      expect(result!.meetsThreshold).toBe(true); // 10% >= 10%
    });
  });

  describe('Multiple Position Scenarios', () => {
    it('should filter positions correctly with mixed profit levels', () => {
      const mixedWallet: Wallet = [
        {
          base: 'TMOS',
          quote: 'RUB',
          figi: 'BBG000000001',
          amount: 100,
          lotSize: 1,
          priceNumber: 150,
          lotPriceNumber: 150,
          totalPriceNumber: 15000,
          averagePositionPriceFifoNumber: 120, // 25% profit
        },
        {
          base: 'TCSG',
          quote: 'RUB',
          figi: 'BBG000000002',
          amount: 50,
          lotSize: 1,
          priceNumber: 110,
          lotPriceNumber: 110,
          totalPriceNumber: 5500,
          averagePositionPriceFifoNumber: 100, // 10% profit
        },
        {
          base: 'SBER',
          quote: 'RUB',
          figi: 'BBG000000003',
          amount: 200,
          lotSize: 1,
          priceNumber: 95,
          lotPriceNumber: 95,
          totalPriceNumber: 19000,
          averagePositionPriceFifoNumber: 100, // -5% loss
        }
      ];

      const positions = identifyProfitablePositions(mixedWallet, mockConfig, 15);

      expect(positions).toHaveLength(1); // Only TMOS meets 15% threshold
      expect(positions[0].base).toBe('TMOS');
    });

    it('should handle empty wallet gracefully', () => {
      const positions = identifyProfitablePositions([], mockConfig, 10);
      expect(positions).toHaveLength(0);
    });
  });
});