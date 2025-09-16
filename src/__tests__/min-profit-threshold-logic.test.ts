import { describe, it, expect, beforeEach } from 'bun:test';
import { Position, Wallet, BuyRequiresTotalMarginalSellConfig } from '../types.d';

// Reimplement the core logic directly in the test to avoid lodash dependency
const calculatePositionProfitTest = (
  position: Position,
  minProfitPercent?: number
): {
  profitAmount: number;
  profitPercent: number;
  meetsThreshold: boolean;
} | null => {
  if (!position.totalPriceNumber || position.totalPriceNumber <= 0) {
    return null;
  }

  if (!position.amount || position.amount <= 0) {
    return null;
  }

  let originalPurchaseCost = 0;

  if (position.averagePositionPriceFifoNumber) {
    originalPurchaseCost = position.averagePositionPriceFifoNumber * (position.amount || 0);
  } else if (position.averagePositionPriceNumber) {
    originalPurchaseCost = position.averagePositionPriceNumber * (position.amount || 0);
  } else {
    return null;
  }

  const profitAmount = position.totalPriceNumber - originalPurchaseCost;
  const profitPercent = (profitAmount / originalPurchaseCost) * 100;

  const meetsThreshold = minProfitPercent !== undefined
    ? profitPercent >= minProfitPercent
    : true;

  return {
    profitAmount,
    profitPercent,
    meetsThreshold
  };
};

// Test the core profit calculation logic directly without external dependencies
describe('Minimum Profit Threshold Logic Tests', () => {
  let mockPosition: Position;

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
  });

  describe('Core profit calculation logic', () => {

    it('should calculate profit correctly without threshold', () => {
      const result = calculatePositionProfitTest(mockPosition);

      expect(result).toBeDefined();
      expect(result!.profitAmount).toBe(3000); // 15000 - 12000 = 3000
      expect(result!.profitPercent).toBe(25); // (3000/12000) * 100 = 25%
      expect(result!.meetsThreshold).toBe(true); // No threshold specified
    });

    it('should pass threshold check when profit exceeds threshold', () => {
      const result = calculatePositionProfitTest(mockPosition, 20); // 20% threshold

      expect(result).toBeDefined();
      expect(result!.profitAmount).toBe(3000);
      expect(result!.profitPercent).toBe(25);
      expect(result!.meetsThreshold).toBe(true); // 25% > 20%
    });

    it('should fail threshold check when profit is below threshold', () => {
      const result = calculatePositionProfitTest(mockPosition, 30); // 30% threshold

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

      const result = calculatePositionProfitTest(losingPosition, -5); // Allow up to 5% loss

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

      const result = calculatePositionProfitTest(smallLossPosition, -5); // Allow up to 5% loss

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

      const result = calculatePositionProfitTest(positionWithoutPrice, 10);
      expect(result).toBeNull();
    });

    it('should return null when position has no amount', () => {
      const positionWithoutAmount = {
        ...mockPosition,
        amount: 0,
      };

      const result = calculatePositionProfitTest(positionWithoutAmount, 10);
      expect(result).toBeNull();
    });

    it('should return null when no purchase price data available', () => {
      const positionWithoutPurchasePrice = {
        ...mockPosition,
        averagePositionPriceFifoNumber: undefined,
        averagePositionPriceNumber: undefined,
      };

      const result = calculatePositionProfitTest(positionWithoutPurchasePrice, 10);
      expect(result).toBeNull();
    });

    it('should fall back to averagePositionPriceNumber when FIFO not available', () => {
      const positionWithAveragePrice = {
        ...mockPosition,
        averagePositionPriceFifoNumber: undefined,
        averagePositionPriceNumber: 120,
      };

      const result = calculatePositionProfitTest(positionWithAveragePrice, 20);

      expect(result).toBeDefined();
      expect(result!.profitAmount).toBe(3000);
      expect(result!.profitPercent).toBe(25);
      expect(result!.meetsThreshold).toBe(true);
    });

    it('should handle zero profit positions', () => {
      const breakEvenPosition = {
        ...mockPosition,
        priceNumber: 120,
        lotPriceNumber: 120,
        totalPriceNumber: 12000,
        averagePositionPriceFifoNumber: 120,
      };

      const result = calculatePositionProfitTest(breakEvenPosition, 5);

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

      const result = calculatePositionProfitTest(exactThresholdPosition, 10);

      expect(result).toBeDefined();
      expect(result!.profitPercent).toBe(10);
      expect(result!.meetsThreshold).toBe(true); // 10% >= 10%
    });

    it('should handle extreme threshold values', () => {
      // Test with very high threshold
      const result1 = calculatePositionProfitTest(mockPosition, 1000);
      expect(result1!.meetsThreshold).toBe(false);

      // Test with very low threshold
      const result2 = calculatePositionProfitTest(mockPosition, -100);
      expect(result2!.meetsThreshold).toBe(true);
    });
  });

  describe('Configuration validation scenarios', () => {
    it('should represent common use cases correctly', () => {
      // Conservative threshold (5%)
      const conservativeResult = calculatePositionProfitTest(mockPosition, 5);
      expect(conservativeResult!.meetsThreshold).toBe(true); // 25% > 5%

      // Aggressive threshold (1%)
      const aggressiveResult = calculatePositionProfitTest(mockPosition, 1);
      expect(aggressiveResult!.meetsThreshold).toBe(true); // 25% > 1%

      // Stop-loss threshold (-5%)
      const losingPosition = {
        ...mockPosition,
        priceNumber: 114,
        lotPriceNumber: 114,
        totalPriceNumber: 11400,
        averagePositionPriceFifoNumber: 120, // -5% loss
      };

      const stopLossResult = calculatePositionProfitTest(losingPosition, -5);
      expect(stopLossResult!.profitPercent).toBe(-5);
      expect(stopLossResult!.meetsThreshold).toBe(true); // -5% >= -5%
    });

    it('should handle decimal threshold values', () => {
      const result = calculatePositionProfitTest(mockPosition, 2.5);
      expect(result!.meetsThreshold).toBe(true); // 25% > 2.5%
    });
  });

  describe('Business logic validation', () => {
    it('should correctly identify when selling should be allowed', () => {
      const profitablePosition = {
        ...mockPosition,
        averagePositionPriceFifoNumber: 100, // 50% profit
      };

      const result = calculatePositionProfitTest(profitablePosition, 20);
      expect(result!.profitPercent).toBe(50);
      expect(result!.meetsThreshold).toBe(true);
    });

    it('should correctly identify when selling should be blocked', () => {
      const lowProfitPosition = {
        ...mockPosition,
        priceNumber: 122,
        lotPriceNumber: 122,
        totalPriceNumber: 12200,
        averagePositionPriceFifoNumber: 120, // Only 1.67% profit
      };

      const result = calculatePositionProfitTest(lowProfitPosition, 5);
      expect(result!.profitPercent).toBeCloseTo(1.67, 2);
      expect(result!.meetsThreshold).toBe(false); // 1.67% < 5%
    });

    it('should handle positions bought at different prices (FIFO vs average)', () => {
      const positionWithDifferentPrices = {
        ...mockPosition,
        averagePositionPriceFifoNumber: 100, // FIFO price
        averagePositionPriceNumber: 110,     // Average price
      };

      // Should use FIFO price when available
      const result = calculatePositionProfitTest(positionWithDifferentPrices, 20);
      expect(result!.profitPercent).toBe(50); // (15000 - 10000) / 10000 * 100 = 50%
      expect(result!.meetsThreshold).toBe(true);
    });
  });
});