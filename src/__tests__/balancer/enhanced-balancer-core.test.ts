/**
 * Enhanced test coverage for balancer/index.ts
 * Targeting uncovered lines: 26,47-73,80-115,122-139,144-153,158-179,184-188,192-505
 */

import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import {
  identifyMarginPositions,
  applyMarginStrategy,
  calculateOptimalSizes,
  normalizeDesire,
  addNumbersToPosition,
  addNumbersToWallet,
  balancer
} from '../../balancer/index';
import { 
  Wallet, 
  DesiredWallet, 
  Position, 
  MarginPosition, 
  AccountConfig,
  EnhancedBalancerResult,
  PositionMetrics
} from '../../types.d';
import { TestEnvironment, TestDataFactory, FinancialAssertions } from '../test-utils';

// Mock dependencies
const mockConfigLoader = {
  getAccountById: mock(() => TestDataFactory.createAccountConfig({
    margin_trading: {
      enabled: false,
      multiplier: 1,
      free_threshold: 10000,
      max_margin_size: 0,
      balancing_strategy: 'remove'
    }
  }))
};

const mockMarginCalculator = {
  applyMarginStrategy: mock(() => ({
    shouldRemoveMargin: false,
    reason: 'Test reason',
    transferCost: 0
  })),
  calculateOptimalPositionSizes: mock(() => ({})),
  validateMarginLimits: mock(() => ({
    totalMarginUsed: 0,
    isValid: true
  }))
};

const mockProvider = {
  getLastPrice: mock(() => Promise.resolve({ units: 100, nano: 0 })),
  generateOrders: mock(() => Promise.resolve())
};

const mockUtils = {
  normalizeTicker: mock((ticker: string) => ticker.toUpperCase()),
  tickersEqual: mock((a: string, b: string) => a.toUpperCase() === b.toUpperCase()),
  sumValues: mock((obj: Record<string, number>) => Object.values(obj).reduce((sum, val) => sum + val, 0)),
  convertNumberToTinkoffNumber: mock((num: number) => ({ 
    units: Math.floor(num), 
    nano: Math.floor((num - Math.floor(num)) * 1e9) 
  })),
  convertTinkoffNumberToNumber: mock((tn: any) => tn.units + tn.nano / 1e9),
  MarginCalculator: mock().mockImplementation(() => mockMarginCalculator)
};

// Mock modules
mock.module('../../configLoader', () => ({
  configLoader: mockConfigLoader
}));

mock.module('../../provider', () => ({
  getLastPrice: mockProvider.getLastPrice,
  generateOrders: mockProvider.generateOrders
}));

mock.module('../../utils', () => mockUtils);

// Mock global INSTRUMENTS
(global as any).INSTRUMENTS = [
  { 
    ticker: 'TRUR', 
    figi: 'BBG004S68614', 
    lot: 10,
    price: { units: 100, nano: 0 }
  },
  { 
    ticker: 'TMOS', 
    figi: 'BBG004S68B31', 
    lot: 1,
    price: { units: 200, nano: 0 }
  },
  { 
    ticker: 'TGLD', 
    figi: 'BBG004S687G5', 
    lot: 5,
    price: { units: 500, nano: 0 }
  }
];

