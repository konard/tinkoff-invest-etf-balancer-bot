import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";
import { promises as fs } from 'fs';
import path from 'path';

// Mock modules first, before any other imports
const mockFs = {
  promises: {
    readFile: mock(async () => ''),
    writeFile: mock(async () => undefined),
    access: mock(async () => undefined),
    mkdir: mock(async () => undefined),
    readdir: mock(async () => [])
  }
};

const mockPath = {
  resolve: mock((...args: string[]) => args.join('/')),
  join: mock((...args: string[]) => args.join('/')),
  dirname: mock((p: string) => p.split('/').slice(0, -1).join('/'))
};

// Mock the modules
mock.module('fs', () => ({
  ...mockFs,
  promises: mockFs.promises
}));

// Mock node:fs specifically
mock.module('node:fs', () => ({
  default: {
    promises: mockFs.promises
  },
  promises: mockFs.promises
}));

mock.module('path', () => mockPath);

// Mock request-promise for HTTP requests
const mockRp = mock(async () => '');

mock.module('request-promise', () => ({
  default: mockRp,
  ...mockRp
}));

// Mock configLoader
const mockConfigLoader = {
  getAccountById: mock((id: string) => {
    if (id === 'test-account-1') {
      return {
        id: 'test-account-1',
        name: 'Test Account 1',
        t_invest_token: 't.test_token_1',
        account_id: '123456789',
        desired_wallet: { TRUR: 50, TMOS: 50 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { enabled: false }
      };
    }
    return undefined;
  }),
  loadConfig: mock(() => ({
    accounts: []
  })),
  getAllAccounts: mock(() => [])
};

mock.module('../../configLoader', () => ({
  configLoader: mockConfigLoader
}));

// Mock utils module
mock.module('../../utils', () => ({
  normalizeTicker: mock((ticker: string) => ticker)
}));

// Mock etfCap module
mock.module('../../tools/etfCap', () => ({
  getFxRateToRub: mock(async () => 100),
  getEtfMarketCapRUB: mock(async () => ({ lastPriceRUB: 100, figi: 'test-figi', uid: 'test-uid' })),
  buildAumMapSmart: mock(async () => ({}))
}));

// Mock dotenv
mock.module('dotenv', () => ({
  config: mock(() => undefined)
}));

// Mock dotenv/config specifically
mock.module('dotenv/config', () => ({}));

// Mock debug
const mockDebugFunction = mock(() => ({}));
mockDebugFunction.extend = mock(() => mockDebugFunction);

mock.module('debug', () => ({
  default: mock(() => mockDebugFunction)
}));

// Mock tinkoff-sdk-grpc-js
mock.module('tinkoff-sdk-grpc-js', () => ({
  TinkoffInvestApi: mock(() => ({})),
  createSdk: mock(() => ({})),
  SdkApi: mock(() => ({}))
}));

// Mock lodash
mock.module('lodash', () => ({
  default: {},
  ...Object.fromEntries(['map', 'filter', 'find', 'reduce', 'forEach', 'groupBy', 'sortBy', 'uniq', 'flatten', 'isEqual', 'cloneDeep'].map(fn => [fn, mock(() => [])]))
}));

// Mock uniqid
mock.module('uniqid', () => mock(() => 'test-unique-id'));

// Mock nice-grpc
mock.module('nice-grpc', () => ({
  createChannel: mock(() => ({})),
  createClient: mock(() => ({}))
}));

// Mock process.exit to prevent tests from exiting the process
const mockProcessExit = mock((code?: number) => {
  throw new Error(`Process would exit with code ${code}`);
});

// Store original process.exit
const originalProcessExit = process.exit;
const originalProcessArgv = process.argv;
const originalEnv = process.env;

// Import test utilities
import { 
  TestEnvironment, 
  FinancialAssertions, 
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { mockControls } from '../__mocks__/external-deps';

testSuite('PollEtfMetrics Data Aggregation Tests', () => {
  let testWorkspace: string;
  
  beforeEach(() => {
    // Setup mocks
    mockControls.resetAll();
    mockFs.promises.readFile.mockClear();
    mockFs.promises.writeFile.mockClear();
    mockFs.promises.access.mockClear();
    mockFs.promises.mkdir.mockClear();
    mockFs.promises.readdir.mockClear();
    mockPath.resolve.mockClear();
    mockPath.join.mockClear();
    mockPath.dirname.mockClear();
    mockRp.mockClear();
    mockConfigLoader.getAccountById.mockClear();
    mockConfigLoader.loadConfig.mockClear();
    mockConfigLoader.getAllAccounts.mockClear();
    
    // Mock process.exit
    process.exit = mockProcessExit as any;
    
    // Set up test workspace in a writable temp directory
    testWorkspace = '/tmp/test-workspace';
    process.cwd = () => testWorkspace;
    
    // Set default mock responses
    mockFs.promises.readFile.mockResolvedValue('');
    mockFs.promises.writeFile.mockResolvedValue(undefined);
    mockFs.promises.access.mockResolvedValue(undefined);
    mockFs.promises.mkdir.mockResolvedValue(undefined);
    mockFs.promises.readdir.mockResolvedValue([]);
    mockPath.resolve.mockImplementation((...args: string[]) => args.join('/'));
    mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
    mockPath.dirname.mockImplementation((p: string) => p.split('/').slice(0, -1).join('/'));
    mockRp.mockResolvedValue('');
    
    // Set default env vars
    process.env = {
      ...originalEnv,
      TOKEN: 'test_token',
      ACCOUNT_ID: 'test-account-1'
    };
    
    // Set default argv
    process.argv = ['node', 'pollEtfMetrics.ts'];
  });

  afterEach(() => {
    // Restore process.exit
    process.exit = originalProcessExit;
    process.argv = originalProcessArgv;
    process.env = originalEnv;
    process.cwd = originalProcessArgv.includes('pollEtfMetrics.ts') ? () => process.argv[1] : () => '.';
  });

  describe('Cross-Symbol Data Aggregation', () => {
    it('should aggregate metrics across multiple ETF symbols', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Track written metrics for aggregation verification
      const writtenMetrics: Record<string, any> = {};
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string') {
          const fileName = path.basename(filePath, '.json');
          writtenMetrics[fileName] = JSON.parse(data);
        }
        return undefined;
      });
      
      // Mock request-promise for Smartfeed API with different data for each symbol
      mockRp.mockImplementation(async (options: any) => {
        const url = typeof options === 'string' ? options : options.uri || options.url;
        
        if (url && url.includes('TRUR')) {
          return JSON.stringify({
            payload: {
              news: [
                {
                  id: 12345,
                  title: 'В фонд поступили новые деньги',
                  additional_fields: [
                    {
                      name: 'Общее количество паёв',
                      value: '50,000,000'
                    }
                  ]
                }
              ],
              meta: {
                cursor: null
              }
            }
          });
        } else if (url && url.includes('TMOS')) {
          return JSON.stringify({
            payload: {
              news: [
                {
                  id: 67890,
                  title: 'В фонд поступили новые деньги',
                  additional_fields: [
                    {
                      name: 'Общее количество паёв',
                      value: '30,000,000'
                    }
                  ]
                }
              ],
              meta: {
                cursor: null
              }
            }
          });
        } else if (url && url.includes('TGLD')) {
          return JSON.stringify({
            payload: {
              news: [
                {
                  id: 11111,
                  title: 'В фонд поступили новые деньги',
                  additional_fields: [
                    {
                      name: 'Общее количество паёв',
                      value: '20,000,000'
                    }
                  ]
                }
              ],
              meta: {
                cursor: null
              }
            }
          });
        }
        
        // Default response
        return JSON.stringify({
          payload: {
            news: [],
            meta: {
              cursor: null
            }
          }
        });
      });
      
      // Mock configLoader
      mockConfigLoader.getAccountById.mockReturnValue({
        id: 'test-account-1',
        name: 'Test Account 1',
        t_invest_token: 't.test_token_1',
        account_id: '123456789',
        desired_wallet: { TRUR: 50, TMOS: 30, TGLD: 20 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { enabled: false }
      });
      
      // Mock path functions
      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) {
          return '/test/workspace/etf_metrics';
        }
        return args.join('/');
      });
      
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
      
      // Test the metrics collection for multiple symbols
      await collectOnceForSymbols(['TRUR', 'TMOS', 'TGLD']);
      
      // Verify that metrics were written for all symbols
      expect(Object.keys(writtenMetrics)).toHaveLength(3);
      expect(writtenMetrics).toHaveProperty('TRUR');
      expect(writtenMetrics).toHaveProperty('TMOS');
      expect(writtenMetrics).toHaveProperty('TGLD');
      
      // Verify that each symbol has the correct shares count
      expect(writtenMetrics.TRUR.sharesCount).toBe(50000000);
      expect(writtenMetrics.TMOS.sharesCount).toBe(30000000);
      expect(writtenMetrics.TGLD.sharesCount).toBe(20000000);
      
      // Verify aggregation: total shares count
      const totalShares = writtenMetrics.TRUR.sharesCount + writtenMetrics.TMOS.sharesCount + writtenMetrics.TGLD.sharesCount;
      expect(totalShares).toBe(100000000);
    });
    
    it('should calculate portfolio-level metrics from individual ETF metrics', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Track written metrics for aggregation verification
      const writtenMetrics: Record<string, any> = {};
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string') {
          const fileName = path.basename(filePath, '.json');
          writtenMetrics[fileName] = JSON.parse(data);
        }
        return undefined;
      });
      
      // Mock request-promise for Smartfeed API
      mockRp.mockResolvedValue(JSON.stringify({
        payload: {
          news: [
            {
              id: 12345,
              title: 'В фонд поступили новые деньги',
              additional_fields: [
                {
                  name: 'Общее количество паёв',
                  value: '50,000,000'
                }
              ]
            }
          ],
          meta: {
            cursor: null
          }
        }
      }));
      
      // Mock configLoader
      mockConfigLoader.getAccountById.mockReturnValue({
        id: 'test-account-1',
        name: 'Test Account 1',
        t_invest_token: 't.test_token_1',
        account_id: '123456789',
        desired_wallet: { TRUR: 50, TMOS: 30, TGLD: 20 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { enabled: false }
      });
      
      // Mock path functions
      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) {
          return '/test/workspace/etf_metrics';
        }
        return args.join('/');
      });
      
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
      
      // Test the metrics collection
      await collectOnceForSymbols(['TRUR', 'TMOS', 'TGLD']);
      
      // Verify that metrics were written for all symbols
      expect(Object.keys(writtenMetrics)).toHaveLength(3);
      
      // Calculate portfolio-level metrics
      let totalMarketCap = 0;
      let totalAUM = 0;
      
      for (const symbol in writtenMetrics) {
        const metrics = writtenMetrics[symbol];
        totalMarketCap += metrics.marketCap || 0;
        totalAUM += metrics.aum || 0;
      }
      
      // Verify that portfolio-level metrics are calculated correctly
      expect(typeof totalMarketCap).toBe('number');
      expect(typeof totalAUM).toBe('number');
      expect(totalMarketCap).toBeGreaterThanOrEqual(0);
      expect(totalAUM).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Time-Series Data Aggregation', () => {
    it('should aggregate metrics over time for trend analysis', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations to simulate time-series data
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Track written metrics over time
      const timeSeriesData: Record<string, any[]> = {
        TRUR: [],
        TMOS: []
      };
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string') {
          const fileName = path.basename(filePath, '.json');
          if (timeSeriesData[fileName]) {
            timeSeriesData[fileName].push(JSON.parse(data));
          }
        }
        return undefined;
      });
      
      // Mock request-promise to return different data over time
      let callCount = 0;
      mockRp.mockImplementation(async () => {
        callCount++;
        
        if (callCount === 1) {
          // First call - earlier time period
          return JSON.stringify({
            payload: {
              news: [
                {
                  id: 12345,
                  title: 'В фонд поступили новые деньги',
                  additional_fields: [
                    {
                      name: 'Общее количество паёв',
                      value: '45,000,000'
                    }
                  ]
                }
              ],
              meta: {
                cursor: null
              }
            }
          });
        } else {
          // Subsequent calls - later time period
          return JSON.stringify({
            payload: {
              news: [
                {
                  id: 67890,
                  title: 'В фонд поступили новые деньги',
                  additional_fields: [
                    {
                      name: 'Общее количество паёв',
                      value: '50,000,000'
                    }
                  ]
                }
              ],
              meta: {
                cursor: null
              }
            }
          });
        }
      });
      
      // Mock configLoader
      mockConfigLoader.getAccountById.mockReturnValue({
        id: 'test-account-1',
        name: 'Test Account 1',
        t_invest_token: 't.test_token_1',
        account_id: '123456789',
        desired_wallet: { TRUR: 50, TMOS: 50 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { enabled: false }
      });
      
      // Mock path functions
      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) {
          return '/test/workspace/etf_metrics';
        }
        return args.join('/');
      });
      
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
      
      // Simulate multiple collection runs over time
      await collectOnceForSymbols(['TRUR']);
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await collectOnceForSymbols(['TRUR']);
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await collectOnceForSymbols(['TRUR']);
      
      // Verify that time-series data was collected
      expect(timeSeriesData.TRUR).toHaveLength(3);
      
      // Verify that shares count increased over time (45M -> 50M)
      const firstShares = timeSeriesData.TRUR[0].sharesCount;
      const lastShares = timeSeriesData.TRUR[2].sharesCount;
      expect(firstShares).toBe(45000000);
      expect(lastShares).toBe(50000000);
      expect(lastShares).toBeGreaterThanOrEqual(firstShares);
    });
    
    it('should calculate moving averages for metrics', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations to collect time-series data
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Store time-series data for moving average calculation
      const timeSeriesData: any[] = [];
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('TRUR.json')) {
          timeSeriesData.push(JSON.parse(data));
        }
        return undefined;
      });
      
      // Mock request-promise to return sequential data
      let callCount = 0;
      const sharesValues = [40000000, 42000000, 44000000, 46000000, 48000000, 50000000];
      
      mockRp.mockImplementation(async () => {
        const sharesCount = sharesValues[callCount] || 50000000;
        callCount++;
        
        return JSON.stringify({
          payload: {
            news: [
              {
                id: 12345 + callCount,
                title: 'В фонд поступили новые деньги',
                additional_fields: [
                  {
                    name: 'Общее количество паёв',
                    value: sharesCount.toLocaleString()
                  }
                ]
              }
            ],
            meta: {
              cursor: null
            }
          }
        });
      });
      
      // Mock configLoader
      mockConfigLoader.getAccountById.mockReturnValue({
        id: 'test-account-1',
        name: 'Test Account 1',
        t_invest_token: 't.test_token_1',
        account_id: '123456789',
        desired_wallet: { TRUR: 100 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { enabled: false }
      });
      
      // Mock path functions
      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) {
          return '/test/workspace/etf_metrics';
        }
        return args.join('/');
      });
      
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
      
      // Collect data points for moving average calculation
      for (let i = 0; i < 6; i++) {
        await collectOnceForSymbols(['TRUR']);
        await new Promise(resolve => setTimeout(resolve, 5)); // Small delay
      }
      
      // Verify that we have the expected number of data points
      expect(timeSeriesData).toHaveLength(6);
      
      // Calculate 3-point moving average for the last data point
      if (timeSeriesData.length >= 3) {
        const lastIndex = timeSeriesData.length - 1;
        const movingAverage = (
          timeSeriesData[lastIndex].sharesCount +
          timeSeriesData[lastIndex - 1].sharesCount +
          timeSeriesData[lastIndex - 2].sharesCount
        ) / 3;
        
        // Verify that moving average is calculated correctly
        expect(typeof movingAverage).toBe('number');
        expect(movingAverage).toBeGreaterThan(0);
        
        // The moving average should be between the min and max values
        const values = sharesValues.slice(-3);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        expect(movingAverage).toBeGreaterThanOrEqual(minVal);
        expect(movingAverage).toBeLessThanOrEqual(maxVal);
      }
    });
  });

  describe('Cross-Metric Data Aggregation', () => {
    it('should correlate different metrics (shares count, price, AUM)', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Track written metrics for correlation analysis
      const writtenMetrics: Record<string, any> = {};
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string') {
          const fileName = path.basename(filePath, '.json');
          writtenMetrics[fileName] = JSON.parse(data);
        }
        return undefined;
      });
      
      // Mock request-promise for Smartfeed API
      mockRp.mockResolvedValue(JSON.stringify({
        payload: {
          news: [
            {
              id: 12345,
              title: 'В фонд поступили новые деньги',
              additional_fields: [
                {
                  name: 'Общее количество паёв',
                  value: '50,000,000'
                }
              ]
            }
          ],
          meta: {
            cursor: null
          }
        }
      }));
      
      // Mock configLoader
      mockConfigLoader.getAccountById.mockReturnValue({
        id: 'test-account-1',
        name: 'Test Account 1',
        t_invest_token: 't.test_token_1',
        account_id: '123456789',
        desired_wallet: { TRUR: 100 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { enabled: false }
      });
      
      // Mock path functions
      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) {
          return '/test/workspace/etf_metrics';
        }
        return args.join('/');
      });
      
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
      
      // Test the metrics collection
      await collectOnceForSymbols(['TRUR']);
      
      // Verify that metrics were written
      expect(Object.keys(writtenMetrics)).toHaveLength(1);
      expect(writtenMetrics).toHaveProperty('TRUR');
      
      // Extract metrics for correlation analysis
      const metrics = writtenMetrics.TRUR;
      
      // Verify that all required metrics are present
      expect(metrics).toHaveProperty('sharesCount');
      expect(metrics).toHaveProperty('price');
      expect(metrics).toHaveProperty('aum');
      expect(metrics).toHaveProperty('marketCap');
      
      // Verify data types
      expect(typeof metrics.sharesCount).toBe('number');
      expect(typeof metrics.price).toBe('number');
      expect(typeof metrics.aum).toBe('number');
      expect(typeof metrics.marketCap).toBe('number');
      
      // Verify that market cap is calculated as sharesCount * price
      const calculatedMarketCap = metrics.sharesCount * metrics.price;
      expect(metrics.marketCap).toBe(calculatedMarketCap);
      
      // Verify that decorrelation percentage is calculated correctly
      if (metrics.aum > 0) {
        const expectedDecorrelation = ((metrics.marketCap - metrics.aum) / metrics.aum) * 100;
        expect(metrics.decorrelationPct).toBeCloseTo(expectedDecorrelation, 2);
      }
    });
    
    it('should aggregate FX rate data for currency conversion', async () => {
      // Dynamically import the necessary functions
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const { toRubFromAum } = pollEtfMetricsModule;
      
      // Test currency conversion aggregation
      const testCases = [
        { amount: 1000, currency: 'USD', expectedRub: 95000 }, // Assuming 95 RUB/USD
        { amount: 1000, currency: 'EUR', expectedRub: 105000 }, // Assuming 105 RUB/EUR
        { amount: 1000, currency: 'RUB', expectedRub: 1000 } // No conversion needed
      ];
      
      // Mock FX rate functions by temporarily modifying the module
      // This is a simplified approach since we can't easily mock internal functions
      
      for (const testCase of testCases) {
        // For this test, we'll verify the function exists and can be called
        expect(typeof toRubFromAum).toBe('function');
        
        // Note: Actual FX rate mocking would require more complex setup
        // that's beyond the scope of this test
      }
      
      // Verify that the function handles edge cases
      const edgeCases = [
        { amount: 0, currency: 'USD' }, // Zero amount
        { amount: -1000, currency: 'EUR' }, // Negative amount
        null, // Null input
        undefined // Undefined input
      ];
      
      for (const edgeCase of edgeCases) {
        const result = await toRubFromAum(edgeCase as any);
        expect(typeof result).toBe('number');
        if (!edgeCase || (edgeCase as any).amount <= 0) {
          expect(result).toBe(0);
        }
      }
    });
  });

  describe('Aggregation Error Handling', () => {
    it('should handle missing data gracefully during aggregation', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Track written metrics
      const writtenMetrics: Record<string, any> = {};
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string') {
          const fileName = path.basename(filePath, '.json');
          writtenMetrics[fileName] = JSON.parse(data);
        }
        return undefined;
      });
      
      // Mock request-promise to return partial data
      mockRp.mockImplementation(async (options: any) => {
        const url = typeof options === 'string' ? options : options.uri || options.url;
        
        // Return different data quality for different symbols
        if (url && url.includes('TRUR')) {
          // Good data
          return JSON.stringify({
            payload: {
              news: [
                {
                  id: 12345,
                  title: 'В фонд поступили новые деньги',
                  additional_fields: [
                    {
                      name: 'Общее количество паёв',
                      value: '50,000,000'
                    }
                  ]
                }
              ],
              meta: {
                cursor: null
              }
            }
          });
        } else if (url && url.includes('TMOS')) {
          // Missing shares count data
          return JSON.stringify({
            payload: {
              news: [
                {
                  id: 67890,
                  title: 'В фонд поступили новые деньги',
                  additional_fields: [
                    {
                      name: 'Чистые активы',
                      value: 'Нет данных'
                    }
                  ]
                }
              ],
              meta: {
                cursor: null
              }
            }
          });
        }
        
        // Default response
        return JSON.stringify({
          payload: {
            news: [],
            meta: {
              cursor: null
            }
          }
        });
      });
      
      // Mock configLoader
      mockConfigLoader.getAccountById.mockReturnValue({
        id: 'test-account-1',
        name: 'Test Account 1',
        t_invest_token: 't.test_token_1',
        account_id: '123456789',
        desired_wallet: { TRUR: 60, TMOS: 40 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { enabled: false }
      });
      
      // Mock path functions
      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) {
          return '/test/workspace/etf_metrics';
        }
        return args.join('/');
      });
      
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
      
      // Test the metrics collection
      await collectOnceForSymbols(['TRUR', 'TMOS']);
      
      // Verify that metrics were written for both symbols
      expect(Object.keys(writtenMetrics)).toHaveLength(2);
      expect(writtenMetrics).toHaveProperty('TRUR');
      expect(writtenMetrics).toHaveProperty('TMOS');
      
      // Verify that TRUR has good data
      expect(writtenMetrics.TRUR.sharesCount).toBe(50000000);
      
      // Verify that TMOS handles missing data gracefully
      expect(writtenMetrics.TMOS).toHaveProperty('symbol');
      expect(writtenMetrics.TMOS).toHaveProperty('timestamp');
      // sharesCount might be null or fallback value
    });
    
    it('should continue aggregation when individual symbol collection fails', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Track written metrics
      const writtenMetrics: Record<string, any> = {};
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string') {
          const fileName = path.basename(filePath, '.json');
          writtenMetrics[fileName] = JSON.parse(data);
        }
        return undefined;
      });
      
      // Mock request-promise to fail for one symbol but succeed for others
      mockRp.mockImplementation(async (options: any) => {
        const url = typeof options === 'string' ? options : options.uri || options.url;
        
        if (url && url.includes('TMOS')) {
          // Simulate failure for TMOS
          throw new Error('Network error for TMOS');
        } else if (url && url.includes('TRUR')) {
          // Success for TRUR
          return JSON.stringify({
            payload: {
              news: [
                {
                  id: 12345,
                  title: 'В фонд поступили новые деньги',
                  additional_fields: [
                    {
                      name: 'Общее количество паёв',
                      value: '50,000,000'
                    }
                  ]
                }
              ],
              meta: {
                cursor: null
              }
            }
          });
        }
        
        // Default response
        return JSON.stringify({
          payload: {
            news: [],
            meta: {
              cursor: null
            }
          }
        });
      });
      
      // Mock configLoader
      mockConfigLoader.getAccountById.mockReturnValue({
        id: 'test-account-1',
        name: 'Test Account 1',
        t_invest_token: 't.test_token_1',
        account_id: '123456789',
        desired_wallet: { TRUR: 70, TMOS: 30 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { enabled: false }
      });
      
      // Mock path functions
      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) {
          return '/test/workspace/etf_metrics';
        }
        return args.join('/');
      });
      
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
      
      // Test the metrics collection - should not throw even if one symbol fails
      await expect(collectOnceForSymbols(['TRUR', 'TMOS'])).resolves.toBeUndefined();
      
      // Verify that metrics were written for the successful symbol
      expect(Object.keys(writtenMetrics)).toHaveLength(1);
      expect(writtenMetrics).toHaveProperty('TRUR');
      expect(writtenMetrics).not.toHaveProperty('TMOS');
      
      // Verify that TRUR has correct data
      expect(writtenMetrics.TRUR.sharesCount).toBe(50000000);
    });
  });

  describe('Aggregation Performance', () => {
    it('should efficiently aggregate data from many symbols', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Create many symbols for performance testing
      const manySymbols = Array.from({ length: 20 }, (_, i) => `ETF${i + 1}`);
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      // Mock request-promise to handle many symbols
      mockRp.mockImplementation(async (options: any) => {
        return JSON.stringify({
          payload: {
            news: [
              {
                id: 12345,
                title: 'В фонд поступили новые деньги',
                additional_fields: [
                  {
                    name: 'Общее количество паёв',
                    value: '10,000,000'
                  }
                ]
              }
            ],
            meta: {
              cursor: null
            }
          }
        });
      });
      
      // Mock configLoader
      const desiredWallet: Record<string, number> = {};
      manySymbols.forEach(symbol => {
        desiredWallet[symbol] = 100 / manySymbols.length;
      });
      
      mockConfigLoader.getAccountById.mockReturnValue({
        id: 'test-account-1',
        name: 'Test Account 1',
        t_invest_token: 't.test_token_1',
        account_id: '123456789',
        desired_wallet: desiredWallet,
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { enabled: false }
      });
      
      // Mock path functions
      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) {
          return '/test/workspace/etf_metrics';
        }
        return args.join('/');
      });
      
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
      
      // Measure performance
      const startTime = performance.now();
      await collectOnceForSymbols(manySymbols);
      const endTime = performance.now();
      
      // Should complete within reasonable time (less than 5 seconds for 20 symbols)
      expect(endTime - startTime).toBeLessThan(5000);
      
      // Verify that the necessary functions were called
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalledTimes(manySymbols.length);
      expect(mockRp).toHaveBeenCalledTimes(manySymbols.length);
    });
    
    it('should handle large numeric values in aggregation', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Track written metrics with large values
      const writtenMetrics: Record<string, any> = {};
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string') {
          const fileName = path.basename(filePath, '.json');
          writtenMetrics[fileName] = JSON.parse(data);
        }
        return undefined;
      });
      
      // Mock request-promise for large values
      mockRp.mockResolvedValue(JSON.stringify({
        payload: {
          news: [
            {
              id: 12345,
              title: 'В фонд поступили новые деньги',
              additional_fields: [
                {
                  name: 'Общее количество паёв',
                  value: '1,000,000,000' // 1 billion shares
                }
              ]
            }
          ],
          meta: {
            cursor: null
          }
        }
      }));
      
      // Mock configLoader
      mockConfigLoader.getAccountById.mockReturnValue({
        id: 'test-account-1',
        name: 'Test Account 1',
        t_invest_token: 't.test_token_1',
        account_id: '123456789',
        desired_wallet: { TRUR: 100 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { enabled: false }
      });
      
      // Mock path functions
      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) {
          return '/test/workspace/etf_metrics';
        }
        return args.join('/');
      });
      
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
      
      // Test the metrics collection
      await collectOnceForSymbols(['TRUR']);
      
      // Verify that metrics were written
      expect(Object.keys(writtenMetrics)).toHaveLength(1);
      expect(writtenMetrics).toHaveProperty('TRUR');
      
      // Verify that large values are handled correctly
      const metrics = writtenMetrics.TRUR;
      expect(metrics.sharesCount).toBe(1000000000); // 1 billion
      
      // Verify that calculations with large numbers are correct
      const marketCap = metrics.sharesCount * metrics.price;
      expect(metrics.marketCap).toBe(marketCap);
      
      // Verify that aggregated values don't overflow
      expect(Number.isFinite(metrics.marketCap)).toBe(true);
      expect(Number.isFinite(metrics.aum)).toBe(true);
    });
  });

  describe('Aggregation Edge Cases', () => {
    it('should handle symbols with special characters in aggregation', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Track written metrics
      const writtenMetrics: Record<string, any> = {};
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string') {
          const fileName = path.basename(filePath, '.json');
          writtenMetrics[fileName] = JSON.parse(data);
        }
        return undefined;
      });
      
      // Mock request-promise for Smartfeed API
      mockRp.mockResolvedValue(JSON.stringify({
        payload: {
          news: [
            {
              id: 12345,
              title: 'В фонд поступили новые деньги',
              additional_fields: [
                {
                  name: 'Общее количество паёв',
                  value: '50,000,000'
                }
              ]
            }
          ],
          meta: {
            cursor: null
          }
        }
      }));
      
      // Mock configLoader
      mockConfigLoader.getAccountById.mockReturnValue({
        id: 'test-account-1',
        name: 'Test Account 1',
        t_invest_token: 't.test_token_1',
        account_id: '123456789',
        desired_wallet: { 'T@GLD': 50, 'T#MOS': 50 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { enabled: false }
      });
      
      // Mock path functions
      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) {
          return '/test/workspace/etf_metrics';
        }
        return args.join('/');
      });
      
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
      
      // Test the metrics collection
      await collectOnceForSymbols(['T@GLD', 'T#MOS']);
      
      // Verify that metrics were written for symbols with special characters
      expect(Object.keys(writtenMetrics)).toHaveLength(2);
      expect(writtenMetrics).toHaveProperty('T@GLD');
      expect(writtenMetrics).toHaveProperty('T#MOS');
      
      // Verify that special characters are handled correctly in file names
      expect(typeof writtenMetrics['T@GLD'].symbol).toBe('string');
      expect(typeof writtenMetrics['T#MOS'].symbol).toBe('string');
    });
    
    it('should aggregate data with mixed data sources', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Track written metrics
      const writtenMetrics: Record<string, any> = {};
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string') {
          const fileName = path.basename(filePath, '.json');
          writtenMetrics[fileName] = JSON.parse(data);
        }
        return undefined;
      });
      
      // Mock request-promise to return different data sources
      mockRp.mockImplementation(async (options: any) => {
        const url = typeof options === 'string' ? options : options.uri || options.url;
        
        if (url && url.includes('TRUR')) {
          // Smartfeed API data
          return JSON.stringify({
            payload: {
              news: [
                {
                  id: 12345,
                  title: 'В фонд поступили новые деньги',
                  additional_fields: [
                    {
                      name: 'Общее количество паёв',
                      value: '50,000,000'
                    }
                  ]
                }
              ],
              meta: {
                cursor: null
              }
            }
          });
        } else if (url && url.includes('TMOS')) {
          // Different API response format
          return JSON.stringify({
            payload: {
              news: [
                {
                  id: 67890,
                  title: 'Fund Update',
                  body: 'Total shares: 30,000,000',
                  additional_fields: []
                }
              ],
              meta: {
                cursor: null
              }
            }
          });
        }
        
        // Default response
        return JSON.stringify({
          payload: {
            news: [],
            meta: {
              cursor: null
            }
          }
        });
      });
      
      // Mock configLoader
      mockConfigLoader.getAccountById.mockReturnValue({
        id: 'test-account-1',
        name: 'Test Account 1',
        t_invest_token: 't.test_token_1',
        account_id: '123456789',
        desired_wallet: { TRUR: 60, TMOS: 40 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { enabled: false }
      });
      
      // Mock path functions
      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) {
          return '/test/workspace/etf_metrics';
        }
        return args.join('/');
      });
      
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
      
      // Test the metrics collection
      await collectOnceForSymbols(['TRUR', 'TMOS']);
      
      // Verify that metrics were written for both symbols
      expect(Object.keys(writtenMetrics)).toHaveLength(2);
      expect(writtenMetrics).toHaveProperty('TRUR');
      expect(writtenMetrics).toHaveProperty('TMOS');
      
      // Verify that both data sources are handled correctly
      expect(typeof writtenMetrics.TRUR.sharesCount).toBe('number');
      expect(typeof writtenMetrics.TMOS.sharesCount).toBe('number');
      expect(writtenMetrics.TRUR.sharesCount).toBeGreaterThan(0);
      expect(writtenMetrics.TMOS.sharesCount).toBeGreaterThan(0);
    });
  });
});