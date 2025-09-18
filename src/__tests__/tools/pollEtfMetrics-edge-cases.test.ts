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

testSuite('PollEtfMetrics Aggregation Edge Cases Tests', () => {
  let testWorkspace: string;

  beforeEach(() => {
    testWorkspace = setupTestEnvironment();
    // Setup specific test mocks
    mockControls.resetAll();
  });

  afterEach(() => {
    teardownTestEnvironment();
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
      // For special character symbols, always return data since they don't have brand mappings
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
      });

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
          return '/tmp/test-workspace/etf_metrics';
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

        if (url && url.includes(encodeURIComponent('Вечный портфель'))) {
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
        } else if (url && url.includes(encodeURIComponent('Крупнейшие компании РФ'))) {
          // Different API response format
          return JSON.stringify({
            payload: {
              news: [
                {
                  id: 67890,
                  title: 'В фонд поступили новые деньги',
                  body: 'Общее количество паёв: 30,000,000',
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
          return '/tmp/test-workspace/etf_metrics';
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