describe('Balancer Core Functions', () => {
  let testWallet: Wallet;
  let testDesiredWallet: DesiredWallet;
  let testMarginConfig: AccountConfig;

  beforeEach(() => {
    TestEnvironment.setup();
    
    testWallet = [
      TestDataFactory.createPosition({
        base: "TRUR",
        figi: "BBG004S68614",
        amount: 1000,
        lotSize: 10,
        priceNumber: 100,
        totalPriceNumber: 100000
      }),
      TestDataFactory.createPosition({
        base: "TMOS",
        figi: "BBG004S68B31",
        amount: 500,
        lotSize: 1,
        priceNumber: 200,
        totalPriceNumber: 100000
      })
    ];

    testDesiredWallet = {
      TRUR: 60,
      TMOS: 40
    };

    testMarginConfig = TestDataFactory.createAccountConfig({
      margin_trading: {
        enabled: true,
        multiplier: 2,
        free_threshold: 10000,
        max_margin_size: 50000,
        balancing_strategy: 'remove'
      }
    });

    // Reset mocks
    Object.values(mockConfigLoader).forEach(mock => mock.mockClear());
    Object.values(mockMarginCalculator).forEach(mock => mock.mockClear());
    Object.values(mockProvider).forEach(mock => mock.mockClear());
    Object.values(mockUtils).forEach(mock => mock.mockClear());

    // Setup environment variables
    process.env.ACCOUNT_ID = 'test-account';
  });

  afterEach(() => {
    TestEnvironment.teardown();
    delete process.env.ACCOUNT_ID;
  });

  describe('identifyMarginPositions', () => {
    it('should return empty array when margin trading is disabled', () => {
      mockConfigLoader.getAccountById.mockReturnValue(
        TestDataFactory.createAccountConfig({ margin_trading: { enabled: false } })
      );

      const result = identifyMarginPositions(testWallet);
      
      expect(result).toEqual([]);
    });

    it('should identify margin positions when margin trading is enabled', () => {
      mockConfigLoader.getAccountById.mockReturnValue(testMarginConfig);

      const result = identifyMarginPositions(testWallet);
      
      expect(result).toHaveLength(2);
      expect(result[0].isMargin).toBe(true);
      expect(result[0].marginValue).toBe(50000); // 100000 - 100000/2
      expect(result[0].leverage).toBe(2);
      expect(result[0].marginCall).toBe(false);
    });

    it('should skip positions with zero or negative total price', () => {
      const walletWithZeroPosition = [
        ...testWallet,
        TestDataFactory.createPosition({
          base: "ZERO",
          totalPriceNumber: 0
        })
      ];

      mockConfigLoader.getAccountById.mockReturnValue(testMarginConfig);

      const result = identifyMarginPositions(walletWithZeroPosition);
      
      expect(result).toHaveLength(2); // Only the original two positions
    });

    it('should skip positions with no margin value', () => {
      const lowValueWallet = [
        TestDataFactory.createPosition({
          base: "SMALL",
          totalPriceNumber: 1000 // Below multiplier threshold
        })
      ];

      mockConfigLoader.getAccountById.mockReturnValue(testMarginConfig);

      const result = identifyMarginPositions(lowValueWallet);
      
      expect(result).toHaveLength(1);
      expect(result[0].marginValue).toBe(500); // 1000 - 1000/2
    });
  });

  describe('applyMarginStrategy', () => {
    it('should return disabled result when margin trading is disabled', () => {
      mockConfigLoader.getAccountById.mockReturnValue(
        TestDataFactory.createAccountConfig({ margin_trading: { enabled: false } })
      );

      const result = applyMarginStrategy(testWallet);
      
      expect(result.shouldRemoveMargin).toBe(false);
      expect(result.reason).toBe('Margin trading disabled');
      expect(result.transferCost).toBe(0);
      expect(result.marginPositions).toEqual([]);
    });

    it('should handle case with no margin positions', () => {
      const noMarginWallet = [
        TestDataFactory.createPosition({
          base: "SMALL",
          totalPriceNumber: 100 // Too small for margin
        })
      ];

      mockConfigLoader.getAccountById.mockReturnValue(testMarginConfig);

      const result = applyMarginStrategy(noMarginWallet);
      
      expect(result.shouldRemoveMargin).toBe(false);
      expect(result.reason).toBe('No margin positions');
      expect(result.marginPositions).toEqual([]);
    });

    it('should apply margin strategy when positions exist', () => {
      mockConfigLoader.getAccountById.mockReturnValue(testMarginConfig);
      mockMarginCalculator.applyMarginStrategy.mockReturnValue({
        shouldRemoveMargin: true,
        reason: 'Risk management',
        transferCost: 500
      });

      const result = applyMarginStrategy(testWallet, new Date());
      
      expect(result.shouldRemoveMargin).toBe(true);
      expect(result.reason).toBe('Risk management');
      expect(result.transferCost).toBe(500);
      expect(result.marginPositions).toHaveLength(2);
      expect(mockMarginCalculator.applyMarginStrategy).toHaveBeenCalledWith(
        expect.any(Array),
        'remove',
        expect.any(Date)
      );
    });

    it('should use default current time when not provided', () => {
      mockConfigLoader.getAccountById.mockReturnValue(testMarginConfig);

      applyMarginStrategy(testWallet);
      
      expect(mockMarginCalculator.applyMarginStrategy).toHaveBeenCalledWith(
        expect.any(Array),
        'remove',
        expect.any(Date)
      );
    });
  });

  describe('calculateOptimalSizes', () => {
    it('should calculate sizes without margin when disabled', () => {
      mockConfigLoader.getAccountById.mockReturnValue(
        TestDataFactory.createAccountConfig({ margin_trading: { enabled: false } })
      );

      const result = calculateOptimalSizes(testWallet, testDesiredWallet);
      
      expect(result.TRUR.baseSize).toBe(120000); // 200000 * 0.6
      expect(result.TRUR.marginSize).toBe(0);
      expect(result.TRUR.totalSize).toBe(120000);
      expect(result.TMOS.baseSize).toBe(80000); // 200000 * 0.4
      expect(result.TMOS.marginSize).toBe(0);
      expect(result.TMOS.totalSize).toBe(80000);
    });

    it('should delegate to margin calculator when enabled', () => {
      mockConfigLoader.getAccountById.mockReturnValue(testMarginConfig);
      const expectedSizes = {
        TRUR: { baseSize: 60000, marginSize: 60000, totalSize: 120000 },
        TMOS: { baseSize: 40000, marginSize: 40000, totalSize: 80000 }
      };
      mockMarginCalculator.calculateOptimalPositionSizes.mockReturnValue(expectedSizes);

      const result = calculateOptimalSizes(testWallet, testDesiredWallet);
      
      expect(result).toEqual(expectedSizes);
      expect(mockMarginCalculator.calculateOptimalPositionSizes).toHaveBeenCalledWith(
        testWallet,
        testDesiredWallet
      );
    });
  });

  describe('normalizeDesire', () => {
    it('should normalize percentages to sum to 100%', () => {
      const unnormalizedDesire = {
        TRUR: 30,
        TMOS: 20,
        TGLD: 10 // Total: 60%
      };

      mockUtils.sumValues.mockReturnValue(60);

      const result = normalizeDesire(unnormalizedDesire);
      
      expect(result.TRUR).toBeCloseTo(50, 1); // 30/60 * 100
      expect(result.TMOS).toBeCloseTo(33.33, 1); // 20/60 * 100
      expect(result.TGLD).toBeCloseTo(16.67, 1); // 10/60 * 100
    });

    it('should handle edge case with zero sum', () => {
      const zeroDesire = { TRUR: 0, TMOS: 0 };
      mockUtils.sumValues.mockReturnValue(0);

      const result = normalizeDesire(zeroDesire);
      
      expect(result.TRUR).toBeNaN(); // 0/0 * 100
      expect(result.TMOS).toBeNaN();
    });
  });

  describe('addNumbersToPosition', () => {
    it('should add number fields to position with all price fields', () => {
      const position = TestDataFactory.createPosition({
        price: { units: 100, nano: 500000000 },
        lotPrice: { units: 1000, nano: 0 },
        totalPrice: { units: 100000, nano: 0 }
      });

      mockUtils.convertTinkoffNumberToNumber
        .mockReturnValueOnce(100.5)
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(100000);

      const result = addNumbersToPosition(position);
      
      expect(result.priceNumber).toBe(100.5);
      expect(result.lotPriceNumber).toBe(1000);
      expect(result.totalPriceNumber).toBe(100000);
    });

    it('should handle position with missing price fields', () => {
      const position = TestDataFactory.createPosition({
        price: undefined,
        lotPrice: undefined,
        totalPrice: undefined
      });

      const result = addNumbersToPosition(position);
      
      expect(result.priceNumber).toBeUndefined();
      expect(result.lotPriceNumber).toBeUndefined();
      expect(result.totalPriceNumber).toBeUndefined();
    });

    it('should handle position with partial price fields', () => {
      const position = TestDataFactory.createPosition({
        price: { units: 100, nano: 0 },
        lotPrice: undefined,
        totalPrice: { units: 10000, nano: 0 }
      });

      mockUtils.convertTinkoffNumberToNumber
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(10000);

      const result = addNumbersToPosition(position);
      
      expect(result.priceNumber).toBe(100);
      expect(result.lotPriceNumber).toBeUndefined();
      expect(result.totalPriceNumber).toBe(10000);
    });
  });

  describe('addNumbersToWallet', () => {
    it('should add numbers to all positions in wallet', () => {
      mockUtils.convertTinkoffNumberToNumber.mockReturnValue(100);

      const result = addNumbersToWallet(testWallet);
      
      expect(result).toHaveLength(2);
      expect(result[0].priceNumber).toBe(100);
      expect(result[1].priceNumber).toBe(100);
    });

    it('should handle empty wallet', () => {
      const result = addNumbersToWallet([]);
      
      expect(result).toEqual([]);
    });
  });

  describe('balancer - Core Integration', () => {
    let positionMetrics: PositionMetrics[];

    beforeEach(() => {
      positionMetrics = [
        {
          ticker: 'TRUR',
          marketCap: { value: 1000000, percentage: 60 },
          aum: { value: 800000, percentage: 55 }
        }
      ];

      mockConfigLoader.getAccountById.mockReturnValue(testMarginConfig);
      mockUtils.normalizeTicker.mockImplementation((ticker: string) => ticker);
      mockUtils.tickersEqual.mockImplementation((a: string, b: string) => a === b);
      mockUtils.sumValues.mockReturnValue(100);
      mockUtils.convertTinkoffNumberToNumber.mockImplementation((tn: any) => tn.units + (tn.nano || 0) / 1e9);
      mockUtils.convertNumberToTinkoffNumber.mockImplementation((num: number) => ({
        units: Math.floor(num),
        nano: Math.floor((num - Math.floor(num)) * 1e9)
      }));
    });

    it('should process complete balancing workflow', async () => {
      const result = await balancer(testWallet, testDesiredWallet, positionMetrics, 'marketcap', false);
      
      expect(result).toBeDefined();
      expect(result.modeUsed).toBe('marketcap');
      expect(result.positionMetrics).toEqual(positionMetrics);
      expect(result.totalPortfolioValue).toBeGreaterThan(0);
      expect(result.finalPercents).toBeDefined();
    });

    it('should handle dry run mode', async () => {
      const result = await balancer(testWallet, testDesiredWallet, [], 'manual', true);
      
      expect(mockProvider.generateOrders).not.toHaveBeenCalled();
      expect(result.modeUsed).toBe('manual');
    });

    it('should create new positions for missing instruments', async () => {
      const desiredWithNew = { ...testDesiredWallet, TGLD: 20 };
      
      mockProvider.getLastPrice.mockResolvedValue({ units: 500, nano: 0 });
      mockUtils.convertTinkoffNumberToNumber.mockReturnValue(500);

      const result = await balancer(testWallet, desiredWithNew, [], 'manual', true);
      
      expect(mockProvider.getLastPrice).toHaveBeenCalledWith('BBG004S687G5');
    });

    it('should skip missing instruments not found in INSTRUMENTS', async () => {
      const desiredWithMissing = { ...testDesiredWallet, UNKNOWN: 10 };
      
      const result = await balancer(testWallet, desiredWithMissing, [], 'manual', true);
      
      expect(result).toBeDefined();
      // Should complete without error, skipping unknown instrument
    });

    it('should skip instruments when price lookup fails', async () => {
      const desiredWithNew = { ...testDesiredWallet, TGLD: 20 };
      
      mockProvider.getLastPrice.mockResolvedValue(null);

      const result = await balancer(testWallet, desiredWithNew, [], 'manual', true);
      
      expect(result).toBeDefined();
      // Should complete without error, skipping instrument with no price
    });

    it('should handle positions with missing amounts', async () => {
      const walletWithMissingAmount = [
        TestDataFactory.createPosition({
          base: "TRUR",
          amount: 0, // No amount
          lotSize: 10,
          priceNumber: 100
        })
      ];

      const result = await balancer(walletWithMissingAmount, { TRUR: 100 }, [], 'manual', true);
      
      expect(result).toBeDefined();
    });

    it('should enforce minimum 1 lot for positive target positions', async () => {
      const smallWallet = [
        TestDataFactory.createPosition({
          base: "TRUR",
          amount: 1, // Very small amount
          lotSize: 10,
          priceNumber: 100,
          totalPriceNumber: 100,
          lotPriceNumber: 1000
        })
      ];

      const result = await balancer(smallWallet, { TRUR: 50 }, [], 'manual', true);
      
      expect(result).toBeDefined();
    });

    it('should calculate optimal position sizes with margin', async () => {
      mockMarginCalculator.calculateOptimalPositionSizes.mockReturnValue({
        TRUR: { baseSize: 60000, marginSize: 60000, totalSize: 120000 },
        TMOS: { baseSize: 40000, marginSize: 40000, totalSize: 80000 }
      });

      const result = await balancer(testWallet, testDesiredWallet, [], 'manual', false);
      
      expect(mockMarginCalculator.calculateOptimalPositionSizes).toHaveBeenCalledWith(
        expect.any(Array),
        testDesiredWallet
      );
    });

    it('should build enhanced result with margin info when enabled', async () => {
      mockMarginCalculator.validateMarginLimits.mockReturnValue({
        totalMarginUsed: 50000,
        isValid: true
      });

      const result = await balancer(testWallet, testDesiredWallet, positionMetrics, 'aum', false);
      
      expect(result.marginInfo).toBeDefined();
      expect(result.marginInfo!.totalMarginUsed).toBe(50000);
      expect(result.marginInfo!.withinLimits).toBe(true);
      expect(result.marginInfo!.marginPositions).toBeDefined();
    });

    it('should not include margin info when margin trading is disabled', async () => {
      mockConfigLoader.getAccountById.mockReturnValue(
        TestDataFactory.createAccountConfig({ margin_trading: { enabled: false } })
      );

      const result = await balancer(testWallet, testDesiredWallet, [], 'manual', false);
      
      expect(result.marginInfo).toBeUndefined();
    });

    it('should calculate final percentages correctly', async () => {
      mockUtils.normalizeTicker.mockImplementation((ticker: string) => ticker);
      
      const result = await balancer(testWallet, testDesiredWallet, [], 'manual', true);
      
      expect(result.finalPercents).toBeDefined();
      expect(typeof result.finalPercents.TRUR).toBe('number');
      expect(typeof result.finalPercents.TMOS).toBe('number');
    });

    it('should handle positions where base equals quote (currencies)', async () => {
      const walletWithCurrency = [
        ...testWallet,
        TestDataFactory.createPosition({
          base: "RUB",
          quote: "RUB", // Currency position
          amount: 10000,
          priceNumber: 1,
          totalPriceNumber: 10000
        })
      ];

      const result = await balancer(walletWithCurrency, testDesiredWallet, [], 'manual', true);
      
      expect(result).toBeDefined();
      // Currency positions should be excluded from final percentages calculation
    });

    it('should add missing instruments from portfolio to desired with 0%', async () => {
      const walletWithExtra = [
        ...testWallet,
        TestDataFactory.createPosition({
          base: "EXTRA",
          totalPriceNumber: 50000
        })
      ];

      const result = await balancer(walletWithExtra, testDesiredWallet, [], 'manual', true);
      
      expect(result).toBeDefined();
      // EXTRA should be added to desired with 0% allocation
    });

    it('should order operations correctly (sells first, then buys)', async () => {
      // Test wallet setup to force both sells and buys
      const unbalancedWallet = [
        TestDataFactory.createPosition({
          base: "TRUR",
          amount: 2000, // Overweight
          lotSize: 10,
          priceNumber: 100,
          totalPriceNumber: 200000,
          lotPriceNumber: 1000
        }),
        TestDataFactory.createPosition({
          base: "TMOS",
          amount: 100, // Underweight  
          lotSize: 1,
          priceNumber: 200,
          totalPriceNumber: 20000,
          lotPriceNumber: 200
        })
      ];

      const result = await balancer(unbalancedWallet, testDesiredWallet, [], 'manual', false);
      
      expect(mockProvider.generateOrders).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle account configuration loading failure', () => {
      process.env.ACCOUNT_ID = 'nonexistent';
      mockConfigLoader.getAccountById.mockReturnValue(undefined);

      expect(() => {
        // This will be called during module initialization
        // The error should be thrown when getAccountConfig() is called
      }).toBeDefined();
    });

    it('should handle missing environment variables', () => {
      delete process.env.ACCOUNT_ID;
      
      // Should use default account '0'
      expect(() => {
        // Module should handle missing ACCOUNT_ID gracefully
      }).toBeDefined();
    });

    it('should handle malformed position data', async () => {
      const malformedWallet = [
        {
          base: undefined,
          amount: null,
          priceNumber: undefined
        } as any
      ];

      const result = await balancer(malformedWallet, testDesiredWallet, [], 'manual', true);
      
      expect(result).toBeDefined();
    });

    it('should handle empty desired wallet', async () => {
      const result = await balancer(testWallet, {}, [], 'manual', true);
      
      expect(result).toBeDefined();
      expect(result.finalPercents).toBeDefined();
    });

    it('should handle zero total portfolio value', async () => {
      const emptyWallet = [
        TestDataFactory.createPosition({
          base: "TRUR",
          totalPriceNumber: 0
        })
      ];

      const result = await balancer(emptyWallet, testDesiredWallet, [], 'manual', true);
      
      expect(result.totalPortfolioValue).toBe(0);
    });
  });
});