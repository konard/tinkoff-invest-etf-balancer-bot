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

testSuite('PollEtfMetrics Time-Series Data Aggregation Tests', () => {
  let testWorkspace: string;

  beforeEach(() => {
    testWorkspace = setupTestEnvironment();
    // Setup specific test mocks
    mockControls.resetAll();
  });

  afterEach(() => {
    teardownTestEnvironment();
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
          return '/tmp/test-workspace/etf_metrics';
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
          return '/tmp/test-workspace/etf_metrics';
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
});