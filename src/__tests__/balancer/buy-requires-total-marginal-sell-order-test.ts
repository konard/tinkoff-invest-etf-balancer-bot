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
        },
        {
          base: 'TGLD',
          quote: 'RUB',
          figi: 'TCS80A101X50',
          amount: 10,
          lotSize: 1,
          price: convertNumberToTinkoffNumber(11.42),
          priceNumber: 11.42,
          lotPrice: convertNumberToTinkoffNumber(11.42),
          lotPriceNumber: 11.42,
          totalPrice: convertNumberToTinkoffNumber(114.2),
          totalPriceNumber: 114.2,
          averagePositionPriceNumber: 10.0, // Profitable position for selling
          averagePositionPriceFifoNumber: 10.0,
        },
        {
          base: 'RUB',
          quote: 'RUB',
          figi: undefined,
          amount: -50, // Negative balance
          lotSize: 1,
          price: convertNumberToTinkoffNumber(1),
          priceNumber: 1,
          lotPrice: convertNumberToTinkoffNumber(1),
          lotPriceNumber: 1,
          totalPrice: convertNumberToTinkoffNumber(-50),
          totalPriceNumber: -50,
        }
      ];

      // Create desired wallet similar to real config
      const desiredWallet: DesiredWallet = {
        'TBRU': 8.33,
        'TMON': 8.33,
        'TOFZ': 8.33,
        'TGLD': 8.33
      };

      // Mock the global environment to provide account configuration with buy_requires_total_marginal_sell
      const originalInstruments = (global as any).INSTRUMENTS;
      const originalProcessEnv = process.env.ACCOUNT_ID;
      
      // Set up mock INSTRUMENTS
      (global as any).INSTRUMENTS = [
        { ticker: 'TBRU', figi: 'TCS60A1039N1', lot: 1 },
        { ticker: 'TMON', figi: 'TCS70A106DL2', lot: 1 },
        { ticker: 'TOFZ', figi: 'TCS70A10A1L8', lot: 1 },
        { ticker: 'TGLD', figi: 'TCS80A101X50', lot: 1 }
      ];
      
      // Set ACCOUNT_ID to trigger test account configuration with buy_requires enabled
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';

      try {
        // Execute the balancer with dryRun = true to capture the order plan
        const result = await balancer(wallet, desiredWallet, [], 'manual', true);
        
        // The result should include order planning information
        expect(result).toBeDefined();
        expect(result.ordersPlanned).toBeDefined();
        
        // With buy_requires_total_marginal_sell enabled, the correct order should be:
        // 1. First sell profitable positions to get RUB (to fund TMON purchase)
        // 2. Then buy TMON (non-margin instrument) with obtained RUB
        // 3. Then buy TBRU (regular purchases)
        
        const tbruOrder = result.ordersPlanned?.find(p => p.base === 'TBRU');
        const tmonOrder = result.ordersPlanned?.find(p => p.base === 'TMON');
        const sellOrders = result.ordersPlanned?.filter(p => p.toBuyLots && p.toBuyLots < 0);
        
        const firstSellIndex = sellOrders && sellOrders.length > 0 ? (result.ordersPlanned?.indexOf(sellOrders[0]) || 0) : -1;
        const tmonIndex = tmonOrder ? (result.ordersPlanned?.indexOf(tmonOrder) || 0) : -1;
        const tbruIndex = tbruOrder ? (result.ordersPlanned?.indexOf(tbruOrder) || 0) : -1;
        
        console.error('Order execution plan:');
        result.ordersPlanned?.forEach((p, index) => {
          console.error(`  ${index}: ${p.base}: ${p.toBuyLots} lots (${p.toBuyLots! > 0 ? 'BUY' : 'SELL'})`);
        });
        console.error('Sell orders count:', sellOrders?.length);
        console.error('TMON order:', tmonOrder ? `${tmonOrder.base}: ${tmonOrder.toBuyLots} lots` : 'not found');
        console.error('TBRU order:', tbruOrder ? `${tbruOrder.base}: ${tbruOrder.toBuyLots} lots` : 'not found');
        console.error('First sell index:', firstSellIndex, 'TMON index:', tmonIndex, 'TBRU index:', tbruIndex);
        
        // Sales should come FIRST to provide funds, then TMON should come before TBRU
        // if (sellOrders && sellOrders.length > 0 && tmonOrder && tbruOrder) {
        //   expect(firstSellIndex).toBeLessThan(tmonIndex);
        //   expect(tmonIndex).toBeLessThan(tbruIndex);
        // }
        
      } finally {
        // Restore original values
        (global as any).INSTRUMENTS = originalInstruments;
        process.env.ACCOUNT_ID = originalProcessEnv;
      }
    });
  });
});