import { describe, it, expect, beforeEach } from "bun:test";
import { 
  normalizeTicker, 
  tickersEqual, 
  convertTinkoffNumberToNumber, 
  convertNumberToTinkoffNumber,
  sumValues,
  sleep,
  zeroPad
} from "../../utils";
import { TinkoffNumber } from "../../types.d";

// Import test utilities
import { 
  TestEnvironment, 
  FinancialAssertions, 
  PerformanceTestUtils,
  testSuite
} from '../test-utils';

testSuite('Utils Module Comprehensive Tests', () => {
  describe('Ticker Utilities', () => {
    describe('normalizeTicker', () => {
      it('should remove @ suffix from ticker', () => {
        expect(normalizeTicker("TGLD@")).toBe("TGLD");
        expect(normalizeTicker("TRUR@")).toBe("TRUR");
        expect(normalizeTicker("TMOS@")).toBe("TMOS");
      });

      it('should apply ticker aliases correctly', () => {
        expect(normalizeTicker("TRAY")).toBe("TPAY");
      });

      it('should handle undefined and null input', () => {
        expect(normalizeTicker(undefined)).toBeUndefined();
      });

      it('should trim whitespace', () => {
        expect(normalizeTicker("  TRUR  ")).toBe("TRUR");
        expect(normalizeTicker("\tTMOS\n")).toBe("TMOS");
      });

      it('should return unchanged ticker for unknown tickers', () => {
        expect(normalizeTicker("UNKNOWN")).toBe("UNKNOWN");
        expect(normalizeTicker("NEW_TICKER")).toBe("NEW_TICKER");
      });

      it('should handle edge cases', () => {
        expect(normalizeTicker("")).toBe("");
        expect(normalizeTicker("@")).toBe("");
        expect(normalizeTicker("@@")).toBe("@");
        expect(normalizeTicker("A@B@")).toBe("A@B");
      });
    });

    describe('tickersEqual', () => {
      it('should return true for equal normalized tickers', () => {
        expect(tickersEqual("TRAY", "TPAY")).toBe(true);
        expect(tickersEqual("TGLD@", "TGLD")).toBe(true);
        expect(tickersEqual("TRUR", "TRUR")).toBe(true);
        expect(tickersEqual("  TMOS  ", "TMOS")).toBe(true);
      });

      it('should return false for different tickers', () => {
        expect(tickersEqual("TRUR", "TMOS")).toBe(false);
        expect(tickersEqual("TGLD", "TRAY")).toBe(false);
        expect(tickersEqual("KNOWN", "UNKNOWN")).toBe(false);
      });

      it('should handle undefined and null inputs', () => {
        expect(tickersEqual(undefined, "TRUR")).toBe(false);
        expect(tickersEqual("TRUR", undefined)).toBe(false);
        expect(tickersEqual(undefined, undefined)).toBe(false);
      });

      it('should handle empty strings', () => {
        expect(tickersEqual("", "")).toBe(false);
        expect(tickersEqual("", "TRUR")).toBe(false);
        expect(tickersEqual("TRUR", "")).toBe(false);
      });
    });
  });

  describe('Number Conversion Utilities', () => {
    describe('convertTinkoffNumberToNumber', () => {
      it('should convert standard TinkoffNumber to regular number', () => {
        const tinkoffNumber: TinkoffNumber = {
          units: 100,
          nano: 500000000
        };
        
        const result = convertTinkoffNumberToNumber(tinkoffNumber);
        expect(result).toBeCloseTo(100.5, 9);
      });

      it('should handle zero units', () => {
        const tinkoffNumber: TinkoffNumber = {
          units: 0,
          nano: 250000000
        };
        
        const result = convertTinkoffNumberToNumber(tinkoffNumber);
        expect(result).toBeCloseTo(0.25, 9);
      });

      it('should handle undefined units', () => {
        const tinkoffNumber: TinkoffNumber = {
          units: undefined as any,
          nano: 500000000
        };
        
        const result = convertTinkoffNumberToNumber(tinkoffNumber);
        expect(result).toBeCloseTo(0.5, 9);
      });

      it('should handle large numbers', () => {
        const tinkoffNumber: TinkoffNumber = {
          units: 1000000,
          nano: 999999999
        };
        
        const result = convertTinkoffNumberToNumber(tinkoffNumber);
        expect(result).toBeCloseTo(1000000.999999999, 9);
      });

      it('should handle zero nano', () => {
        const tinkoffNumber: TinkoffNumber = {
          units: 42,
          nano: 0
        };
        
        const result = convertTinkoffNumberToNumber(tinkoffNumber);
        expect(result).toBe(42);
      });

      it('should handle negative numbers', () => {
        const tinkoffNumber: TinkoffNumber = {
          units: -100,
          nano: 500000000
        };
        
        const result = convertTinkoffNumberToNumber(tinkoffNumber);
        expect(result).toBeCloseTo(-100.5, 9);
      });
    });

    describe('convertNumberToTinkoffNumber', () => {
      it('should convert regular number to TinkoffNumber', () => {
        const number = 100.5;
        const result = convertNumberToTinkoffNumber(number);
        
        expect(result.units).toBe(100);
        expect(result.nano).toBe(500000000);
      });

      it('should handle whole numbers', () => {
        const number = 150;
        const result = convertNumberToTinkoffNumber(number);
        
        expect(result.units).toBe(150);
        expect(result.nano).toBe(0);
      });

      it('should handle decimal numbers', () => {
        const number = 0.25;
        const result = convertNumberToTinkoffNumber(number);
        
        expect(result.units).toBe(0);
        expect(result.nano).toBe(250000000);
      });

      it('should handle very small numbers', () => {
        const number = 0.000000001; // 1 nano
        const result = convertNumberToTinkoffNumber(number);
        
        expect(result.units).toBe(0);
        expect(result.nano).toBe(1);
      });

      it('should handle negative numbers', () => {
        const number = -42.5;
        const result = convertNumberToTinkoffNumber(number);
        
        expect(result.units).toBe(-42);
        expect(result.nano).toBe(500000000);
      });

      it('should handle zero', () => {
        const number = 0;
        const result = convertNumberToTinkoffNumber(number);
        
        expect(result.units).toBe(0);
        expect(result.nano).toBe(0);
      });
    });

    describe('Number Conversion Round-trip', () => {
      it('should maintain precision in round-trip conversions', () => {
        const testNumbers = [
          0,
          1,
          -1,
          0.1,
          0.01,
          0.001,
          0.000000001,
          123.456789123,
          1000000.999999999,
          -42.123456789
        ];

        testNumbers.forEach(originalNumber => {
          const tinkoffNumber = convertNumberToTinkoffNumber(originalNumber);
          const convertedBack = convertTinkoffNumberToNumber(tinkoffNumber);
          
          expect(convertedBack).toBeCloseTo(originalNumber, 9);
        });
      });
    });
  });

  describe('Utility Functions', () => {
    describe('sumValues', () => {
      it('should sum numeric values from object', () => {
        const obj = {
          TRUR: 25,
          TMOS: 30,
          TGLD: 45
        };
        
        const result = sumValues(obj);
        expect(result).toBe(100);
      });

      it('should ignore non-numeric values', () => {
        const obj = {
          TRUR: 25,
          TMOS: "invalid",
          TGLD: 45,
          TRAY: null,
          TBRU: undefined,
          TMON: true,
          TITR: {},
          TDIV: []
        };
        
        const result = sumValues(obj);
        expect(result).toBe(70);
      });

      it('should handle empty object', () => {
        const obj = {};
        const result = sumValues(obj);
        expect(result).toBe(0);
      });

      it('should handle null/undefined object', () => {
        expect(sumValues(null as any)).toBe(0);
        expect(sumValues(undefined as any)).toBe(0);
      });

      it('should ignore NaN values', () => {
        const obj = {
          TRUR: 25,
          TMOS: NaN,
          TGLD: 45
        };
        
        const result = sumValues(obj);
        expect(result).toBe(70);
      });

      it('should handle negative numbers', () => {
        const obj = {
          TRUR: 25,
          TMOS: -10,
          TGLD: 45
        };
        
        const result = sumValues(obj);
        expect(result).toBe(60);
      });

      it('should handle floating point numbers', () => {
        const obj = {
          TRUR: 25.5,
          TMOS: 30.25,
          TGLD: 44.25
        };
        
        const result = sumValues(obj);
        expect(result).toBeCloseTo(100, 2);
      });
    });

    describe('zeroPad', () => {
      it('should pad single digit', () => {
        expect(zeroPad(5, 3)).toBe("005");
      });
      
      it('should not pad if already long enough', () => {
        expect(zeroPad(123, 2)).toBe("123");
      });
      
      it('should handle zero', () => {
        expect(zeroPad(0, 3)).toBe("000");
      });
      
      it('should handle string input', () => {
        expect(zeroPad("7", 4)).toBe("0007");
      });

      it('should handle edge cases', () => {
        expect(zeroPad(0, 0)).toBe("0");
        expect(zeroPad(123, 1)).toBe("123");
        // Note: negative numbers are converted to string, then padded
        expect(zeroPad(-5, 3)).toBe("0-5");
      });
    });

    describe('sleep utility', () => {
      it('should resolve after specified time', async () => {
        const startTime = performance.now();
        await sleep(50); // 50ms
        const endTime = performance.now();
        
        const elapsed = endTime - startTime;
        expect(elapsed).toBeGreaterThanOrEqual(40); // Some tolerance for timing
        expect(elapsed).toBeLessThan(100);
      });

      it('should handle zero delay', async () => {
        const startTime = Date.now();
        await sleep(0);
        const endTime = Date.now();
        
        const elapsed = endTime - startTime;
        expect(elapsed).toBeLessThan(10); // Should be very quick
      });
    });
  });

  describe('Integration and Performance Tests', () => {
    it('should handle ticker normalization in equality checks', () => {
      // Test the full flow of ticker normalization
      expect(tickersEqual("TRAY@", " TPAY ")).toBe(true);
      expect(tickersEqual("TGLD@", "TGLD")).toBe(true);
      expect(tickersEqual("  TRUR  ", "TRUR")).toBe(true);
    });

    it('should perform number conversions efficiently', async () => {
      await PerformanceTestUtils.expectExecutionTime(
        () => {
          // Perform many conversions
          for (let i = 0; i < 10000; i++) {
            const num = Math.random() * 1000;
            const tinkoff = convertNumberToTinkoffNumber(num);
            convertTinkoffNumberToNumber(tinkoff);
          }
          return Promise.resolve();
        },
        1000 // Should complete within 1 second
      );
    });

    it('should handle large objects in sumValues efficiently', async () => {
      await PerformanceTestUtils.expectExecutionTime(
        () => {
          // Create large object
          const largeObj = Object.fromEntries(
            Array.from({ length: 10000 }, (_, i) => [`key${i}`, i])
          );
          
          sumValues(largeObj);
          return Promise.resolve();
        },
        100 // Should complete within 100ms
      );
    });
  });
});
