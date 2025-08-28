import { describe, it, expect, beforeEach } from "bun:test";
import { MarginCalculator } from "../../utils/marginCalculator";
import { MarginConfig, Position, MarginPosition, MarginBalancingStrategy } from "../../types.d";
import { 
  TestEnvironment, 
  FinancialAssertions, 
  testSuite
} from '../test-utils';
import { createMockPosition } from '../__fixtures__/wallets';

testSuite('Margin Calculator Tests', () => {
  let marginCalculator: MarginCalculator;
  let defaultConfig: MarginConfig;
  let mockPortfolio: Position[];
  let mockMarginPositions: MarginPosition[];

  beforeEach(() => {
    defaultConfig = {
      enabled: true,
      multiplier: 2.0,
      freeThreshold: 10000,
      maxMarginSize: 100000,
      strategy: 'keep_if_small'
    };

    marginCalculator = new MarginCalculator(defaultConfig);

    mockPortfolio = [
      createMockPosition({
        base: 'TRUR',
        totalPriceNumber: 50000
      }),
      createMockPosition({
        base: 'TMOS',
        totalPriceNumber: 30000
      }),
      createMockPosition({
        base: 'RUB',
        totalPriceNumber: 20000
      })
    ];

    mockMarginPositions = [
      {
        ...createMockPosition({
          base: 'TRUR',
          totalPriceNumber: 25000
        }),
        isMargin: true,
        marginValue: 15000,
        leverage: 1.6,
        marginCall: false
      },
      {
        ...createMockPosition({
          base: 'TMOS',
          totalPriceNumber: 15000
        }),
        isMargin: true,
        marginValue: 8000,
        leverage: 1.8,
        marginCall: false
      }
    ];
  });

  describe('MarginCalculator Constructor', () => {
    it('should initialize with provided config', () => {
      const config: MarginConfig = {
        enabled: true,
        multiplier: 3.0,
        freeThreshold: 5000,
        maxMarginSize: 50000,
        strategy: 'remove'
      };

      const calculator = new MarginCalculator(config);
      expect(calculator).toBeDefined();
    });

    it('should work with minimal config', () => {
      const minimalConfig: MarginConfig = {
        enabled: true,
        multiplier: 1.5
      };

      const calculator = new MarginCalculator(minimalConfig);
      expect(calculator).toBeDefined();
    });
  });

  describe('calculateAvailableMargin', () => {
    it('should calculate available margin correctly', () => {
      const totalValue = 50000 + 30000 + 20000; // 100000
      const expectedMargin = totalValue * (defaultConfig.multiplier - 1); // 100000 * 1 = 100000

      const result = marginCalculator.calculateAvailableMargin(mockPortfolio);
      
      expect(result).toBe(expectedMargin);
    });

    it('should handle empty portfolio', () => {
      const result = marginCalculator.calculateAvailableMargin([]);
      
      expect(result).toBe(0);
    });

    it('should handle portfolio with zero values', () => {
      const zeroPortfolio = [
        createMockPosition({
          base: 'TRUR',
          totalPriceNumber: 0
        })
      ];

      const result = marginCalculator.calculateAvailableMargin(zeroPortfolio);
      
      expect(result).toBe(0);
    });

    it('should handle different multipliers', () => {
      const highMultiplierConfig: MarginConfig = {
        enabled: true,
        multiplier: 4.0
      };
      
      const calculator = new MarginCalculator(highMultiplierConfig);
      const totalValue = 100000;
      const expectedMargin = totalValue * 3; // (4 - 1) = 3

      const result = calculator.calculateAvailableMargin(mockPortfolio);
      
      expect(result).toBe(expectedMargin);
    });

    it('should handle positions with undefined totalPriceNumber', () => {
      const portfolioWithUndefined = [
        createMockPosition({
          base: 'TRUR',
          totalPriceNumber: undefined as any
        }),
        createMockPosition({
          base: 'TMOS',
          totalPriceNumber: 50000
        })
      ];

      const result = marginCalculator.calculateAvailableMargin(portfolioWithUndefined);
      
      expect(result).toBe(50000); // Only count the valid position
    });
  });

  describe('validateMarginLimits', () => {
    it('should validate margin limits correctly when within limits', () => {
      const result = marginCalculator.validateMarginLimits(mockMarginPositions);
      
      expect(result.isValid).toBe(true);
      expect(result.totalMarginUsed).toBe(23000); // 15000 + 8000
      expect(result.maxMarginAllowed).toBe(100000);
      expect(result.exceededAmount).toBeUndefined();
    });

    it('should detect when margin limits are exceeded', () => {
      const largeMarginPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 80000
          }),
          isMargin: true,
          marginValue: 70000,
          leverage: 2.0,
          marginCall: false
        },
        {
          ...createMockPosition({
            base: 'TMOS', 
            totalPriceNumber: 60000
          }),
          isMargin: true,
          marginValue: 50000,
          leverage: 2.0,
          marginCall: false
        }
      ];

      const result = marginCalculator.validateMarginLimits(largeMarginPositions);
      
      expect(result.isValid).toBe(false);
      expect(result.totalMarginUsed).toBe(120000); // 70000 + 50000
      expect(result.maxMarginAllowed).toBe(100000);
      expect(result.exceededAmount).toBe(20000); // 120000 - 100000
    });

    it('should use default max margin size if not configured', () => {
      const configWithoutMax: MarginConfig = {
        enabled: true,
        multiplier: 2.0
      };
      
      const calculator = new MarginCalculator(configWithoutMax);
      const result = calculator.validateMarginLimits(mockMarginPositions);
      
      expect(result.maxMarginAllowed).toBe(5000); // Default value
      expect(result.isValid).toBe(false); // 23000 > 5000
    });

    it('should handle empty margin positions', () => {
      const result = marginCalculator.validateMarginLimits([]);
      
      expect(result.isValid).toBe(true);
      expect(result.totalMarginUsed).toBe(0);
      expect(result.exceededAmount).toBeUndefined();
    });

    it('should handle positions with undefined marginValue', () => {
      const positionsWithUndefined: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 25000
          }),
          isMargin: true,
          marginValue: undefined as any,
          leverage: 1.6,
          marginCall: false
        }
      ];

      const result = marginCalculator.validateMarginLimits(positionsWithUndefined);
      
      expect(result.totalMarginUsed).toBe(0);
      expect(result.isValid).toBe(true);
    });
  });

  describe('checkMarginLimits', () => {
    it('should check margin limits and calculate risk levels', () => {
      const result = marginCalculator.checkMarginLimits(mockPortfolio, mockMarginPositions);
      
      expect(result.isValid).toBe(true);
      expect(result.availableMargin).toBe(100000); // Total value * (multiplier - 1)
      expect(result.usedMargin).toBe(23000); // Sum of margin values
      expect(result.remainingMargin).toBe(77000); // 100000 - 23000
      expect(result.riskLevel).toBe('low'); // 23% usage < 60%
    });

    it('should detect medium risk level', () => {
      const mediumRiskPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 40000
          }),
          isMargin: true,
          marginValue: 65000, // 65% of available margin
          leverage: 2.6,
          marginCall: false
        }
      ];

      const result = marginCalculator.checkMarginLimits(mockPortfolio, mediumRiskPositions);
      
      expect(result.riskLevel).toBe('medium'); // 65% usage > 60%
      expect(result.isValid).toBe(true);
    });

    it('should detect high risk level', () => {
      const highRiskPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 50000
          }),
          isMargin: true,
          marginValue: 85000, // 85% of available margin
          leverage: 2.7,
          marginCall: false
        }
      ];

      const result = marginCalculator.checkMarginLimits(mockPortfolio, highRiskPositions);
      
      expect(result.riskLevel).toBe('high'); // 85% usage > 80%
      expect(result.isValid).toBe(true);
    });

    it('should detect invalid margin usage', () => {
      const overLimitPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'TRUR',
            totalPriceNumber: 60000
          }),
          isMargin: true,
          marginValue: 110000, // Exceeds available margin
          leverage: 2.8,
          marginCall: false
        }
      ];

      const result = marginCalculator.checkMarginLimits(mockPortfolio, overLimitPositions);
      
      expect(result.isValid).toBe(false);
      expect(result.remainingMargin).toBe(-10000); // Negative remaining
      expect(result.riskLevel).toBe('high');
    });
  });

  describe('calculateTransferCost', () => {
    it('should calculate transfer costs correctly', () => {
      const result = marginCalculator.calculateTransferCost(mockMarginPositions);
      
      expect(result.totalCost).toBe(400); // 15000 * 0.01 + 8000 * 0.01 = 150 + 80 = 230, but positions > threshold
      expect(result.freeTransfers).toBe(0); // Both positions > 10000 threshold
      expect(result.paidTransfers).toBe(2);
      expect(result.costBreakdown).toHaveLength(2);
      
      expect(result.costBreakdown[0].ticker).toBe('TRUR');
      expect(result.costBreakdown[0].cost).toBe(250); // 25000 * 0.01
      expect(result.costBreakdown[0].isFree).toBe(false);
    });

    it('should identify free transfers under threshold', () => {
      const smallPositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'SMALL',
            totalPriceNumber: 5000
          }),
          isMargin: true,
          marginValue: 3000,
          leverage: 1.6,
          marginCall: false
        }
      ];

      const result = marginCalculator.calculateTransferCost(smallPositions);
      
      expect(result.totalCost).toBe(0);
      expect(result.freeTransfers).toBe(1);
      expect(result.paidTransfers).toBe(0);
      expect(result.costBreakdown[0].isFree).toBe(true);
    });

    it('should handle empty positions list', () => {
      const result = marginCalculator.calculateTransferCost([]);
      
      expect(result.totalCost).toBe(0);
      expect(result.freeTransfers).toBe(0);
      expect(result.paidTransfers).toBe(0);
      expect(result.costBreakdown).toHaveLength(0);
    });

    it('should handle positions with undefined values', () => {
      const positionsWithUndefined: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'UNDEFINED',
            totalPriceNumber: undefined as any
          }),
          isMargin: true,
          marginValue: 5000,
          leverage: 1.5,
          marginCall: false
        }
      ];

      const result = marginCalculator.calculateTransferCost(positionsWithUndefined);
      
      expect(result.totalCost).toBe(0);
      expect(result.freeTransfers).toBe(1); // 0 < threshold
      expect(result.costBreakdown[0].cost).toBe(0);
    });
  });

  describe('shouldApplyMarginStrategy', () => {
    it('should return true when close to market close', () => {
      const marketCloseTime = new Date();
      marketCloseTime.setHours(18, 30, 0, 0); // 18:30, 15 minutes before close

      const result = marginCalculator.shouldApplyMarginStrategy(
        marketCloseTime,
        60000 * 60, // 1 hour interval
        '18:45'
      );
      
      expect(result).toBe(true);
    });

    it('should return false when far from market close', () => {
      const earlyTime = new Date();
      earlyTime.setHours(10, 0, 0, 0); // 10:00 AM

      const result = marginCalculator.shouldApplyMarginStrategy(
        earlyTime,
        60000 * 60, // 1 hour interval
        '18:45'
      );
      
      expect(result).toBe(false);
    });

    it('should return true when next balance would be after market close', () => {
      const lateTime = new Date();
      lateTime.setHours(18, 0, 0, 0); // 18:00, 45 minutes before close but within balance interval

      const result = marginCalculator.shouldApplyMarginStrategy(
        lateTime,
        60000 * 60, // 1 hour interval (60 minutes)
        '18:45'
      );
      
      expect(result).toBe(true);
    });

    it('should return true after market close', () => {
      const afterClose = new Date();
      afterClose.setHours(19, 0, 0, 0); // 19:00, after market close

      const result = marginCalculator.shouldApplyMarginStrategy(
        afterClose,
        60000 * 60,
        '18:45'
      );
      
      expect(result).toBe(true);
    });

    it('should handle different market close times', () => {
      const testTime = new Date();
      testTime.setHours(15, 30, 0, 0);

      const result = marginCalculator.shouldApplyMarginStrategy(
        testTime,
        60000 * 60,
        '16:00' // Earlier close time
      );
      
      expect(result).toBe(true); // 30 minutes to close < 60 minute interval
    });
  });

  describe('applyMarginStrategy', () => {
    let testTime: Date;

    beforeEach(() => {
      testTime = new Date();
      testTime.setHours(18, 30, 0, 0); // 18:30, close to market close
    });

    it('should apply remove strategy', () => {
      const result = marginCalculator.applyMarginStrategy(
        mockMarginPositions,
        'remove',
        testTime,
        60000 * 60,
        '18:45'
      );
      
      expect(result.shouldRemoveMargin).toBe(true);
      expect(result.reason).toContain('remove margin at market close');
      expect(result.transferCost).toBeGreaterThan(0);
      expect(result.timeInfo.timeToClose).toBe(15);
      expect(result.timeInfo.isLastBalance).toBe(true);
    });

    it('should apply keep strategy', () => {
      const result = marginCalculator.applyMarginStrategy(
        mockMarginPositions,
        'keep',
        testTime,
        60000 * 60,
        '18:45'
      );
      
      expect(result.shouldRemoveMargin).toBe(false);
      expect(result.reason).toContain('keep margin');
      expect(result.transferCost).toBe(0);
    });

    it('should apply keep_if_small strategy when positions are small', () => {
      const result = marginCalculator.applyMarginStrategy(
        mockMarginPositions,
        'keep_if_small',
        testTime,
        60000 * 60,
        '18:45'
      );
      
      expect(result.shouldRemoveMargin).toBe(false); // Total 40000 < max 100000
      expect(result.reason).toContain('keep margin');
      expect(result.transferCost).toBe(0);
    });

    it('should apply keep_if_small strategy when positions are large', () => {
      const largePositions: MarginPosition[] = [
        {
          ...createMockPosition({
            base: 'LARGE',
            totalPriceNumber: 150000
          }),
          isMargin: true,
          marginValue: 80000,
          leverage: 2.0,
          marginCall: false
        }
      ];

      const result = marginCalculator.applyMarginStrategy(
        largePositions,
        'keep_if_small',
        testTime,
        60000 * 60,
        '18:45'
      );
      
      expect(result.shouldRemoveMargin).toBe(true); // Total 150000 > max 100000
      expect(result.reason).toContain('remove margin');
      expect(result.transferCost).toBeGreaterThan(0);
    });

    it('should not apply strategy when not time to apply', () => {
      const earlyTime = new Date();
      earlyTime.setHours(10, 0, 0, 0);

      const result = marginCalculator.applyMarginStrategy(
        mockMarginPositions,
        'remove',
        earlyTime,
        60000 * 60,
        '18:45'
      );
      
      expect(result.shouldRemoveMargin).toBe(false);
      expect(result.reason).toContain('Not time to apply');
      expect(result.transferCost).toBe(0);
    });

    it('should use config strategy when no strategy provided', () => {
      const configWithRemove: MarginConfig = {
        ...defaultConfig,
        strategy: 'remove'
      };
      
      const calculator = new MarginCalculator(configWithRemove);
      
      const result = calculator.applyMarginStrategy(
        mockMarginPositions,
        undefined, // No strategy provided
        testTime,
        60000 * 60,
        '18:45'
      );
      
      expect(result.shouldRemoveMargin).toBe(true);
      expect(result.reason).toContain('remove margin');
    });

    it('should handle unknown strategy', () => {
      const result = marginCalculator.applyMarginStrategy(
        mockMarginPositions,
        'unknown_strategy' as MarginBalancingStrategy,
        testTime,
        60000 * 60,
        '18:45'
      );
      
      expect(result.shouldRemoveMargin).toBe(false);
      expect(result.reason).toBe('Unknown strategy');
      expect(result.transferCost).toBe(0);
    });
  });

  describe('calculateOptimalPositionSizes', () => {
    it('should calculate optimal position sizes', () => {
      const desiredWallet = {
        TRUR: 40,
        TMOS: 30,
        TGLD: 20,
        RUB: 10
      };

      const result = marginCalculator.calculateOptimalPositionSizes(mockPortfolio, desiredWallet);
      
      expect(result.TRUR).toBeDefined();
      expect(result.TRUR.baseSize).toBe(40000); // 40% of 100000
      expect(result.TRUR.marginSize).toBe(40000); // Min of available margin * percentage and target * (multiplier - 1)
      expect(result.TRUR.totalSize).toBe(80000);
      
      expect(result.TMOS).toBeDefined();
      expect(result.TMOS.baseSize).toBe(30000);
      expect(result.TMOS.marginSize).toBe(30000);
      expect(result.TMOS.totalSize).toBe(60000);
    });

    it('should handle empty desired wallet', () => {
      const result = marginCalculator.calculateOptimalPositionSizes(mockPortfolio, {});
      
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should handle zero portfolio value', () => {
      const emptyPortfolio: Position[] = [];
      const desiredWallet = { TRUR: 100 };

      const result = marginCalculator.calculateOptimalPositionSizes(emptyPortfolio, desiredWallet);
      
      expect(result.TRUR.baseSize).toBe(0);
      expect(result.TRUR.marginSize).toBe(0);
      expect(result.TRUR.totalSize).toBe(0);
    });

    it('should limit margin size by available margin', () => {
      const smallPortfolio = [
        createMockPosition({
          base: 'TRUR',
          totalPriceNumber: 1000
        })
      ];
      
      const desiredWallet = { TRUR: 100 };

      const result = marginCalculator.calculateOptimalPositionSizes(smallPortfolio, desiredWallet);
      
      // Available margin is 1000 * 1 = 1000
      // Target value is 1000
      // Margin size should be min(1000, 1000) = 1000
      expect(result.TRUR.marginSize).toBe(1000);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete margin management workflow', () => {
      // Step 1: Check available margin
      const availableMargin = marginCalculator.calculateAvailableMargin(mockPortfolio);
      expect(availableMargin).toBeGreaterThan(0);

      // Step 2: Validate margin limits
      const validation = marginCalculator.validateMarginLimits(mockMarginPositions);
      expect(validation.isValid).toBe(true);

      // Step 3: Check margin limits and risk
      const limits = marginCalculator.checkMarginLimits(mockPortfolio, mockMarginPositions);
      expect(limits.isValid).toBe(true);

      // Step 4: Calculate transfer costs
      const transferCost = marginCalculator.calculateTransferCost(mockMarginPositions);
      expect(transferCost.totalCost).toBeGreaterThanOrEqual(0);

      // Step 5: Apply margin strategy
      const strategy = marginCalculator.applyMarginStrategy(mockMarginPositions);
      expect(strategy).toBeDefined();
    });

    it('should handle edge case scenarios', () => {
      const edgeCaseConfig: MarginConfig = {
        enabled: true,
        multiplier: 1.1, // Very low multiplier
        freeThreshold: 0,
        maxMarginSize: 10
      };

      const calculator = new MarginCalculator(edgeCaseConfig);
      
      const availableMargin = calculator.calculateAvailableMargin(mockPortfolio);
      expect(availableMargin).toBeCloseTo(10000, 5); // 100000 * 0.1, allowing for floating point precision

      const validation = calculator.validateMarginLimits(mockMarginPositions);
      expect(validation.isValid).toBe(false); // Will exceed low max margin size
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed position data', () => {
      const malformedPortfolio = [
        {
          base: undefined,
          totalPriceNumber: null
        } as any
      ];

      const result = marginCalculator.calculateAvailableMargin(malformedPortfolio);
      expect(result).toBe(0);
    });

    it('should handle extreme multiplier values', () => {
      const extremeConfig: MarginConfig = {
        enabled: true,
        multiplier: 100
      };

      const calculator = new MarginCalculator(extremeConfig);
      const result = calculator.calculateAvailableMargin(mockPortfolio);
      
      expect(result).toBe(9900000); // 100000 * 99
    });

    it('should handle negative values gracefully', () => {
      const negativePortfolio = [
        createMockPosition({
          base: 'NEGATIVE',
          totalPriceNumber: -50000
        })
      ];

      const result = marginCalculator.calculateAvailableMargin(negativePortfolio);
      expect(result).toBe(-50000); // Negative available margin
    });
  });
});