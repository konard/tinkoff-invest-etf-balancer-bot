import { describe, it, expect, beforeEach } from 'bun:test';
import { 
  identifyProfitablePositions,
  calculateRequiredFunds,
  calculateSellingAmounts,
  calculatePositionProfit
} from '../utils/buyRequiresTotalMarginalSell';
import { Position, BuyRequiresTotalMarginalSellConfig } from '../types.d';

describe('buy_requires_total_marginal_sell Edge Cases and Boundary Tests', () => {
  let baseConfig: BuyRequiresTotalMarginalSellConfig;

  beforeEach(() => {
    baseConfig = {
      enabled: true,
      instruments: ['TMON'],
      allow_to_sell_others_positions_to_buy_non_marginal_positions: {
        mode: 'only_positive_positions_sell'
      },
      min_buy_rebalance_percent: 0.5
    };
  });

  describe('1. Empty and Null Data Edge Cases', () => {
    it('should handle empty wallet', () => {
      const emptyWallet: Position[] = [];
      const desiredWallet = { TMON: 100 };
      
      const requiredFunds = calculateRequiredFunds(emptyWallet, desiredWallet, baseConfig);
      expect(Object.keys(requiredFunds)).toHaveLength(0);
      
      const profitablePositions = identifyProfitablePositions(emptyWallet, baseConfig);
      expect(profitablePositions).toHaveLength(0);
    });

    it('should handle empty desired wallet', () => {
      const wallet: Position[] = [{
        pair: 'TPAY/RUB',
        base: 'TPAY',
        quote: 'RUB',
        amount: 10,
        lotSize: 1,
        totalPriceNumber: 1000,
        priceNumber: 100,
        lotPriceNumber: 100
      }];
      
      const emptyDesired = {};
      
      const requiredFunds = calculateRequiredFunds(wallet, emptyDesired, baseConfig);
      expect(Object.keys(requiredFunds)).toHaveLength(0);
    });

    it('should handle positions with undefined/null values', () => {
      const walletWithNulls: Position[] = [{
        pair: 'TEST/RUB',
        base: 'TEST',
        quote: 'RUB',
        amount: undefined as any,
        lotSize: 1,
        totalPriceNumber: undefined as any,
        priceNumber: undefined as any,
        lotPriceNumber: undefined as any
      }];
      
      const profit = calculatePositionProfit(walletWithNulls[0]);
      expect(profit).toBeNull();
      
      const profitablePositions = identifyProfitablePositions(walletWithNulls, baseConfig);
      expect(profitablePositions).toHaveLength(0);
    });

    it('should handle positions with zero lot size', () => {
      const zeroLotSizeWallet: Position[] = [{
        pair: 'TEST/RUB',
        base: 'TEST',
        quote: 'RUB',
        amount: 10,
        lotSize: 0, // Zero lot size
        totalPriceNumber: 1000,
        priceNumber: 100,
        lotPriceNumber: 100,
        averagePositionPriceFifoNumber: 90
      }];
      
      const profit = calculatePositionProfit(zeroLotSizeWallet[0]);
      expect(profit).not.toBeNull(); // Should still calculate profit
      
      const profitablePositions = identifyProfitablePositions(zeroLotSizeWallet, baseConfig);
      expect(profitablePositions).toHaveLength(1);
    });
  });

  describe('2. Extreme Numerical Values', () => {
    it('should handle very large position values', () => {
      const largeValueWallet: Position[] = [{
        pair: 'LARGE/RUB',
        base: 'LARGE',
        quote: 'RUB',
        amount: 1000000,
        lotSize: 1,
        totalPriceNumber: 1000000000, // 1 billion RUB
        priceNumber: 1000,
        lotPriceNumber: 1000,
        averagePositionPriceFifoNumber: 900
      }];
      
      const profit = calculatePositionProfit(largeValueWallet[0]);
      expect(profit).not.toBeNull();
      expect(profit!.profitAmount).toBe(100000000); // 100 million profit
      
      const sellingPlan = calculateSellingAmounts(
        largeValueWallet,
        { TMON: 500000000 }, // Need 500 million
        'only_positive_positions_sell',
        0
      );
      
      expect(Object.keys(sellingPlan)).toHaveLength(1);
      expect(sellingPlan['LARGE'].sellAmount).toBeGreaterThan(0);
    });

    it('should handle very small position values', () => {
      const smallValueWallet: Position[] = [{
        pair: 'SMALL/RUB',
        base: 'SMALL',
        quote: 'RUB',
        amount: 1,
        lotSize: 1,
        totalPriceNumber: 0.01, // 1 kopeck
        priceNumber: 0.01,
        lotPriceNumber: 0.01,
        averagePositionPriceFifoNumber: 0.005
      }];
      
      const profit = calculatePositionProfit(smallValueWallet[0]);
      expect(profit).not.toBeNull();
      expect(profit!.profitAmount).toBe(0.005); // Half kopeck profit
      
      const sellingPlan = calculateSellingAmounts(
        smallValueWallet,
        { TMON: 0.001 }, // Need very small amount
        'only_positive_positions_sell',
        0
      );
      
      expect(Object.keys(sellingPlan)).toHaveLength(1);
    });

    it('should handle negative prices (edge case)', () => {
      const negativePriceWallet: Position[] = [{
        pair: 'NEGATIVE/RUB',
        base: 'NEGATIVE',
        quote: 'RUB',
        amount: 10,
        lotSize: 1,
        totalPriceNumber: -100, // Negative total price
        priceNumber: -10,
        lotPriceNumber: -10,
        averagePositionPriceFifoNumber: -15
      }];
      
      const profit = calculatePositionProfit(negativePriceWallet[0]);
      expect(profit).toBeNull(); // Should not consider negative positions as profitable
      
      const profitablePositions = identifyProfitablePositions(negativePriceWallet, baseConfig);
      expect(profitablePositions).toHaveLength(0);
    });
  });

  describe('3. Precision and Rounding Edge Cases', () => {
    it('should handle floating point precision issues', () => {
      const precisionWallet: Position[] = [{
        pair: 'PRECISION/RUB',
        base: 'PRECISION',
        quote: 'RUB',
        amount: 3,
        lotSize: 1,
        totalPriceNumber: 10.000000000001, // Floating point precision issue
        priceNumber: 3.333333333334,
        lotPriceNumber: 3.333333333334,
        averagePositionPriceFifoNumber: 3.333333333333
      }];
      
      const profit = calculatePositionProfit(precisionWallet[0]);
      expect(profit).not.toBeNull();
      
      // Should handle tiny differences gracefully
      expect(profit!.profitAmount).toBeCloseTo(0.000000000003, 10);
    });

    it('should handle lot calculations with fractional results', () => {
      const fractionalWallet: Position[] = [{
        pair: 'FRAC/RUB',
        base: 'FRAC',
        quote: 'RUB',
        amount: 7,
        lotSize: 1,
        totalPriceNumber: 333.33,
        priceNumber: 47.619,
        lotPriceNumber: 47.619,
        averagePositionPriceFifoNumber: 40.0
      }];
      
      const sellingPlan = calculateSellingAmounts(
        fractionalWallet,
        { TMON: 100.50 }, // Amount that doesn't divide evenly
        'only_positive_positions_sell',
        0
      );
      
      expect(Object.keys(sellingPlan)).toHaveLength(1);
      
      // Should handle fractional lot calculations properly
      const plan = sellingPlan['FRAC'];
      expect(plan.sellLots).toBeGreaterThan(0);
      expect(plan.sellLots).toBeLessThanOrEqual(7); // Cannot sell more than available
    });

    it('should handle threshold calculations near boundaries', () => {
      // Create a wallet with known total value
      const boundaryWallet: Position[] = [
        {
          pair: 'TMON/RUB',
          base: 'TMON',
          quote: 'RUB',
          amount: 0,
          lotSize: 1,
          totalPriceNumber: 0,
          toBuyNumber: 49.999999, // Just under 50 RUB
          toBuyLots: 0.5
        },
        {
          pair: 'OTHER/RUB',
          base: 'OTHER',
          quote: 'RUB',
          amount: 10,
          lotSize: 1,
          totalPriceNumber: 1000, // This gives us total portfolio value of 1000
          priceNumber: 100,
          lotPriceNumber: 100
        }
      ];
      
      // Portfolio value = 1000, threshold = 5% = 50 RUB
      const config = { ...baseConfig, min_buy_rebalance_percent: 5.0 };
      
      const requiredFunds = calculateRequiredFunds(boundaryWallet, { TMON: 5 }, config);
      
      // 49.999999 should be below 50 RUB threshold
      expect(Object.keys(requiredFunds)).toHaveLength(0);
      
      // Now test just above threshold
      boundaryWallet[0].toBuyNumber = 50.000001;
      const requiredFundsAbove = calculateRequiredFunds(boundaryWallet, { TMON: 5 }, config);
      expect(requiredFundsAbove).toHaveProperty('TMON');
    });
  });

  describe('4. Configuration Edge Cases', () => {
    it('should handle instruments list with special characters', () => {
      const specialConfig = {
        ...baseConfig,
        instruments: ['T-MON@', 'ETF_123', 'FUND.A', 'TEST@@@']
      };
      
      const wallet: Position[] = [{
        pair: 'T-MON@/RUB',
        base: 'T-MON@',
        quote: 'RUB',
        amount: 0,
        lotSize: 1,
        totalPriceNumber: 0,
        toBuyNumber: 100,
        toBuyLots: 1
      }];
      
      const requiredFunds = calculateRequiredFunds(wallet, { 'T-MON@': 10 }, specialConfig);
      expect(requiredFunds).toHaveProperty('T-MON@');
    });

    it('should handle very long instruments list', () => {
      const longInstrumentsList = Array.from({ length: 1000 }, (_, i) => `INSTRUMENT_${i}`);
      const longConfig = {
        ...baseConfig,
        instruments: longInstrumentsList
      };
      
      const wallet: Position[] = [{
        pair: 'INSTRUMENT_500/RUB',
        base: 'INSTRUMENT_500',
        quote: 'RUB',
        amount: 0,
        lotSize: 1,
        totalPriceNumber: 0,
        toBuyNumber: 100,
        toBuyLots: 1
      }];
      
      const requiredFunds = calculateRequiredFunds(wallet, { INSTRUMENT_500: 10 }, longConfig);
      expect(requiredFunds).toHaveProperty('INSTRUMENT_500');
    });

    it('should handle extreme threshold values', () => {
      const extremeConfigs = [
        { ...baseConfig, min_buy_rebalance_percent: 0.000001 }, // Extremely low
        { ...baseConfig, min_buy_rebalance_percent: 999999.999 }, // Extremely high
        { ...baseConfig, min_buy_rebalance_percent: Number.MAX_SAFE_INTEGER }
      ];
      
      const wallet: Position[] = [
        {
          pair: 'TMON/RUB',
          base: 'TMON',
          quote: 'RUB',
          amount: 0,
          lotSize: 1,
          totalPriceNumber: 0,
          toBuyNumber: 100,
          toBuyLots: 1
        },
        {
          pair: 'OTHER/RUB',
          base: 'OTHER',
          quote: 'RUB',
          amount: 10,
          lotSize: 1,
          totalPriceNumber: 1000, // Portfolio value for threshold calculation
          priceNumber: 100,
          lotPriceNumber: 100
        }
      ];
      
      extremeConfigs.forEach((config, index) => {
        const requiredFunds = calculateRequiredFunds(wallet, { TMON: 10 }, config);
        
        if (index === 0) {
          // Extremely low threshold - should allow purchase (100 RUB > 0.000001% of 1000)
          expect(requiredFunds).toHaveProperty('TMON');
        } else {
          // Extremely high threshold - should block purchase (100 RUB < 999999% of 1000)
          expect(Object.keys(requiredFunds)).toHaveLength(0);
        }
      });
    });
  });

  describe('5. Selling Strategy Edge Cases', () => {
    it('should handle equal_in_percents with identical position values', () => {
      const identicalWallet: Position[] = [
        {
          pair: 'IDENTICAL1/RUB',
          base: 'IDENTICAL1',
          quote: 'RUB',
          amount: 10,
          lotSize: 1,
          totalPriceNumber: 1000,
          priceNumber: 100,
          lotPriceNumber: 100
        },
        {
          pair: 'IDENTICAL2/RUB',
          base: 'IDENTICAL2',
          quote: 'RUB',
          amount: 10,
          lotSize: 1,
          totalPriceNumber: 1000,
          priceNumber: 100,
          lotPriceNumber: 100
        }
      ];
      
      const sellingPlan = calculateSellingAmounts(
        identicalWallet,
        { TMON: 1000 },
        'equal_in_percents',
        0
      );
      
      expect(Object.keys(sellingPlan)).toHaveLength(2);
      
      // Should distribute equally between identical positions
      const plan1 = sellingPlan['IDENTICAL1'];
      const plan2 = sellingPlan['IDENTICAL2'];
      
      expect(Math.abs(plan1.sellAmount - plan2.sellAmount)).toBeLessThan(1); // Should be nearly equal
    });

    it('should handle selling more than total available value', () => {
      const limitedWallet: Position[] = [{
        pair: 'LIMITED/RUB',
        base: 'LIMITED',
        quote: 'RUB',
        amount: 1,
        lotSize: 1,
        totalPriceNumber: 100,
        priceNumber: 100,
        lotPriceNumber: 100
      }];
      
      const sellingPlan = calculateSellingAmounts(
        limitedWallet,
        { TMON: 10000 }, // Need much more than available
        'only_positive_positions_sell',
        0
      );
      
      expect(Object.keys(sellingPlan)).toHaveLength(1);
      
      const plan = sellingPlan['LIMITED'];
      expect(plan.sellAmount).toBeLessThanOrEqual(100); // Cannot exceed available
      expect(plan.sellLots).toBeLessThanOrEqual(1);
    });

    it('should handle positions with zero lot price', () => {
      const zeroLotPriceWallet: Position[] = [{
        pair: 'ZEROPRICE/RUB',
        base: 'ZEROPRICE',
        quote: 'RUB',
        amount: 10,
        lotSize: 1,
        totalPriceNumber: 100,
        priceNumber: 0, // Zero price
        lotPriceNumber: 0
      }];
      
      const sellingPlan = calculateSellingAmounts(
        zeroLotPriceWallet,
        { TMON: 50 },
        'only_positive_positions_sell',
        0
      );
      
      // Should handle zero lot price gracefully (likely skip this position)
      expect(sellingPlan['ZEROPRICE']).toBeUndefined();
    });
  });

  describe('6. RUB Balance Edge Cases', () => {
    it('should handle very large negative RUB balance', () => {
      const wallet: Position[] = [{
        pair: 'TPAY/RUB',
        base: 'TPAY',
        quote: 'RUB',
        amount: 10,
        lotSize: 1,
        totalPriceNumber: 1000,
        priceNumber: 100,
        lotPriceNumber: 100
      }];
      
      const sellingPlan = calculateSellingAmounts(
        wallet,
        { TMON: 100 },
        'only_positive_positions_sell',
        -1000000 // Very large negative balance
      );
      
      expect(Object.keys(sellingPlan)).toHaveLength(1);
      
      // Should plan to sell to cover both deficit and purchase
      const totalNeeded = 1000000 + 100; // Deficit + purchase
      const plan = sellingPlan['TPAY'];
      expect(plan.sellAmount).toBeGreaterThan(0);
    });

    it('should handle very large positive RUB balance', () => {
      const wallet: Position[] = [{
        pair: 'TPAY/RUB',
        base: 'TPAY',
        quote: 'RUB',
        amount: 10,
        lotSize: 1,
        totalPriceNumber: 1000,
        priceNumber: 100,
        lotPriceNumber: 100
      }];
      
      const sellingPlan = calculateSellingAmounts(
        wallet,
        { TMON: 100 },
        'only_positive_positions_sell',
        1000000 // Very large positive balance
      );
      
      // Should not need to sell anything with large positive balance
      expect(Object.keys(sellingPlan)).toHaveLength(0);
    });

    it('should handle RUB balance exactly equal to required funds', () => {
      const wallet: Position[] = [{
        pair: 'TPAY/RUB',
        base: 'TPAY',
        quote: 'RUB',
        amount: 10,
        lotSize: 1,
        totalPriceNumber: 1000,
        priceNumber: 100,
        lotPriceNumber: 100
      }];
      
      const sellingPlan = calculateSellingAmounts(
        wallet,
        { TMON: 500 },
        'only_positive_positions_sell',
        500 // Exactly enough cash
      );
      
      // Should not need to sell anything
      expect(Object.keys(sellingPlan)).toHaveLength(0);
    });
  });

  describe('7. Performance Edge Cases', () => {
    it('should handle portfolio with many positions efficiently', () => {
      const manyPositions: Position[] = [];
      
      // Create 1000 positions
      for (let i = 0; i < 1000; i++) {
        manyPositions.push({
          pair: `POS${i}/RUB`,
          base: `POS${i}`,
          quote: 'RUB',
          amount: 10,
          lotSize: 1,
          totalPriceNumber: 100 + i,
          priceNumber: 10 + i * 0.1,
          lotPriceNumber: 10 + i * 0.1,
          averagePositionPriceFifoNumber: 9 + i * 0.1 // All profitable
        });
      }
      
      const startTime = Date.now();
      
      const profitablePositions = identifyProfitablePositions(manyPositions, baseConfig);
      
      const endTime = Date.now();
      
      expect(profitablePositions.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle repeated calculations efficiently', () => {
      const wallet: Position[] = [{
        pair: 'TPAY/RUB',
        base: 'TPAY',
        quote: 'RUB',
        amount: 10,
        lotSize: 1,
        totalPriceNumber: 1000,
        priceNumber: 100,
        lotPriceNumber: 100,
        averagePositionPriceFifoNumber: 90
      }];
      
      const startTime = Date.now();
      
      // Perform many calculations
      for (let i = 0; i < 1000; i++) {
        calculatePositionProfit(wallet[0]);
        identifyProfitablePositions(wallet, baseConfig);
        calculateSellingAmounts(wallet, { TMON: 100 + i }, 'only_positive_positions_sell', 0);
      }
      
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
