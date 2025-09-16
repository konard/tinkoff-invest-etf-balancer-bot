import { describe, it, expect } from "bun:test";
import {
  normalizeTicker,
  tickersEqual,
  convertTinkoffNumberToNumber,
  convertNumberToTinkoffNumber,
  zeroPad,
  sumValues,
  calculatePositionProfit,
  canSellPosition
} from "../../utils";
import { Position } from "../../types.d";

describe("Utils", () => {
  describe("normalizeTicker", () => {
    it("should normalize TRAY to TPAY", () => {
      expect(normalizeTicker("TRAY")).toBe("TPAY");
    });
    
    it("should remove @ suffix", () => {
      expect(normalizeTicker("TGLD@")).toBe("TGLD");
    });
    
    it("should handle undefined input", () => {
      expect(normalizeTicker(undefined)).toBeUndefined();
    });
    
    it("should handle empty string", () => {
      expect(normalizeTicker("")).toBe("");
    });
    
    it("should handle normal ticker", () => {
      expect(normalizeTicker("TRUR")).toBe("TRUR");
    });
    
    it("should trim whitespace", () => {
      expect(normalizeTicker(" TRUR ")).toBe("TRUR");
    });
  });

  describe("tickersEqual", () => {
    it("should return true for equal normalized tickers", () => {
      expect(tickersEqual("TRAY", "TPAY")).toBe(true);
    });
    
    it("should return true for same tickers", () => {
      expect(tickersEqual("TRUR", "TRUR")).toBe(true);
    });
    
    it("should return false for different tickers", () => {
      expect(tickersEqual("TRUR", "TMOS")).toBe(false);
    });
    
    it("should return false for undefined inputs", () => {
      expect(tickersEqual(undefined, "TRUR")).toBe(false);
      expect(tickersEqual("TRUR", undefined)).toBe(false);
      expect(tickersEqual(undefined, undefined)).toBe(false);
    });
  });

  describe("convertTinkoffNumberToNumber", () => {
    it("should convert with units and nano", () => {
      const result = convertTinkoffNumberToNumber({ units: 10, nano: 500000000 });
      expect(result).toBe(10.5);
    });
    
    it("should convert with only nano", () => {
      const result = convertTinkoffNumberToNumber({ units: undefined, nano: 500000000 });
      expect(result).toBe(0.5);
    });
    
    it("should handle zero values", () => {
      const result = convertTinkoffNumberToNumber({ units: 0, nano: 0 });
      expect(result).toBe(0);
    });
    
    it("should handle large numbers", () => {
      const result = convertTinkoffNumberToNumber({ units: 1000000, nano: 123456789 });
      expect(result).toBe(1000000.123456789);
    });
  });

  describe("convertNumberToTinkoffNumber", () => {
    it("should convert integer", () => {
      const result = convertNumberToTinkoffNumber(10);
      expect(result.units).toBe(10);
      expect(result.nano).toBe(0);
    });
    
    it("should convert decimal", () => {
      const result = convertNumberToTinkoffNumber(10.5);
      expect(result.units).toBe(10);
      expect(result.nano).toBe(500000000);
    });
    
    it("should handle zero", () => {
      const result = convertNumberToTinkoffNumber(0);
      expect(result.units).toBe(0);
      expect(result.nano).toBe(0);
    });
    
    it("should handle small decimals", () => {
      const result = convertNumberToTinkoffNumber(0.001);
      expect(result.units).toBe(0);
      expect(result.nano).toBe(1000000);
    });
  });

  describe("zeroPad", () => {
    it("should pad single digit", () => {
      expect(zeroPad(5, 3)).toBe("005");
    });
    
    it("should not pad if already long enough", () => {
      expect(zeroPad(123, 2)).toBe("123");
    });
    
    it("should handle zero", () => {
      expect(zeroPad(0, 3)).toBe("000");
    });
    
    it("should handle string input", () => {
      expect(zeroPad("7", 4)).toBe("0007");
    });
  });

  describe("sumValues", () => {
    it("should sum numeric values", () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(sumValues(obj)).toBe(6);
    });
    
    it("should handle empty object", () => {
      const obj = {};
      expect(sumValues(obj)).toBe(0);
    });
    
    it("should handle mixed types", () => {
      const obj = { a: 1, b: "2", c: 3 };
      expect(sumValues(obj)).toBe(4); // Only numbers are summed
    });
  });

  describe("calculatePositionProfit", () => {
    const createTestPosition = (amount: number, priceNumber: number): Position => ({
      base: "TEST",
      quote: "RUB",
      amount,
      priceNumber,
      figi: "TEST001",
      lotSize: 1
    });

    it("should calculate profit for winning position", () => {
      const position = createTestPosition(100, 10); // Bought 100 shares at 10 RUB each
      const currentPrice = 12; // Current price is 12 RUB
      const result = calculatePositionProfit(position, currentPrice);

      expect(result).not.toBeNull();
      expect(result!.profitAmount).toBe(200); // (12-10) * 100
      expect(result!.profitPercent).toBe(20); // 20% profit
      expect(result!.meetsThreshold).toBe(true); // No threshold specified
    });

    it("should calculate loss for losing position", () => {
      const position = createTestPosition(100, 10);
      const currentPrice = 8;
      const result = calculatePositionProfit(position, currentPrice);

      expect(result).not.toBeNull();
      expect(result!.profitAmount).toBe(-200); // (8-10) * 100
      expect(result!.profitPercent).toBe(-20); // -20% loss
      expect(result!.meetsThreshold).toBe(true); // No threshold specified
    });

    it("should check profit threshold correctly", () => {
      const position = createTestPosition(100, 10);
      const currentPrice = 12;
      const minProfitPercent = 15; // Require 15% minimum profit
      const result = calculatePositionProfit(position, currentPrice, minProfitPercent);

      expect(result).not.toBeNull();
      expect(result!.profitPercent).toBe(20);
      expect(result!.meetsThreshold).toBe(true); // 20% > 15%
    });

    it("should fail profit threshold", () => {
      const position = createTestPosition(100, 10);
      const currentPrice = 11; // Only 10% profit
      const minProfitPercent = 15; // Require 15% minimum profit
      const result = calculatePositionProfit(position, currentPrice, minProfitPercent);

      expect(result).not.toBeNull();
      expect(result!.profitPercent).toBe(10);
      expect(result!.meetsThreshold).toBe(false); // 10% < 15%
    });

    it("should allow negative thresholds for loss tolerance", () => {
      const position = createTestPosition(100, 10);
      const currentPrice = 9; // -10% loss
      const minProfitPercent = -5; // Allow up to 5% loss
      const result = calculatePositionProfit(position, currentPrice, minProfitPercent);

      expect(result).not.toBeNull();
      expect(result!.profitPercent).toBe(-10);
      expect(result!.meetsThreshold).toBe(false); // -10% < -5%
    });

    it("should allow small losses within threshold", () => {
      const position = createTestPosition(100, 10);
      const currentPrice = 9.7; // -3% loss
      const minProfitPercent = -5; // Allow up to 5% loss
      const result = calculatePositionProfit(position, currentPrice, minProfitPercent);

      expect(result).not.toBeNull();
      expect(result!.profitPercent).toBeCloseTo(-3, 5);
      expect(result!.meetsThreshold).toBe(true); // -3% > -5%
    });

    it("should use position price when no current price provided", () => {
      const position = createTestPosition(100, 10);
      const result = calculatePositionProfit(position);

      expect(result).not.toBeNull();
      expect(result!.profitAmount).toBe(0); // Same price
      expect(result!.profitPercent).toBe(0);
    });

    it("should return null for invalid position data", () => {
      const invalidPosition: Position = { base: "TEST", quote: "RUB" };
      const result = calculatePositionProfit(invalidPosition, 10);

      expect(result).toBeNull();
    });

    it("should return null for zero amount", () => {
      const position = createTestPosition(0, 10);
      const result = calculatePositionProfit(position, 12);

      expect(result).toBeNull();
    });

    it("should return null for invalid current price", () => {
      const position = createTestPosition(100, 10);
      const result = calculatePositionProfit(position, 0);

      expect(result).toBeNull();
    });
  });

  describe("canSellPosition", () => {
    const createTestPosition = (amount: number, priceNumber: number): Position => ({
      base: "TEST",
      quote: "RUB",
      amount,
      priceNumber,
      figi: "TEST001",
      lotSize: 1
    });

    it("should allow selling when no threshold configured", () => {
      const position = createTestPosition(100, 10);
      expect(canSellPosition(position, 8)).toBe(true); // Even at a loss
    });

    it("should allow selling when threshold is met", () => {
      const position = createTestPosition(100, 10);
      expect(canSellPosition(position, 12, 15)).toBe(true); // 20% > 15%
    });

    it("should prevent selling when threshold not met", () => {
      const position = createTestPosition(100, 10);
      expect(canSellPosition(position, 11, 15)).toBe(false); // 10% < 15%
    });

    it("should allow selling with negative threshold", () => {
      const position = createTestPosition(100, 10);
      expect(canSellPosition(position, 9.7, -5)).toBe(true); // -3% > -5%
    });

    it("should prevent selling beyond loss threshold", () => {
      const position = createTestPosition(100, 10);
      expect(canSellPosition(position, 8, -5)).toBe(false); // -20% < -5%
    });

    it("should allow selling when profit calculation fails", () => {
      const invalidPosition: Position = { base: "TEST", quote: "RUB" };
      expect(canSellPosition(invalidPosition, 10, 5)).toBe(true); // Graceful fallback
    });
  });
});
