import { describe, it, expect, beforeEach } from "bun:test";
import { 
  addNumbersToPosition, 
  addNumbersToWallet,
  normalizeDesire
} from "../../balancer";
import { Position, Wallet, DesiredWallet } from "../../types.d";
import { 
  TestEnvironment, 
  FinancialAssertions,
  testSuite
} from '../test-utils';

testSuite('Balancer Simple Functions Tests', () => {
  describe('addNumbersToPosition', () => {
    it('should add number fields to position with all price fields', () => {
      const position: Position = {
        base: "TRUR",
        figi: "BBG004S68614",
        amount: 1000,
        lotSize: 10,
        price: { units: 100, nano: 500000000 },
        lotPrice: { units: 1000, nano: 0 },
        totalPrice: { units: 50000, nano: 0 }
      } as Position;
      
      const result = addNumbersToPosition(position);
      
      expect(result.priceNumber).toBeCloseTo(100.5, 9);
      expect(result.lotPriceNumber).toBe(1000);
      expect(result.totalPriceNumber).toBe(50000);
    });
    
    it('should handle position with missing price fields', () => {
      const position: Position = {
        base: "TRUR",
        figi: "BBG004S68614",
        amount: 1000,
        lotSize: 10
        // No price, lotPrice, or totalPrice fields
      } as Position;
      
      const result = addNumbersToPosition(position);
      
      // When fields are missing, the function doesn't set the number fields
      expect(result.priceNumber).toBeUndefined();
      expect(result.lotPriceNumber).toBeUndefined();
      expect(result.totalPriceNumber).toBeUndefined();
    });
    
    it('should handle position with partial price fields', () => {
      const position: Position = {
        base: "TRUR",
        figi: "BBG004S68614",
        amount: 1000,
        lotSize: 10,
        price: { units: 50, nano: 250000000 },
        // Missing lotPrice
        totalPrice: { units: 25000, nano: 0 }
      } as Position;
      
      const result = addNumbersToPosition(position);
      
      expect(result.priceNumber).toBeCloseTo(50.25, 9);
      expect(result.lotPriceNumber).toBeUndefined();
      expect(result.totalPriceNumber).toBe(25000);
    });
    
    it('should handle position with zero values', () => {
      const position: Position = {
        base: "TRUR",
        figi: "BBG004S68614",
        amount: 1000,
        lotSize: 10,
        price: { units: 0, nano: 0 },
        lotPrice: { units: 0, nano: 0 },
        totalPrice: { units: 0, nano: 0 }
      } as Position;
      
      const result = addNumbersToPosition(position);
      
      expect(result.priceNumber).toBe(0);
      expect(result.lotPriceNumber).toBe(0);
      expect(result.totalPriceNumber).toBe(0);
    });
    
    it('should handle position with negative values', () => {
      const position: Position = {
        base: "TRUR",
        figi: "BBG004S68614",
        amount: 1000,
        lotSize: 10,
        price: { units: -100, nano: 500000000 },
        lotPrice: { units: -1000, nano: 0 },
        totalPrice: { units: -50000, nano: 0 }
      } as Position;
      
      const result = addNumbersToPosition(position);
      
      expect(result.priceNumber).toBeCloseTo(-100.5, 9);
      expect(result.lotPriceNumber).toBe(-1000);
      expect(result.totalPriceNumber).toBe(-50000);
    });
    
    it('should handle position with undefined units', () => {
      const position: Position = {
        base: "TRUR",
        figi: "BBG004S68614",
        amount: 1000,
        lotSize: 10,
        price: { units: undefined, nano: 500000000 },
        lotPrice: { units: undefined, nano: 250000000 },
        totalPrice: { units: undefined, nano: 100000000 }
      } as Position;
      
      const result = addNumbersToPosition(position);
      
      expect(result.priceNumber).toBeCloseTo(0.5, 9);
      expect(result.lotPriceNumber).toBeCloseTo(0.25, 9);
      expect(result.totalPriceNumber).toBeCloseTo(0.1, 9);
    });
  });
  
  describe('addNumbersToWallet', () => {
    it('should add numbers to all positions in wallet', () => {
      const wallet: Wallet = [
        {
          base: 'TRUR',
          figi: "BBG004S68614",
          amount: 1000,
          lotSize: 10,
          price: { units: 100, nano: 500000000 },
          lotPrice: { units: 1000, nano: 0 },
          totalPrice: { units: 50000, nano: 0 }
        } as Position,
        {
          base: 'TMOS',
          figi: "BBG004S68B31",
          amount: 500,
          lotSize: 1,
          price: { units: 200, nano: 250000000 },
          lotPrice: { units: 200, nano: 0 },
          totalPrice: { units: 100000, nano: 0 }
        } as Position
      ];
      
      const result = addNumbersToWallet(wallet);
      
      expect(result[0].priceNumber).toBeCloseTo(100.5, 9);
      expect(result[0].lotPriceNumber).toBe(1000);
      expect(result[0].totalPriceNumber).toBe(50000);
      
      expect(result[1].priceNumber).toBeCloseTo(200.25, 9);
      expect(result[1].lotPriceNumber).toBe(200);
      expect(result[1].totalPriceNumber).toBe(100000);
    });
    
    it('should handle empty wallet', () => {
      const wallet: Wallet = [];
      
      const result = addNumbersToWallet(wallet);
      
      expect(result).toEqual([]);
    });
    
    it('should handle wallet with positions missing price data', () => {
      const wallet: Wallet = [
        {
          base: 'TRUR',
          figi: "BBG004S68614",
          amount: 1000,
          lotSize: 10
          // No price fields
        } as Position,
        {
          base: 'TMOS',
          figi: "BBG004S68B31",
          amount: 500,
          lotSize: 1,
          price: { units: 100, nano: 0 },
          // Missing lotPrice
          totalPrice: { units: 50000, nano: 0 }
        } as Position
      ];
      
      const result = addNumbersToWallet(wallet);
      
      expect(result[0].priceNumber).toBeUndefined();
      expect(result[0].lotPriceNumber).toBeUndefined();
      expect(result[0].totalPriceNumber).toBeUndefined();
      
      expect(result[1].priceNumber).toBe(100);
      expect(result[1].lotPriceNumber).toBeUndefined();
      expect(result[1].totalPriceNumber).toBe(50000);
    });
  });
  
  describe('normalizeDesire - Additional Edge Cases', () => {
    it('should handle very large numbers', () => {
      const desiredWallet: DesiredWallet = {
        TRUR: 1e15,
        TMOS: 2e15,
        TGLD: 3e15
      };
      
      const result = normalizeDesire(desiredWallet);
      
      const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
      expect(sum).toBeCloseTo(100, 2);
      
      // Check proportions are maintained
      expect(result.TRUR).toBeCloseTo(16.67, 1);
      expect(result.TMOS).toBeCloseTo(33.33, 1);
      expect(result.TGLD).toBeCloseTo(50, 1);
    });
    
    it('should handle very small numbers', () => {
      const desiredWallet: DesiredWallet = {
        TRUR: 1e-15,
        TMOS: 2e-15,
        TGLD: 3e-15
      };
      
      const result = normalizeDesire(desiredWallet);
      
      const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
      expect(sum).toBeCloseTo(100, 2);
      
      // Check proportions are maintained
      expect(result.TRUR).toBeCloseTo(16.67, 1);
      expect(result.TMOS).toBeCloseTo(33.33, 1);
      expect(result.TGLD).toBeCloseTo(50, 1);
    });
    
    it('should handle mixed positive and negative values', () => {
      const desiredWallet: DesiredWallet = {
        TRUR: 50,
        TMOS: -20,
        TGLD: 30
      };
      
      const result = normalizeDesire(desiredWallet);
      
      // Should handle negative values appropriately
      expect(typeof result).toBe('object');
      expect(Object.keys(result)).toHaveLength(3);
    });
    
    it('should handle NaN values', () => {
      const desiredWallet: DesiredWallet = {
        TRUR: 50,
        TMOS: NaN,
        TGLD: 30
      };
      
      const result = normalizeDesire(desiredWallet);
      
      // Should ignore NaN values in sum calculation
      const sum = Object.values(result).reduce((acc, val) => {
        return acc + (typeof val === 'number' && !isNaN(val) ? val : 0);
      }, 0);
      
      expect(sum).toBeCloseTo(100, 2);
    });
    
    it('should handle infinite values', () => {
      const desiredWallet: DesiredWallet = {
        TRUR: 50,
        TMOS: Infinity,
        TGLD: 30
      };
      
      const result = normalizeDesire(desiredWallet);
      
      // Should handle infinite values appropriately
      expect(typeof result).toBe('object');
    });
  });
});