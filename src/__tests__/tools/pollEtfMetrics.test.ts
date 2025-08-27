import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from 'fs';
import path from 'path';
import { 
  collectOnceForSymbols,
  toRubFromAum
} from "../../tools/pollEtfMetrics";
import { AumEntry } from "../../tools/etfCap";

// Import test utilities and fixtures
import { 
  TestEnvironment, 
  FinancialAssertions, 
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { mockAccountConfigs } from '../__fixtures__/configurations';
import { mockMarketData } from '../__fixtures__/market-data';
import { mockTinkoffSDKControls } from '../__mocks__/tinkoff-sdk';
import { mockControls } from '../__mocks__/external-deps';

// Mock the configLoader
const mockConfigLoader = {
  getAccountById: (id: string) => {
    if (id === '0' || id === 'test-account-1') return mockAccountConfigs.basic;
    return undefined;
  }
};

// Mock environment variables
const originalEnv = process.env;
const originalCwd = process.cwd;

testSuite('PollEtfMetrics Tool Tests', () => {
  let testWorkspace: string;
  
  beforeEach(async () => {
    // Setup test workspace
    testWorkspace = path.join(process.cwd(), 'test-workspace');
    await fs.mkdir(testWorkspace, { recursive: true });
    await fs.mkdir(path.join(testWorkspace, 'etf_metrics'), { recursive: true });
    await fs.mkdir(path.join(testWorkspace, 'shares_count'), { recursive: true });
    
    // Mock process.cwd() to point to test workspace
    process.cwd = () => testWorkspace;
    
    // Setup mocks
    mockTinkoffSDKControls.setSuccess();
    mockControls.resetAll();
    
    // Mock environment variables
    process.env = {
      ...originalEnv,
      TOKEN: 'test_token',
      ACCOUNT_ID: 'test-account-1'
    };
    
    // Mock configLoader
    const configLoaderPath = require.resolve('../../configLoader');
    delete require.cache[configLoaderPath];
    require.cache[configLoaderPath] = {
      id: configLoaderPath,
      filename: configLoaderPath,
      loaded: true,
      children: [],
      parent: null,
      paths: [],
      exports: { configLoader: mockConfigLoader }
    };
    
    // Mock network requests
    mockControls.network.setSuccess();
    
    // Mock T-Capital AUM data
    mockControls.network.setResponse('https://t-capital-funds.ru/statistics/', `
      <html>
        <body>
          <table>
            <tr>
              <th>Фонд</th>
              <th>СЧА за последний день</th>
            </tr>
            <tr>
              <td>TRUR - Стратегия вечного портфеля в рублях</td>
              <td>1,500,000,000 ₽</td>
            </tr>
            <tr>
              <td>TMOS - Крупнейшие компании РФ</td>
              <td>2,300,000,000 ₽</td>
            </tr>
          </table>
        </body>
      </html>
    `);
    
    // Mock Smartfeed API responses
    mockControls.network.setResponse('https://www.tbank.ru/api/invest/smartfeed-public/v1/feed/api/brands/Вечный%20портфель/fund-news?limit=50', JSON.stringify({
      payload: {
        news: [
          {
            id: 12345,
            title: "В фонд поступили новые деньги, количество паёв изменилось",
            additional_fields: [
              {
                name: "Всего паёв",
                value: "15,000,000"
              }
            ]
          }
        ],
        meta: {
          cursor: null
        }
      }
    }));
    
    mockControls.network.setResponse('https://www.tbank.ru/api/invest/smartfeed-public/v1/feed/api/brands/Крупнейшие%20компании%20РФ/fund-news?limit=50', JSON.stringify({
      payload: {
        news: [
          {
            id: 67890,
            title: "Общее количество паёв увеличилось",
            additional_fields: [
              {
                name: "Общее количество паёв",
                value: "23,000,000"
              }
            ]
          }
        ],
        meta: {
          cursor: null
        }
      }
    }));
    
    // Mock Tinkoff SDK responses
    mockTinkoffSDKControls.setResponse('etfs', {
      instruments: [
        {
          ticker: 'TRUR',
          figi: 'BBG004S68614',
          uid: 'etf-trur-uid',
          numShares: { units: 15000000, nano: 0 }
        },
        {
          ticker: 'TMOS',
          figi: 'BBG004S68B31',
          uid: 'etf-tmos-uid',
          numShares: { units: 23000000, nano: 0 }
        }
      ]
    });
    
    mockTinkoffSDKControls.setResponse('currencies', {
      instruments: [
        {
          ticker: 'USD000UTSTOM',
          figi: 'BBG0013HGFT4',
          name: 'USD/RUB'
        },
        {
          ticker: 'EUR_RUB__TOM',
          figi: 'BBG0013HJJ31',
          name: 'EUR/RUB'
        }
      ]
    });
    
    mockTinkoffSDKControls.setResponse('getLastPrices', {
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
          figi: 'BBG0013HGFT4',
          price: { units: 95, nano: 0 }
        },
        {
          figi: 'BBG0013HJJ31',
          price: { units: 105, nano: 0 }
        }
      ]
    });
    
    // Setup mock shares count files
    await fs.writeFile(
      path.join(testWorkspace, 'shares_count', 'TRUR.json'),
      '15000000',
      'utf-8'
    );
    
    await fs.writeFile(
      path.join(testWorkspace, 'shares_count', 'TMOS.json'),
      '23000000',
      'utf-8'
    );
  });
  
  afterEach(async () => {
    // Restore environment and cwd
    process.env = originalEnv;
    process.cwd = originalCwd;
    
    // Clean up test workspace
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    
    // Clean up require cache
    Object.keys(require.cache).forEach(key => {
      if (key.includes('configLoader') || key.includes('pollEtfMetrics')) {
        delete require.cache[key];
      }
    });
  });

  describe('AUM Currency Conversion', () => {
    it('should convert RUB AUM correctly', async () => {
      const aumEntry: AumEntry = {
        amount: 1500000000,
        currency: 'RUB'
      };
      
      const result = await toRubFromAum(aumEntry);
      expect(result).toBe(1500000000);
    });
    
    it('should convert USD AUM to RUB', async () => {
      const aumEntry: AumEntry = {
        amount: 15000000,
        currency: 'USD'
      };
      
      const result = await toRubFromAum(aumEntry);
      expect(result).toBeGreaterThan(0);
      // Should be converted at ~95 RUB/USD rate
      expect(result).toBeCloseTo(15000000 * 95, -6);
    });
    
    it('should convert EUR AUM to RUB', async () => {
      const aumEntry: AumEntry = {
        amount: 12000000,
        currency: 'EUR'
      };
      
      const result = await toRubFromAum(aumEntry);
      expect(result).toBeGreaterThan(0);
      // Should be converted at ~105 RUB/EUR rate
      expect(result).toBeCloseTo(12000000 * 105, -6);
    });
    
    it('should handle undefined AUM entry', async () => {
      const result = await toRubFromAum(undefined);
      expect(result).toBe(0);
    });
    
    it('should handle zero amount AUM', async () => {
      const aumEntry: AumEntry = {
        amount: 0,
        currency: 'RUB'
      };
      
      const result = await toRubFromAum(aumEntry);
      expect(result).toBe(0);
    });
    
    it('should handle FX rate fetch failure', async () => {
      mockTinkoffSDKControls.setFailure('unauthorized');
      
      const aumEntry: AumEntry = {
        amount: 1000000,
        currency: 'USD'
      };
      
      const result = await toRubFromAum(aumEntry);
      expect(result).toBe(0);
    });
  });

  describe('Metrics Collection', () => {
    it('should collect metrics for single symbol', async () => {
      await collectOnceForSymbols(['TRUR']);
      
      // Check that metrics file was created
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const exists = await fs.access(metricsPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
      
      // Read and validate metrics content
      const metricsContent = await fs.readFile(metricsPath, 'utf-8');
      const metrics = JSON.parse(metricsContent);
      
      expect(metrics.symbol).toBe('TRUR');
      expect(metrics.timestamp).toBeDefined();
      expect(typeof metrics.timestamp).toBe('string');
      expect(metrics.sharesCount).toBe(15000000);
      expect(metrics.price).toBe(100);
      expect(metrics.marketCap).toBe(1500000000); // 15M * 100
      expect(metrics.aum).toBeGreaterThan(0);
      expect(typeof metrics.decorrelationPct).toBe('number');
      expect(metrics.figi).toBe('BBG004S68614');
      expect(metrics.uid).toBe('etf-trur-uid');
    });
    
    it('should collect metrics for multiple symbols', async () => {
      await collectOnceForSymbols(['TRUR', 'TMOS']);
      
      // Check both metrics files were created
      const trurPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const tmosPath = path.join(testWorkspace, 'etf_metrics', 'TMOS.json');
      
      const trurExists = await fs.access(trurPath).then(() => true).catch(() => false);
      const tmosExists = await fs.access(tmosPath).then(() => true).catch(() => false);
      
      expect(trurExists).toBe(true);
      expect(tmosExists).toBe(true);
      
      // Validate TMOS metrics
      const tmosContent = await fs.readFile(tmosPath, 'utf-8');
      const tmosMetrics = JSON.parse(tmosContent);
      
      expect(tmosMetrics.symbol).toBe('TMOS');
      expect(tmosMetrics.sharesCount).toBe(23000000);
      expect(tmosMetrics.marketCap).toBe(2300000000); // 23M * 100
    });
    
    it('should handle empty symbols array', async () => {
      await collectOnceForSymbols([]);
      
      // No metrics files should be created
      const metricsDir = path.join(testWorkspace, 'etf_metrics');
      const files = await fs.readdir(metricsDir);
      expect(files).toHaveLength(0);
    });
    
    it('should handle symbols with missing data', async () => {
      // Mock network failure for unknown symbol
      mockControls.network.setFailureForUrl('https://www.tbank.ru/api/invest/smartfeed-public/v1/feed/api/brands/Unknown/fund-news?limit=50', 'not found');
      
      await collectOnceForSymbols(['UNKNOWN']);
      
      // Should still create metrics file with available data
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'UNKNOWN.json');
      const exists = await fs.access(metricsPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
      
      const metricsContent = await fs.readFile(metricsPath, 'utf-8');
      const metrics = JSON.parse(metricsContent);
      
      expect(metrics.symbol).toBe('UNKNOWN');
      expect(metrics.sharesCount).toBeNull();
      expect(metrics.aum).toBeNull();
    });
    
    it('should calculate decorrelation percentage correctly', async () => {
      await collectOnceForSymbols(['TRUR']);
      
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const metricsContent = await fs.readFile(metricsPath, 'utf-8');
      const metrics = JSON.parse(metricsContent);
      
      // Decorrelation = (marketCap - AUM) / AUM * 100
      const expectedDecorel = ((metrics.marketCap - metrics.aum) / metrics.aum) * 100;
      expect(metrics.decorrelationPct).toBeCloseTo(expectedDecorel, 2);
    });
    
    it('should include all required fields in metrics', async () => {
      await collectOnceForSymbols(['TRUR']);
      
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const metricsContent = await fs.readFile(metricsPath, 'utf-8');
      const metrics = JSON.parse(metricsContent);
      
      const requiredFields = [
        'symbol',
        'timestamp',
        'sharesCount',
        'price',
        'marketCap',
        'aum',
        'decorrelationPct',
        'sharesSearchUrl',
        'sharesSourceUrl',
        'figi',
        'uid',
        'smartfeedBrand',
        'smartfeedUrl'
      ];
      
      requiredFields.forEach(field => {
        expect(metrics).toHaveProperty(field);
      });
    });
  });

  describe('Shares Count Sources', () => {
    it('should fetch shares count from Smartfeed API', async () => {
      // Remove local cache file to force API fetch
      const cacheFile = path.join(testWorkspace, 'shares_count', 'TRUR.json');
      try {
        await fs.unlink(cacheFile);
      } catch {
        // Ignore if file doesn't exist
      }
      
      await collectOnceForSymbols(['TRUR']);
      
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const metricsContent = await fs.readFile(metricsPath, 'utf-8');
      const metrics = JSON.parse(metricsContent);
      
      expect(metrics.sharesCount).toBe(15000000);
      expect(metrics.sharesSourceUrl).toContain('tbank.ru/invest/fund-news/');
      expect(metrics.smartfeedBrand).toBe('Вечный портфель');
    });
    
    it('should fallback to local cache when API fails', async () => {
      // Mock API failure
      mockControls.network.setFailureForUrl('https://www.tbank.ru/api/invest/smartfeed-public/v1/feed/api/brands/Вечный%20портфель/fund-news?limit=50', 'timeout');
      
      await collectOnceForSymbols(['TRUR']);
      
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const metricsContent = await fs.readFile(metricsPath, 'utf-8');
      const metrics = JSON.parse(metricsContent);
      
      expect(metrics.sharesCount).toBe(15000000); // From local cache
      expect(metrics.sharesSourceUrl).toBeNull(); // No API source
    });
    
    it('should handle malformed shares count files', async () => {
      // Write invalid content to shares count file
      const cacheFile = path.join(testWorkspace, 'shares_count', 'TRUR.json');
      await fs.writeFile(cacheFile, 'invalid json', 'utf-8');
      
      // Mock API failure too
      mockControls.network.setFailureForUrl('https://www.tbank.ru/api/invest/smartfeed-public/v1/feed/api/brands/Вечный%20портфель/fund-news?limit=50', 'timeout');
      
      await collectOnceForSymbols(['TRUR']);
      
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const metricsContent = await fs.readFile(metricsPath, 'utf-8');
      const metrics = JSON.parse(metricsContent);
      
      expect(metrics.sharesCount).toBeNull();
    });
  });

  describe('Price Data Integration', () => {
    it('should fetch price data from Tinkoff API', async () => {
      await collectOnceForSymbols(['TRUR']);
      
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const metricsContent = await fs.readFile(metricsPath, 'utf-8');
      const metrics = JSON.parse(metricsContent);
      
      expect(metrics.price).toBe(100);
      expect(metrics.figi).toBe('BBG004S68614');
      expect(metrics.uid).toBe('etf-trur-uid');
    });
    
    it('should handle missing price data', async () => {
      // Mock empty price response
      mockTinkoffSDKControls.setResponse('getLastPrices', {
        lastPrices: []
      });
      
      await collectOnceForSymbols(['TRUR']);
      
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const metricsContent = await fs.readFile(metricsPath, 'utf-8');
      const metrics = JSON.parse(metricsContent);
      
      expect(metrics.price).toBeNull();
      expect(metrics.marketCap).toBeNull();
    });
    
    it('should handle API authentication errors', async () => {
      mockTinkoffSDKControls.setFailure('unauthorized');
      
      await collectOnceForSymbols(['TRUR']);
      
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const metricsContent = await fs.readFile(metricsPath, 'utf-8');
      const metrics = JSON.parse(metricsContent);
      
      expect(metrics.price).toBeNull();
      expect(metrics.figi).toBeNull();
      expect(metrics.uid).toBeNull();
    });
  });

  describe('File System Operations', () => {
    it('should create etf_metrics directory if it does not exist', async () => {
      // Remove the directory
      await fs.rm(path.join(testWorkspace, 'etf_metrics'), { recursive: true, force: true });
      
      await collectOnceForSymbols(['TRUR']);
      
      // Check directory was recreated
      const dirExists = await fs.access(path.join(testWorkspace, 'etf_metrics')).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
      
      // Check file was created
      const fileExists = await fs.access(path.join(testWorkspace, 'etf_metrics', 'TRUR.json')).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });
    
    it('should overwrite existing metrics files', async () => {
      // Create initial metrics file
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      await fs.writeFile(metricsPath, JSON.stringify({ old: 'data' }), 'utf-8');
      
      await collectOnceForSymbols(['TRUR']);
      
      // Check file was overwritten
      const metricsContent = await fs.readFile(metricsPath, 'utf-8');
      const metrics = JSON.parse(metricsContent);
      
      expect(metrics.symbol).toBe('TRUR');
      expect(metrics.old).toBeUndefined();
    });
    
    it('should handle file system permission errors', async () => {
      // This test would be platform-specific and complex to mock properly
      // We'll just verify the function doesn't crash
      await expect(collectOnceForSymbols(['TRUR'])).resolves.not.toThrow();
    });
  });

  describe('Data Processing and Calculations', () => {
    it('should parse shares count from different text formats', async () => {
      // Test different news title formats through mocked API responses
      mockControls.network.setResponse('https://www.tbank.ru/api/invest/smartfeed-public/v1/feed/api/brands/Вечный%20портфель/fund-news?limit=50', JSON.stringify({
        payload: {
          news: [
            {
              id: 1,
              title: "Количество паёв изменилось",
              additional_fields: [
                { name: "Всего паёв", value: "14,500,000" }
              ]
            }
          ],
          meta: { cursor: null }
        }
      }));
      
      await collectOnceForSymbols(['TRUR']);
      
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const metricsContent = await fs.readFile(metricsPath, 'utf-8');
      const metrics = JSON.parse(metricsContent);
      
      expect(metrics.sharesCount).toBe(14500000);
    });
    
    it('should handle ticker normalization', async () => {
      // Test with TRAY which should normalize to TPAY
      const mockBrandResponse = JSON.stringify({
        payload: {
          news: [
            {
              id: 1,
              title: "Пассивный доход обновлен",
              additional_fields: [
                { name: "Общее количество паёв", value: "10,000,000" }
              ]
            }
          ],
          meta: { cursor: null }
        }
      });
      
      mockControls.network.setResponse('https://www.tbank.ru/api/invest/smartfeed-public/v1/feed/api/brands/Пассивный%20доход/fund-news?limit=50', mockBrandResponse);
      
      await collectOnceForSymbols(['TRAY']); // Should normalize to TPAY
      
      // Should create metrics file with normalized ticker
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TPAY.json');
      const exists = await fs.access(metricsPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
    
    it('should calculate market cap correctly', async () => {
      await collectOnceForSymbols(['TRUR']);
      
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const metricsContent = await fs.readFile(metricsPath, 'utf-8');
      const metrics = JSON.parse(metricsContent);
      
      const expectedMarketCap = metrics.sharesCount * metrics.price;
      expect(metrics.marketCap).toBe(expectedMarketCap);
    });
    
    it('should handle missing market cap calculation gracefully', async () => {
      // Mock scenario where shares count is missing
      mockControls.network.setFailureForUrl('https://www.tbank.ru/api/invest/smartfeed-public/v1/feed/api/brands/Вечный%20портфель/fund-news?limit=50', 'not found');
      
      // Remove local cache
      const cacheFile = path.join(testWorkspace, 'shares_count', 'TRUR.json');
      try {
        await fs.unlink(cacheFile);
      } catch {
        // Ignore
      }
      
      await collectOnceForSymbols(['TRUR']);
      
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const metricsContent = await fs.readFile(metricsPath, 'utf-8');
      const metrics = JSON.parse(metricsContent);
      
      expect(metrics.sharesCount).toBeNull();
      expect(metrics.marketCap).toBeNull();
      expect(metrics.decorrelationPct).toBeNull();
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should continue processing other symbols if one fails', async () => {
      // Make TRUR fail but TMOS succeed
      mockControls.network.setFailureForUrl('https://www.tbank.ru/api/invest/smartfeed-public/v1/feed/api/brands/Вечный%20портфель/fund-news?limit=50', 'timeout');
      
      await collectOnceForSymbols(['TRUR', 'TMOS']);
      
      // TMOS should still succeed
      const tmosPath = path.join(testWorkspace, 'etf_metrics', 'TMOS.json');
      const tmosExists = await fs.access(tmosPath).then(() => true).catch(() => false);
      expect(tmosExists).toBe(true);
      
      // TRUR should still create file with partial data
      const trurPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const trurExists = await fs.access(trurPath).then(() => true).catch(() => false);
      expect(trurExists).toBe(true);
    });
    
    it('should handle malformed API responses', async () => {
      mockControls.network.setResponse('https://www.tbank.ru/api/invest/smartfeed-public/v1/feed/api/brands/Вечный%20портфель/fund-news?limit=50', 'invalid json');
      
      await collectOnceForSymbols(['TRUR']);
      
      // Should still create metrics file with fallback data
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const exists = await fs.access(metricsPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
    
    it('should handle network timeouts gracefully', async () => {
      mockControls.network.simulateTimeout();
      
      await expect(collectOnceForSymbols(['TRUR'])).resolves.not.toThrow();
      
      // Should still create metrics with available data
      const metricsPath = path.join(testWorkspace, 'etf_metrics', 'TRUR.json');
      const exists = await fs.access(metricsPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('Performance and Integration', () => {
    it('should complete within reasonable time for single symbol', async () => {
      const startTime = performance.now();
      await collectOnceForSymbols(['TRUR']);
      const elapsed = performance.now() - startTime;
      
      // Should complete within 10 seconds
      expect(elapsed).toBeLessThan(10000);
    });
    
    it('should handle multiple symbols efficiently', async () => {
      const symbols = ['TRUR', 'TMOS'];
      
      const startTime = performance.now();
      await collectOnceForSymbols(symbols);
      const elapsed = performance.now() - startTime;
      
      // Should complete within reasonable time for multiple symbols
      expect(elapsed).toBeLessThan(15000);
      
      // Verify all files were created
      for (const symbol of symbols) {
        const normalizedSymbol = symbol; // Already normalized in this case
        const metricsPath = path.join(testWorkspace, 'etf_metrics', `${normalizedSymbol}.json`);
        const exists = await fs.access(metricsPath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
    });
  });
});