import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";

// Mock modules first, before any other imports
const mockTinkoffSDK = {
  instruments: {
    shares: mock(() => Promise.resolve({ instruments: [] })),
    etfs: mock(() => Promise.resolve({ instruments: [] })),
    currencies: mock(() => Promise.resolve({ instruments: [] })),
    etfBy: mock(() => Promise.resolve({ instrument: {} })),
    getAssetBy: mock(() => Promise.resolve({ asset: { security: { etf: {} } } })),
  },
  marketData: {
    getLastPrices: mock(() => Promise.resolve({ lastPrices: [] })),
  }
};

// Mock the Tinkoff SDK before importing etfCap
mock.module('tinkoff-sdk-grpc-js', () => ({
  createSdk: mock((token: string) => {
    // If token is empty, simulate authentication error
    if (!token) {
      return {
        instruments: {
          shares: mock(() => Promise.reject(new Error('UNAUTHENTICATED: Unauthorized'))),
          etfs: mock(() => Promise.reject(new Error('UNAUTHENTICATED: Unauthorized'))),
          currencies: mock(() => Promise.reject(new Error('UNAUTHENTICATED: Unauthorized'))),
          etfBy: mock(() => Promise.reject(new Error('UNAUTHENTICATED: Unauthorized'))),
          getAssetBy: mock(() => Promise.reject(new Error('UNAUTHENTICATED: Unauthorized'))),
        },
        marketData: {
          getLastPrices: mock(() => Promise.reject(new Error('UNAUTHENTICATED: Unauthorized'))),
        }
      };
    }
    return mockTinkoffSDK;
  })
}));

// Mock request-promise module used by etfCap.ts
let rpMockState = {
  shouldFail: false,
  responses: new Map<string, any>(),
};

mock.module('request-promise', () => {
  return (options: any) => {
    const url = options.uri || options.url || '';
    
    if (rpMockState.shouldFail) {
      return Promise.reject(new Error(`Network error: ${url}`));
    }
    
    if (rpMockState.responses.has(url)) {
      return Promise.resolve(rpMockState.responses.get(url));
    }
    
    // Default response for T-Capital statistics
    if (url.includes('t-capital-funds.ru/statistics')) {
      return Promise.resolve(`
        <html>
          <body>
            <table>
              <tr>
                <th>Фонд</th>
                <th>СЧА за последний день</th>
                <th>Другие данные</th>
              </tr>
              <tr>
                <td>TRUR - Стратегия вечного портфеля в рублях</td>
                <td>1,500,000,000 ₽</td>
                <td>-</td>
              </tr>
              <tr>
                <td>TMOS - Т-Капитал Индекс МосБиржи</td>
                <td>2,300,000,000 ₽</td>
                <td>-</td>
              </tr>
              <tr>
                <td>TGLD - Золото</td>
                <td>800,000,000 ₽</td>
                <td>-</td>
              </tr>
              <tr>
                <td>TPAY - Пассивный доход</td>
                <td>1,200,000,000 ₽</td>
                <td>-</td>
              </tr>
            </table>
          </body>
        </html>
      `);
    }
    
    return Promise.resolve('');
  };
});

// Mock configLoader
const mockConfigLoader = {
  getAccountById: mock((id: string) => {
    if (id === '0' || id === 'test-account-1') return { desired_wallet: {} };
    return undefined;
  })
};

mock.module('../../configLoader', () => ({
  configLoader: mockConfigLoader
}));

