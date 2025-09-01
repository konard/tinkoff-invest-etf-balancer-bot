// Mock modules first, before any other imports
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";

// Mock the provider functions used in balancer.ts
const mockGetLastPrice = mock(async () => ({ units: 100, nano: 0 }));
const mockGenerateOrders = mock(async () => undefined);
const mockGetAccountId = mock(async () => 'test-account-id');
const mockGetInstruments = mock(async () => undefined);
const mockGetPositionsCycle = mock(async () => undefined);
const mockIsExchangeOpenNow = mock(async () => true);

mock.module('../../provider', () => ({
  getLastPrice: mockGetLastPrice,
  generateOrders: mockGenerateOrders,
  getAccountId: mockGetAccountId,
  getInstruments: mockGetInstruments,
  getPositionsCycle: mockGetPositionsCycle,
  isExchangeOpenNow: mockIsExchangeOpenNow,
}));

import { 
  balancer, 
  normalizeDesire, 
  identifyMarginPositions, 
  applyMarginStrategy, 
  calculateOptimalSizes,
  addNumbersToPosition,
  addNumbersToWallet
} from "../../balancer";
import { Wallet, Position, DesiredWallet, MarginPosition, EnhancedBalancerResult } from "../../types.d";

// Import test utilities and fixtures
import { 
  TestEnvironment, 
  FinancialAssertions, 
  TestDataFactory, 
  PerformanceTestUtils,
  testSuite
} from '../test-utils';
import { 
  mockBalancedWallet, 
  mockEmptyWallet, 
  mockSingleAssetWallet, 
  mockMarginWallet,
  mockDesiredWallets,
  balancingScenarios,
  createMockPosition
} from '../__fixtures__/wallets';
import { mockAccountConfigs } from '../__fixtures__/configurations';
import { mockTinkoffSDKControls } from '../__mocks__/tinkoff-sdk';
import { mockControls } from '../__mocks__/external-deps';
import { mockProviderControls } from '../__mocks__/provider';

// Mock global INSTRUMENTS for testing
(global as any).INSTRUMENTS = [
  {
    ticker: 'TRUR',
    figi: 'BBG004S68614',
    lot: 10,
    name: 'Tinkoff Russian ETF'
  },
  {
    ticker: 'TMOS',
    figi: 'BBG004S68B31',
    lot: 1,
    name: 'Tinkoff Moscow ETF'
  },
  {
    ticker: 'TGLD',
    figi: 'BBG004S687G5',
    lot: 1,
    name: 'Tinkoff Gold ETF'
  }
];

