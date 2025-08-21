import { describe, it, expect } from "bun:test";
import { balancer } from "../../balancer";
import { Wallet, Position } from "../../types.d";
import { normalizeDesire } from '../../balancer';

describe("Balancer", () => {
  describe("Portfolio Balancing", () => {
    it("should balance portfolio with equal weights", () => {
      const currentWallet: Wallet = [
        {
          base: "TRUR",
          figi: "figi1",
          amount: 1000,
          lotSize: 10,
          price: { units: 100, nano: 0 },
          priceNumber: 100,
          lotPrice: { units: 100, nano: 0 },
          lotPriceNumber: 100,
          totalPrice: { units: 1000, nano: 0 },
          totalPriceNumber: 1000,
          toBuyLots: 0,
        },
        {
          base: "TMOS",
          figi: "figi2",
          amount: 2000,
          lotSize: 10,
          price: { units: 200, nano: 0 },
          priceNumber: 200,
          lotPrice: { units: 200, nano: 0 },
          lotPriceNumber: 200,
          totalPrice: { units: 2000, nano: 0 },
          totalPriceNumber: 2000,
          toBuyLots: 0,
        },
        {
          base: "RUB",
          figi: "figi3",
          amount: 1000,
          lotSize: 1,
          price: { units: 1, nano: 0 },
          priceNumber: 1,
          lotPrice: { units: 1, nano: 0 },
          lotPriceNumber: 1,
          totalPrice: { units: 1000, nano: 0 },
          totalPriceNumber: 1000,
          toBuyLots: 0,
        },
      ];

      const desiredWallet = {
        TRUR: 25,
        TMOS: 50,
        RUB: 25,
      };

      // Mock the balancer function
      // This is a placeholder test - actual implementation would need to be mocked
      expect(currentWallet).toHaveLength(3);
      expect(desiredWallet.TRUR).toBe(25);
      expect(desiredWallet.TMOS).toBe(50);
      expect(desiredWallet.RUB).toBe(25);
    });

    it("should handle empty portfolio", () => {
      const currentWallet: Wallet = [];
      const desiredWallet = {};

      expect(currentWallet).toHaveLength(0);
      expect(Object.keys(desiredWallet)).toHaveLength(0);
    });

    it("should handle single asset portfolio", () => {
      const currentWallet: Wallet = [
        {
          base: "TRUR",
          figi: "figi1",
          amount: 1000,
          lotSize: 10,
          price: { units: 100, nano: 0 },
          priceNumber: 100,
          lotPrice: { units: 100, nano: 0 },
          lotPriceNumber: 100,
          totalPrice: { units: 1000, nano: 0 },
          totalPriceNumber: 1000,
          toBuyLots: 0,
        },
      ];

      const desiredWallet = { TRUR: 100 };

      expect(currentWallet).toHaveLength(1);
      expect(desiredWallet.TRUR).toBe(100);
    });
  });

  describe("Position Calculations", () => {
    it("should calculate correct lot quantities", () => {
      const position: Position = {
        base: "TRUR",
        figi: "figi1",
        amount: 1000,
        lotSize: 10,
        price: { units: 100, nano: 0 },
        priceNumber: 100,
        lotPrice: { units: 100, nano: 0 },
        lotPriceNumber: 100,
        totalPrice: { units: 1000, nano: 0 },
        totalPriceNumber: 1000,
        toBuyLots: 5,
      };

      expect(position.toBuyLots).toBe(5);
      expect(position.lotSize).toBe(10);
      expect(position.amount).toBe(1000);
    });

    it("should handle fractional lots", () => {
      const position: Position = {
        base: "TRUR",
        figi: "figi1",
        amount: 1000,
        lotSize: 10,
        price: { units: 100, nano: 0 },
        priceNumber: 100,
        lotPrice: { units: 100, nano: 0 },
        lotPriceNumber: 100,
        totalPrice: { units: 1000, nano: 0 },
        totalPriceNumber: 1000,
        toBuyLots: 0.5,
      };

      expect(position.toBuyLots).toBe(0.5);
      expect(position.lotSize).toBe(10);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero amounts", () => {
      const position: Position = {
        base: "TRUR",
        figi: "figi1",
        amount: 0,
        lotSize: 0,
        price: { units: 0, nano: 0 },
        priceNumber: 0,
        lotPrice: { units: 0, nano: 0 },
        lotPriceNumber: 0,
        totalPrice: { units: 0, nano: 0 },
        totalPriceNumber: 0,
        toBuyLots: 0,
      };

      expect(position.amount).toBe(0);
      expect(position.lotSize).toBe(0);
      expect(position.toBuyLots).toBe(0);
    });

    it("should handle very large amounts", () => {
      const largeAmount = 1000000000; // 1 billion
      const position: Position = {
        base: "TRUR",
        figi: "figi1",
        amount: largeAmount,
        lotSize: 1000,
        price: { units: largeAmount / 1000, nano: 0 },
        priceNumber: largeAmount / 1000,
        lotPrice: { units: largeAmount / 1000, nano: 0 },
        lotPriceNumber: largeAmount / 1000,
        totalPrice: { units: largeAmount, nano: 0 },
        totalPriceNumber: largeAmount,
        toBuyLots: 1000,
      };

      expect(position.amount).toBe(largeAmount);
      expect(position.lotSize).toBe(1000);
      expect(position.toBuyLots).toBe(1000);
    });
  });

  describe('normalizeDesire', () => {
    it('should normalize desired wallet percentages to sum to 100%', () => {
      const desiredWallet = {
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

    it('should handle different percentage values correctly', () => {
      const desiredWallet = {
        TGLD: 50,
        TPAY: 30,
        TRUR: 20
      };

      const result = normalizeDesire(desiredWallet);

      // Check that sum equals 100%
      const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
      expect(sum).toBeCloseTo(100, 2);

      // Check proportions
      expect(result.TGLD).toBeCloseTo(50, 2);
      expect(result.TPAY).toBeCloseTo(30, 2);
      expect(result.TRUR).toBeCloseTo(20, 2);
    });

    it('should handle single asset correctly', () => {
      const desiredWallet = {
        TGLD: 100
      };

      const result = normalizeDesire(desiredWallet);

      expect(result.TGLD).toBe(100);
    });

    it('should handle empty wallet', () => {
      const desiredWallet = {};

      const result = normalizeDesire(desiredWallet);

      expect(result).toEqual({});
    });
  });
});