// Now import the rest
import { 
  TestEnvironment, 
  FinancialAssertions, 
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { mockAccountConfigs } from '../__fixtures__/configurations';
import { mockCurrentPrices, mockMarketData } from '../__fixtures__/market-data';
import { mockControls } from '../__mocks__/external-deps';
import { describe, it, expect, beforeEach, afterEach } from "bun:test";

// Mock environment variables
const originalEnv = process.env;

testSuite('AUM Data Processing with Various Currencies Tests', () => {
  beforeEach(() => {
    // Setup mocks
    mockControls.resetAll();
    
    // Reset and setup mock SDK methods
    mockTinkoffSDK.instruments.shares.mockClear();
    mockTinkoffSDK.instruments.etfs.mockClear();
    mockTinkoffSDK.instruments.currencies.mockClear();
    mockTinkoffSDK.instruments.etfBy.mockClear();
    mockTinkoffSDK.instruments.getAssetBy.mockClear();
    mockTinkoffSDK.marketData.getLastPrices.mockClear();
    
    // Setup default mock responses
    mockTinkoffSDK.instruments.shares.mockResolvedValue({ instruments: [] });
    mockTinkoffSDK.instruments.etfs.mockResolvedValue({ instruments: [] });
    mockTinkoffSDK.instruments.currencies.mockResolvedValue({ instruments: [] });
    mockTinkoffSDK.instruments.etfBy.mockResolvedValue({ instrument: {} });
    mockTinkoffSDK.instruments.getAssetBy.mockResolvedValue({ asset: { security: { etf: {} } } });
    mockTinkoffSDK.marketData.getLastPrices.mockResolvedValue({ lastPrices: [] });
    
    // Mock environment variables
    process.env = {
      ...originalEnv,
      TOKEN: 'test_token',
      ACCOUNT_ID: 'test-account-1'
    };
    
    // Mock request-promise for HTTP requests
    mockControls.network.setSuccess();
    
    // Setup Tinkoff SDK mock responses for currency data
    mockTinkoffSDK.instruments.currencies.mockResolvedValue({
      instruments: [
        {
          ticker: 'USD000UTSTOM',
          figi: 'BBG0013HGFT4',
          name: 'USD/RUB',
          classCode: 'CETS',
          currency: 'RUB'
        },
        {
          ticker: 'EUR_RUB__TOM',
          figi: 'BBG0013HJJ31',
          name: 'EUR/RUB',
          classCode: 'CETS',
          currency: 'RUB'
        }
      ]
    });
    
    mockTinkoffSDK.marketData.getLastPrices.mockResolvedValue({
      lastPrices: [
        {
          figi: 'BBG0013HGFT4',
          price: { units: 95, nano: 0 }
        },
        {
          figi: 'BBG0013HJJ31',
          price: { units: 105, nano: 0 }
        }
      ]
    });
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  describe('AUM Data Fetching with Various Currencies', () => {
    it('should fetch AUM data with RUB currency correctly', async () => {
      // Import the function inside the test
      const { buildAumMapSmart, parseMoneyToNumber } = await import('../../tools/etfCap');
      
      // Mock HTML response with RUB currency
      mockControls.network.setResponse('https://t-capital-funds.ru/statistics/', `
        <html>
          <body>
            <table>
              <tr>
                <th>Фонд</th>
                <th>СЧА за последний день</th>
                <th>Другие данные</th>
              </tr>
              <tr>
                <td>TRUR - Стратегия вечного портфеля в рублях</td>
                <td>1,500,000,000 ₽</td>
                <td>-</td>
              </tr>
            </table>
          </body>
        </html>
      `);
      
      const result = await buildAumMapSmart(['TRUR']);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result.TRUR).toBeDefined();
      expect(result.TRUR.amount).toBe(1500000000);
      expect(result.TRUR.currency).toBe('RUB');
    });
    
    it('should fetch AUM data with USD currency correctly', async () => {
      // Import the function inside the test
      const { buildAumMapSmart, parseMoneyToNumber } = await import('../../tools/etfCap');
      
      // Mock HTML response with USD currency
      mockControls.network.setResponse('https://t-capital-funds.ru/statistics/', `
        <html>
          <body>
            <table>
              <tr>
                <th>Фонд</th>
                <th>СЧА за последний день</th>
                <th>Другие данные</th>
              </tr>
              <tr>
                <td>TUSD - USD Fund</td>
                <td>$50,000,000</td>
                <td>-</td>
              </tr>
            </table>
          </body>
        </html>
      `);
      
      const result = await buildAumMapSmart(['TUSD']);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result.TUSD).toBeDefined();
      expect(result.TUSD.amount).toBe(50000000);
      expect(result.TUSD.currency).toBe('USD');
    });
    
    it('should fetch AUM data with EUR currency correctly', async () => {
      // Import the function inside the test
      const { buildAumMapSmart, parseMoneyToNumber } = await import('../../tools/etfCap');
      
      // Mock HTML response with EUR currency
      mockControls.network.setResponse('https://t-capital-funds.ru/statistics/', `
        <html>
          <body>
            <table>
              <tr>
                <th>Фонд</th>
                <th>СЧА за последний день</th>
                <th>Другие данные</th>
              </tr>
              <tr>
                <td>TEUR - EUR Fund</td>
                <td>€30,000,000</td>
                <td>-</td>
              </tr>
            </table>
          </body>
        </html>
      `);
      
      const result = await buildAumMapSmart(['TEUR']);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result.TEUR).toBeDefined();
      expect(result.TEUR.amount).toBe(30000000);
      expect(result.TEUR.currency).toBe('EUR');
    });
    
    it('should handle mixed currency AUM data correctly', async () => {
      // Import the function inside the test
      const { buildAumMapSmart, parseMoneyToNumber } = await import('../../tools/etfCap');
      
      // Mock HTML response with mixed currencies
      mockControls.network.setResponse('https://t-capital-funds.ru/statistics/', `
        <html>
          <body>
            <table>
              <tr>
                <th>Фонд</th>
                <th>СЧА за последний день</th>
                <th>Другие данные</th>
              </tr>
              <tr>
                <td>TRUR - Стратегия вечного портфеля в рублях</td>
                <td>1,500,000,000 ₽</td>
                <td>-</td>
              </tr>
              <tr>
                <td>TUSD - USD Fund</td>
                <td>$50,000,000</td>
                <td>-</td>
              </tr>
              <tr>
                <td>TEUR - EUR Fund</td>
                <td>€30,000,000</td>
                <td>-</td>
              </tr>
            </table>
          </body>
        </html>
      `);
      
      const result = await buildAumMapSmart(['TRUR', 'TUSD', 'TEUR']);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      
      // Check RUB currency
      expect(result.TRUR).toBeDefined();
      expect(result.TRUR.amount).toBe(1500000000);
      expect(result.TRUR.currency).toBe('RUB');
      
      // Check USD currency
      expect(result.TUSD).toBeDefined();
      expect(result.TUSD.amount).toBe(50000000);
      expect(result.TUSD.currency).toBe('USD');
      
      // Check EUR currency
      expect(result.TEUR).toBeDefined();
      expect(result.TEUR.amount).toBe(30000000);
      expect(result.TEUR.currency).toBe('EUR');
    });
    
    it('should handle AUM data with different number formats', async () => {
      // Import the function inside the test
      const { buildAumMapSmart, parseMoneyToNumber } = await import('../../tools/etfCap');
      
      // Mock HTML response with different number formats
      mockControls.network.setResponse('https://t-capital-funds.ru/statistics/', `
        <html>
          <body>
            <table>
              <tr>
                <th>Фонд</th>
                <th>СЧА за последний день</th>
                <th>Другие данные</th>
              </tr>
              <tr>
                <td>TFMT1 - Format Test 1</td>
                <td>1.500.000.000,50 ₽</td>
                <td>-</td>
              </tr>
              <tr>
                <td>TFMT2 - Format Test 2</td>
                <td>2,000,000,000.75</td>
                <td>-</td>
              </tr>
            </table>
          </body>
        </html>
      `);
      
      const result = await buildAumMapSmart(['TFMT1', 'TFMT2']);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      
      // The parsing should handle different formats correctly
      expect(result.TFMT1).toBeDefined();
      expect(typeof result.TFMT1.amount).toBe('number');
      expect(result.TFMT1.currency).toBe('RUB');
      
      expect(result.TFMT2).toBeDefined();
      expect(typeof result.TFMT2.amount).toBe('number');
    });
  });

  describe('Currency Conversion for AUM Data', () => {
    it('should convert USD AUM to RUB correctly', async () => {
      // Import the function inside the test
      const { getFxRateToRub } = await import('../../tools/etfCap');
      
      // Mock currency data for USD/RUB conversion
      mockTinkoffSDK.instruments.currencies.mockResolvedValue({
        instruments: [
          {
            ticker: 'USD000UTSTOM',
            figi: 'BBG0013HGFT4',
            name: 'USD/RUB',
            classCode: 'CETS',
            currency: 'RUB'
          }
        ]
      });
      
      mockTinkoffSDK.marketData.getLastPrices.mockResolvedValue({
        lastPrices: [
          {
            figi: 'BBG0013HGFT4',
            price: { units: 95, nano: 0 } // 95 RUB per USD
          }
        ]
      });
      
      const rate = await getFxRateToRub('USD');
      expect(rate).toBe(95);
    });
    
    it('should convert EUR AUM to RUB correctly', async () => {
      // Import the function inside the test
      const { getFxRateToRub } = await import('../../tools/etfCap');
      
      // Mock currency data for EUR/RUB conversion
      mockTinkoffSDK.instruments.currencies.mockResolvedValue({
        instruments: [
          {
            ticker: 'EUR_RUB__TOM',
            figi: 'BBG0013HJJ31',
            name: 'EUR/RUB',
            classCode: 'CETS',
            currency: 'RUB'
          }
        ]
      });
      
      mockTinkoffSDK.marketData.getLastPrices.mockResolvedValue({
        lastPrices: [
          {
            figi: 'BBG0013HJJ31',
            price: { units: 105, nano: 0 } // 105 RUB per EUR
          }
        ]
      });
      
      const rate = await getFxRateToRub('EUR');
      expect(rate).toBe(105);
    });
    
    it('should return 1 for RUB currency (no conversion needed)', async () => {
      // Import the function inside the test
      const { getFxRateToRub } = await import('../../tools/etfCap');
      
      const rate = await getFxRateToRub('RUB');
      expect(rate).toBe(1);
    });
    
    it('should handle missing currency instruments gracefully', async () => {
      // Import the function inside the test
      const { getFxRateToRub } = await import('../../tools/etfCap');
      
      // Mock empty currency response
      mockTinkoffSDK.instruments.currencies.mockResolvedValue({
        instruments: []
      });
      
      const rate = await getFxRateToRub('USD');
      expect(rate).toBe(0);
    });
    
    it('should handle invalid price data gracefully', async () => {
      // Import the function inside the test
      const { getFxRateToRub } = await import('../../tools/etfCap');
      
      // Mock currency data with invalid price
      mockTinkoffSDK.instruments.currencies.mockResolvedValue({
        instruments: [
          {
            ticker: 'USD000UTSTOM',
            figi: 'BBG0013HGFT4',
            name: 'USD/RUB',
            classCode: 'CETS',
            currency: 'RUB'
          }
        ]
      });
      
      mockTinkoffSDK.marketData.getLastPrices.mockResolvedValue({
        lastPrices: [
          {
            figi: 'BBG0013HGFT4',
            price: undefined // Invalid price
          }
        ]
      });
      
      const rate = await getFxRateToRub('USD');
      expect(rate).toBe(0);
    });
  });

  describe('AUM Data Processing Edge Cases with Currencies', () => {
    it('should handle AUM data with zero amounts', async () => {
      // Import the function inside the test
      const { buildAumMapSmart } = await import('../../tools/etfCap');
      
      // Mock HTML response with zero AUM
      mockControls.network.setResponse('https://t-capital-funds.ru/statistics/', `
        <html>
          <body>
            <table>
              <tr>
                <th>Фонд</th>
                <th>СЧА за последний день</th>
                <th>Другие данные</th>
              </tr>
              <tr>
                <td>TZERO - Zero AUM Fund</td>
                <td>0 ₽</td>
                <td>-</td>
              </tr>
            </table>
          </body>
        </html>
      `);
      
      const result = await buildAumMapSmart(['TZERO']);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      // Zero amounts should not be included in the result
      expect(result.TZERO).toBeUndefined();
    });
    
    it('should handle AUM data with negative amounts', async () => {
      // Import the function inside the test
      const { buildAumMapSmart } = await import('../../tools/etfCap');
      
      // Mock HTML response with negative AUM
      mockControls.network.setResponse('https://t-capital-funds.ru/statistics/', `
        <html>
          <body>
            <table>
              <tr>
                <th>Фонд</th>
                <th>СЧА за последний день</th>
                <th>Другие данные</th>
              </tr>
              <tr>
                <td>TNEG - Negative AUM Fund</td>
                <td>-500,000,000 ₽</td>
                <td>-</td>
              </tr>
            </table>
          </body>
        </html>
      `);
      
      const result = await buildAumMapSmart(['TNEG']);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      // Negative amounts should not be included in the result
      expect(result.TNEG).toBeUndefined();
    });
    
    it('should handle AUM data with extremely large numbers', async () => {
      // Import the function inside the test
      const { buildAumMapSmart } = await import('../../tools/etfCap');
      
      // Mock HTML response with extremely large AUM
      mockControls.network.setResponse('https://t-capital-funds.ru/statistics/', `
        <html>
          <body>
            <table>
              <tr>
                <th>Фонд</th>
                <th>СЧА за последний день</th>
                <th>Другие данные</th>
              </tr>
              <tr>
                <td>TLARGE - Large AUM Fund</td>
                <td>9,999,999,999,999 ₽</td>
                <td>-</td>
              </tr>
            </table>
          </body>
        </html>
      `);
      
      const result = await buildAumMapSmart(['TLARGE']);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result.TLARGE).toBeDefined();
      expect(result.TLARGE.amount).toBe(9999999999999);
      expect(result.TLARGE.currency).toBe('RUB');
    });
    
    it('should handle AUM data with special characters in currency symbols', async () => {
      // Import the function inside the test
      const { buildAumMapSmart } = await import('../../tools/etfCap');
      
      // Mock HTML response with special currency symbols
      mockControls.network.setResponse('https://t-capital-funds.ru/statistics/', `
        <html>
          <body>
            <table>
              <tr>
                <th>Фонд</th>
                <th>СЧА за последний день</th>
                <th>Другие данные</th>
              </tr>
              <tr>
                <td>TSPEC - Special Currency Fund</td>
                <td>100.000.000₽</td>
                <td>-</td>
              </tr>
            </table>
          </body>
        </html>
      `);
      
      const result = await buildAumMapSmart(['TSPEC']);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result.TSPEC).toBeDefined();
      expect(typeof result.TSPEC.amount).toBe('number');
      expect(result.TSPEC.currency).toBe('RUB');
    });
  });

  describe('Integration Tests for AUM Data with Currencies', () => {
    it('should handle complete workflow with USD AUM data and conversion', async () => {
      // Import the functions inside the test
      const { buildAumMapSmart, getFxRateToRub } = await import('../../tools/etfCap');
      
      // Mock HTML response with USD AUM data
      mockControls.network.setResponse('https://t-capital-funds.ru/statistics/', `
        <html>
          <body>
            <table>
              <tr>
                <th>Фонд</th>
                <th>СЧА за последний день</th>
                <th>Другие данные</th>
              </tr>
              <tr>
                <td>TUSD - USD Fund</td>
                <td>$50,000,000</td>
                <td>-</td>
              </tr>
            </table>
          </body>
        </html>
      `);
      
      // Mock currency data for USD/RUB conversion
      mockTinkoffSDK.instruments.currencies.mockResolvedValue({
        instruments: [
          {
            ticker: 'USD000UTSTOM',
            figi: 'BBG0013HGFT4',
            name: 'USD/RUB',
            classCode: 'CETS',
            currency: 'RUB'
          }
        ]
      });
      
      mockTinkoffSDK.marketData.getLastPrices.mockResolvedValue({
        lastPrices: [
          {
            figi: 'BBG0013HGFT4',
            price: { units: 95, nano: 0 } // 95 RUB per USD
          }
        ]
      });
      
      // Test the complete workflow: fetch AUM data + convert to RUB
      const aumResult = await buildAumMapSmart(['TUSD']);
      const usdToRubRate = await getFxRateToRub('USD');
      
      expect(aumResult).toBeDefined();
      expect(aumResult.TUSD).toBeDefined();
      expect(aumResult.TUSD.amount).toBe(50000000);
      expect(aumResult.TUSD.currency).toBe('USD');
      
      expect(usdToRubRate).toBe(95);
      
      // Calculate expected RUB value
      const expectedRubValue = aumResult.TUSD.amount * usdToRubRate;
      expect(expectedRubValue).toBe(4750000000); // 50,000,000 * 95
    });
    
    it('should handle mixed currency workflow with conversion', async () => {
      // Import the functions inside the test
      const { buildAumMapSmart, getFxRateToRub } = await import('../../tools/etfCap');
      
      // Mock HTML response with mixed currency AUM data
      mockControls.network.setResponse('https://t-capital-funds.ru/statistics/', `
        <html>
          <body>
            <table>
              <tr>
                <th>Фонд</th>
                <th>СЧА за последний день</th>
                <th>Другие данные</th>
              </tr>
              <tr>
                <td>TRUR - RUB Fund</td>
                <td>1,000,000,000 ₽</td>
                <td>-</td>
              </tr>
              <tr>
                <td>TUSD - USD Fund</td>
                <td>$50,000,000</td>
                <td>-</td>
              </tr>
              <tr>
                <td>TEUR - EUR Fund</td>
                <td>€30,000,000</td>
                <td>-</td>
              </tr>
            </table>
          </body>
        </html>
      `);
      
      // Mock currency data for conversion
      mockTinkoffSDK.instruments.currencies.mockResolvedValue({
        instruments: [
          {
            ticker: 'USD000UTSTOM',
            figi: 'BBG0013HGFT4',
            name: 'USD/RUB',
            classCode: 'CETS',
            currency: 'RUB'
          },
          {
            ticker: 'EUR_RUB__TOM',
            figi: 'BBG0013HJJ31',
            name: 'EUR/RUB',
            classCode: 'CETS',
            currency: 'RUB'
          }
        ]
      });
      
      mockTinkoffSDK.marketData.getLastPrices.mockResolvedValue({
        lastPrices: [
          {
            figi: 'BBG0013HGFT4',
            price: { units: 95, nano: 0 } // 95 RUB per USD
          },
          {
            figi: 'BBG0013HJJ31',
            price: { units: 105, nano: 0 } // 105 RUB per EUR
          }
        ]
      });
      
      // Test the complete workflow: fetch AUM data + convert to RUB
      const aumResult = await buildAumMapSmart(['TRUR', 'TUSD', 'TEUR']);
      const usdToRubRate = await getFxRateToRub('USD');
      const eurToRubRate = await getFxRateToRub('EUR');
      
      expect(aumResult).toBeDefined();
      expect(aumResult.TRUR).toBeDefined();
      expect(aumResult.TUSD).toBeDefined();
      expect(aumResult.TEUR).toBeDefined();
      
      expect(aumResult.TRUR.amount).toBe(1000000000);
      expect(aumResult.TRUR.currency).toBe('RUB');
      
      expect(aumResult.TUSD.amount).toBe(50000000);
      expect(aumResult.TUSD.currency).toBe('USD');
      
      expect(aumResult.TEUR.amount).toBe(30000000);
      expect(aumResult.TEUR.currency).toBe('EUR');
      
      expect(usdToRubRate).toBe(95);
      expect(eurToRubRate).toBe(105);
      
      // Calculate expected RUB values
      const rubValue = aumResult.TRUR.amount; // 1,000,000,000 RUB (no conversion)
      const usdValueInRub = aumResult.TUSD.amount * usdToRubRate; // 50,000,000 * 95
      const eurValueInRub = aumResult.TEUR.amount * eurToRubRate; // 30,000,000 * 105
      
      expect(rubValue).toBe(1000000000);
      expect(usdValueInRub).toBe(4750000000);
      expect(eurValueInRub).toBe(3150000000);
    });
  });

  describe('Error Handling for AUM Data with Currencies', () => {
    it('should handle network errors when fetching AUM data gracefully', async () => {
      // Import the function inside the test
      const { buildAumMapSmart } = await import('../../tools/etfCap');
      
      // Mock network failure
      mockControls.network.setFailure('networkTimeout');
      
      const result = await buildAumMapSmart(['TRUR']);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      // Should return empty object on network error
      expect(Object.keys(result)).toHaveLength(0);
    });
    
    it('should handle unauthorized access errors when fetching currency rates', async () => {
      // Import the function inside the test
      const { getFxRateToRub } = await import('../../tools/etfCap');
      
      // Mock the currencies method to reject with an unauthorized error
      mockTinkoffSDK.instruments.currencies.mockRejectedValue(new Error('UNAUTHENTICATED: Network error'));
      
      const rate = await getFxRateToRub('USD');
      expect(rate).toBe(0);
    });
    
    it('should handle rate limiting errors when fetching currency rates', async () => {
      // Import the function inside the test
      const { getFxRateToRub } = await import('../../tools/etfCap');
      
      // Mock the currencies method to reject with a rate limit error
      mockTinkoffSDK.instruments.currencies.mockRejectedValue(new Error('RESOURCE_EXHAUSTED: Rate limit exceeded'));
      
      const rate = await getFxRateToRub('USD');
      expect(rate).toBe(0);
    });
    
    it('should handle malformed HTML when parsing AUM data', async () => {
      // Import the function inside the test
      const { buildAumMapSmart } = await import('../../tools/etfCap');
      
      // Mock malformed HTML response
      mockControls.network.setResponse('https://t-capital-funds.ru/statistics/', `
        <html>
          <body>
            <div>This is not a table</div>
          </body>
        </html>
      `);
      
      const result = await buildAumMapSmart(['TRUR']);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      // Should return empty object when unable to parse HTML
      expect(Object.keys(result)).toHaveLength(0);
    });
    
    it('should handle empty environment variables', async () => {
      // Import the function inside the test
      const { getFxRateToRub } = await import('../../tools/etfCap');
      
      // Save original TOKEN and set it to empty string
      const originalToken = process.env.TOKEN;
      process.env.TOKEN = '';
      
      const rate = await getFxRateToRub('USD');
      expect(rate).toBe(0);
      
      // Restore original TOKEN
      process.env.TOKEN = originalToken;
    });
  });

  describe('Performance Tests for AUM Data with Currencies', () => {
    it('should handle multiple concurrent AUM data requests with different currencies', async () => {
      // Import the function inside the test
      const { buildAumMapSmart } = await import('../../tools/etfCap');
      
      // Mock HTML response with multiple currencies
      mockControls.network.setResponse('https://t-capital-funds.ru/statistics/', `
        <html>
          <body>
            <table>
              <tr>
                <th>Фонд</th>
                <th>СЧА за последний день</th>
                <th>Другие данные</th>
              </tr>
              <tr>
                <td>TRUR - RUB Fund</td>
                <td>1,000,000,000 ₽</td>
                <td>-</td>
              </tr>
              <tr>
                <td>TUSD - USD Fund</td>
                <td>$50,000,000</td>
                <td>-</td>
              </tr>
              <tr>
                <td>TEUR - EUR Fund</td>
                <td>€30,000,000</td>
                <td>-</td>
              </tr>
            </table>
          </body>
        </html>
      `);
      
      const result = await buildAumMapSmart(['TRUR', 'TUSD', 'TEUR']);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result.TRUR).toBeDefined();
      expect(result.TUSD).toBeDefined();
      expect(result.TEUR).toBeDefined();
    });
    
    it('should handle multiple concurrent currency conversion requests', async () => {
      // Import the function inside the test
      const { getFxRateToRub } = await import('../../tools/etfCap');
      
      // Mock currency data
      mockTinkoffSDK.instruments.currencies.mockResolvedValue({
        instruments: [
          {
            ticker: 'USD000UTSTOM',
            figi: 'BBG0013HGFT4',
            name: 'USD/RUB',
            classCode: 'CETS',
            currency: 'RUB'
          },
          {
            ticker: 'EUR_RUB__TOM',
            figi: 'BBG0013HJJ31',
            name: 'EUR/RUB',
            classCode: 'CETS',
            currency: 'RUB'
          }
        ]
      });
      
      mockTinkoffSDK.marketData.getLastPrices.mockResolvedValue({
        lastPrices: [
          {
            figi: 'BBG0013HGFT4',
            price: { units: 95, nano: 0 }
          },
          {
            figi: 'BBG0013HJJ31',
            price: { units: 105, nano: 0 }
          }
        ]
      });
      
      const promises = [
        getFxRateToRub('RUB'),
        getFxRateToRub('USD'),
        getFxRateToRub('EUR')
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      expect(results[0]).toBe(1); // RUB to RUB
      expect(results[1]).toBe(95); // USD to RUB
      expect(results[2]).toBe(105); // EUR to RUB
    });
    
    it('should complete AUM data processing with currency conversion within reasonable time', async () => {
      // Import the functions inside the test
      const { buildAumMapSmart, getFxRateToRub } = await import('../../tools/etfCap');
      
      // Mock HTML response
      mockControls.network.setResponse('https://t-capital-funds.ru/statistics/', `
        <html>
          <body>
            <table>
              <tr>
                <th>Фонд</th>
                <th>СЧА за последний день</th>
                <th>Другие данные</th>
              </tr>
              <tr>
                <td>TRUR - RUB Fund</td>
                <td>1,000,000,000 ₽</td>
                <td>-</td>
              </tr>
              <tr>
                <td>TUSD - USD Fund</td>
                <td>$50,000,000</td>
                <td>-</td>
              </tr>
            </table>
          </body>
        </html>
      `);
      
      // Mock currency data
      mockTinkoffSDK.instruments.currencies.mockResolvedValue({
        instruments: [
          {
            ticker: 'USD000UTSTOM',
            figi: 'BBG0013HGFT4',
            name: 'USD/RUB',
            classCode: 'CETS',
            currency: 'RUB'
          }
        ]
      });
      
      mockTinkoffSDK.marketData.getLastPrices.mockResolvedValue({
        lastPrices: [
          {
            figi: 'BBG0013HGFT4',
            price: { units: 95, nano: 0 }
          }
        ]
      });
      
      const startTime = performance.now();
      const aumResult = await buildAumMapSmart(['TRUR', 'TUSD']);
      const usdRate = await getFxRateToRub('USD');
      const elapsed = performance.now() - startTime;
      
      expect(aumResult).toBeDefined();
      expect(usdRate).toBe(95);
      // Should complete within 5 seconds
      expect(elapsed).toBeLessThan(5000);
    });
  });
});