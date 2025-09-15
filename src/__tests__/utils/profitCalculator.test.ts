import { describe, it, expect, beforeEach } from "bun:test";
import { ProfitCalculator } from "../../utils/profitCalculator";
import { Wallet, Position } from "../../types.d";

describe("ProfitCalculator", () => {
  let profitCalculator: ProfitCalculator;

  beforeEach(() => {
    profitCalculator = new ProfitCalculator();
  });

  describe("calculatePositionProfitLoss", () => {
    it("should calculate profit for a profitable position", () => {
      const position: Position = {
        base: "TRUR",
        quote: "RUB",
        figi: "test-figi-1",
        amount: 100,
        totalPriceNumber: 12000, // Current value: 120 RUB per share * 100 shares
      };

      const portfolioPositions = [
        {
          figi: "test-figi-1",
          averagePositionPrice: { units: 100, nano: 0 }, // Bought at 100 RUB per share
        },
      ];

      const result = profitCalculator.calculatePositionProfitLoss(position, portfolioPositions);

      expect(result).toBeDefined();
      expect(result!.ticker).toBe("TRUR");
      expect(result!.currentPositionValue).toBe(12000);
      expect(result!.originalCost).toBe(10000); // 100 RUB * 100 shares
      expect(result!.profitAmount).toBe(2000); // 12000 - 10000
      expect(result!.profitPercentage).toBe(20); // (2000 / 10000) * 100
      expect(result!.isMarginPosition).toBe(false);
    });

    it("should calculate loss for a losing position", () => {
      const position: Position = {
        base: "TMOS",
        quote: "RUB",
        figi: "test-figi-2",
        amount: 50,
        totalPriceNumber: 4500, // Current value: 90 RUB per share * 50 shares
      };

      const portfolioPositions = [
        {
          figi: "test-figi-2",
          averagePositionPriceFifo: { units: 110, nano: 0 }, // Bought at 110 RUB per share
        },
      ];

      const result = profitCalculator.calculatePositionProfitLoss(position, portfolioPositions);

      expect(result).toBeDefined();
      expect(result!.ticker).toBe("TMOS");
      expect(result!.currentPositionValue).toBe(4500);
      expect(result!.originalCost).toBe(5500); // 110 RUB * 50 shares
      expect(result!.profitAmount).toBe(-1000); // 4500 - 5500
      expect(result!.profitPercentage).toBeCloseTo(-18.18, 2); // (-1000 / 5500) * 100
    });

    it("should return null for currency positions", () => {
      const position: Position = {
        base: "RUB",
        quote: "RUB",
        figi: undefined,
        amount: 1000,
        totalPriceNumber: 1000,
      };

      const result = profitCalculator.calculatePositionProfitLoss(position, []);

      expect(result).toBeNull();
    });

    it("should return null when portfolio position is not found", () => {
      const position: Position = {
        base: "UNKNOWN",
        quote: "RUB",
        figi: "unknown-figi",
        amount: 100,
        totalPriceNumber: 10000,
      };

      const result = profitCalculator.calculatePositionProfitLoss(position, []);

      expect(result).toBeNull();
    });

    it("should return null when no average price is available", () => {
      const position: Position = {
        base: "TEST",
        quote: "RUB",
        figi: "test-figi",
        amount: 100,
        totalPriceNumber: 10000,
      };

      const portfolioPositions = [
        {
          figi: "test-figi",
          // No averagePositionPrice or averagePositionPriceFifo
        },
      ];

      const result = profitCalculator.calculatePositionProfitLoss(position, portfolioPositions);

      expect(result).toBeNull();
    });
  });

  describe("calculateIterationProfitSummary", () => {
    it("should calculate summary for multiple positions", () => {
      const wallet: Wallet = [
        {
          base: "TRUR",
          quote: "RUB",
          figi: "figi-1",
          amount: 100,
          totalPriceNumber: 12000,
        },
        {
          base: "TMOS",
          quote: "RUB",
          figi: "figi-2",
          amount: 50,
          totalPriceNumber: 4500,
        },
        {
          base: "RUB",
          quote: "RUB",
          amount: 1000,
          totalPriceNumber: 1000,
        },
      ];

      const portfolioPositions = [
        {
          figi: "figi-1",
          averagePositionPrice: { units: 100, nano: 0 },
        },
        {
          figi: "figi-2",
          averagePositionPrice: { units: 110, nano: 0 },
        },
      ];

      const summary = profitCalculator.calculateIterationProfitSummary(wallet, portfolioPositions);

      expect(summary.totalProfit).toBe(1000); // 2000 profit - 1000 loss
      expect(summary.totalProfitPercentage).toBeCloseTo(6.45, 2); // 1000 / (10000 + 5500) * 100
      expect(summary.profitPositions).toBe(1);
      expect(summary.lossPositions).toBe(1);
      expect(summary.profitLossRecords).toHaveLength(2);
    });

    it("should handle empty wallet", () => {
      const summary = profitCalculator.calculateIterationProfitSummary([], []);

      expect(summary.totalProfit).toBe(0);
      expect(summary.totalProfitPercentage).toBe(0);
      expect(summary.profitPositions).toBe(0);
      expect(summary.lossPositions).toBe(0);
      expect(summary.profitLossRecords).toHaveLength(0);
    });
  });

  describe("formatProfitAmount", () => {
    it("should format positive amounts with plus sign", () => {
      expect(profitCalculator.formatProfitAmount(1234.56)).toBe("+1234.56 RUB");
    });

    it("should format negative amounts with minus sign", () => {
      expect(profitCalculator.formatProfitAmount(-1234.56)).toBe("-1234.56 RUB");
    });

    it("should format zero without sign", () => {
      expect(profitCalculator.formatProfitAmount(0)).toBe("+0.00 RUB");
    });
  });

  describe("formatProfitPercentage", () => {
    it("should format positive percentages with plus sign", () => {
      expect(profitCalculator.formatProfitPercentage(12.345)).toBe("+12.35%");
    });

    it("should format negative percentages with minus sign", () => {
      expect(profitCalculator.formatProfitPercentage(-12.345)).toBe("-12.35%");
    });

    it("should format zero without sign", () => {
      expect(profitCalculator.formatProfitPercentage(0)).toBe("+0.00%");
    });
  });
});