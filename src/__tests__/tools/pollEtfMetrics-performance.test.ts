import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import path from 'path';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  mockFs,
  mockPath,
  mockRp,
  mockConfigLoader
} from './pollEtfMetrics-test-setup';

// Import test utilities
import {
  TestEnvironment,
  FinancialAssertions,
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { mockControls } from '../__mocks__/external-deps';

testSuite('PollEtfMetrics Aggregation Performance Tests', () => {
  let testWorkspace: string;

  beforeEach(() => {
    testWorkspace = setupTestEnvironment();
    // Setup specific test mocks
    mockControls.resetAll();
  });

  afterEach(() => {
    teardownTestEnvironment();
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
          return '/tmp/test-workspace/etf_metrics';
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
      // Each symbol may make multiple API requests due to pagination
      expect(mockRp).toHaveBeenCalled();
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
      mockRp.mockImplementation(async (options: any) => {
        const url = typeof options === 'string' ? options : options.uri || options.url;

        if (url && url.includes(encodeURIComponent('Вечный портфель'))) {
          return JSON.stringify({
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
          });
        }
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
        desired_wallet: { TRUR: 100 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { enabled: false }
      });

      // Mock path functions
      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) {
          return '/tmp/test-workspace/etf_metrics';
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
});