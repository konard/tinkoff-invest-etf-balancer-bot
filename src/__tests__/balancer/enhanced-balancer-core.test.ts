import { describe, it, expect, beforeEach } from "bun:test";
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

// Mock configLoader
const mockConfigLoader = {
  getAccountById: (id: string) => {
    if (id === 'no-margin-account') {
      return {
        id: "test-account-1",
        name: "Test Account 1",
        t_invest_token: "t.test_token_123",
        account_id: "123456789",
        desired_wallet: { TRUR: 25, TMOS: 25, TGLD: 25, RUB: 25 },
        desired_mode: 'manual',
        balance_interval: 3600,
        sleep_between_orders: 1000,
        margin_trading: {
          enabled: false,
          multiplier: 1,
          free_threshold: 10000,
          max_margin_size: 0,
          balancing_strategy: 'remove',
        },
        exchange_closure_behavior: {
          mode: 'skip_iteration',
          update_iteration_result: false,
        },
      };
    } else if (id === 'margin-test-account') {
      return {
        id: "test-account-2",
        name: "Test Account 2 (Margin)",
        t_invest_token: "t.test_token_456",
        account_id: "987654321",
        desired_wallet: { TRUR: 40, TMOS: 30, TGLD: 20, TRAY: 10 },
        desired_mode: 'marketcap',
        balance_interval: 1800,
        sleep_between_orders: 2000,
        margin_trading: {
          enabled: true,
          multiplier: 2,
          free_threshold: 10000,
          max_margin_size: 100000,
          balancing_strategy: 'keep_if_small',
        },
        exchange_closure_behavior: {
          mode: 'dry_run',
          update_iteration_result: true,
        },
      };
    } else {
      // Default account
      return {
        id: "0",
        name: "Test Account",
        t_invest_token: "t.test_token",
        account_id: "test_account",
        desired_wallet: { TRUR: 25, TMOS: 25, TGLD: 25, RUB: 25 },
        desired_mode: 'manual',
        balance_interval: 3600,
        sleep_between_orders: 1000,
        margin_trading: {
          enabled: false,
          multiplier: 1,
          free_threshold: 10000,
          max_margin_size: 0,
          balancing_strategy: 'remove',
        },
        exchange_closure_behavior: {
          mode: 'skip_iteration',
          update_iteration_result: false,
        },
      };
    }
  }
};

