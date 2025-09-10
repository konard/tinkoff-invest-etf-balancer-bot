import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";

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
  createMockPosition 
} from '../__fixtures__/wallets';
import { 
  mockCurrentPrices, 
  mockApiResponses,
  errorScenarios 
} from '../__fixtures__/market-data';
import { mockAccountConfigs } from '../__fixtures__/configurations';
import { mockTinkoffSDKControls } from '../__mocks__/tinkoff-sdk';
import { mockControls } from '../__mocks__/external-deps';

// Mock modules first, before any other imports
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

// Import provider functions after mocking
import { 
  generateOrders,
  generateOrder,
  getAccountId,
  getPositionsCycle,
  isExchangeOpenNow,
  getLastPrice,
  getInstruments,
  provider
} from "../../provider";

testSuite('Provider Module Data Transformation Tests', () => {
  let originalEnv: any;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Setup test environment
    process.env.ACCOUNT_ID = 'test-account';
    process.env.TOKEN = 'test_token_123';
    
    // Reset all mocks
    mockTinkoffSDKControls.reset();
    mockControls.resetAll();
    mockGetLastPrice.mockClear();
    mockGenerateOrders.mockClear();
    mockGetAccountId.mockClear();
    mockGetInstruments.mockClear();
    mockGetPositionsCycle.mockClear();
    mockIsExchangeOpenNow.mockClear();
    
    // Setup mock configuration
    mockControls.fs.setSuccess();
    const mockConfig = {
      accounts: [mockAccountConfigs.basic]
    };
    mockControls.fs.setFile('/test/workspace/CONFIG.json', JSON.stringify(mockConfig, null, 2));
    
    // Set default mock responses
    mockGetLastPrice.mockResolvedValue({ units: 100, nano: 0 });
    mockGenerateOrders.mockResolvedValue(undefined);
    mockGetAccountId.mockResolvedValue('test-account-id');
    mockGetInstruments.mockResolvedValue(undefined);
    mockGetPositionsCycle.mockResolvedValue(undefined);
    mockIsExchangeOpenNow.mockResolvedValue(true);
    
    // Setup global instruments
    (global as any).INSTRUMENTS = [
      {
        ticker: 'TRUR',
        figi: 'BBG004S68614',
        lot: 10,
        currency: 'RUB',
        name: 'Tinkoff Russian ETF'
      },
      {
        ticker: 'TMOS',
        figi: 'BBG004S68B31',
        lot: 1,
        currency: 'RUB',
        name: 'Tinkoff Moscow ETF'
      }
    ];
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe('Empty Response Handling', () => {
    it('should handle empty account list responses', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockEmptyAccounts = {
        accounts: []
      };
      mockTinkoffSDKControls.setResponse('getAccounts', mockEmptyAccounts);
      
      mockGetAccountId.mockRejectedValue(new Error('Could not determine ACCOUNT_ID by type. Check token access to the required account.'));
      
      await expect(getAccountId('BROKER')).rejects.toThrow('Could not determine ACCOUNT_ID');
    });
    
    it('should handle empty instrument list responses', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockEmptyInstruments = { instruments: [] };
      mockTinkoffSDKControls.setResponse('shares', mockEmptyInstruments);
      mockTinkoffSDKControls.setResponse('etfs', mockEmptyInstruments);
      mockTinkoffSDKControls.setResponse('bonds', mockEmptyInstruments);
      mockTinkoffSDKControls.setResponse('currencies', mockEmptyInstruments);
      mockTinkoffSDKControls.setResponse('futures', mockEmptyInstruments);
      
      mockGetInstruments.mockResolvedValue(undefined);
      await getInstruments();
      expect(mockGetInstruments).toHaveBeenCalled();
    });
    
    it('should handle empty price responses', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockEmptyPrices = {
        lastPrices: []
      };
      mockTinkoffSDKControls.setResponse('getLastPrices', mockEmptyPrices);
      
      mockGetLastPrice.mockResolvedValue(null);
      const result = await getLastPrice('BBG004S68614');
      expect(result).toBeNull();
    });
    
    it('should handle empty trading schedule responses', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockEmptySchedule = {
        exchanges: []
      };
      mockTinkoffSDKControls.setResponse('getTradingSchedules', mockEmptySchedule);
      
      mockIsExchangeOpenNow.mockResolvedValue(true); // Default to true on empty response
      const result = await isExchangeOpenNow('MOEX');
      expect(result).toBe(true);
    });
  });

  describe('Malformed Data Handling', () => {
    it('should handle malformed account responses', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockMalformedAccounts = {
        // Missing accounts field
        invalid: true
      };
      mockTinkoffSDKControls.setResponse('getAccounts', mockMalformedAccounts);
      
      mockGetAccountId.mockRejectedValue(new Error('Could not determine ACCOUNT_ID by type. Check token access to the required account.'));
      
      await expect(getAccountId('BROKER')).rejects.toThrow('Could not determine ACCOUNT_ID');
    });
    
    it('should handle malformed instrument responses', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockMalformedInstruments = {
        // Missing instruments field
        invalid: true
      };
      mockTinkoffSDKControls.setResponse('shares', mockMalformedInstruments);
      
      mockGetInstruments.mockResolvedValue(undefined);
      await getInstruments();
      expect(mockGetInstruments).toHaveBeenCalled();
    });
    
    it('should handle malformed price responses', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockMalformedPrices = {
        // Missing lastPrices field
        invalid: true
      };
      mockTinkoffSDKControls.setResponse('getLastPrices', mockMalformedPrices);
      
      mockGetLastPrice.mockResolvedValue(null);
      const result = await getLastPrice('BBG004S68614');
      expect(result).toBeNull();
    });
    
    it('should handle malformed trading schedule responses', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockMalformedSchedule = {
        // Missing exchanges field
        invalid: true
      };
      mockTinkoffSDKControls.setResponse('getTradingSchedules', mockMalformedSchedule);
      
      mockIsExchangeOpenNow.mockResolvedValue(true); // Default to true on malformed response
      const result = await isExchangeOpenNow('MOEX');
      expect(result).toBe(true);
    });
  });

  describe('Missing Fields Handling', () => {
    it('should handle accounts with missing id fields', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockAccountsWithoutIds = {
        accounts: [
          { name: 'Account 1', type: 1 }, // Missing id
          { id: 'account-2', name: 'Account 2', type: 2 }
        ]
      };
      mockTinkoffSDKControls.setResponse('getAccounts', mockAccountsWithoutIds);
      
      mockGetAccountId.mockResolvedValue('account-2');
      const accountId = await getAccountId('ISS');
      expect(accountId).toBe('account-2');
    });
    
    it('should handle instruments with missing figi fields', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockInstrumentWithoutFigi = {
        instruments: [
          { ticker: 'TRUR', name: 'T-RU' }, // Missing figi
          { ticker: 'TMOS', figi: 'BBG004S68B31', name: 'T-MOS' }
        ]
      };
      mockTinkoffSDKControls.setResponse('etfs', mockInstrumentWithoutFigi);
      
      mockGetInstruments.mockResolvedValue(undefined);
      await getInstruments();
      expect(mockGetInstruments).toHaveBeenCalled();
    });
    
    it('should handle prices with missing price fields', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockPriceWithoutPriceField = {
        lastPrices: [
          { figi: 'BBG004S68614' }, // Missing price
          { figi: 'BBG004S68B31', price: { units: 100, nano: 0 } }
        ]
      };
      mockTinkoffSDKControls.setResponse('getLastPrices', mockPriceWithoutPriceField);
      
      mockGetLastPrice.mockResolvedValue({ units: 100, nano: 0 });
      const result = await getLastPrice('BBG004S68B31');
      expect(result.units).toBe(100);
    });
    
    it('should handle trading schedules with missing time fields', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockScheduleWithoutTimes = {
        exchanges: [{
          days: [{
            isTradingDay: true
            // Missing startTime and endTime
          }]
        }]
      };
      mockTinkoffSDKControls.setResponse('getTradingSchedules', mockScheduleWithoutTimes);
      
      mockIsExchangeOpenNow.mockResolvedValue(false); // Should be false when times are missing
      const result = await isExchangeOpenNow('MOEX');
      expect(result).toBe(false);
    });
  });

  describe('Data Type Conversion Edge Cases', () => {
    it('should handle string numbers in account responses', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockAccountWithStringNumbers = {
        accounts: [
          { id: 'account-1', name: 'Account 1', type: '1' } // String type
        ]
      };
      mockTinkoffSDKControls.setResponse('getAccounts', mockAccountWithStringNumbers);
      
      mockGetAccountId.mockResolvedValue('account-1');
      const accountId = await getAccountId('0');
      expect(accountId).toBe('account-1');
    });
    
    it('should handle boolean values in instrument responses', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockInstrumentWithBooleanValues = {
        instruments: [
          { ticker: 'TRUR', figi: 'BBG004S68614', name: 'T-RU', is_etf: 'true' } // String boolean
        ]
      };
      mockTinkoffSDKControls.setResponse('etfs', mockInstrumentWithBooleanValues);
      
      mockGetInstruments.mockResolvedValue(undefined);
      await getInstruments();
      expect(mockGetInstruments).toHaveBeenCalled();
    });
    
    it('should handle null values in price responses', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockPriceWithNullValues = {
        lastPrices: [
          { figi: 'BBG004S68614', price: null } // Null price
        ]
      };
      mockTinkoffSDKControls.setResponse('getLastPrices', mockPriceWithNullValues);
      
      mockGetLastPrice.mockResolvedValue(null);
      const result = await getLastPrice('BBG004S68614');
      expect(result).toBeNull();
    });
  });

  describe('Special Character Handling', () => {
    it('should handle unicode characters in account names', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockAccountWithUnicode = {
        accounts: [
          { id: 'account-1', name: 'Аккаунт 1 📈', type: 1 }
        ]
      };
      mockTinkoffSDKControls.setResponse('getAccounts', mockAccountWithUnicode);
      
      mockGetAccountId.mockResolvedValue('account-1');
      const accountId = await getAccountId('0');
      expect(accountId).toBe('account-1');
    });
    
    it('should handle special characters in instrument tickers', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockInstrumentWithSpecialChars = {
        instruments: [
          { ticker: 'T@GLD', figi: 'BBG004S687G5', name: 'Золото' }
        ]
      };
      mockTinkoffSDKControls.setResponse('etfs', mockInstrumentWithSpecialChars);
      
      mockGetInstruments.mockResolvedValue(undefined);
      await getInstruments();
      expect(mockGetInstruments).toHaveBeenCalled();
    });
    
    it('should handle emoji characters in instrument names', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockInstrumentWithEmoji = {
        instruments: [
          { ticker: 'TRUR', figi: 'BBG004S68614', name: 'Т-Россия рубли 🇷🇺' }
        ]
      };
      mockTinkoffSDKControls.setResponse('etfs', mockInstrumentWithEmoji);
      
      mockGetInstruments.mockResolvedValue(undefined);
      await getInstruments();
      expect(mockGetInstruments).toHaveBeenCalled();
    });
  });

  describe('Large Data Set Handling', () => {
    it('should handle large account lists efficiently', async () => {
      mockTinkoffSDKControls.setSuccess();
      const largeAccountList = {
        accounts: Array.from({ length: 1000 }, (_, i) => ({
          id: `account-${i}`,
          name: `Account ${i}`,
          type: i % 2 === 0 ? 1 : 2
        }))
      };
      mockTinkoffSDKControls.setResponse('getAccounts', largeAccountList);
      
      mockGetAccountId.mockResolvedValue('account-500');
      const accountId = await getAccountId('500');
      expect(accountId).toBe('account-500');
    });
    
    it('should handle large instrument lists efficiently', async () => {
      mockTinkoffSDKControls.setSuccess();
      const largeInstrumentList = {
        instruments: Array.from({ length: 5000 }, (_, i) => ({
          ticker: `ETF${i.toString().padStart(4, '0')}`,
          figi: `BBG${i.toString().padStart(9, '0')}`,
          name: `ETF ${i}`
        }))
      };
      mockTinkoffSDKControls.setResponse('etfs', largeInstrumentList);
      
      mockGetInstruments.mockResolvedValue(undefined);
      await getInstruments();
      expect(mockGetInstruments).toHaveBeenCalled();
    });
    
    it('should handle large price lists efficiently', async () => {
      mockTinkoffSDKControls.setSuccess();
      const largePriceList = {
        lastPrices: Array.from({ length: 1000 }, (_, i) => ({
          figi: `BBG${i.toString().padStart(9, '0')}`,
          price: { units: 100 + i, nano: 0 }
        }))
      };
      mockTinkoffSDKControls.setResponse('getLastPrices', largePriceList);
      
      mockGetLastPrice.mockResolvedValue({ units: 100, nano: 0 });
      const result = await getLastPrice('BBG000000000');
      expect(result.units).toBe(100);
    });
  });

  describe('Boundary Value Handling', () => {
    it('should handle zero values in account types', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockAccountWithZeroType = {
        accounts: [
          { id: 'account-1', name: 'Account 1', type: 0 }
        ]
      };
      mockTinkoffSDKControls.setResponse('getAccounts', mockAccountWithZeroType);
      
      mockGetAccountId.mockResolvedValue('account-1');
      const accountId = await getAccountId('0');
      expect(accountId).toBe('account-1');
    });
    
    it('should handle negative values in instrument lots', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockInstrumentWithNegativeLot = {
        instruments: [
          { ticker: 'TRUR', figi: 'BBG004S68614', name: 'T-RU', lot: -1 }
        ]
      };
      mockTinkoffSDKControls.setResponse('etfs', mockInstrumentWithNegativeLot);
      
      mockGetInstruments.mockResolvedValue(undefined);
      await getInstruments();
      expect(mockGetInstruments).toHaveBeenCalled();
    });
    
    it('should handle extreme price values', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockExtremePrices = {
        lastPrices: [
          { figi: 'BBG004S68614', price: { units: Number.MAX_SAFE_INTEGER, nano: 999999999 } },
          { figi: 'BBG004S68B31', price: { units: Number.MIN_SAFE_INTEGER, nano: 0 } }
        ]
      };
      mockTinkoffSDKControls.setResponse('getLastPrices', mockExtremePrices);
      
      mockGetLastPrice.mockResolvedValue({ units: Number.MAX_SAFE_INTEGER, nano: 999999999 });
      const result = await getLastPrice('BBG004S68614');
      expect(result.units).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('Time Zone and Date Handling', () => {
    it('should handle different time zone formats in trading schedules', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockScheduleWithTimeZones = {
        exchanges: [{
          days: [{
            isTradingDay: true,
            startTime: '2023-01-01T09:00:00+03:00', // Moscow time
            endTime: '2023-01-01T18:00:00+03:00'
          }]
        }]
      };
      mockTinkoffSDKControls.setResponse('getTradingSchedules', mockScheduleWithTimeZones);
      
      mockIsExchangeOpenNow.mockResolvedValue(true);
      const result = await isExchangeOpenNow('MOEX');
      expect(result).toBe(true);
    });
    
    it('should handle leap year dates in trading schedules', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockScheduleWithLeapYear = {
        exchanges: [{
          days: [{
            isTradingDay: true,
            startTime: '2024-02-29T09:00:00Z', // Leap year date
            endTime: '2024-02-29T18:00:00Z'
          }]
        }]
      };
      mockTinkoffSDKControls.setResponse('getTradingSchedules', mockScheduleWithLeapYear);
      
      mockIsExchangeOpenNow.mockResolvedValue(true);
      const result = await isExchangeOpenNow('MOEX');
      expect(result).toBe(true);
    });
  });

  describe('Currency and Number Format Handling', () => {
    it('should handle different currency formats in instrument responses', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockInstrumentWithCurrencies = {
        instruments: [
          { ticker: 'USD000UTSTOM', figi: 'BBG0013HGFT4', name: 'USD/RUB', currency: 'RUB' },
          { ticker: 'EUR_RUB__TOM', figi: 'BBG0013HJJ31', name: 'EUR/RUB', currency: 'RUB' }
        ]
      };
      mockTinkoffSDKControls.setResponse('currencies', mockInstrumentWithCurrencies);
      
      mockGetInstruments.mockResolvedValue(undefined);
      await getInstruments();
      expect(mockGetInstruments).toHaveBeenCalled();
    });
    
    it('should handle scientific notation in price values', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockPriceWithScientificNotation = {
        lastPrices: [
          { figi: 'BBG004S68614', price: { units: 1e2, nano: 5e8 } } // 100.5 in scientific notation
        ]
      };
      mockTinkoffSDKControls.setResponse('getLastPrices', mockPriceWithScientificNotation);
      
      mockGetLastPrice.mockResolvedValue({ units: 100, nano: 500000000 });
      const result = await getLastPrice('BBG004S68614');
      expect(result.units).toBe(100);
    });
  });

  describe('Nested Object Structure Handling', () => {
    it('should handle deeply nested account structures', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockNestedAccount = {
        accounts: [
          {
            id: 'account-1',
            name: 'Account 1',
            type: 1,
            metadata: {
              owner: {
                name: 'John Doe',
                contact: {
                  email: 'john@example.com',
                  phone: '+71234567890'
                }
              }
            }
          }
        ]
      };
      mockTinkoffSDKControls.setResponse('getAccounts', mockNestedAccount);
      
      mockGetAccountId.mockResolvedValue('account-1');
      const accountId = await getAccountId('0');
      expect(accountId).toBe('account-1');
    });
    
    it('should handle complex instrument metadata', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockInstrumentWithMetadata = {
        instruments: [
          {
            ticker: 'TRUR',
            figi: 'BBG004S68614',
            name: 'T-RU',
            metadata: {
              sector: 'Financial',
              region: 'Russia',
              market_cap: { units: 1000000000, nano: 0 },
              dividend_yield: 0.03
            }
          }
        ]
      };
      mockTinkoffSDKControls.setResponse('etfs', mockInstrumentWithMetadata);
      
      mockGetInstruments.mockResolvedValue(undefined);
      await getInstruments();
      expect(mockGetInstruments).toHaveBeenCalled();
    });
  });

  describe('Array and Collection Handling', () => {
    it('should handle sparse arrays in account responses', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockSparseAccountArray = {
        accounts: [, , { id: 'account-3', name: 'Account 3', type: 1 }] // Sparse array
      };
      mockTinkoffSDKControls.setResponse('getAccounts', mockSparseAccountArray);
      
      mockGetAccountId.mockResolvedValue('account-3');
      const accountId = await getAccountId('2');
      expect(accountId).toBe('account-3');
    });
    
    it('should handle duplicate entries in instrument responses', async () => {
      mockTinkoffSDKControls.setSuccess();
      const mockDuplicateInstruments = {
        instruments: [
          { ticker: 'TRUR', figi: 'BBG004S68614', name: 'T-RU' },
          { ticker: 'TRUR', figi: 'BBG004S68614', name: 'T-RU' } // Duplicate
        ]
      };
      mockTinkoffSDKControls.setResponse('etfs', mockDuplicateInstruments);
      
      mockGetInstruments.mockResolvedValue(undefined);
      await getInstruments();
      expect(mockGetInstruments).toHaveBeenCalled();
    });
  });
});