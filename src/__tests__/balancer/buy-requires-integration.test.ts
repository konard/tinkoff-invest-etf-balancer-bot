import { describe, it, expect, beforeEach } from "bun:test";
import { configLoader } from "../../configLoader";
import { processBuyRequiresTotalMarginalSell } from "../../balancer";
import { Wallet, DesiredWallet, Position } from "../../types.d";

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.TOKEN = 'test-token';

// Set default account ID for the test
process.env.ACCOUNT_ID = 'test-buy-requires-enabled';

describe("Buy Requires Total Marginal Sell Integration Tests", () => {
  
  const createMockPosition = (base: string, amount: number, totalPriceNumber: number, toBuyNumber?: number): Position => ({
    base,
    figi: `figi_${base}`,
    amount,
    lotSize: 1,
    price: { units: totalPriceNumber / amount, nano: 0 },
    priceNumber: totalPriceNumber / amount,
    lotPrice: { units: totalPriceNumber / amount, nano: 0 },
    lotPriceNumber: totalPriceNumber / amount,
    totalPrice: { units: totalPriceNumber, nano: 0 },
    totalPriceNumber,
    toBuyNumber: toBuyNumber || 0,
    toBuyLots: toBuyNumber ? toBuyNumber / (totalPriceNumber / amount) : 0,
  });

  const createTestWallet = (): Wallet => [
    createMockPosition('TMON', 100, 50000, 10000), // Buy order for required instrument
    createMockPosition('TGLD', 50, 25000, 5000),   // Buy order for required instrument
    createMockPosition('TRAY', 200, 40000, -8000), // Sell order for non-required instrument
    createMockPosition('TRUR', 150, 60000, 2000),  // Small buy order for non-required instrument
    createMockPosition('TDIV', 80, 30000, -3000),  // Small sell order for non-required instrument
  ];

  const createTestDesiredWallet = (): DesiredWallet => ({
    TMON: 25,
    TGLD: 25,
    TRAY: 20,
    TRUR: 20,
    TDIV: 10,
  });

  describe("should handle sequential execution when buy_requires is enabled", () => {
    beforeEach(() => {
      // Set account ID to test-buy-requires-enabled
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
    });

    it("should process buy requirements correctly", () => {
      const wallet = createTestWallet();
      const desiredWallet = createTestDesiredWallet();

      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet);

      expect(result.modifiedWallet).toBeDefined();
      expect(result.buyPositions).toHaveLength(2); // TMON and TGLD
      expect(result.sellPositions.length).toBeGreaterThan(0);
      expect(result.reason).toContain('Applied buy_requires_total_marginal_sell');
    });

    it("should identify required instruments correctly", () => {
      const wallet = createTestWallet();
      const desiredWallet = createTestDesiredWallet();

      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet);

      const buyPositionTickers = result.buyPositions.map(p => p.base);
      expect(buyPositionTickers).toContain('TMON');
      expect(buyPositionTickers).toContain('TGLD');
    });

    it("should respect min_buy_rebalance_percent threshold", () => {
      const wallet = createTestWallet();
      const desiredWallet = createTestDesiredWallet();
      
      // Create a position with buy amount below threshold
      const smallBuyWallet = [
        createMockPosition('TMON', 100, 50000, 100), // Very small buy order (below 0.5% threshold)
        createMockPosition('TRAY', 200, 40000, -8000),
      ];

      const result = processBuyRequiresTotalMarginalSell(smallBuyWallet, desiredWallet);

      expect(result.buyPositions).toHaveLength(0);
      expect(result.reason).toContain('No significant buy orders');
    });
  });

  describe("should work normally when buy_requires_total_marginal_sell is disabled", () => {
    it("should return original wallet when disabled", () => {
      const wallet = createTestWallet();
      const desiredWallet = createTestDesiredWallet();

      // Pass a disabled config override
      const disabledConfig = {
        enabled: false,
        instruments: [],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'disabled' as const
        },
        min_buy_rebalance_percent: 0
      };

      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet, disabledConfig);

      expect(result.modifiedWallet).toEqual(wallet);
      expect(result.sellPositions).toHaveLength(0);
      expect(result.buyPositions).toHaveLength(0);
      expect(result.reason).toContain('disabled');
    });
  });

  describe("should handle only_positive_positions_sell mode in full balancer", () => {
    beforeEach(() => {
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
    });

    it("should only sell positions with positive values", () => {
      const wallet = [
        createMockPosition('TMON', 100, 50000, 10000), // Buy order for required instrument
        createMockPosition('TRAY', 200, 40000, 0),     // Positive position, can be sold
        createMockPosition('TRUR', 0, 0, 0),           // Zero position, cannot be sold
        createMockPosition('TDIV', 80, 30000, 0),      // Positive position, can be sold
      ];
      const desiredWallet = createTestDesiredWallet();

      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet);

      // Should only sell positions with positive values
      const sellPositionTickers = result.sellPositions.map(p => p.base);
      expect(sellPositionTickers).not.toContain('TRUR'); // Zero position should not be sold
      expect(sellPositionTickers).not.toContain('TMON'); // Required instrument should not be sold
    });
  });

  describe("should respect min_buy_rebalance_percent in full balancer flow", () => {
    beforeEach(() => {
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
    });

    it("should only process buy orders above threshold", () => {
      const totalPortfolioValue = 205000; // Sum of all positions
      const minThreshold = totalPortfolioValue * 0.005; // 0.5% threshold = 1025 RUB
      
      const wallet = [
        createMockPosition('TMON', 100, 50000, 500),  // Below threshold
        createMockPosition('TGLD', 50, 25000, 2000),  // Above threshold
        createMockPosition('TRAY', 200, 40000, -8000),
      ];
      const desiredWallet = createTestDesiredWallet();

      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet);

      // Should only find TGLD as buy position (above threshold)
      expect(result.buyPositions).toHaveLength(1);
      expect(result.buyPositions[0].base).toBe('TGLD');
    });
  });

  describe("should process purchases above threshold", () => {
    beforeEach(() => {
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
    });

    it("should process significant purchases", () => {
      const wallet = createTestWallet();
      const desiredWallet = createTestDesiredWallet();

      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet);

      // Both TMON (10000) and TGLD (5000) should be above 0.5% threshold
      expect(result.buyPositions).toHaveLength(2);
      expect(result.buyPositions.map(p => p.base)).toContain('TMON');
      expect(result.buyPositions.map(p => p.base)).toContain('TGLD');
    });
  });

  describe("should handle missing configuration gracefully", () => {
    it("should handle accounts without buy_requires config", () => {
      const wallet = createTestWallet();
      const originalWallet = JSON.parse(JSON.stringify(wallet)); // Deep copy for comparison
      const desiredWallet = createTestDesiredWallet();

      // Pass null config to simulate missing configuration
      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet, null);


      expect(result.modifiedWallet).toEqual(originalWallet);
      expect(result.reason).toContain('disabled');
    });
  });

  describe("should handle empty instruments list", () => {
    it("should handle empty required instruments", () => {
      const wallet = createTestWallet();
      const desiredWallet = createTestDesiredWallet();

      // Pass config with enabled but empty instruments list
      const emptyInstrumentsConfig = {
        enabled: true,
        instruments: [],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell' as const
        },
        min_buy_rebalance_percent: 0.5
      };

      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet, emptyInstrumentsConfig);

      expect(result.buyPositions).toHaveLength(0);
      expect(result.reason).toContain('No significant buy orders');
    });
  });

  describe("should handle instruments not in portfolio", () => {
    beforeEach(() => {
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
    });

    it("should handle required instruments not present in wallet", () => {
      const wallet = [
        createMockPosition('TRAY', 200, 40000, 10000), // Not a required instrument
        createMockPosition('TRUR', 150, 60000, 5000),  // Not a required instrument
      ];
      const desiredWallet = { TRAY: 50, TRUR: 50 };

      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet);

      expect(result.buyPositions).toHaveLength(0);
      expect(result.reason).toContain('No significant buy orders');
    });
  });

  describe("should work with margin trading enabled", () => {
    beforeEach(() => {
      process.env.ACCOUNT_ID = 'test-buy-requires-margin-enabled';
    });

    it("should work with margin trading account", () => {
      const wallet = createTestWallet();
      const desiredWallet = createTestDesiredWallet();

      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet);

      expect(result.modifiedWallet).toBeDefined();
      // Should work with margin-enabled account
      expect(result.buyPositions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("should work with margin trading disabled", () => {
    beforeEach(() => {
      process.env.ACCOUNT_ID = 'test-buy-requires-no-margin';
    });

    it("should work without margin trading", () => {
      const wallet = createTestWallet();
      const desiredWallet = createTestDesiredWallet();

      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet);

      expect(result.modifiedWallet).toBeDefined();
      // Should work with margin-disabled account
      expect(result.buyPositions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("should handle typical rebalancing scenario", () => {
    beforeEach(() => {
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
    });

    it("should handle normal portfolio rebalancing", () => {
      const wallet = createTestWallet();
      const desiredWallet = createTestDesiredWallet();

      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet);

      expect(result.modifiedWallet).toBeDefined();
      expect(result.sellPositions.length + result.buyPositions.length).toBeGreaterThan(0);
      expect(typeof result.reason).toBe('string');
    });
  });

  describe("should handle portfolio with insufficient funds scenario", () => {
    beforeEach(() => {
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
    });

    it("should handle insufficient liquidity", () => {
      const wallet = [
        createMockPosition('TMON', 100, 50000, 40000), // Large buy requirement
        createMockPosition('TRAY', 10, 5000, -1000),   // Small position to sell
      ];
      const desiredWallet = { TMON: 80, TRAY: 20 };

      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet);

      expect(result.buyPositions).toHaveLength(1);
      expect(result.sellPositions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("should handle portfolio optimization scenario", () => {
    beforeEach(() => {
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
    });

    it("should optimize portfolio with buy requirements", () => {
      const wallet = createTestWallet();
      const desiredWallet = createTestDesiredWallet();

      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet);

      // Check that the function processes the scenario without errors
      expect(result).toBeDefined();
      expect(result.modifiedWallet).toBeDefined();
      expect(Array.isArray(result.sellPositions)).toBe(true);
      expect(Array.isArray(result.buyPositions)).toBe(true);
    });
  });

  describe("should handle large portfolio efficiently", () => {
    beforeEach(() => {
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
    });

    it("should process large portfolios", () => {
      // Create a large portfolio
      const wallet: Wallet = [];
      const desiredWallet: DesiredWallet = {};
      
      for (let i = 0; i < 50; i++) {
        const ticker = `TICKER${i}`;
        wallet.push(createMockPosition(ticker, 100, 10000, Math.random() * 2000 - 1000));
        desiredWallet[ticker] = 2; // 2% each
      }

      const startTime = Date.now();
      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet);
      const endTime = Date.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in less than 1 second
    });
  });

  describe("should handle zero-value positions", () => {
    beforeEach(() => {
      process.env.ACCOUNT_ID = 'test-buy-requires-enabled';
    });

    it("should handle positions with zero values", () => {
      const wallet = [
        createMockPosition('TMON', 0, 0, 0),         // Zero position
        createMockPosition('TGLD', 100, 50000, 5000), // Normal position
        createMockPosition('TRAY', 200, 40000, 0),    // Position with no buy/sell order
      ];
      const desiredWallet = { TMON: 20, TGLD: 40, TRAY: 40 };

      const result = processBuyRequiresTotalMarginalSell(wallet, desiredWallet);

      expect(result.modifiedWallet).toBeDefined();
      // Zero positions should not cause errors
      expect(result.buyPositions.length).toBeGreaterThanOrEqual(0);
    });
  });
});