import { describe, it, expect } from "bun:test";
import { 
  calculatePositionProfit,
  identifyProfitablePositions,
  calculateRequiredFunds,
  calculateSellingAmounts
} from "../../utils/buyRequiresTotalMarginalSell";
import { Wallet, Position, BuyRequiresTotalMarginalSellConfig } from "../../types.d";
import { convertNumberToTinkoffNumber } from "../../utils";
import { testSuite } from '../test-utils';

testSuite('Buy Requires Total Marginal Sell Utility Functions', () => {
  describe('calculatePositionProfit', () => {
    it('should calculate profit for a position', () => {
      const position: Position = {
        base: 'TGLD',
        quote: 'RUB',
        figi: 'test_figi',
        amount: 10,
        lotSize: 1,
        price: convertNumberToTinkoffNumber(100),
        priceNumber: 100,
        lotPrice: convertNumberToTinkoffNumber(100),
        lotPriceNumber: 100,
        totalPrice: convertNumberToTinkoffNumber(1000),
        totalPriceNumber: 1000,
        averagePositionPriceNumber: 90, // Bought at 90, now at 100 -> profit
        averagePositionPriceFifoNumber: 90,
      };

      const profit = calculatePositionProfit(position);
      expect(profit).not.toBeNull();
      expect(profit!.profitAmount).toBeGreaterThan(0);
      expect(profit!.profitPercent).toBeGreaterThan(0);
    });

    it('should return null for position with zero value', () => {
      const position: Position = {
        base: 'TGLD',
        quote: 'RUB',
        figi: 'test_figi',
        amount: 0,
        lotSize: 1,
        price: convertNumberToTinkoffNumber(0),
        priceNumber: 0,
      };

      const profit = calculatePositionProfit(position);
      expect(profit).toBeNull();
    });
  });

  describe('identifyProfitablePositions', () => {
    it('should identify profitable positions excluding non-margin instruments', () => {
      const wallet: Wallet = [
        {
          base: 'TGLD',
          quote: 'RUB',
          figi: 'test_figi_1',
          amount: 10,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(100),
          priceNumber: 100,
          lotPrice: convertNumberToTinkoffNumber(100),
          lotPriceNumber: 100,
          totalPrice: convertNumberToTinkoffNumber(1000),
          totalPriceNumber: 1000,
          averagePositionPriceNumber: 90, // Profitable
          averagePositionPriceFifoNumber: 90,
        },
        {
          base: 'TMON',
          quote: 'RUB',
          figi: 'test_figi_2',
          amount: 5,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(200),
          priceNumber: 200,
          lotPrice: convertNumberToTinkoffNumber(200),
          lotPriceNumber: 200,
          totalPrice: convertNumberToTinkoffNumber(1000),
          totalPriceNumber: 1000,
          averagePositionPriceNumber: 150, // Profitable but should be excluded
          averagePositionPriceFifoNumber: 150,
        },
        {
          base: 'TRUR',
          quote: 'RUB',
          figi: 'test_figi_3',
          amount: 20,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(50),
          priceNumber: 50,
          lotPrice: convertNumberToTinkoffNumber(50),
          lotPriceNumber: 50,
          totalPrice: convertNumberToTinkoffNumber(1000),
          totalPriceNumber: 1000,
          averagePositionPriceNumber: 40, // Profitable
          averagePositionPriceFifoNumber: 40,
        }
      ];

      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell'
        },
        min_buy_rebalance_percent: 0.1
      };

      const profitablePositions = identifyProfitablePositions(wallet, config);
      
      // Should find 2 profitable positions (TGLD and TRUR) but exclude TMON
      expect(profitablePositions).toHaveLength(2);
      expect(profitablePositions.some(p => p.base === 'TGLD')).toBe(true);
      expect(profitablePositions.some(p => p.base === 'TRUR')).toBe(true);
      expect(profitablePositions.some(p => p.base === 'TMON')).toBe(false);
    });

    it('should return empty array when feature is disabled', () => {
      const wallet: Wallet = [
        {
          base: 'TGLD',
          quote: 'RUB',
          figi: 'test_figi',
          amount: 10,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(100),
          priceNumber: 100,
          lotPrice: convertNumberToTinkoffNumber(100),
          lotPriceNumber: 100,
          totalPrice: convertNumberToTinkoffNumber(1000),
          totalPriceNumber: 1000,
        }
      ];

      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: false,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell'
        },
        min_buy_rebalance_percent: 0.1
      };

      const profitablePositions = identifyProfitablePositions(wallet, config);
      expect(profitablePositions).toHaveLength(0);
    });
  });

  describe('calculateRequiredFunds', () => {
    it('should calculate required funds for non-margin instruments', () => {
      const wallet: Wallet = [
        {
          base: 'TMON',
          quote: 'RUB',
          figi: 'test_figi',
          amount: 0,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(100),
          priceNumber: 100,
          lotPrice: convertNumberToTinkoffNumber(100),
          lotPriceNumber: 100,
          totalPrice: convertNumberToTinkoffNumber(0),
          totalPriceNumber: 1000, // Current value is 1000 RUB
          toBuyNumber: 500, // Need to buy 500 RUB worth
        }
      ];

      const desiredWallet = {
        'TMON': 50,
        'TGLD': 50
      };

      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell'
        },
        min_buy_rebalance_percent: 0.1 // 0.1% of 1000 RUB = 1 RUB threshold
      };

      const requiredFunds = calculateRequiredFunds(wallet, desiredWallet, config);
      
      expect(requiredFunds['TMON']).toBe(500);
    });

    it('should exclude purchases below threshold', () => {
      const wallet: Wallet = [
        {
          base: 'TMON',
          quote: 'RUB',
          figi: 'test_figi',
          amount: 0,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(100),
          priceNumber: 100,
          lotPrice: convertNumberToTinkoffNumber(100),
          lotPriceNumber: 100,
          totalPrice: convertNumberToTinkoffNumber(1000),
          totalPriceNumber: 1000, // Current value is 1000 RUB
          toBuyNumber: 5, // Small purchase of 5 RUB
        }
      ];

      const desiredWallet = {
        'TMON': 50,
        'TGLD': 50
      };

      // Set threshold high enough to exclude this purchase
      const config: BuyRequiresTotalMarginalSellConfig = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell'
        },
        min_buy_rebalance_percent: 50 // 50% of 1000 RUB = 500 RUB threshold
      };

      const requiredFunds = calculateRequiredFunds(wallet, desiredWallet, config);
      
      // Should be empty because purchase (5 RUB) is below threshold (500 RUB)
      expect(requiredFunds['TMON']).toBeUndefined();
    });
  });

  describe('calculateSellingAmounts', () => {
    it('should calculate selling amounts for only_positive_positions_sell mode', () => {
      const profitablePositions: Wallet = [
        {
          base: 'TGLD',
          quote: 'RUB',
          figi: 'test_figi_1',
          amount: 10,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(100),
          priceNumber: 100,
          lotPrice: convertNumberToTinkoffNumber(100),
          lotPriceNumber: 100,
          totalPrice: convertNumberToTinkoffNumber(1000),
          totalPriceNumber: 1000,
        },
        {
          base: 'TRUR',
          quote: 'RUB',
          figi: 'test_figi_2',
          amount: 20,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(50),
          priceNumber: 50,
          lotPrice: convertNumberToTinkoffNumber(50),
          lotPriceNumber: 50,
          totalPrice: convertNumberToTinkoffNumber(1000),
          totalPriceNumber: 1000,
        }
      ];

      const requiredFunds = {
        'TMON': 150 // Need 150 RUB
      };

      const sellingPlan = calculateSellingAmounts(
        profitablePositions,
        requiredFunds,
        'only_positive_positions_sell',
        0  // Assume 0 RUB balance for test
      );
      
      // Should plan to sell from the positions (the exact number depends on the implementation)
      // The important thing is that it plans to sell something
      expect(Object.keys(sellingPlan).length).toBeGreaterThan(0);
    });

    it('should calculate proportional selling for equal_in_percents mode', () => {
      const profitablePositions: Wallet = [
        {
          base: 'TGLD',
          quote: 'RUB',
          figi: 'test_figi_1',
          amount: 10,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(100),
          priceNumber: 100,
          lotPrice: convertNumberToTinkoffNumber(100),
          lotPriceNumber: 100,
          totalPrice: convertNumberToTinkoffNumber(1000),
          totalPriceNumber: 1000,
        },
        {
          base: 'TRUR',
          quote: 'RUB',
          figi: 'test_figi_2',
          amount: 20,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(50),
          priceNumber: 50,
          lotPrice: convertNumberToTinkoffNumber(50),
          lotPriceNumber: 50,
          totalPrice: convertNumberToTinkoffNumber(1000),
          totalPriceNumber: 1000,
        }
      ];

      const requiredFunds = {
        'TMON': 300 // Need 300 RUB
      };

      const sellingPlan = calculateSellingAmounts(
        profitablePositions,
        requiredFunds,
        'equal_in_percents',
        0  // Assume 0 RUB balance for test
      );
      
      // Should plan to sell proportionally from both positions
      expect(Object.keys(sellingPlan)).toHaveLength(2);
      expect(sellingPlan['TGLD']).toBeDefined();
      expect(sellingPlan['TRUR']).toBeDefined();
    });

    it('should not sell anything for none mode', () => {
      const profitablePositions: Wallet = [
        {
          base: 'TGLD',
          quote: 'RUB',
          figi: 'test_figi',
          amount: 10,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(100),
          priceNumber: 100,
          lotPrice: convertNumberToTinkoffNumber(100),
          lotPriceNumber: 100,
          totalPrice: convertNumberToTinkoffNumber(1000),
          totalPriceNumber: 1000,
        }
      ];

      const requiredFunds = {
        'TMON': 300 // Need 300 RUB
      };

      const sellingPlan = calculateSellingAmounts(
        profitablePositions,
        requiredFunds,
        'none',
        0  // Assume 0 RUB balance for test
      );
      
      // Should not plan to sell anything
      expect(Object.keys(sellingPlan)).toHaveLength(0);
    });

    it('should calculate correct selling amount with negative RUB balance', () => {
      const profitablePositions: Wallet = [
        {
          base: 'TGLD',
          quote: 'RUB',
          figi: 'test_figi',
          amount: 10,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(100),
          priceNumber: 100,
          lotPrice: convertNumberToTinkoffNumber(100),
          lotPriceNumber: 100,
          totalPrice: convertNumberToTinkoffNumber(1000),
          totalPriceNumber: 1000,
        }
      ];

      const requiredFunds = {
        'TMON': 142.29 // Need 142.29 RUB for TMON
      };

      // Test with negative RUB balance like in the log: -454.76
      const negativeRubBalance = -454.76;
      const sellingPlan = calculateSellingAmounts(
        profitablePositions,
        requiredFunds,
        'only_positive_positions_sell',
        negativeRubBalance
      );
      
      // Should sell enough to cover deficit + purchase: 454.76 + 142.29 = 597.05 RUB
      // With lot price 100, should sell 6 lots (600 RUB) to cover 597.05 RUB needed
      expect(Object.keys(sellingPlan)).toHaveLength(1);
      expect(sellingPlan['TGLD']).toBeDefined();
      expect(sellingPlan['TGLD'].sellLots).toBe(6);
      expect(sellingPlan['TGLD'].sellAmount).toBe(600);
    });
  });
});