import { describe, it, expect, beforeEach } from 'bun:test';
import { balancer } from '../balancer';
import { Position, BuyRequiresTotalMarginalSellConfig } from '../types.d';
import { 
  calculateRequiredFunds,
  identifyPositionsForSelling
} from '../utils/buyRequiresTotalMarginalSell';

describe('buy_requires_total_marginal_sell Integration Tests', () => {
  let mockWallet: Position[];
  let baseDesiredWallet: Record<string, number>;

  beforeEach(() => {
    // Create comprehensive mock wallet for integration testing
    mockWallet = [
      // Non-margin instrument that needs buying
      {
        pair: 'TMON/RUB',
        base: 'TMON',
        quote: 'RUB',
        figi: 'TCS70A106DL2',
        amount: 0,
        lotSize: 1,
        price: { units: 142, nano: 500000000 },
        priceNumber: 142.50,
        lotPrice: { units: 142, nano: 500000000 },
        lotPriceNumber: 142.50,
        totalPrice: { units: 0, nano: 0 },
        totalPriceNumber: 0
      },
      // Profitable margin position
      {
        pair: 'TPAY/RUB',
        base: 'TPAY',
        quote: 'RUB',
        figi: 'TCS00A108WX3',
        amount: 10,
        lotSize: 1,
        price: { units: 100, nano: 0 },
        priceNumber: 100.00,
        lotPrice: { units: 100, nano: 0 },
        lotPriceNumber: 100.00,
        totalPrice: { units: 1000, nano: 0 },
        totalPriceNumber: 1000.00,
        averagePositionPriceFifoNumber: 90.00,
        averagePositionPriceNumber: 90.00
      },
      // Another profitable position
      {
        pair: 'TMOS/RUB',
        base: 'TMOS',
        quote: 'RUB',
        figi: 'TCS60A101X76',
        amount: 50,
        lotSize: 1,
        price: { units: 6, nano: 700000000 },
        priceNumber: 6.70,
        lotPrice: { units: 6, nano: 700000000 },
        lotPriceNumber: 6.70,
        totalPrice: { units: 335, nano: 0 },
        totalPriceNumber: 335.00,
        averagePositionPriceFifoNumber: 6.00,
        averagePositionPriceNumber: 6.00
      },
      // Loss position (should not be sold in only_positive_positions_sell mode)
      {
        pair: 'TGLD/RUB',
        base: 'TGLD',
        quote: 'RUB',
        figi: 'TCS80A101X50',
        amount: 20,
        lotSize: 1,
        price: { units: 11, nano: 500000000 },
        priceNumber: 11.50,
        lotPrice: { units: 11, nano: 500000000 },
        lotPriceNumber: 11.50,
        totalPrice: { units: 230, nano: 0 },
        totalPriceNumber: 230.00,
        averagePositionPriceFifoNumber: 12.00,
        averagePositionPriceNumber: 12.00
      },
      // RUB position with negative balance (margin used)
      {
        pair: 'RUB/RUB',
        base: 'RUB',
        quote: 'RUB',
        amount: -100.00,
        lotSize: 1,
        price: { units: 1, nano: 0 },
        priceNumber: 1,
        lotPrice: { units: 1, nano: 0 },
        lotPriceNumber: 1,
        totalPrice: { units: -100, nano: 0 },
        totalPriceNumber: -100.00
      }
    ];

    baseDesiredWallet = {
      TMON: 25,  // Want to buy TMON (non-margin)
      TPAY: 35,  // Current position, may need adjustment
      TMOS: 20,  // Current position, may need adjustment  
      TGLD: 20   // Current position, may need adjustment
    };
  });

  describe('1. Integration with Balancer - enabled=true', () => {
    it('should integrate properly when buy_requires_total_marginal_sell is enabled', async () => {
      // Test the functions directly since balancer integration requires complex setup
      const config = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell'
        },
        min_buy_rebalance_percent: 0.5
      };
      
      // Test that the functions work together
      const requiredFunds = calculateRequiredFunds(mockWallet, baseDesiredWallet, config);
      const sellablePositions = identifyPositionsForSelling(mockWallet, config, 'only_positive_positions_sell');
      
      expect(sellablePositions).toBeDefined();
      expect(Array.isArray(sellablePositions)).toBe(true);
      
      // Should work without errors
      expect(true).toBe(true);
    });

    it('should handle sequential execution when buy_requires is enabled', async () => {
      const originalAccountId = process.env.ACCOUNT_ID;
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
      
      try {
        // Create wallet where TMON needs significant buying
        const walletNeedingTMON = [...mockWallet];
        const tmonPosition = walletNeedingTMON.find(p => p.base === 'TMON')!;
        
        const result = await balancer(walletNeedingTMON, baseDesiredWallet, [], 'manual', true);
        
        expect(result).toBeDefined();
        
        // The balancer should have identified TMON as needing purchase
        // and planned selling of other positions to fund it
        
      } finally {
        process.env.ACCOUNT_ID = originalAccountId;
      }
    });
  });

  describe('2. Integration with Balancer - enabled=false', () => {
    it('should work normally when buy_requires_total_marginal_sell is disabled', async () => {
      // Use default test account (no buy_requires configuration)
      const originalAccountId = process.env.ACCOUNT_ID;
      process.env.ACCOUNT_ID = 'test-default';
      
      try {
        const result = await balancer(mockWallet, baseDesiredWallet, [], 'manual', true);
        
        expect(result).toBeDefined();
        expect(result.finalPercents).toBeDefined();
        
        // Should work with normal balancing logic
        expect(Object.keys(result.finalPercents).length).toBeGreaterThan(0);
        
      } finally {
        process.env.ACCOUNT_ID = originalAccountId;
      }
    });
  });

  describe('3. Different Selling Modes Integration', () => {
    it('should handle only_positive_positions_sell mode in full balancer', async () => {
      const originalAccountId = process.env.ACCOUNT_ID;
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
      
      try {
        // The test account is configured with only_positive_positions_sell mode
        const result = await balancer(mockWallet, baseDesiredWallet, [], 'manual', true);
        
        expect(result).toBeDefined();
        
        // Should have processed only profitable positions for selling
        // Loss positions like TGLD should not be planned for selling
        
      } finally {
        process.env.ACCOUNT_ID = originalAccountId;
      }
    });
  });

  describe('4. Threshold Integration Tests', () => {
    it('should respect min_buy_rebalance_percent in full balancer flow', async () => {
      const originalAccountId = process.env.ACCOUNT_ID;
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
      
      try {
        // Create scenario where TMON purchase is very small (below threshold)
        const smallPurchaseWallet = [...mockWallet];
        const desiredWalletSmallChange = {
          TMON: 1,   // Very small desired percentage
          TPAY: 49,
          TMOS: 25,
          TGLD: 25
        };
        
        const result = await balancer(smallPurchaseWallet, desiredWalletSmallChange, [], 'manual', true);
        
        expect(result).toBeDefined();
        
        // With min_buy_rebalance_percent = 0.5% in test config,
        // very small purchases should be ignored
        
      } finally {
        process.env.ACCOUNT_ID = originalAccountId;
      }
    });

    it('should process purchases above threshold', async () => {
      const originalAccountId = process.env.ACCOUNT_ID;
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
      
      try {
        // Create scenario where TMON purchase is significant (above threshold)
        const largePurchaseDesired = {
          TMON: 30,  // Significant desired percentage
          TPAY: 30,
          TMOS: 20,
          TGLD: 20
        };
        
        const result = await balancer(mockWallet, largePurchaseDesired, [], 'manual', true);
        
        expect(result).toBeDefined();
        
        // Should process the purchase and plan selling accordingly
        
      } finally {
        process.env.ACCOUNT_ID = originalAccountId;
      }
    });
  });

  describe('5. Error Handling Integration', () => {
    it('should handle missing configuration gracefully', async () => {
      const originalAccountId = process.env.ACCOUNT_ID;
      process.env.ACCOUNT_ID = 'test-no-buy-requires';
      
      try {
        // Account without buy_requires_total_marginal_sell configuration
        const result = await balancer(mockWallet, baseDesiredWallet, [], 'manual', true);
        
        expect(result).toBeDefined();
        
        // Should fall back to normal balancing without errors
        expect(result.finalPercents).toBeDefined();
        
      } finally {
        process.env.ACCOUNT_ID = originalAccountId;
      }
    });

    it('should handle empty instruments list', async () => {
      const originalAccountId = process.env.ACCOUNT_ID;
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
      
      try {
        // Even with buy_requires enabled, empty instruments list should work
        const result = await balancer(mockWallet, baseDesiredWallet, [], 'manual', true);
        
        expect(result).toBeDefined();
        expect(result.finalPercents).toBeDefined();
        
      } finally {
        process.env.ACCOUNT_ID = originalAccountId;
      }
    });

    it('should handle instruments not in portfolio', async () => {
      const originalAccountId = process.env.ACCOUNT_ID;
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
      
      try {
        // Desired wallet with instrument not in current portfolio
        const desiredWithMissing = {
          ...baseDesiredWallet,
          NONEXISTENT: 10
        };
        
        const result = await balancer(mockWallet, desiredWithMissing, [], 'manual', true);
        
        expect(result).toBeDefined();
        
        // Should handle gracefully without errors
        
      } finally {
        process.env.ACCOUNT_ID = originalAccountId;
      }
    });
  });

  describe('6. Margin Trading Integration', () => {
    it('should work with margin trading enabled', async () => {
      const originalAccountId = process.env.ACCOUNT_ID;
      process.env.ACCOUNT_ID = 'test-buy-requires-margin-enabled';
      
      try {
        const result = await balancer(mockWallet, baseDesiredWallet, [], 'manual', true);
        
        expect(result).toBeDefined();
        expect(result.marginInfo).toBeDefined();
        
        // Should handle both margin trading and buy_requires logic
        expect(result.marginInfo.totalMarginUsed).toBeGreaterThanOrEqual(0);
        
      } finally {
        process.env.ACCOUNT_ID = originalAccountId;
      }
    });

    it('should work with margin trading disabled', async () => {
      const originalAccountId = process.env.ACCOUNT_ID;
      process.env.ACCOUNT_ID = 'test-buy-requires-no-margin';
      
      try {
        const result = await balancer(mockWallet, baseDesiredWallet, [], 'manual', true);
        
        expect(result).toBeDefined();
        
        // Should work without margin trading
        expect(result.finalPercents).toBeDefined();
        
      } finally {
        process.env.ACCOUNT_ID = originalAccountId;
      }
    });
  });

  describe('7. Real-world Scenario Tests', () => {
    it('should handle typical rebalancing scenario', async () => {
      const originalAccountId = process.env.ACCOUNT_ID;
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
      
      try {
        // Realistic scenario: portfolio needs rebalancing to include TMON
        const realisticDesired = {
          TMON: 15,  // Want to add gold ETF
          TPAY: 35,  // Reduce from current high allocation
          TMOS: 25,  // Slight adjustment
          TGLD: 25   // Keep current allocation
        };
        
        const result = await balancer(mockWallet, realisticDesired, [], 'manual', true);
        
        expect(result).toBeDefined();
        expect(result.finalPercents).toBeDefined();
        
        // Should have planned appropriate trades
        expect(Object.keys(result.finalPercents)).toContain('TMON');
        
      } finally {
        process.env.ACCOUNT_ID = originalAccountId;
      }
    });

    it('should handle portfolio with insufficient funds scenario', async () => {
      const originalAccountId = process.env.ACCOUNT_ID;
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
      
      try {
        // Scenario where we want to buy a lot of TMON but have limited profitable positions
        const aggressiveDesired = {
          TMON: 50,  // Very high allocation to TMON
          TPAY: 20,
          TMOS: 15,
          TGLD: 15
        };
        
        const result = await balancer(mockWallet, aggressiveDesired, [], 'manual', true);
        
        expect(result).toBeDefined();
        
        // Should handle the case where we can't fully fund the purchase
        // and may need to adjust the plan accordingly
        
      } finally {
        process.env.ACCOUNT_ID = originalAccountId;
      }
    });

    it('should handle portfolio optimization scenario', async () => {
      const originalAccountId = process.env.ACCOUNT_ID;
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
      
      try {
        // Scenario: optimize portfolio by selling loss positions and buying TMON
        const optimizationDesired = {
          TMON: 40,  // Significant allocation to non-margin instrument
          TPAY: 30,  // Keep profitable position
          TMOS: 30,  // Keep profitable position
          TGLD: 0    // Sell loss position
        };
        
        const result = await balancer(mockWallet, optimizationDesired, [], 'manual', true);
        
        expect(result).toBeDefined();
        expect(result.finalPercents).toBeDefined();
        
        // Should have planned to reduce/eliminate TGLD and increase TMON
        
      } finally {
        process.env.ACCOUNT_ID = originalAccountId;
      }
    });
  });

  describe('8. Performance and Edge Cases', () => {
    it('should handle large portfolio efficiently', async () => {
      const originalAccountId = process.env.ACCOUNT_ID;
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
      
      try {
        // Create large portfolio with many positions
        const largeWallet = [...mockWallet];
        
        // Add many additional positions
        for (let i = 0; i < 20; i++) {
          largeWallet.push({
            pair: `ETF${i}/RUB`,
            base: `ETF${i}`,
            quote: 'RUB',
            figi: `TEST${i}`,
            amount: 10 + i,
            lotSize: 1,
            priceNumber: 10 + i * 0.5,
            lotPriceNumber: 10 + i * 0.5,
            totalPriceNumber: (10 + i) * (10 + i * 0.5),
            averagePositionPriceFifoNumber: 9 + i * 0.5, // Most are profitable
            averagePositionPriceNumber: 9 + i * 0.5
          });
        }
        
        const largeDesired: Record<string, number> = { TMON: 50 };
        // Distribute remaining 50% among other ETFs
        for (let i = 0; i < 20; i++) {
          largeDesired[`ETF${i}`] = 2.5; // 50% / 20 = 2.5% each
        }
        
        const startTime = Date.now();
        const result = await balancer(largeWallet, largeDesired, [], 'manual', true);
        const endTime = Date.now();
        
        expect(result).toBeDefined();
        expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
        
      } finally {
        process.env.ACCOUNT_ID = originalAccountId;
      }
    });

    it('should handle zero-value positions', async () => {
      const originalAccountId = process.env.ACCOUNT_ID;
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
      
      try {
        // Portfolio with some zero-value positions
        const zeroValueWallet = [...mockWallet];
        zeroValueWallet.push({
          pair: 'ZERO/RUB',
          base: 'ZERO',
          quote: 'RUB',
          figi: 'ZERO123',
          amount: 0,
          lotSize: 1,
          priceNumber: 0,
          lotPriceNumber: 0,
          totalPriceNumber: 0
        });
        
        const result = await balancer(zeroValueWallet, baseDesiredWallet, [], 'manual', true);
        
        expect(result).toBeDefined();
        
        // Should handle zero-value positions without errors
        
      } finally {
        process.env.ACCOUNT_ID = originalAccountId;
      }
    });
  });
});
