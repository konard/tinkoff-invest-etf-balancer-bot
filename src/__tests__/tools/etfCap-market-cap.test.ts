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

testSuite('ETF Market Capitalization Calculation Tests', () => {
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

  describe('ETF Market Capitalization Calculation', () => {
    it('should calculate market cap for standard ETF', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      const result = await getEtfMarketCapRUB('TRUR');
      
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.type).toBe('ETF');
      expect(result!.ticker).toBe('TRUR');
      expect(result!.normalizedTicker).toBe('TRUR');
      expect(result!.figi).toBe('BBG004S68614');
      expect(result!.lastPriceRUB).toBe(100);
      expect(result!.numShares).toBe(15000000);
      expect(result!.numSharesSource).toBe('list');
      expect(result!.marketCapRUB).toBe(1500000000); // 15M * 100
    });
    
    it('should handle ETF with missing numShares from list', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TRUR',
            figi: 'BBG004S68614',
            uid: 'etf-trur-uid',
            numShares: undefined, // Missing numShares
            assetUid: 'asset-trur-uid'
          }
        ]
      });
      
      // Mock etfBy response to provide numShares
      mockTinkoffSDK.instruments.etfBy.mockResolvedValue({
        instrument: {
          numShares: { units: 10000000, nano: 0 }
        }
      });
      
      const result = await getEtfMarketCapRUB('TRUR');
      
      expect(result).toBeDefined();
      expect(result!.numShares).toBe(10000000);
      expect(result!.numSharesSource).toBe('etfBy');
      expect(result!.marketCapRUB).toBe(1000000000); // 10M * 100
    });
    
    it('should fallback to asset API when etfBy fails', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TRUR',
            figi: 'BBG004S68614',
            uid: 'etf-trur-uid',
            numShares: undefined,
            assetUid: 'asset-trur-uid'
          }
        ]
      });
      
      // Mock etfBy to fail
      mockTinkoffSDK.instruments.etfBy.mockRejectedValue(new Error('Not found'));
      
      mockTinkoffSDK.instruments.getAssetBy.mockResolvedValue({
        asset: {
          security: {
            etf: {
              numShares: { units: 5000000, nano: 0 }
            }
          }
        }
      });
      
      const result = await getEtfMarketCapRUB('TRUR');
      
      expect(result).toBeDefined();
      expect(result!.numShares).toBe(5000000);
      expect(result!.numSharesSource).toBe('asset');
      expect(result!.marketCapRUB).toBe(500000000); // 5M * 100
    });
    
    it('should handle non-existent ETF', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      const result = await getEtfMarketCapRUB('NONEXISTENT');
      
      expect(result).toBeNull();
    });
    
    it('should handle ticker normalization', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      const result = await getEtfMarketCapRUB('TRAY'); // Should normalize to TPAY
      
      // The result should handle the normalization
      if (result) {
        expect(result.ticker).toBe('TRAY');
        expect(result.normalizedTicker).toBeDefined();
      }
    });
    
    it('should handle ETF with zero shares', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TRUR',
            figi: 'BBG004S68614',
            uid: 'etf-trur-uid',
            numShares: { units: 0, nano: 0 },
            assetUid: 'asset-trur-uid'
          }
        ]
      });
      
      const result = await getEtfMarketCapRUB('TRUR');
      
      expect(result).toBeDefined();
      expect(result!.numShares).toBe(0);
      expect(result!.marketCapRUB).toBe(0);
    });
    
    it('should handle ETF with extremely large number of shares', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TRUR',
            figi: 'BBG004S68614',
            uid: 'etf-trur-uid',
            numShares: { units: 1000000000, nano: 0 }, // 1 billion shares
            assetUid: 'asset-trur-uid'
          }
        ]
      });
      
      const result = await getEtfMarketCapRUB('TRUR');
      
      expect(result).toBeDefined();
      expect(result!.numShares).toBe(1000000000);
      expect(result!.marketCapRUB).toBe(100000000000); // 1B * 100
    });
  });

  describe('Share Market Capitalization Calculation', () => {
    it('should calculate market cap for standard share', async () => {
      // Import the function inside the test
      const { getShareMarketCapRUB } = await import('../../tools/etfCap');
      
      const result = await getShareMarketCapRUB('SBER');
      
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.type).toBe('SHARE');
      expect(result!.ticker).toBe('SBER');
      expect(result!.normalizedTicker).toBe('SBER');
      expect(result!.figi).toBe('BBG004730N88');
      expect(typeof result!.lastPriceRUB).toBe('number');
      expect(result!.numShares).toBe(21586948000);
      expect(typeof result!.marketCapRUB).toBe('number');
      expect(result!.marketCapRUB).toBeGreaterThan(0);
    });
    
    it('should handle share with missing issueSize from list', async () => {
      // Import the function inside the test
      const { getShareMarketCapRUB } = await import('../../tools/etfCap');
      
      mockTinkoffSDK.instruments.shares.mockResolvedValue({
        instruments: [
          {
            ticker: 'SBER',
            figi: 'BBG004730N88',
            uid: 'share-sber-uid',
            issueSize: undefined, // Missing issueSize
            assetUid: 'asset-sber-uid'
          }
        ]
      });
      
      mockTinkoffSDK.instruments.getAssetBy.mockResolvedValue({
        asset: {
          security: {
            share: {
              issueSize: { units: 20000000000, nano: 0 }
            }
          }
        }
      });
      
      const result = await getShareMarketCapRUB('SBER');
      
      expect(result).toBeDefined();
      expect(result!.numShares).toBe(20000000000);
    });
    
    it('should handle non-existent share', async () => {
      // Import the function inside the test
      const { getShareMarketCapRUB } = await import('../../tools/etfCap');
      
      const result = await getShareMarketCapRUB('NONEXISTENT');
      
      expect(result).toBeNull();
    });
    
    it('should handle share with zero issue size', async () => {
      // Import the function inside the test
      const { getShareMarketCapRUB } = await import('../../tools/etfCap');
      
      mockTinkoffSDK.instruments.shares.mockResolvedValue({
        instruments: [
          {
            ticker: 'SBER',
            figi: 'BBG004730N88',
            uid: 'share-sber-uid',
            issueSize: { units: 0, nano: 0 },
            assetUid: 'asset-sber-uid'
          }
        ]
      });
      
      const result = await getShareMarketCapRUB('SBER');
      
      expect(result).toBeDefined();
      expect(result!.numShares).toBe(0);
      expect(result!.marketCapRUB).toBe(0);
    });
  });

  describe('Market Cap Calculation Edge Cases', () => {
    it('should handle ETF with special characters in ticker', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
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
    
    it('should handle ETF with extremely high price', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TRUR',
            figi: 'BBG004S68614',
            uid: 'etf-trur-uid',
            numShares: { units: 1000000, nano: 0 },
            assetUid: 'asset-trur-uid'
          }
        ]
      });
      
      mockTinkoffSDK.marketData.getLastPrices.mockResolvedValue({
        lastPrices: [
          {
            figi: 'BBG004S68614',
            price: { units: 10000, nano: 0 } // 10,000 RUB per share
          }
        ]
      });
      
      const result = await getEtfMarketCapRUB('TRUR');
      
      expect(result).toBeDefined();
      expect(result!.lastPriceRUB).toBe(10000);
      expect(result!.marketCapRUB).toBe(10000000000); // 1M * 10,000
    });
    
    it('should handle ETF with fractional shares', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TRUR',
            figi: 'BBG004S68614',
            uid: 'etf-trur-uid',
            numShares: { units: 15000000, nano: 500000000 }, // 15,000,000.5 shares
            assetUid: 'asset-trur-uid'
          }
        ]
      });
      
      const result = await getEtfMarketCapRUB('TRUR');
      
      expect(result).toBeDefined();
      // The numShares should be properly converted from TinkoffNumber format
      expect(result!.numShares).toBe(15000000.5);
      expect(result!.marketCapRUB).toBe(1500000050); // 15,000,000.5 * 100
    });
  });

  describe('API Error Handling for Market Cap Calculation', () => {
    it('should handle unauthorized access errors', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock the etfs method to reject with an unauthorized error
      mockTinkoffSDK.instruments.etfs.mockRejectedValue(new Error('UNAUTHENTICATED: Network error'));
      
      const result = await getEtfMarketCapRUB('TRUR');
      expect(result).toBeNull();
    });
    
    it('should handle rate limiting errors', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock the etfs method to reject with a rate limit error
      mockTinkoffSDK.instruments.etfs.mockRejectedValue(new Error('RESOURCE_EXHAUSTED: Rate limit exceeded'));
      
      const result = await getEtfMarketCapRUB('TRUR');
      expect(result).toBeNull();
    });
    
    it('should handle network timeout errors', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock the etfs method to reject with a timeout error
      mockTinkoffSDK.instruments.etfs.mockRejectedValue(new Error('DEADLINE_EXCEEDED: Request timed out'));
      
      const result = await getEtfMarketCapRUB('TRUR');
      expect(result).toBeNull();
    });
    
    it('should handle malformed API responses', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        // Missing instruments field
        invalidResponse: true
      });
      
      const result = await getEtfMarketCapRUB('TRUR');
      expect(result).toBeNull();
    });
    
    it('should handle empty environment variables', async () => {
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

  describe('Performance Tests for Market Cap Calculation', () => {
    it('should handle multiple concurrent ETF requests', async () => {
      // Import the functions inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
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
    
    it('should handle mixed ETF and share requests', async () => {
      // Import the functions inside the test
      const { getEtfMarketCapRUB, getShareMarketCapRUB } = await import('../../tools/etfCap');
      
      const promises = [
        getEtfMarketCapRUB('TRUR'),
        getShareMarketCapRUB('SBER')
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(2);
      expect(results[0]).toBeDefined();
      expect(results[1]).toBeDefined();
      
      if (results[0] && results[1]) {
        expect(results[0].type).toBe('ETF');
        expect(results[1].type).toBe('SHARE');
        expect(results[0].marketCapRUB).toBeGreaterThan(0);
        expect(results[1].marketCapRUB).toBeGreaterThan(0);
      }
    });
    
    it('should complete market cap calculation within reasonable time', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      const startTime = performance.now();
      await getEtfMarketCapRUB('TRUR');
      const elapsed = performance.now() - startTime;
      
      // Should complete within 5 seconds
      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe('Integration Tests for Market Cap Calculation', () => {
    it('should handle complete workflow with valid data', async () => {
      // Import the functions inside the test
      const { getEtfMarketCapRUB, getShareMarketCapRUB } = await import('../../tools/etfCap');
      
      // Test the complete workflow: fetch ETF data + share data
      const etfResult = await getEtfMarketCapRUB('TRUR');
      const shareResult = await getShareMarketCapRUB('SBER');
      
      expect(etfResult).toBeDefined();
      expect(shareResult).toBeDefined();
      
      if (etfResult && shareResult) {
        expect(etfResult.type).toBe('ETF');
        expect(shareResult.type).toBe('SHARE');
        expect(etfResult.marketCapRUB).toBeGreaterThan(0);
        expect(shareResult.marketCapRUB).toBeGreaterThan(0);
      }
    });
    
    it('should handle workflow with missing data sources', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock all data sources to fail
      mockTinkoffSDK.instruments.etfs.mockRejectedValue(new Error('API Error'));
      mockTinkoffSDK.instruments.etfBy.mockRejectedValue(new Error('API Error'));
      mockTinkoffSDK.instruments.getAssetBy.mockRejectedValue(new Error('API Error'));
      
      const result = await getEtfMarketCapRUB('TRUR');
      expect(result).toBeNull();
    });
    
    it('should handle workflow with partial data sources', async () => {
      // Import the function inside the test
      const { getEtfMarketCapRUB } = await import('../../tools/etfCap');
      
      // Mock primary source to fail but secondary to succeed
      mockTinkoffSDK.instruments.etfs.mockResolvedValue({
        instruments: [
          {
            ticker: 'TRUR',
            figi: 'BBG004S68614',
            uid: 'etf-trur-uid',
            numShares: undefined, // Missing numShares
            assetUid: 'asset-trur-uid'
          }
        ]
      });
      
      mockTinkoffSDK.instruments.etfBy.mockRejectedValue(new Error('Not found'));
      
      mockTinkoffSDK.instruments.getAssetBy.mockResolvedValue({
        asset: {
          security: {
            etf: {
              numShares: { units: 5000000, nano: 0 }
            }
          }
        }
      });
      
      const result = await getEtfMarketCapRUB('TRUR');
      
      expect(result).toBeDefined();
      expect(result!.numShares).toBe(5000000);
      expect(result!.numSharesSource).toBe('asset');
    });
  });
});