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
    it("should calculate profit correctly for profitable position", () => {
      const result = calculatePositionProfit(1200, 1000, 5);
      expect(result).not.toBeNull();
      expect(result?.profitAmount).toBe(200);
      expect(result?.profitPercent).toBe(20);
      expect(result?.meetsThreshold).toBe(true);
    });

    it("should calculate profit correctly for losing position", () => {
      const result = calculatePositionProfit(800, 1000, 5);
      expect(result).not.toBeNull();
      expect(result?.profitAmount).toBe(-200);
      expect(result?.profitPercent).toBe(-20);
      expect(result?.meetsThreshold).toBe(false);
    });

    it("should meet threshold with negative threshold (max loss)", () => {
      const result = calculatePositionProfit(900, 1000, -5);
      expect(result).not.toBeNull();
      expect(result?.profitPercent).toBe(-10);
      expect(result?.meetsThreshold).toBe(false); // -10% < -5% (more loss than allowed)
    });

    it("should meet threshold with negative threshold within limit", () => {
      const result = calculatePositionProfit(980, 1000, -5);
      expect(result).not.toBeNull();
      expect(result?.profitPercent).toBe(-2);
      expect(result?.meetsThreshold).toBe(true); // -2% >= -5% (less loss than max allowed)
    });

    it("should always meet threshold when no threshold is set", () => {
      const result = calculatePositionProfit(800, 1000);
      expect(result).not.toBeNull();
      expect(result?.profitPercent).toBe(-20);
      expect(result?.meetsThreshold).toBe(true);
    });

    it("should return null for invalid cost basis", () => {
      const result = calculatePositionProfit(1000, 0, 5);
      expect(result).toBeNull();
    });

    it("should return null for negative current value", () => {
      const result = calculatePositionProfit(-100, 1000, 5);
      expect(result).toBeNull();
    });
  });

  describe("canSellPosition", () => {
    it("should allow selling when no threshold is set", () => {
      const position = {
        totalPriceNumber: 1200,
        amount: 10,
        averagePositionPriceNumber: 100,
        base: "TRUR"
      };
      expect(canSellPosition(position)).toBe(true);
    });

    it("should allow selling profitable position meeting threshold", () => {
      const position = {
        totalPriceNumber: 1200,
        amount: 10,
        averagePositionPriceNumber: 100, // Cost basis: 10 * 100 = 1000
        base: "TRUR"
      };
      // Current value 1200 vs cost 1000 = 20% profit, meets 5% threshold
      expect(canSellPosition(position, 5)).toBe(true);
    });

    it("should prevent selling position not meeting threshold", () => {
      const position = {
        totalPriceNumber: 800,
        amount: 10,
        averagePositionPriceNumber: 100, // Cost basis: 10 * 100 = 1000
        base: "TRUR"
      };
      // Current value 800 vs cost 1000 = -20% loss, doesn't meet 5% threshold
      expect(canSellPosition(position, 5)).toBe(false);
    });

    it("should allow selling with negative threshold (max loss)", () => {
      const position = {
        totalPriceNumber: 980,
        amount: 10,
        averagePositionPriceNumber: 100, // Cost basis: 10 * 100 = 1000
        base: "TRUR"
      };
      // Current value 980 vs cost 1000 = -2% loss, meets -5% max loss threshold
      expect(canSellPosition(position, -5)).toBe(true);
    });

    it("should prevent selling exceeding max loss threshold", () => {
      const position = {
        totalPriceNumber: 900,
        amount: 10,
        averagePositionPriceNumber: 100, // Cost basis: 10 * 100 = 1000
        base: "TRUR"
      };
      // Current value 900 vs cost 1000 = -10% loss, exceeds -5% max loss threshold
      expect(canSellPosition(position, -5)).toBe(false);
    });

    it("should allow selling when missing cost basis data", () => {
      const position = {
        totalPriceNumber: 800,
        amount: 10,
        // averagePositionPriceNumber missing
        base: "TRUR"
      };
      // Should allow selling when we can't determine profit
      expect(canSellPosition(position, 5)).toBe(true);
    });

    it("should allow selling when missing position data", () => {
      const position = {
        totalPriceNumber: 800,
        // amount missing
        averagePositionPriceNumber: 100,
        base: "TRUR"
      };
      expect(canSellPosition(position, 5)).toBe(true);
    });
  });
});
