import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import path from 'path';
import {
  setupHistoricalTestEnvironment,
  teardownHistoricalTestEnvironment,
  mockFs,
  mockPath,
  mockRp,
  mockConfigLoader
} from './pollEtfMetrics-historical-setup';

// Import test utilities
import {
  TestEnvironment,
  FinancialAssertions,
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { mockControls } from '../__mocks__/external-deps';

testSuite('PollEtfMetrics Historical Miscellaneous Tests', () => {
  let testWorkspace: string;

  beforeEach(() => {
    testWorkspace = setupHistoricalTestEnvironment();
    // Setup specific test mocks
    mockControls.resetAll();
  });

  afterEach(() => {
    teardownHistoricalTestEnvironment();
  });

  describe('Historical Metric Comparison', () => {
    it('should compare current metrics with historical averages', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      // Mock file system operations to simulate existing historical data
      mockFs.promises.mkdir.mockResolvedValue(undefined);

      // Mock existing historical data
      const historicalMetrics = [
        { sharesCount: 45000000, price: 1200, aum: 54000000000 },
        { sharesCount: 47000000, price: 1250, aum: 58750000000 },
        { sharesCount: 49000000, price: 1300, aum: 63700000000 }
      ];

      // Track current metrics
      let currentMetrics: any = null;

      mockFs.promises.readFile.mockImplementation(async (filePath: string) => {
        if (typeof filePath === 'string' && filePath.includes('TRUR_historical.json')) {
          return JSON.stringify(historicalMetrics);
        }
        // For other files, return empty string or throw ENOENT
        const error = new Error('ENOENT: no such file or directory');
        (error as any).code = 'ENOENT';
        throw error;
      });

      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('TRUR.json')) {
          currentMetrics = JSON.parse(data);
        }
        return undefined;
      });

      // Mock request-promise for current data
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

      // Collect current metrics
      await collectOnceForSymbols(['TRUR']);

      // Verify current metrics were collected
      expect(currentMetrics).not.toBeNull();
      expect(currentMetrics.sharesCount).toBe(50000000);

      // Calculate historical averages
      const avgSharesCount = historicalMetrics.reduce((sum, m) => sum + m.sharesCount, 0) / historicalMetrics.length;
      const avgPrice = historicalMetrics.reduce((sum, m) => sum + m.price, 0) / historicalMetrics.length;
      const avgAum = historicalMetrics.reduce((sum, m) => sum + m.aum, 0) / historicalMetrics.length;

      // Compare current with historical average
      const sharesCountDiff = ((currentMetrics.sharesCount - avgSharesCount) / avgSharesCount) * 100;

      // Verify that comparison calculations are reasonable
      expect(typeof avgSharesCount).toBe('number');
      expect(typeof avgPrice).toBe('number');
      expect(typeof avgAum).toBe('number');
      expect(typeof sharesCountDiff).toBe('number');

      // Verify the current value is higher than historical average
      expect(currentMetrics.sharesCount).toBeGreaterThan(avgSharesCount);
      expect(sharesCountDiff).toBeGreaterThan(0);
    });
  });

  describe('Long-Term Data Storage and Validation', () => {
    it('should maintain data integrity across multiple collection cycles', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);

      // Track all written data for integrity verification
      const allWrittenData: any[] = [];

      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('.json')) {
          const parsedData = JSON.parse(data);
          allWrittenData.push({
            filePath,
            data: parsedData,
            timestamp: new Date().toISOString()
          });
        }
        return undefined;
      });

      // Mock request-promise for consistent data
      let callCount = 0;
      mockRp.mockImplementation(async () => {
        callCount++;
        const baseShares = 45000000;
        const increment = 1000000;

        return JSON.stringify({
          payload: {
            news: [
              {
                id: 12345 + callCount,
                title: 'В фонд поступили новые деньги',
                additional_fields: [
                  {
                    name: 'Общее количество паёв',
                    value: (baseShares + (callCount * increment)).toLocaleString()
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

      // Perform multiple collection cycles
      const cycles = 10;
      for (let i = 0; i < cycles; i++) {
        await collectOnceForSymbols(['TRUR']);
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      // Verify data integrity
      expect(allWrittenData).toHaveLength(cycles);

      // Verify data consistency
      for (let i = 0; i < allWrittenData.length; i++) {
        const data = allWrittenData[i].data;

        // Verify required fields exist
        expect(data).toHaveProperty('symbol');
        expect(data).toHaveProperty('timestamp');
        expect(data).toHaveProperty('sharesCount');

        // Verify data types
        expect(typeof data.symbol).toBe('string');
        expect(typeof data.timestamp).toBe('string');
        expect(typeof data.sharesCount).toBe('number');

        // Verify logical progression
        const expectedShares = 45000000 + ((i + 1) * 1000000);
        expect(data.sharesCount).toBe(expectedShares);
      }

      // Verify timestamps are increasing
      for (let i = 1; i < allWrittenData.length; i++) {
        const prevTimestamp = new Date(allWrittenData[i - 1].data.timestamp);
        const currentTimestamp = new Date(allWrittenData[i].data.timestamp);
        expect(currentTimestamp.getTime()).toBeGreaterThanOrEqual(prevTimestamp.getTime());
      }
    });
  });

  describe('Historical Data Edge Cases', () => {
    it('should handle corrupted historical data gracefully', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);

      // Track current collection
      let currentMetrics: any = null;

      // Mock corrupted historical data
      mockFs.promises.readFile.mockImplementation(async (filePath: string) => {
        if (typeof filePath === 'string' && filePath.includes('historical')) {
          // Return corrupted JSON
          return '{"invalid": json}';
        }
        const error = new Error('ENOENT: no such file or directory');
        (error as any).code = 'ENOENT';
        throw error;
      });

      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('TRUR.json')) {
          currentMetrics = JSON.parse(data);
        }
        return undefined;
      });

      // Mock request-promise
      mockRp.mockResolvedValue(JSON.stringify({
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

      // Should not throw despite corrupted historical data
      await expect(collectOnceForSymbols(['TRUR'])).resolves.toBeUndefined();

      // Verify current collection still works
      expect(currentMetrics).not.toBeNull();
      expect(currentMetrics.sharesCount).toBe(45000000);
      expect(currentMetrics.symbol).toBe('TRUR');
    });

    it('should handle extremely large historical datasets', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);

      // Create a large historical dataset
      const largeHistoricalData = Array.from({ length: 10000 }, (_, i) => ({
        timestamp: new Date(Date.now() - (10000 - i) * 60000).toISOString(),
        sharesCount: 40000000 + i * 1000,
        price: 1000 + (i % 100),
        aum: (40000000 + i * 1000) * (1000 + (i % 100))
      }));

      // Track performance
      let readTime = 0;
      let writeTime = 0;

      mockFs.promises.readFile.mockImplementation(async (filePath: string) => {
        const start = performance.now();
        if (typeof filePath === 'string' && filePath.includes('historical')) {
          const result = JSON.stringify(largeHistoricalData);
          readTime = performance.now() - start;
          return result;
        }
        const error = new Error('ENOENT: no such file or directory');
        (error as any).code = 'ENOENT';
        throw error;
      });

      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        const start = performance.now();
        // Simulate write operation
        writeTime = performance.now() - start;
        return undefined;
      });

      // Mock request-promise
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

      // Measure total execution time
      const start = performance.now();
      await collectOnceForSymbols(['TRUR']);
      const totalTime = performance.now() - start;

      // Verify it completes within reasonable time (less than 1 second)
      expect(totalTime).toBeLessThan(1000);

      // Verify data was processed (even if just mock operations)
      expect(typeof readTime).toBe('number');
      expect(typeof writeTime).toBe('number');
    });
  });
});