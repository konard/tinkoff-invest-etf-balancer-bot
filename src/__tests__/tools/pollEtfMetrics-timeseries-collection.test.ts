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

testSuite('PollEtfMetrics Time-Series Data Collection Tests', () => {
  let testWorkspace: string;

  beforeEach(() => {
    testWorkspace = setupHistoricalTestEnvironment();
    // Setup specific test mocks
    mockControls.resetAll();
  });

  afterEach(() => {
    teardownHistoricalTestEnvironment();
  });

  describe('Time-Series Data Collection', () => {
    it('should collect and store metrics over time for historical analysis', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      // Mock file system operations to simulate time-series data collection
      mockFs.promises.mkdir.mockResolvedValue(undefined);

      // Track all written metrics to verify time-series storage
      const writtenMetricsHistory: Record<string, any[]> = {
        TRUR: [],
        TMOS: []
      };

      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string') {
          const fileName = path.basename(filePath, '.json');
          if (writtenMetricsHistory[fileName]) {
            writtenMetricsHistory[fileName].push(JSON.parse(data));
          }
        }
        return undefined;
      });

      // Mock request-promise to return different data over time
      let callCount = 0;
      const sharesValues = [45000000, 47000000, 50000000, 52000000, 55000000];

      mockRp.mockImplementation(async () => {
        const sharesCount = sharesValues[callCount % sharesValues.length];
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

      // Simulate multiple collection runs over time to build historical data
      for (let i = 0; i < 5; i++) {
        await collectOnceForSymbols(['TRUR', 'TMOS']);
        // Add small delay to simulate time passing
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Verify that historical data was collected
      expect(writtenMetricsHistory.TRUR).toHaveLength(5);
      expect(writtenMetricsHistory.TMOS).toHaveLength(5);

      // Verify that shares count values follow the expected pattern
      const trurShares = writtenMetricsHistory.TRUR.map(m => m.sharesCount);
      expect(trurShares).toEqual(sharesValues);

      // Verify that timestamps are different for each collection
      const timestamps = writtenMetricsHistory.TRUR.map(m => m.timestamp);
      const uniqueTimestamps = new Set(timestamps);
      expect(uniqueTimestamps.size).toBe(5);
    });

    it('should handle time-series data with missing intervals', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);

      // Track written metrics
      const writtenMetricsHistory: Record<string, any[]> = {
        TRUR: []
      };

      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string') {
          const fileName = path.basename(filePath, '.json');
          if (writtenMetricsHistory[fileName]) {
            writtenMetricsHistory[fileName].push(JSON.parse(data));
          }
        }
        return undefined;
      });

      // Mock request-promise to simulate data collection with gaps
      let callCount = 0;
      mockRp.mockImplementation(async () => {
        callCount++;

        // Simulate failure on some calls to create gaps
        if (callCount === 2 || callCount === 4) {
          throw new Error('Network error');
        }

        return JSON.stringify({
          payload: {
            news: [
              {
                id: 12345 + callCount,
                title: 'В фонд поступили новые деньги',
                additional_fields: [
                  {
                    name: 'Общее количество паёв',
                    value: (45000000 + callCount * 1000000).toLocaleString()
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

      // Simulate collection runs with some failures
      for (let i = 0; i < 5; i++) {
        try {
          await collectOnceForSymbols(['TRUR']);
        } catch (error) {
          // Ignore errors, they're expected for some calls
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Verify that we have fewer data points due to failures
      expect(writtenMetricsHistory.TRUR.length).toBeLessThan(5);
      expect(writtenMetricsHistory.TRUR.length).toBeGreaterThan(0);

      // Verify that the data we do have is valid
      writtenMetricsHistory.TRUR.forEach(metrics => {
        expect(metrics.symbol).toBe('TRUR');
        expect(typeof metrics.timestamp).toBe('string');
        expect(typeof metrics.sharesCount).toBe('number');
        expect(metrics.sharesCount).toBeGreaterThan(0);
      });
    });
  });
});