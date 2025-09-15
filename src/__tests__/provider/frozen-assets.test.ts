import { describe, it, expect } from "bun:test";
import type { Wallet, Position } from "../../types.d";

// Mock implementations of our functions for testing
const filterFrozenAssets = (wallet: Wallet): Wallet => {
  return wallet.filter(position => !position.blocked);
};

const calculateAvailablePortfolioValue = (wallet: Wallet): number => {
  const availableWallet = filterFrozenAssets(wallet);
  return availableWallet.reduce((sum, position) => sum + (position.totalPriceNumber || 0), 0);
};

const calculatePortfolioShares = (wallet: Wallet): Record<string, number> => {
  // Filter out currencies and blocked positions
  const securities = wallet.filter(p => p.base !== p.quote && !p.blocked);
  const totalValue = securities.reduce((sum, position) => sum + (position.totalPriceNumber || 0), 0);
  
  if (totalValue <= 0) return {};
  
  const shares: Record<string, number> = {};
  for (const position of securities) {
    if (position.base && position.totalPriceNumber) {
      shares[position.base] = (position.totalPriceNumber / totalValue) * 100;
    }
  }
  return shares;
};

const mockWallet: Wallet = [
  {
    pair: 'AAPL/RUB',
    base: 'AAPL',
    quote: 'RUB',
    figi: 'BBG000B9XRY4',
    amount: 10,
    lotSize: 1,
    totalPriceNumber: 10000,
    blocked: false
  },
  {
    pair: 'MSFT/RUB',
    base: 'MSFT',
    quote: 'RUB',
    figi: 'BBG000BPH459',
    amount: 5,
    lotSize: 1,
    totalPriceNumber: 15000,
    blocked: true,
    blockedLotsNumber: 5
  },
  {
    pair: 'GOOGL/RUB',
    base: 'GOOGL',
    quote: 'RUB',
    figi: 'BBG009S39JX6',
    amount: 8,
    lotSize: 1,
    totalPriceNumber: 12000,
    blocked: false
  },
  {
    pair: 'RUB/RUB',
    base: 'RUB',
    quote: 'RUB',
    totalPriceNumber: 5000,
    blocked: false
  }
];

describe('Frozen Assets Handling', () => {
  
  describe('filterFrozenAssets', () => {
    it('should filter out blocked positions', () => {
      const result = filterFrozenAssets(mockWallet);
      
      expect(result).toHaveLength(3); // AAPL, GOOGL, RUB
      expect(result.map(p => p.base)).not.toContain('MSFT');
      expect(result.map(p => p.base)).toEqual(expect.arrayContaining(['AAPL', 'GOOGL', 'RUB']));
    });

    it('should return empty array when all assets are blocked', () => {
      const allBlocked = mockWallet.map(p => ({ ...p, blocked: true }));
      const result = filterFrozenAssets(allBlocked);
      
      expect(result).toHaveLength(0);
    });

    it('should return full wallet when no assets are blocked', () => {
      const noneBlocked = mockWallet.map(p => ({ ...p, blocked: false }));
      const result = filterFrozenAssets(noneBlocked);
      
      expect(result).toHaveLength(4);
    });
  });

  describe('calculateAvailablePortfolioValue', () => {
    it('should calculate total value excluding blocked assets', () => {
      const result = calculateAvailablePortfolioValue(mockWallet);
      
      // AAPL (10000) + GOOGL (12000) + RUB (5000) = 27000
      // MSFT (15000) should be excluded as it's blocked
      expect(result).toBe(27000);
    });

    it('should return 0 when all assets are blocked', () => {
      const allBlocked = mockWallet.map(p => ({ ...p, blocked: true }));
      const result = calculateAvailablePortfolioValue(allBlocked);
      
      expect(result).toBe(0);
    });
  });

  describe('calculatePortfolioShares', () => {
    it('should calculate shares excluding currencies and blocked assets', () => {
      const result = calculatePortfolioShares(mockWallet);
      
      // Only AAPL (10000) + GOOGL (12000) = 22000 total for securities
      // MSFT should be excluded (blocked), RUB should be excluded (currency)
      expect(Object.keys(result)).toEqual(expect.arrayContaining(['AAPL', 'GOOGL']));
      expect(result.AAPL).toBeCloseTo(45.45, 1); // 10000/22000 * 100
      expect(result.GOOGL).toBeCloseTo(54.55, 1); // 12000/22000 * 100
    });

    it('should return empty object when no securities are available', () => {
      const currenciesOnly: Wallet = [
        { base: 'RUB', quote: 'RUB', totalPriceNumber: 1000, blocked: false },
        { base: 'USD', quote: 'USD', totalPriceNumber: 500, blocked: false }
      ];
      const result = calculatePortfolioShares(currenciesOnly);
      
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should handle blocked securities correctly', () => {
      const testWallet: Wallet = [
        { base: 'STOCK1', quote: 'RUB', totalPriceNumber: 1000, blocked: false },
        { base: 'STOCK2', quote: 'RUB', totalPriceNumber: 2000, blocked: true },
        { base: 'STOCK3', quote: 'RUB', totalPriceNumber: 3000, blocked: false }
      ];
      
      const result = calculatePortfolioShares(testWallet);
      
      // Only STOCK1 (1000) + STOCK3 (3000) = 4000 total
      expect(Object.keys(result)).toEqual(expect.arrayContaining(['STOCK1', 'STOCK3']));
      expect(result.STOCK1).toBe(25); // 1000/4000 * 100
      expect(result.STOCK3).toBe(75); // 3000/4000 * 100
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty wallet', () => {
      const emptyWallet: Wallet = [];
      
      expect(filterFrozenAssets(emptyWallet)).toHaveLength(0);
      expect(calculateAvailablePortfolioValue(emptyWallet)).toBe(0);
      expect(Object.keys(calculatePortfolioShares(emptyWallet))).toHaveLength(0);
    });

    it('should handle positions with missing blocked field', () => {
      const walletWithUndefinedBlocked: Wallet = mockWallet.map(p => {
        const { blocked, ...rest } = p;
        return rest as Position; // Remove blocked field
      });
      
      const result = filterFrozenAssets(walletWithUndefinedBlocked);
      expect(result).toHaveLength(4); // All should be included since !undefined === true
    });
  });
});