testSuite('Balancer Core Functions', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    mockTinkoffSDKControls.reset();
    mockControls.fs.reset();
    mockProviderControls.reset();
    
    // Reset provider function mocks
    mockGetLastPrice.mockClear();
    mockGenerateOrders.mockClear();
    mockGetAccountId.mockClear();
    mockGetInstruments.mockClear();
    mockGetPositionsCycle.mockClear();
    mockIsExchangeOpenNow.mockClear();
    
    // Set mocks to success state by default
    mockTinkoffSDKControls.setSuccess();
    mockControls.fs.setSuccess();
    mockProviderControls.setSuccess();
    
    // Set provider function mocks to return default values
    mockGetLastPrice.mockResolvedValue({ units: 100, nano: 0 });
    mockGenerateOrders.mockResolvedValue(undefined);
    mockGetAccountId.mockResolvedValue('test-account-id');
    mockGetInstruments.mockResolvedValue(undefined);
    mockGetPositionsCycle.mockResolvedValue(undefined);
    mockIsExchangeOpenNow.mockResolvedValue(true);
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

    it('should handle unnormalized percentages correctly', () => {
      const unnormalizedWallet = {
        TRUR: 30,
        TMOS: 20,
        TGLD: 15,
        // Sum = 65, should be normalized to 100
      };

      const result = normalizeDesire(unnormalizedWallet);
      
      // Verify normalization
      FinancialAssertions.expectNormalizedDesiredWallet(result);
      
      // Verify proportions are maintained
      expect(result.TRUR).toBeCloseTo(46.15, 1); // 30/65 * 100
      expect(result.TMOS).toBeCloseTo(30.77, 1); // 20/65 * 100
      expect(result.TGLD).toBeCloseTo(23.08, 1); // 15/65 * 100
    });

    it('should handle single asset wallet', () => {
      const singleAsset = { TRUR: 50 };
      const result = normalizeDesire(singleAsset);
      
      expect(result.TRUR).toBe(100);
      FinancialAssertions.expectNormalizedDesiredWallet(result);
    });

    it('should handle zero values by excluding them', () => {
      const withZeros = {
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

  describe('addNumbersToPosition', () => {
    it('should add number fields to position with all price fields', () => {
      const position: Position = {
        figi: 'TEST_FIGI',
        base: 'TEST',
        quote: 'RUB',
        pair: 'TEST/RUB',
        amount: 10,
        lotSize: 1,
        price: {
          currency: 'rub',
          units: 100,
          nano: 500000000
        },
        lotPrice: {
          currency: 'rub',
          units: 100,
          nano: 500000000
        },
        totalPrice: {
          currency: 'rub',
          units: 1000,
          nano: 0
        }
      };

      const result = addNumbersToPosition(position);

      expect(result).toHaveProperty('priceNumber');
      expect(result).toHaveProperty('lotPriceNumber');
      expect(result).toHaveProperty('totalPriceNumber');
      expect(result.priceNumber).toBeCloseTo(100.5, 1);
      expect(result.lotPriceNumber).toBeCloseTo(100.5, 1);
      expect(result.totalPriceNumber).toBe(1000);
    });
  });

  describe('addNumbersToWallet', () => {
    it('should add numbers to all positions in wallet', () => {
      const wallet: Wallet = [
        {
          figi: 'TEST_FIGI',
          base: 'TEST',
          quote: 'RUB',
          pair: 'TEST/RUB',
          amount: 10,
          lotSize: 1,
          price: {
            currency: 'rub',
            units: 100,
            nano: 0
          },
          lotPrice: {
            currency: 'rub',
            units: 100,
            nano: 0
          },
          totalPrice: {
            currency: 'rub',
            units: 1000,
            nano: 0
          }
        }
      ];

      const result = addNumbersToWallet(wallet);

      expect(result[0]).toHaveProperty('priceNumber', 100);
      expect(result[0]).toHaveProperty('lotPriceNumber', 100);
      expect(result[0]).toHaveProperty('totalPriceNumber', 1000);
    });
  });
});

// Additional test suites for comprehensive coverage
testSuite('Balancer Integration Tests', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    mockTinkoffSDKControls.reset();
    mockControls.fs.reset();
    mockProviderControls.reset();
    
    // Reset provider function mocks
    mockGetLastPrice.mockClear();
    mockGenerateOrders.mockClear();
    mockGetAccountId.mockClear();
    mockGetInstruments.mockClear();
    mockGetPositionsCycle.mockClear();
    mockIsExchangeOpenNow.mockClear();
    
    // Set mocks to success state by default
    mockTinkoffSDKControls.setSuccess();
    mockControls.fs.setSuccess();
    mockProviderControls.setSuccess();
    
    // Set provider function mocks to return default values
    mockGetLastPrice.mockResolvedValue({ units: 100, nano: 0 });
    mockGenerateOrders.mockResolvedValue(undefined);
    mockGetAccountId.mockResolvedValue('test-account-id');
    mockGetInstruments.mockResolvedValue(undefined);
    mockGetPositionsCycle.mockResolvedValue(undefined);
    mockIsExchangeOpenNow.mockResolvedValue(true);
  });
  
  describe('Complex Balancing Scenarios', () => {
    it('should handle need-to-buy scenario', async () => {
      const { current, desired } = balancingScenarios.needToBuy;
      
      const result = await balancer(current, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
      expect(result.totalPortfolioValue).toBeGreaterThan(0);
    });
    
    it('should handle need-to-sell scenario', async () => {
      const { current, desired } = balancingScenarios.needToSell;
      
      const result = await balancer(current, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
      // Should convert to 100% RUB
      expect(result.finalPercents.RUB).toBeCloseTo(100, 5);
    });
    
    it('should handle rebalancing scenario', async () => {
      const { current, desired } = balancingScenarios.needRebalance;
      
      const result = await balancer(current, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
      FinancialAssertions.expectValidBalancerResult(result);
    });
    
    it('should handle already balanced scenario', async () => {
      // Create a properly balanced portfolio that matches the desired allocation
      const balancedPortfolio = [
        createMockPosition({
          base: "TRUR",
          amount: 1000,
          priceNumber: 100,
          totalPriceNumber: 87500, // 25% of 350,000
        }),
        createMockPosition({
          base: "TMOS",
          amount: 500,
          priceNumber: 200,
          totalPriceNumber: 87500, // 25% of 350,000
        }),
        createMockPosition({
          base: "TGLD",
          amount: 200,
          priceNumber: 500,
          totalPriceNumber: 87500, // 25% of 350,000
        }),
        createMockPosition({
          base: "RUB",
          amount: 87500,
          priceNumber: 1,
          totalPriceNumber: 87500, // 25% of 350,000
        }),
      ];
      
      const result = await balancer(balancedPortfolio, mockDesiredWallets.balanced, [], 'manual', true);
      
      expect(result).toBeDefined();
      // Should require minimal changes since portfolio is already balanced
      FinancialAssertions.expectValidBalancerResult(result);
      
      // Verify that the final percentages are close to desired with minimal tolerance
      Object.entries(mockDesiredWallets.balanced).forEach(([ticker, expectedPercent]) => {
        expect(result.finalPercents[ticker]).toBeCloseTo(expectedPercent, 1.0);
      });
    });

  });
  
  describe('Different Balancing Modes', () => {
    beforeEach(() => {
      // Reset all mocks before each test
      mockTinkoffSDKControls.reset();
      mockControls.fs.reset();
      mockProviderControls.reset();
      
      // Reset provider function mocks
      mockGetLastPrice.mockClear();
      mockGenerateOrders.mockClear();
      mockGetAccountId.mockClear();
      mockGetInstruments.mockClear();
      mockGetPositionsCycle.mockClear();
      mockIsExchangeOpenNow.mockClear();
      
      // Set mocks to success state by default
      mockTinkoffSDKControls.setSuccess();
      mockControls.fs.setSuccess();
      mockProviderControls.setSuccess();
      
      // Set provider function mocks to return default values
      mockGetLastPrice.mockResolvedValue({ units: 100, nano: 0 });
      mockGenerateOrders.mockResolvedValue(undefined);
      mockGetAccountId.mockResolvedValue('test-account-id');
      mockGetInstruments.mockResolvedValue(undefined);
      mockGetPositionsCycle.mockResolvedValue(undefined);
      mockIsExchangeOpenNow.mockResolvedValue(true);
    });
    
    it('should handle manual mode', async () => {
      const wallet = mockBalancedWallet;
      const desired = mockDesiredWallets.balanced;
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result.modeUsed).toBe('manual');
      FinancialAssertions.expectValidBalancerResult(result);
    });
    
    it('should handle marketcap mode', async () => {
      const wallet = mockBalancedWallet;
      const desired = mockDesiredWallets.balanced;
      const metrics = [
        {
          ticker: 'TRUR',
          marketCap: { value: 50000000000, percentage: 40 }
        },
        {
          ticker: 'TMOS',
          marketCap: { value: 30000000000, percentage: 30 }
        }
      ];
      
      const result = await balancer(wallet, desired, metrics, 'marketcap', true);
      
      expect(result.modeUsed).toBe('marketcap');
      expect(result.positionMetrics).toEqual(metrics);
    });
  });
  
  describe('Margin Trading Integration', () => {
    beforeEach(() => {
      // Reset all mocks before each test
      mockTinkoffSDKControls.reset();
      mockControls.fs.reset();
      mockProviderControls.reset();
      
      // Reset provider function mocks
      mockGetLastPrice.mockClear();
      mockGenerateOrders.mockClear();
      mockGetAccountId.mockClear();
      mockGetInstruments.mockClear();
      mockGetPositionsCycle.mockClear();
      mockIsExchangeOpenNow.mockClear();
      
      // Set mocks to success state by default
      mockTinkoffSDKControls.setSuccess();
      mockControls.fs.setSuccess();
      mockProviderControls.setSuccess();
      
      // Set provider function mocks to return default values
      mockGetLastPrice.mockResolvedValue({ units: 100, nano: 0 });
      mockGenerateOrders.mockResolvedValue(undefined);
      mockGetAccountId.mockResolvedValue('test-account-id');
      mockGetInstruments.mockResolvedValue(undefined);
      mockGetPositionsCycle.mockResolvedValue(undefined);
      mockIsExchangeOpenNow.mockResolvedValue(true);
      
      // Mock margin-enabled account configuration
      process.env.ACCOUNT_ID = 'margin-test-account';
    });
    
    it('should handle margin positions in balancing', async () => {
      const wallet = mockMarginWallet;
      const desired = mockDesiredWallets.balanced;
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
      
      // Should include margin info if margin trading is enabled
      if (result.marginInfo) {
        expect(result.marginInfo.totalMarginUsed).toBeGreaterThanOrEqual(0);
        expect(typeof result.marginInfo.withinLimits).toBe('boolean');
        expect(Array.isArray(result.marginInfo.marginPositions)).toBe(true);
      }
    });
  });
});

testSuite('Balancer Edge Cases and Error Scenarios', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    mockTinkoffSDKControls.reset();
    mockControls.fs.reset();
    mockProviderControls.reset();
    
    // Reset provider function mocks
    mockGetLastPrice.mockClear();
    mockGenerateOrders.mockClear();
    mockGetAccountId.mockClear();
    mockGetInstruments.mockClear();
    mockGetPositionsCycle.mockClear();
    mockIsExchangeOpenNow.mockClear();
    
    // Set mocks to success state by default
    mockTinkoffSDKControls.setSuccess();
    mockControls.fs.setSuccess();
    mockProviderControls.setSuccess();
    
    // Set provider function mocks to return default values
    mockGetLastPrice.mockResolvedValue({ units: 100, nano: 0 });
    mockGenerateOrders.mockResolvedValue(undefined);
    mockGetAccountId.mockResolvedValue('test-account-id');
    mockGetInstruments.mockResolvedValue(undefined);
    mockGetPositionsCycle.mockResolvedValue(undefined);
    mockIsExchangeOpenNow.mockResolvedValue(true);
  });
  
  describe('Data Validation', () => {
    it('should handle invalid position data', async () => {
      const invalidWallet = [
        createMockPosition({
          base: undefined,
          figi: undefined,
          amount: NaN,
          priceNumber: -1,
        })
      ];
      
      const result = await balancer(invalidWallet, mockDesiredWallets.balanced, [], 'manual', true);
      
      // Should handle gracefully without crashing
      expect(result).toBeDefined();
    });
    
    it('should handle extreme values', async () => {
      const extremeWallet = [
        createMockPosition({
          base: 'EXTREME',
          amount: Number.MAX_SAFE_INTEGER,
          priceNumber: Number.MAX_SAFE_INTEGER,
          totalPriceNumber: Number.MAX_SAFE_INTEGER,
        })
      ];
      
      const result = await balancer(extremeWallet, { EXTREME: 100 }, [], 'manual', true);
      
      expect(result).toBeDefined();
      expect(isFinite(result.totalPortfolioValue)).toBe(true);
    });
  });
  
  describe('Network and API Error Handling', () => {
    it('should handle rate limiting', async () => {
      mockTinkoffSDKControls.simulateRateLimit();
      
      const wallet = mockBalancedWallet;
      const desired = mockDesiredWallets.balanced;
      
      try {
        await balancer(wallet, desired, [], 'manual', true);
      } catch (error) {
        expect(error.message).toContain('RESOURCE_EXHAUSTED');
      }
    });
    
    it('should handle unauthorized access', async () => {
      mockTinkoffSDKControls.simulateUnauthorized();
      
      const wallet = mockBalancedWallet;
      const desired = mockDesiredWallets.balanced;
      
      try {
        await balancer(wallet, desired, [], 'manual', true);
      } catch (error) {
        expect(error.message).toContain('UNAUTHENTICATED');
      }
    });
  });
  
  describe('Mathematical Edge Cases', () => {
    it('should handle division by zero scenarios', () => {
      const zeroDesired = { TRUR: 0, TMOS: 0, TGLD: 0 };
      
      // Should handle zero sum in normalization
      expect(() => normalizeDesire(zeroDesired)).not.toThrow();
    });
    
    it('should handle negative percentages', () => {
      const negativeDesired = { TRUR: -50, TMOS: 150 };
      
      const result = normalizeDesire(negativeDesired);
      
      // Should handle negative values appropriately
      expect(typeof result).toBe('object');
    });
    
    it('should handle very small percentages', () => {
      const smallDesired = { 
        TRUR: 0.001, 
        TMOS: 0.002, 
        TGLD: 99.997 
      };
      
      const result = normalizeDesire(smallDesired);
      
      FinancialAssertions.expectNormalizedDesiredWallet(result);
    });
  });
});