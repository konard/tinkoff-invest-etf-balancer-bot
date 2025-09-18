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

testSuite('PollEtfMetrics Historical Data Analysis Tests', () => {
  let testWorkspace: string;

  beforeEach(() => {
    testWorkspace = setupHistoricalTestEnvironment();
    // Setup specific test mocks
    mockControls.resetAll();
  });

  afterEach(() => {
    teardownHistoricalTestEnvironment();
  });

  describe('Historical Data Analysis', () => {
    it('should calculate trends from historical metrics data', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      // Mock file system operations to collect historical data
      mockFs.promises.mkdir.mockResolvedValue(undefined);

      // Store historical data for trend analysis
      const historicalData: any[] = [];

      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('TRUR.json')) {
          historicalData.push(JSON.parse(data));
        }
        return undefined;
      });

      // Mock request-promise to return sequential data showing a trend
      let callCount = 0;
      const trendingValues = [40000000, 42000000, 44000000, 46000000, 48000000, 50000000];

      mockRp.mockImplementation(async () => {
        const value = trendingValues[callCount] || 50000000;
        callCount = (callCount + 1) % trendingValues.length;

        return JSON.stringify({
          payload: {
            news: [
              {
                id: 12345 + callCount,
                title: 'В фонд поступили новые деньги',
                additional_fields: [
                  {
                    name: 'Общее количество паёв',
                    value: value.toLocaleString()
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

      // Collect historical data points
      for (let i = 0; i < 6; i++) {
        await collectOnceForSymbols(['TRUR']);
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      // Verify we have the expected amount of data
      expect(historicalData).toHaveLength(6);

      // Calculate trend (simple linear regression approach)
      const sharesValues = historicalData.map(d => d.sharesCount);
      const timePoints = historicalData.map((_, i) => i);

      // Calculate slope to determine trend direction
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      const n = sharesValues.length;

      for (let i = 0; i < n; i++) {
        const x = timePoints[i];
        const y = sharesValues[i];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
      }

      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

      // Verify that we have a positive trend (shares count increasing)
      expect(slope).toBeGreaterThan(0);

      // Verify that the trend calculation makes sense
      expect(typeof slope).toBe('number');
      expect(Number.isFinite(slope)).toBe(true);
    });

    it('should identify significant changes in historical data', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);

      // Store historical data
      const historicalData: any[] = [];

      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('TRUR.json')) {
          historicalData.push(JSON.parse(data));
        }
        return undefined;
      });

      // Mock request-promise to return data with a significant change
      let callCount = 0;
      // Normal values followed by a significant jump
      const valuesWithJump = [45000000, 46000000, 45500000, 75000000, 76000000, 75500000];

      mockRp.mockImplementation(async () => {
        const value = valuesWithJump[callCount] || 75000000;
        callCount = (callCount + 1) % valuesWithJump.length;

        return JSON.stringify({
          payload: {
            news: [
              {
                id: 12345 + callCount,
                title: 'В фонд поступили новые деньги',
                additional_fields: [
                  {
                    name: 'Общее количество паёв',
                    value: value.toLocaleString()
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

      // Collect historical data
      for (let i = 0; i < 6; i++) {
        await collectOnceForSymbols(['TRUR']);
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      // Verify we have the data
      expect(historicalData).toHaveLength(6);

      // Identify significant changes (e.g., >10% change from previous value)
      const significantChanges: { index: number; oldValue: number; newValue: number; percentChange: number }[] = [];

      for (let i = 1; i < historicalData.length; i++) {
        const oldValue = historicalData[i - 1].sharesCount;
        const newValue = historicalData[i].sharesCount;
        const percentChange = Math.abs((newValue - oldValue) / oldValue) * 100;

        if (percentChange > 10) { // 10% threshold
          significantChanges.push({
            index: i,
            oldValue,
            newValue,
            percentChange
          });
        }
      }

      // Verify that we detected the significant change
      expect(significantChanges.length).toBeGreaterThan(0);

      // Verify the significant change details
      const jump = significantChanges[0];
      expect(jump.percentChange).toBeGreaterThan(10);
      expect(jump.newValue).toBeGreaterThan(jump.oldValue);

      // Verify the jump occurred at the expected time (between indices 2 and 3)
      expect(jump.index).toBe(3);
    });
  });
});