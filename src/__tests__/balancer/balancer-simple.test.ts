import { describe, it, expect, beforeEach } from "bun:test";
import { normalizeDesire } from "../../balancer";
import { DesiredWallet } from "../../types.d";

describe("Balancer Core Functions", () => {
  describe("normalizeDesire", () => {
    it("should normalize desired wallet percentages to sum to 100%", () => {
      const desiredWallet: DesiredWallet = {
        TGLD: 25,
        TPAY: 25,
        TRUR: 25,
        TRND: 25
      };

      const result = normalizeDesire(desiredWallet);

      // Check that sum equals 100%
      const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
      expect(sum).toBeCloseTo(100, 2);

      // Check that each share equals 25%
      Object.values(result).forEach(percentage => {
        expect(percentage).toBeCloseTo(25, 2);
      });
    });

    it("should handle unnormalized percentages correctly", () => {
      const unnormalizedWallet: DesiredWallet = {
        TRUR: 30,
        TMOS: 20,
        TGLD: 15,
        // Sum = 65, should be normalized to 100
      };

      const result = normalizeDesire(unnormalizedWallet);
      
      // Verify normalization
      const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
      expect(sum).toBeCloseTo(100, 2);
      
      // Verify proportions are maintained
      expect(result.TRUR).toBeCloseTo(46.15, 1); // 30/65 * 100
      expect(result.TMOS).toBeCloseTo(30.77, 1); // 20/65 * 100
      expect(result.TGLD).toBeCloseTo(23.08, 1); // 15/65 * 100
    });

    it("should handle single asset wallet", () => {
      const singleAsset: DesiredWallet = { TRUR: 50 };
      const result = normalizeDesire(singleAsset);
      
      expect(result.TRUR).toBe(100);
      
      const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
      expect(sum).toBeCloseTo(100, 2);
    });

    it("should handle empty wallet", () => {
      const emptyDesired: DesiredWallet = {};
      const result = normalizeDesire(emptyDesired);
      
      expect(result).toEqual({});
    });

    it("should handle zero values by excluding them", () => {
      const withZeros: DesiredWallet = {
        TRUR: 50,
        TMOS: 0,
        TGLD: 30
      };
      
      const result = normalizeDesire(withZeros);
      
      // Should normalize only non-zero values
      expect(result.TRUR).toBeCloseTo(62.5, 1); // 50/80 * 100
      expect(result.TMOS).toBe(0);
      expect(result.TGLD).toBeCloseTo(37.5, 1); // 30/80 * 100
    });
  });
});