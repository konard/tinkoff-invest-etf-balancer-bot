import { describe, it, expect } from "bun:test";
import { 
  normalizeTicker, 
  tickersEqual, 
  convertTinkoffNumberToNumber, 
  convertNumberToTinkoffNumber,
  sumValues 
} from "../../utils";
import { TinkoffNumber } from "../../types.d";

describe("Utils Functions", () => {
  describe("normalizeTicker", () => {
    it("should remove @ suffix from ticker", () => {
      expect(normalizeTicker("TGLD@")).toBe("TGLD");
      expect(normalizeTicker("TRUR@")).toBe("TRUR");
    });

    it("should apply ticker aliases correctly", () => {
      expect(normalizeTicker("TRAY")).toBe("TPAY");
    });

    it("should handle undefined input", () => {
      expect(normalizeTicker(undefined)).toBeUndefined();
    });

    it("should trim whitespace", () => {
      expect(normalizeTicker("  TRUR  ")).toBe("TRUR");
    });

    it("should return normalized ticker for unknown tickers", () => {
      expect(normalizeTicker("UNKNOWN")).toBe("UNKNOWN");
    });
  });

  describe("tickersEqual", () => {
    it("should return true for equal normalized tickers", () => {
      expect(tickersEqual("TRAY", "TPAY")).toBe(true);
      expect(tickersEqual("TGLD@", "TGLD")).toBe(true);
      expect(tickersEqual("TRUR", "TRUR")).toBe(true);
    });

    it("should return false for different tickers", () => {
      expect(tickersEqual("TRUR", "TMOS")).toBe(false);
      expect(tickersEqual("TGLD", "TRAY")).toBe(false);
    });

    it("should handle undefined inputs", () => {
      expect(tickersEqual(undefined, "TRUR")).toBe(false);
      expect(tickersEqual("TRUR", undefined)).toBe(false);
      expect(tickersEqual(undefined, undefined)).toBe(false);
    });
  });

  describe("convertTinkoffNumberToNumber", () => {
    it("should convert TinkoffNumber to regular number", () => {
      const tinkoffNumber: TinkoffNumber = {
        units: 100,
        nano: 500000000
      };
      
      const result = convertTinkoffNumberToNumber(tinkoffNumber);
      expect(result).toBeCloseTo(100.5, 2);
    });

    it("should handle zero units", () => {
      const tinkoffNumber: TinkoffNumber = {
        units: 0,
        nano: 250000000
      };
      
      const result = convertTinkoffNumberToNumber(tinkoffNumber);
      expect(result).toBeCloseTo(0.25, 2);
    });

    it("should handle undefined units", () => {
      const tinkoffNumber: TinkoffNumber = {
        units: undefined as any,
        nano: 500000000
      };
      
      const result = convertTinkoffNumberToNumber(tinkoffNumber);
      expect(result).toBeCloseTo(0.5, 2);
    });

    it("should handle large numbers", () => {
      const tinkoffNumber: TinkoffNumber = {
        units: 1000000,
        nano: 999999999
      };
      
      const result = convertTinkoffNumberToNumber(tinkoffNumber);
      expect(result).toBeCloseTo(1000000.999999999, 6);
    });
  });

  describe("convertNumberToTinkoffNumber", () => {
    it("should convert regular number to TinkoffNumber", () => {
      const number = 100.5;
      const result = convertNumberToTinkoffNumber(number);
      
      expect(result.units).toBe(100);
      expect(result.nano).toBe(500000000);
    });

    it("should handle whole numbers", () => {
      const number = 150;
      const result = convertNumberToTinkoffNumber(number);
      
      expect(result.units).toBe(150);
      expect(result.nano).toBe(0);
    });

    it("should handle decimal numbers", () => {
      const number = 0.25;
      const result = convertNumberToTinkoffNumber(number);
      
      expect(result.units).toBe(0);
      expect(result.nano).toBe(250000000);
    });

    it("should handle very small numbers", () => {
      const number = 0.000000001; // 1 nano
      const result = convertNumberToTinkoffNumber(number);
      
      expect(result.units).toBe(0);
      expect(result.nano).toBe(1);
    });
  });

  describe("sumValues", () => {
    it("should sum numeric values from object", () => {
      const obj = {
        TRUR: 25,
        TMOS: 30,
        TGLD: 45
      };
      
      const result = sumValues(obj);
      expect(result).toBe(100);
    });

    it("should ignore non-numeric values", () => {
      const obj = {
        TRUR: 25,
        TMOS: "invalid",
        TGLD: 45,
        TRAY: null,
        TBRU: undefined
      };
      
      const result = sumValues(obj);
      expect(result).toBe(70);
    });

    it("should handle empty object", () => {
      const obj = {};
      const result = sumValues(obj);
      expect(result).toBe(0);
    });

    it("should handle null/undefined object", () => {
      expect(sumValues(null as any)).toBe(0);
      expect(sumValues(undefined as any)).toBe(0);
    });

    it("should ignore NaN values", () => {
      const obj = {
        TRUR: 25,
        TMOS: NaN,
        TGLD: 45
      };
      
      const result = sumValues(obj);
      expect(result).toBe(70);
    });

    it("should handle negative numbers", () => {
      const obj = {
        TRUR: 25,
        TMOS: -10,
        TGLD: 45
      };
      
      const result = sumValues(obj);
      expect(result).toBe(60);
    });
  });

  describe("Integration Tests", () => {
    it("should maintain precision in number conversions", () => {
      const originalNumber = 123.456789123;
      const tinkoffNumber = convertNumberToTinkoffNumber(originalNumber);
      const convertedBack = convertTinkoffNumberToNumber(tinkoffNumber);
      
      expect(convertedBack).toBeCloseTo(originalNumber, 6);
    });

    it("should handle ticker normalization in equality checks", () => {
      // Test the full flow of ticker normalization
      expect(tickersEqual("TRAY@", " TPAY ")).toBe(true);
      expect(tickersEqual("TGLD@", "TGLD")).toBe(true);
      expect(tickersEqual("  TRUR  ", "TRUR")).toBe(true);
    });
  });
});