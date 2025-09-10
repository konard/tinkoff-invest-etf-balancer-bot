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

testSuite('Weight Distribution Edge Cases Tests', () => {
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
    
    // Setup Tinkoff SDK mock responses for ETF data
    mockTinkoffSDK.instruments.etfs.mockResolvedValue({
      instruments: [
        {
          ticker: 'TRUR',
          figi: 'BBG004S68614',
          uid: 'etf-trur-uid',
          numShares: { units: 15000000, nano: 0 },
          assetUid: 'asset-trur-uid'
        },
        {
          ticker: 'TMOS',
          figi: 'BBG004S68B31',
          uid: 'etf-tmos-uid',
          numShares: { units: 23000000, nano: 0 },
          assetUid: 'asset-tmos-uid'
        },
        {
          ticker: 'TGLD',
          figi: 'BBG004S687G5',
          uid: 'etf-tgld-uid',
          numShares: { units: 8000000, nano: 0 },
          assetUid: 'asset-tgld-uid'
        }
      ]
    });
    
    mockTinkoffSDK.instruments.shares.mockResolvedValue({
      instruments: [
        {
          ticker: 'SBER',
          figi: 'BBG004730N88',
          uid: 'share-sber-uid',
          issueSize: 21586948000,
          assetUid: 'asset-sber-uid'
        },
        {
          ticker: 'GAZP',
          figi: 'BBG004730ZJ9',
          uid: 'share-gazp-uid',
          issueSize: 23673512900,
          assetUid: 'asset-gazp-uid'
        }
      ]
    });
    
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
          figi: 'BBG004S68614',
          price: { units: 100, nano: 0 }
        },
        {
          figi: 'BBG004S68B31',
          price: { units: 100, nano: 0 }
        },
        {
          figi: 'BBG004S687G5',
          price: { units: 100, nano: 0 }
        },
        {
          figi: 'BBG004730N88',
          price: { units: 250, nano: 0 }
        },
        {
          figi: 'BBG004730ZJ9',
          price: { units: 150, nano: 0 }
        },
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

  describe('Market Cap Weight Distribution Edge Cases', () => {
    it('should handle extremely large market cap values', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock ETF with extremely large number of shares
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TLARGE',
            figi: 'BBG004S68614',
            uid: 'etf-tlarge-uid',
            numShares: { units: 1000000000000, nano: 0 }, // 1 trillion shares
            assetUid: 'asset-tlarge-uid'
          }
        ]
      });
      
      const result = await getEtfMarketCapRUB('TLARGE');
      
      expect(result).toBeDefined();
      expect(result!.numShares).toBe(1000000000000);
      expect(result!.lastPriceRUB).toBe(100);
      expect(result!.marketCapRUB).toBe(100000000000000); // 1 trillion * 100
    });
    
    it('should handle extremely small market cap values', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock ETF with extremely small number of shares and price
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TSMALL',
            figi: 'BBG004S68614',
            uid: 'etf-tsmall-uid',
            numShares: { units: 1, nano: 0 }, // 1 share
            assetUid: 'asset-tsmall-uid'
          }
        ]
      });
      
      mockTinkoffSDK.marketData.getLastPrices.mockResolvedValue({
        lastPrices: [
          {
            figi: 'BBG004S68614',
            price: { units: 0, nano: 100000000 } // 0.1 RUB
          }
        ]
      });
      
      const result = await getEtfMarketCapRUB('TSMALL');
      
      expect(result).toBeDefined();
      expect(result!.numShares).toBe(1);
      expect(result!.lastPriceRUB).toBe(0.1);
      expect(result!.marketCapRUB).toBe(0.1); // 1 * 0.1
    });
    
    it('should handle zero market cap values', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock ETF with zero shares
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TZERO',
            figi: 'BBG004S68614',
            uid: 'etf-tzero-uid',
            numShares: { units: 0, nano: 0 }, // 0 shares
            assetUid: 'asset-tzero-uid'
          }
        ]
      });
      
      const result = await getEtfMarketCapRUB('TZERO');
      
      expect(result).toBeDefined();
      expect(result!.numShares).toBe(0);
      expect(result!.marketCapRUB).toBe(0); // 0 * price = 0
    });
    
    it('should handle fractional shares in market cap calculation', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock ETF with fractional shares
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TFRACT',
            figi: 'BBG004S68614',
            uid: 'etf-tfract-uid',
            numShares: { units: 1000000, nano: 500000000 }, // 1,000,000.5 shares
            assetUid: 'asset-tfract-uid'
          }
        ]
      });
      
      const result = await getEtfMarketCapRUB('TFRACT');
      
      expect(result).toBeDefined();
      expect(result!.numShares).toBe(1000000.5);
      expect(result!.lastPriceRUB).toBe(100);
      expect(result!.marketCapRUB).toBe(100000050); // 1,000,000.5 * 100
    });
  });

  describe('AUM Weight Distribution Edge Cases', () => {
    it('should handle extremely large AUM values', async () => {
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
      expect(result.TLARGE).toBeDefined();
      expect(result.TLARGE.amount).toBe(9999999999999);
      expect(result.TLARGE.currency).toBe('RUB');
    });
    
    it('should handle extremely small AUM values', async () => {
      // Import the function inside the test
      const { buildAumMapSmart } = await import('../../tools/etfCap');
      
      // Mock HTML response with extremely small AUM
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
                <td>TSMALL - Small AUM Fund</td>
                <td>1 ₽</td>
                <td>-</td>
              </tr>
            </table>
          </body>
        </html>
      `);
      
      const result = await buildAumMapSmart(['TSMALL']);
      
      expect(result).toBeDefined();
      expect(result.TSMALL).toBeDefined();
      expect(result.TSMALL.amount).toBe(1);
      expect(result.TSMALL.currency).toBe('RUB');
    });
    
    it('should handle zero AUM values', async () => {
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
      // Zero AUM values should not be included in the result
      expect(result.TZERO).toBeUndefined();
    });
    
    it('should handle negative AUM values', async () => {
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
      // Negative AUM values should not be included in the result
      expect(result.TNEG).toBeUndefined();
    });
  });

  describe('Decorrelation Weight Distribution Edge Cases', () => {
    it('should handle equal market cap and AUM values', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock ETF with specific market cap
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TEQUAL',
            figi: 'BBG004S68614',
            uid: 'etf-tequal-uid',
            numShares: { units: 1000000, nano: 0 }, // 1M shares
            assetUid: 'asset-tequal-uid'
          }
        ]
      });
      
      mockTinkoffSDK.marketData.getLastPrices.mockResolvedValue({
        lastPrices: [
          {
            figi: 'BBG004S68614',
            price: { units: 100, nano: 0 } // 100 RUB per share
          }
        ]
      });
      
      const result = await getEtfMarketCapRUB('TEQUAL');
      
      expect(result).toBeDefined();
      expect(result!.marketCapRUB).toBe(100000000); // 1M * 100
      
      // When market cap equals AUM, decorrelation should be 0%
      // This would be tested in the balancer module, but we verify the data is correct here
      expect(result!.marketCapRUB).toBe(100000000);
    });
    
    it('should handle market cap much larger than AUM', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock ETF with high market cap
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TOVER',
            figi: 'BBG004S68614',
            uid: 'etf-tover-uid',
            numShares: { units: 2000000, nano: 0 }, // 2M shares
            assetUid: 'asset-tover-uid'
          }
        ]
      });
      
      mockTinkoffSDK.marketData.getLastPrices.mockResolvedValue({
        lastPrices: [
          {
            figi: 'BBG004S68614',
            price: { units: 100, nano: 0 } // 100 RUB per share
          }
        ]
      });
      
      const result = await getEtfMarketCapRUB('TOVER');
      
      expect(result).toBeDefined();
      expect(result!.marketCapRUB).toBe(200000000); // 2M * 100
      
      // When market cap is much larger than AUM, decorrelation should be positive
      // This would be tested in the balancer module, but we verify the data is correct here
      expect(result!.marketCapRUB).toBe(200000000);
    });
    
    it('should handle market cap much smaller than AUM', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock ETF with low market cap
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TUNDER',
            figi: 'BBG004S68614',
            uid: 'etf-tunder-uid',
            numShares: { units: 500000, nano: 0 }, // 0.5M shares
            assetUid: 'asset-tunder-uid'
          }
        ]
      });
      
      mockTinkoffSDK.marketData.getLastPrices.mockResolvedValue({
        lastPrices: [
          {
            figi: 'BBG004S68614',
            price: { units: 100, nano: 0 } // 100 RUB per share
          }
        ]
      });
      
      const result = await getEtfMarketCapRUB('TUNDER');
      
      expect(result).toBeDefined();
      expect(result!.marketCapRUB).toBe(50000000); // 0.5M * 100
      
      // When market cap is much smaller than AUM, decorrelation should be negative
      // This would be tested in the balancer module, but we verify the data is correct here
      expect(result!.marketCapRUB).toBe(50000000);
    });
  });

  describe('Weight Distribution with Missing Data', () => {
    it('should handle missing numShares gracefully', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock ETF with missing numShares
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TMISSING',
            figi: 'BBG004S68614',
            uid: 'etf-tmissing-uid',
            numShares: undefined, // Missing numShares
            assetUid: 'asset-tmissing-uid'
          }
        ]
      });
      
      // Mock etfBy response to provide numShares
      mockTinkoffSDK.instruments.etfBy.mockResolvedValue({
        instrument: {
          numShares: { units: 1000000, nano: 0 }
        }
      });
      
      const result = await getEtfMarketCapRUB('TMISSING');
      
      expect(result).toBeDefined();
      expect(result!.numShares).toBe(1000000);
      expect(result!.numSharesSource).toBe('etfBy');
      expect(result!.marketCapRUB).toBe(100000000); // 1M * 100
    });
    
    it('should handle missing numShares and etfBy failure', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock ETF with missing numShares
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TMISSING',
            figi: 'BBG004S68614',
            uid: 'etf-tmissing-uid',
            numShares: undefined,
            assetUid: 'asset-tmissing-uid'
          }
        ]
      });
      
      // Mock etfBy to fail
      mockTinkoffSDK.instruments.etfBy.mockRejectedValue(new Error('Not found'));
      
      // Mock getAssetBy to provide numShares
      mockTinkoffSDK.instruments.getAssetBy.mockResolvedValue({
        asset: {
          security: {
            etf: {
              numShares: { units: 500000, nano: 0 }
            }
          }
        }
      });
      
      const result = await getEtfMarketCapRUB('TMISSING');
      
      expect(result).toBeDefined();
      expect(result!.numShares).toBe(500000);
      expect(result!.numSharesSource).toBe('asset');
      expect(result!.marketCapRUB).toBe(50000000); // 0.5M * 100
    });
    
    it('should handle completely missing share data', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock ETF with missing all share data
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TNODATA',
            figi: 'BBG004S68614',
            uid: 'etf-tnodata-uid',
            numShares: undefined,
            assetUid: 'asset-tnodata-uid'
          }
        ]
      });
      
      // Mock all data sources to fail
      mockTinkoffSDK.instruments.etfBy.mockRejectedValue(new Error('Not found'));
      mockTinkoffSDK.instruments.getAssetBy.mockRejectedValue(new Error('Not found'));
      
      const result = await getEtfMarketCapRUB('TNODATA');
      
      expect(result).toBeDefined();
      expect(result!.numShares).toBe(0);
      expect(result!.marketCapRUB).toBe(0);
    });
  });

  describe('Weight Distribution with Special Characters', () => {
    it('should handle tickers with special characters', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock ETF with special characters in ticker
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'T@GLD',
            figi: 'BBG004S687G5',
            uid: 'etf-tgld-uid',
            numShares: { units: 8000000, nano: 0 },
            assetUid: 'asset-tgld-uid'
          }
        ]
      });
      
      const result = await getEtfMarketCapRUB('T@GLD');
      
      expect(result).toBeDefined();
      if (result) {
        expect(result.ticker).toBe('T@GLD');
        expect(result.marketCapRUB).toBe(800000000); // 8M * 100
      }
    });
    
    it('should handle tickers with unicode characters', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock ETF with unicode characters in ticker (this would be unusual but we test for robustness)
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'T₽UB',
            figi: 'BBG004S68614',
            uid: 'etf-trub-uid',
            numShares: { units: 1000000, nano: 0 },
            assetUid: 'asset-trub-uid'
          }
        ]
      });
      
      const result = await getEtfMarketCapRUB('T₽UB');
      
      expect(result).toBeDefined();
      // The function should handle unicode characters in tickers
      expect(typeof result!.marketCapRUB).toBe('number');
    });
  });

  describe('Weight Distribution Performance Edge Cases', () => {
    it('should handle large number of ETFs efficiently', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock response with many ETFs
      const manyEtfs = Array.from({ length: 100 }, (_, i) => ({
        ticker: `T${i.toString().padStart(3, '0')}`,
        figi: `BBG${i.toString().padStart(9, '0')}`,
        uid: `etf-t${i.toString().padStart(3, '0')}-uid`,
        numShares: { units: 1000000 + i * 100000, nano: 0 },
        assetUid: `asset-t${i.toString().padStart(3, '0')}-uid`
      }));
      
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: manyEtfs
      });
      
      // Test a few ETFs from the large list
      const result1 = await getEtfMarketCapRUB('T001');
      const result2 = await getEtfMarketCapRUB('T050');
      const result3 = await getEtfMarketCapRUB('T099');
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
      
      expect(result1!.numShares).toBe(1100000);
      expect(result2!.numShares).toBe(6000000);
      expect(result3!.numShares).toBe(10900000);
    });
    
    it('should handle concurrent requests efficiently', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Test concurrent requests
      const promises = [
        getEtfMarketCapRUB('TRUR'),
        getEtfMarketCapRUB('TMOS'),
        getEtfMarketCapRUB('TGLD')
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result).not.toBeNull();
        if (result) {
          expect(result.marketCapRUB).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Weight Distribution Error Handling Edge Cases', () => {
    it('should handle unauthorized access errors gracefully', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock the etfs method to reject with an unauthorized error
      mockTinkoffSDK.instruments.etfs.mockRejectedValue(new Error('UNAUTHENTICATED: Network error'));
      
      const result = await getEtfMarketCapRUB('TRUR');
      expect(result).toBeNull();
    });
    
    it('should handle rate limiting errors gracefully', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock the etfs method to reject with a rate limit error
      mockTinkoffSDK.instruments.etfs.mockRejectedValue(new Error('RESOURCE_EXHAUSTED: Rate limit exceeded'));
      
      const result = await getEtfMarketCapRUB('TRUR');
      expect(result).toBeNull();
    });
    
    it('should handle network timeout errors gracefully', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock the etfs method to reject with a timeout error
      mockTinkoffSDK.instruments.etfs.mockRejectedValue(new Error('DEADLINE_EXCEEDED: Request timed out'));
      
      const result = await getEtfMarketCapRUB('TRUR');
      expect(result).toBeNull();
    });
    
    it('should handle malformed API responses gracefully', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        // Missing instruments field
        invalidResponse: true
      });
      
      const result = await getEtfMarketCapRUB('TRUR');
      expect(result).toBeNull();
    });
    
    it('should handle empty environment variables gracefully', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Save original TOKEN and set it to empty string
      const originalToken = process.env.TOKEN;
      process.env.TOKEN = '';
      
      const result = await getEtfMarketCapRUB('TRUR');
      expect(result).toBeNull();
      
      // Restore original TOKEN
      process.env.TOKEN = originalToken;
    });
  });
});