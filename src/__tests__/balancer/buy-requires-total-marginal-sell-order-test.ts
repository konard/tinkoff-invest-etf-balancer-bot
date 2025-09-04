import { describe, it, expect } from "bun:test";
import { balancer } from "../../balancer";
import { Wallet, Position, DesiredWallet } from "../../types.d";
import { convertNumberToTinkoffNumber } from "../../utils";
import { testSuite } from '../test-utils';

testSuite('Buy Requires Total Marginal Sell Order Test', () => {
  describe('balancer with buy_requires_total_marginal_sell enabled should buy non-margin first', () => {
    it('should buy TMON before selling TBRU when buy_requires_total_marginal_sell is enabled', async () => {
      // Create a wallet with existing positions
      const wallet: Wallet = [
        {
          base: 'TBRU',
          quote: 'RUB',
          figi: 'TCS60A1039N1',
          amount: 12,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(7.42),
          priceNumber: 7.42,
          lotPrice: convertNumberToTinkoffNumber(7.42),
          lotPriceNumber: 7.42,
          totalPrice: convertNumberToTinkoffNumber(89.04),
          totalPriceNumber: 89.04,
          averagePositionPriceNumber: 7.0, // Profitable position
          averagePositionPriceFifoNumber: 7.0,
        },
        {
          base: 'TMON',
          quote: 'RUB',
          figi: 'TCS70A106DL2',
          amount: 0,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(142.29),
          priceNumber: 142.29,
          lotPrice: convertNumberToTinkoffNumber(142.29),
          lotPriceNumber: 142.29,
          totalPrice: convertNumberToTinkoffNumber(0),
          totalPriceNumber: 0,
        },
        {
          base: 'TOFZ',
          quote: 'RUB',
          figi: 'TCS70A10A1L8',
          amount: 0,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(13.43),
          priceNumber: 13.43,
          lotPrice: convertNumberToTinkoffNumber(13.43),
          lotPriceNumber: 13.43,
          totalPrice: convertNumberToTinkoffNumber(0),
          totalPriceNumber: 0,
        }
      ];

      // Create desired wallet similar to real config
      const desiredWallet: DesiredWallet = {
        'TBRU': 8.33,
        'TMON': 8.33,
        'TOFZ': 8.33
      };

      // Mock the global environment to provide account configuration with buy_requires_total_marginal_sell
      const originalInstruments = (global as any).INSTRUMENTS;
      const originalProcessEnv = process.env.ACCOUNT_ID;
      
      // Set up mock INSTRUMENTS
      (global as any).INSTRUMENTS = [
        { ticker: 'TBRU', figi: 'TCS60A1039N1', lot: 1 },
        { ticker: 'TMON', figi: 'TCS70A106DL2', lot: 1 },
        { ticker: 'TOFZ', figi: 'TCS70A10A1L8', lot: 1 }
      ];
      
      // Set ACCOUNT_ID to trigger test account configuration with buy_requires enabled
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';

      try {
        // Execute the balancer with dryRun = true to capture the order plan
        const result = await balancer(wallet, desiredWallet, [], 'manual', true);
        
        // The result should include order planning information
        expect(result).toBeDefined();
        expect(result.ordersPlanned).toBeDefined();
        
        // In the real scenario: 
        // 1. TBRU should be sold first (negative toBuyLots)
        // 2. TMON should be bought second (positive toBuyLots)
        // But with buy_requires_total_marginal_sell enabled, TMON should be bought FIRST
        
        const tbruOrder = result.ordersPlanned?.find(p => p.base === 'TBRU');
        const tmonOrder = result.ordersPlanned?.find(p => p.base === 'TMON');
        const tofzOrder = result.ordersPlanned?.find(p => p.base === 'TOFZ');
        
        if (tbruOrder && tmonOrder) {
          const tbruIndex = result.ordersPlanned?.indexOf(tbruOrder) || 0;
          const tmonIndex = result.ordersPlanned?.indexOf(tmonOrder) || 0;
          
          // TMON should come before TBRU in execution order because it's a non-margin instrument
          expect(tmonIndex).toBeLessThan(tbruIndex);
        }
        
        console.log('Order execution plan:', result.ordersPlanned?.map(p => `${p.base}: ${p.toBuyLots} lots`));
        
      } finally {
        // Restore original values
        (global as any).INSTRUMENTS = originalInstruments;
        process.env.ACCOUNT_ID = originalProcessEnv;
      }
    });
  });
});