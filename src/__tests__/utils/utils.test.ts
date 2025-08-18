import { describe, it, expect } from "bun:test";
import { 
  normalizeTicker, 
  tickersEqual, 
  convertTinkoffNumberToNumber,
  convertNumberToTinkoffNumber,
  zeroPad,
  sumValues
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
});
