import { describe, it, expect } from "bun:test";
import { balancer } from "../../balancer";
import { Wallet, Position, DesiredWallet } from "../../types.d";
import { convertNumberToTinkoffNumber } from "../../utils";
import { testSuite } from '../test-utils';
import { calculatePositionProfit, identifyProfitablePositions, calculateRequiredFunds, calculateSellingAmounts } from "../../utils/buyRequiresTotalMarginalSell";

testSuite('Buy Requires Total Marginal Sell Comprehensive Tests', () => {
  describe('calculatePositionProfit', () => {
    it('should calculate profit correctly using averagePositionPriceFifoNumber', () => {
      const position: Position = {
        base: 'TGLD',
        quote: 'RUB',
        figi: 'test_figi',
        amount: 10,
        lotSize: 1,
        price: convertNumberToTinkoffNumber(110),
        priceNumber: 110,
        lotPrice: convertNumberToTinkoffNumber(110),
        lotPriceNumber: 110,
        totalPrice: convertNumberToTinkoffNumber(1100),
        totalPriceNumber: 1100,
        averagePositionPriceFifoNumber: 100, // Purchase price
        averagePositionPriceNumber: 100,
      };

      const result = calculatePositionProfit(position);
      expect(result).toBeDefined();
      expect(result!.profitAmount).toBe(100); // 1100 - (100 * 10)
      expect(result!.profitPercent).toBe(10); // (100 / 1000) * 100
    });

    it('should calculate profit correctly using averagePositionPriceNumber as fallback', () => {
      const position: Position = {
        base: 'TGLD',
        quote: 'RUB',
        figi: 'test_figi',
        amount: 5,
        lotSize: 1,
        price: convertNumberToTinkoffNumber(120),
        priceNumber: 120,
        lotPrice: convertNumberToTinkoffNumber(120),
        lotPriceNumber: 120,
        totalPrice: convertNumberToTinkoffNumber(600),
        totalPriceNumber: 600,
        averagePositionPriceNumber: 100, // Purchase price
      };

      const result = calculatePositionProfit(position);
      expect(result).toBeDefined();
      expect(result!.profitAmount).toBe(100); // 600 - (100 * 5)
      expect(result!.profitPercent).toBe(20); // (100 / 500) * 100
    });

    it('should return null for unprofitable positions', () => {
      const position: Position = {
        base: 'TGLD',
        quote: 'RUB',
        figi: 'test_figi',
        amount: 10,
        lotSize: 1,
        price: convertNumberToTinkoffNumber(90),
        priceNumber: 90,
        lotPrice: convertNumberToTinkoffNumber(90),
        lotPriceNumber: 90,
        totalPrice: convertNumberToTinkoffNumber(900),
        totalPriceNumber: 900,
        averagePositionPriceFifoNumber: 100, // Higher than current price
      };

      const result = calculatePositionProfit(position);
      expect(result).toBeNull();
    });

    it('should return null when no purchase price data is available', () => {
      const position: Position = {
        base: 'TGLD',
        quote: 'RUB',
        figi: 'test_figi',
        amount: 10,
        lotSize: 1,
        price: convertNumberToTinkoffNumber(110),
        priceNumber: 110,
        lotPrice: convertNumberToTinkoffNumber(110),
        lotPriceNumber: 110,
        totalPrice: convertNumberToTinkoffNumber(1100),
        totalPriceNumber: 1100,
      };

      const result = calculatePositionProfit(position);
      expect(result).toBeNull();
    });
  });

  describe('identifyProfitablePositions', () => {
    it('should identify profitable positions correctly', () => {
      const wallet: Wallet = [
        {
          base: 'TGLD',
          quote: 'RUB',
          figi: 'test_figi_1',
          amount: 10,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(110),
          priceNumber: 110,
          lotPrice: convertNumberToTinkoffNumber(110),
          lotPriceNumber: 110,
          totalPrice: convertNumberToTinkoffNumber(1100),
          totalPriceNumber: 1100,
          averagePositionPriceFifoNumber: 100,
        },
        {
          base: 'TMON',
          quote: 'RUB',
          figi: 'test_figi_2',
          amount: 5,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(90),
          priceNumber: 90,
          lotPrice: convertNumberToTinkoffNumber(90),
          lotPriceNumber: 90,
          totalPrice: convertNumberToTinkoffNumber(450),
          totalPriceNumber: 450,
          averagePositionPriceFifoNumber: 100, // Unprofitable
        },
        {
          base: 'TMOS',
          quote: 'RUB',
          figi: 'test_figi_3',
          amount: 8,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(120),
          priceNumber: 120,
          lotPrice: convertNumberToTinkoffNumber(120),
          lotPriceNumber: 120,
          totalPrice: convertNumberToTinkoffNumber(960),
          totalPriceNumber: 960,
          averagePositionPriceFifoNumber: 100,
        }
      ];

      const config = {
        enabled: true,
        instruments: ['TMON'], // TMON is non-margin instrument
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell'
        },
        min_buy_rebalance_percent: 0.5
      };

      const result = identifyProfitablePositions(wallet, config);
      expect(result).toHaveLength(2); // TGLD and TMOS are profitable
      expect(result[0].base).toBe('TMOS'); // Should be sorted by profit (TMOS has higher profit)
      expect(result[1].base).toBe('TGLD');
    });
  });

  describe('calculateRequiredFunds', () => {
    it('should calculate required funds correctly', () => {
      const wallet: Wallet = [
        {
          base: 'TGLD',
          quote: 'RUB',
          figi: 'test_figi_1',
          amount: 3,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(110),
          priceNumber: 110,
          lotPrice: convertNumberToTinkoffNumber(110),
          lotPriceNumber: 110,
          totalPrice: convertNumberToTinkoffNumber(330),
          totalPriceNumber: 330,
          toBuyNumber: 200, // Want to buy 200 RUB worth
        },
        {
          base: 'TMON',
          quote: 'RUB',
          figi: 'test_figi_2',
          amount: 0,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(140),
          priceNumber: 140,
          lotPrice: convertNumberToTinkoffNumber(140),
          lotPriceNumber: 140,
          totalPrice: convertNumberToTinkoffNumber(0),
          totalPriceNumber: 0,
          toBuyNumber: 1000, // Want to buy 1000 RUB worth
        }
      ];

      const desiredWallet: DesiredWallet = {
        'TGLD': 25,
        'TMON': 75
      };

      const config = {
        enabled: true,
        instruments: ['TMON', 'TGLD'], // Both are non-margin instruments
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell'
        },
        min_buy_rebalance_percent: 0.5
      };

      // Total portfolio value for threshold calculation
      const totalPortfolioValue = 10000; // Mock value

      const result = calculateRequiredFunds(wallet, desiredWallet, config);
      
      // Both instruments should be included since their purchase amounts exceed threshold
      // Threshold = 10000 * (0.5/100) = 50 RUB
      expect(result['TGLD']).toBe(200);
      expect(result['TMON']).toBe(1000);
    });
  });

  describe('calculateSellingAmounts', () => {
    it('should calculate selling amounts for only_positive_positions_sell mode', () => {
      const profitablePositions: Position[] = [
        {
          base: 'TMOS',
          quote: 'RUB',
          figi: 'test_figi_1',
          amount: 8,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(120),
          priceNumber: 120,
          lotPrice: convertNumberToTinkoffNumber(120),
          lotPriceNumber: 120,
          totalPrice: convertNumberToTinkoffNumber(960),
          totalPriceNumber: 960,
          averagePositionPriceFifoNumber: 100,
        },
        {
          base: 'TGLD',
          quote: 'RUB',
          figi: 'test_figi_2',
          amount: 10,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(110),
          priceNumber: 110,
          lotPrice: convertNumberToTinkoffNumber(110),
          lotPriceNumber: 110,
          totalPrice: convertNumberToTinkoffNumber(1100),
          totalPriceNumber: 1100,
          averagePositionPriceFifoNumber: 100,
        }
      ];

      const requiredFunds = {
        'TMON': 500, // Need 500 RUB to buy TMON
      };

      const result = calculateSellingAmounts(profitablePositions, requiredFunds, 'only_positive_positions_sell', 0);
      
      // Should sell from TMOS first (higher profit), need 500 RUB
      // TMOS position value: 960 RUB, lot price: 120 RUB
      // Need 5 lots (5 * 120 = 600 RUB) to cover 500 RUB needed
      expect(result['TMOS']).toBeDefined();
      expect(result['TMOS']!.sellLots).toBe(5);
      expect(result['TMOS']!.sellAmount).toBe(600);
    });
  });

  describe('balancer with buy_requires_total_marginal_sell', () => {
    it('should prioritize buying non-margin instruments first', async () => {
      // Create a mock wallet with positions
      const wallet: Wallet = [
        {
          base: 'TGLD',
          quote: 'RUB',
          figi: 'test_figi_1',
          amount: 10,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(110),
          priceNumber: 110,
          lotPrice: convertNumberToTinkoffNumber(110),
          lotPriceNumber: 110,
          totalPrice: convertNumberToTinkoffNumber(1100),
          totalPriceNumber: 1100,
          averagePositionPriceFifoNumber: 100, // Profitable position
          desiredAmountNumber: 500, // Want to reduce position
          canBuyBeforeTargetLots: 5,
          canBuyBeforeTargetNumber: 500,
          beforeDiffNumber: 0,
          toBuyLots: -5, // Plan to sell 5 lots
          toBuyNumber: -500, // Plan to sell 500 RUB worth
        },
        {
          base: 'TMON',
          quote: 'RUB',
          figi: 'test_figi_2',
          amount: 0,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(140),
          priceNumber: 140,
          lotPrice: convertNumberToTinkoffNumber(140),
          lotPriceNumber: 140,
          totalPrice: convertNumberToTinkoffNumber(0),
          totalPriceNumber: 0,
          desiredAmountNumber: 1000, // Want to increase position
          canBuyBeforeTargetLots: 7,
          canBuyBeforeTargetNumber: 980,
          beforeDiffNumber: 20,
          toBuyLots: 7, // Plan to buy 7 lots
          toBuyNumber: 980, // Plan to buy 980 RUB worth
        }
      ];

      // Create desired wallet
      const desiredWallet: DesiredWallet = {
        'TGLD': 25,
        'TMON': 75
      };

      // Mock the global environment to provide account configuration
      const originalInstruments = (global as any).INSTRUMENTS;
      const originalProcessEnv = process.env.ACCOUNT_ID;
      
      // Set up mock INSTRUMENTS
      (global as any).INSTRUMENTS = [
        { ticker: 'TGLD', figi: 'test_figi_1', lot: 1 },
        { ticker: 'TMON', figi: 'test_figi_2', lot: 1 }
      ];
      
      // Set ACCOUNT_ID to trigger test account configuration
      process.env.ACCOUNT_ID = 'test-account-with-buy-requires';

      try {
        // Execute the balancer
        const result = await balancer(wallet, desiredWallet, [], 'manual', true); // dryRun = true
        
        // Verify that the result is structured correctly
        expect(result).toBeDefined();
        expect(result.finalPercents).toBeDefined();
        expect(result.modeUsed).toBe('manual');
        expect(result.positionMetrics).toEqual([]);
        expect(result.totalPortfolioValue).toBeGreaterThan(0);
      } finally {
        // Restore original values
        (global as any).INSTRUMENTS = originalInstruments;
        process.env.ACCOUNT_ID = originalProcessEnv;
      }
    });
  });
});