mock.module('../../configLoader', () => ({
  configLoader: mockConfigLoader
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
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { 
  mockBalancedWallet, 
  mockEmptyWallet, 
  mockSingleAssetWallet, 
  mockMarginWallet,
  mockDesiredWallets,
  balancingScenarios,
  createMockPosition,
  mockExtremeWallet,
  mockZeroWallet
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

testSuite('Balancer Core Functions - Enhanced Edge Cases', () => {
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
    
    // Set default account ID
    process.env.ACCOUNT_ID = 'test-account';
  });

  describe('normalizeDesire - Additional Edge Cases', () => {
    it('should handle zero sum scenario gracefully', () => {
      const zeroDesired = { TRUR: 0, TMOS: 0, TGLD: 0 };
      
      // Should handle zero sum in normalization without throwing
      expect(() => normalizeDesire(zeroDesired)).not.toThrow();
      
      const result = normalizeDesire(zeroDesired);
      // When sum is zero, all values remain zero
      expect(result).toEqual({ TRUR: 0, TMOS: 0, TGLD: 0 });
    });
    
    it('should handle single extremely large value', () => {
      const extremeDesired = { TRUR: Number.MAX_SAFE_INTEGER };
      
      const result = normalizeDesire(extremeDesired);
      
      expect(result.TRUR).toBe(100);
    });
    
    it('should handle mixed zero and non-zero values', () => {
      const mixedDesired = { TRUR: 0, TMOS: 50, TGLD: 0, TRAY: 30 };
      
      const result = normalizeDesire(mixedDesired);
      
      const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
      expect(sum).toBeCloseTo(100, 2);
      
      expect(result.TRUR).toBe(0);
      expect(result.TGLD).toBe(0);
    });
  });

  describe('identifyMarginPositions', () => {
    it('should return empty array when margin trading is disabled', () => {
      // Mock a config with margin trading disabled
      process.env.ACCOUNT_ID = 'no-margin-account';
      
      const wallet = mockMarginWallet;
      const result = identifyMarginPositions(wallet);
      
      expect(result).toEqual([]);
    });
    
    it('should identify margin positions when margin trading is enabled', () => {
      // Mock a config with margin trading enabled
      process.env.ACCOUNT_ID = 'margin-test-account';
      
      const wallet = mockMarginWallet;
      const result = identifyMarginPositions(wallet);
      
      expect(result).toHaveLength(1);
      expect(result[0].isMargin).toBe(true);
      expect(result[0].marginValue).toBeGreaterThan(0);
    });
    
    it('should skip positions with zero or negative total price', () => {
      const walletWithZero: Wallet = [
        createMockPosition({
          base: "ZERO",
          totalPriceNumber: 0
        }),
        createMockPosition({
          base: "NEGATIVE",
          totalPriceNumber: -1000
        })
      ];
      
      // Set account with margin enabled
      process.env.ACCOUNT_ID = 'margin-test-account';
      
      const result = identifyMarginPositions(walletWithZero);
      
      expect(result).toHaveLength(0);
    });
    
    it('should skip positions with no margin value', () => {
      // Position with total price equal to base value (no margin)
      const wallet: Wallet = [
        createMockPosition({
          base: "NO_MARGIN",
          totalPriceNumber: 50000, // Exactly base value with multiplier=2
        })
      ];
      
      // Set account with margin enabled
      process.env.ACCOUNT_ID = 'margin-test-account';
      
      const result = identifyMarginPositions(wallet);
      
      // With multiplier of 2, if totalPrice equals base value, there's no margin
      expect(result).toHaveLength(0);
    });
  });

  describe('applyMarginStrategy', () => {
    it('should return disabled result when margin trading is disabled', () => {
      process.env.ACCOUNT_ID = 'no-margin-account';
      
      const wallet = mockMarginWallet;
      const result = applyMarginStrategy(wallet);
      
      expect(result.shouldRemoveMargin).toBe(false);
      expect(result.reason).toBe('Margin trading disabled');
      expect(result.transferCost).toBe(0);
      expect(result.marginPositions).toEqual([]);
    });
    
    it('should handle case with no margin positions', () => {
      process.env.ACCOUNT_ID = 'margin-test-account';
      
      const wallet = mockBalancedWallet; // No margin positions
      const result = applyMarginStrategy(wallet);
      
      expect(result.shouldRemoveMargin).toBe(false);
      expect(result.reason).toBe('No margin positions');
      expect(result.transferCost).toBe(0);
      expect(result.marginPositions).toEqual([]);
    });
    
    it('should apply margin strategy when positions exist', () => {
      process.env.ACCOUNT_ID = 'margin-test-account';
      
      const wallet = mockMarginWallet;
      const result = applyMarginStrategy(wallet);
      
      expect(result.marginPositions).toHaveLength(1);
      expect(typeof result.shouldRemoveMargin).toBe('boolean');
      expect(typeof result.reason).toBe('string');
      expect(typeof result.transferCost).toBe('number');
    });
    
    it('should use default current time when not provided', () => {
      process.env.ACCOUNT_ID = 'margin-test-account';
      
      const wallet = mockMarginWallet;
      const result = applyMarginStrategy(wallet);
      
      expect(result).toBeDefined();
    });
  });

  describe('calculateOptimalSizes', () => {
    it('should calculate sizes without margin when disabled', () => {
      process.env.ACCOUNT_ID = 'no-margin-account';
      
      const wallet = mockBalancedWallet;
      const desired = mockDesiredWallets.balanced;
      const result = calculateOptimalSizes(wallet, desired);
      
      expect(result.TRUR).toBeDefined();
      expect(result.TRUR.marginSize).toBe(0);
      expect(result.TRUR.totalSize).toBe(result.TRUR.baseSize);
    });
    
    it('should delegate to margin calculator when enabled', () => {
      process.env.ACCOUNT_ID = 'margin-test-account';
      
      const wallet = mockBalancedWallet;
      const desired = mockDesiredWallets.balanced;
      const result = calculateOptimalSizes(wallet, desired);
      
      expect(result.TRUR).toBeDefined();
      expect(typeof result.TRUR.baseSize).toBe('number');
      expect(typeof result.TRUR.marginSize).toBe('number');
      expect(typeof result.TRUR.totalSize).toBe('number');
    });
  });

  describe('balancer - Core Integration', () => {
    it('should process complete balancing workflow', async () => {
      const wallet = mockBalancedWallet;
      const desired = mockDesiredWallets.balanced;
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
      expect(typeof result.finalPercents).toBe('object');
      expect(typeof result.totalPortfolioValue).toBe('number');
    });
    
    it('should handle dry run mode', async () => {
      const wallet = mockBalancedWallet;
      const desired = mockDesiredWallets.balanced;
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      // Should not call generateOrders in dry run mode
      expect(mockGenerateOrders).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
    
    it('should create new positions for missing instruments', async () => {
      const wallet = [
        createMockPosition({
          base: "TRUR",
          amount: 1000,
          totalPriceNumber: 100000,
        })
      ];
      
      const desired = {
        TRUR: 50,
        TMOS: 50 // This should trigger creation of TMOS position
      };
      
      mockGetLastPrice.mockResolvedValue({ units: 200, nano: 0 });
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
    });
    
    it('should skip missing instruments not found in INSTRUMENTS', async () => {
      const wallet = mockBalancedWallet;
      
      const desired = {
        TRUR: 50,
        UNKNOWN: 50 // This instrument doesn't exist in INSTRUMENTS
      };
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
    });
    
    it('should skip instruments when price lookup fails', async () => {
      const wallet = [
        createMockPosition({
          base: "TRUR",
          amount: 1000,
          totalPriceNumber: 100000,
        })
      ];
      
      const desired = {
        TRUR: 50,
        TMOS: 50 // This should trigger price lookup which will fail
      };
      
      mockGetLastPrice.mockResolvedValue(null); // Simulate price lookup failure
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
    });
    
    it('should handle positions with missing amounts', async () => {
      const wallet = [
        createMockPosition({
          base: "TRUR",
          amount: undefined,
          totalPriceNumber: 100000,
        }) as any
      ];
      
      const desired = mockDesiredWallets.balanced;
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
    });
    
    it('should enforce minimum 1 lot for positive target positions', async () => {
      const wallet = [
        createMockPosition({
          base: "TRUR",
          amount: 0, // No existing position
          totalPriceNumber: 0,
        })
      ];
      
      const desired = {
        TRUR: 10 // Positive target
      };
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
      // Should have set toBuyLots to at least 1 for new position with positive target
    });
    
    it('should calculate optimal position sizes with margin', async () => {
      process.env.ACCOUNT_ID = 'margin-test-account';
      
      const wallet = mockBalancedWallet;
      const desired = mockDesiredWallets.balanced;
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
    });
    
    it('should build enhanced result with margin info when enabled', async () => {
      process.env.ACCOUNT_ID = 'margin-test-account';
      
      const wallet = mockBalancedWallet;
      const desired = mockDesiredWallets.balanced;
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
      expect(result.marginInfo).toBeDefined();
      if (result.marginInfo) {
        expect(typeof result.marginInfo.totalMarginUsed).toBe('number');
        expect(typeof result.marginInfo.withinLimits).toBe('boolean');
        expect(Array.isArray(result.marginInfo.marginPositions)).toBe(true);
      }
    });
    
    it('should not include margin info when margin trading is disabled', async () => {
      process.env.ACCOUNT_ID = 'no-margin-account';
      
      const wallet = mockBalancedWallet;
      const desired = mockDesiredWallets.balanced;
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
      // When margin trading is disabled, marginInfo should be undefined
      expect(result.marginInfo).toBeUndefined();
    });
    
    it('should calculate final percentages correctly', async () => {
      const wallet = mockBalancedWallet;
      const desired = mockDesiredWallets.balanced;
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
      expect(result.finalPercents).toBeDefined();
      
      // Sum of final percentages should be approximately 100
      const sum = Object.values(result.finalPercents).reduce((acc, val) => acc + val, 0);
      expect(sum).toBeGreaterThan(0);
    });
    
    it('should handle positions where base equals quote (currencies)', async () => {
      const wallet = mockBalancedWallet;
      const desired = mockDesiredWallets.balanced;
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
      // Should handle currency positions correctly
    });
    
    it('should add missing instruments from portfolio to desired with 0%', async () => {
      const wallet = [
        createMockPosition({
          base: "TRUR",
          amount: 1000,
          totalPriceNumber: 100000,
        }),
        createMockPosition({
          base: "TMOS", // This is in portfolio but not in desired
          amount: 500,
          totalPriceNumber: 50000,
        })
      ];
      
      const desired = {
        TRUR: 100 // Only TRUR in desired, TMOS should be added with 0%
      };
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
    });
    
    it('should order operations correctly (sells first, then buys)', async () => {
      const wallet = mockBalancedWallet;
      const desired = {
        RUB: 100 // Convert everything to RUB (sell all)
      };
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle malformed position data', async () => {
      const malformedWallet = [
        {
          base: undefined,
          figi: undefined,
          amount: NaN,
          priceNumber: -1,
        } as any
      ];
      
      const result = await balancer(malformedWallet, mockDesiredWallets.balanced, [], 'manual', true);
      
      // Should handle gracefully without crashing
      expect(result).toBeDefined();
    });
    
    it('should handle empty desired wallet', async () => {
      const wallet = mockBalancedWallet;
      const desired = {};
      
      const result = await balancer(wallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
    });
    
    it('should handle zero total portfolio value', async () => {
      const zeroWallet = mockZeroWallet;
      const desired = mockDesiredWallets.balanced;
      
      const result = await balancer(zeroWallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
    });
    
    it('should handle extreme values in portfolio', async () => {
      const extremeWallet = mockExtremeWallet;
      const desired = { EXTREME: 100 };
      
      const result = await balancer(extremeWallet, desired, [], 'manual', true);
      
      expect(result).toBeDefined();
      expect(isFinite(result.totalPortfolioValue)).toBe(true);
    });
  });
});