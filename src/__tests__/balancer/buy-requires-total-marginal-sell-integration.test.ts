import { describe, it, expect } from "bun:test";
import { balancer } from "../../balancer";
import { Wallet, Position, DesiredWallet } from "../../types.d";
import { convertNumberToTinkoffNumber } from "../../utils";
import { testSuite } from '../test-utils';

testSuite('Buy Requires Total Marginal Sell Integration Tests', () => {
  describe('balancer with buy_requires_total_marginal_sell', () => {
    it('should handle buy_requires_total_marginal_sell configuration', async () => {
      // Create a mock wallet with positions
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
          price: convertNumberToTinkoffNumber(200),
          priceNumber: 200,
          lotPrice: convertNumberToTinkoffNumber(200),
          lotPriceNumber: 200,
          totalPrice: convertNumberToTinkoffNumber(0),
          totalPriceNumber: 0,
          desiredAmountNumber: 1000, // Want to increase position
          canBuyBeforeTargetLots: 5,
          canBuyBeforeTargetNumber: 1000,
          beforeDiffNumber: 0,
          toBuyLots: 5, // Plan to buy 5 lots
          toBuyNumber: 1000, // Plan to buy 1000 RUB worth
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