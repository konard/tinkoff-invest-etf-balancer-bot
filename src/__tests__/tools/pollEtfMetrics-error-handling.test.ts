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

testSuite('PollEtfMetrics Aggregation Error Handling Tests', () => {
  let testWorkspace: string;

  beforeEach(() => {
    testWorkspace = setupTestEnvironment();
    // Setup specific test mocks
    mockControls.resetAll();
  });

  afterEach(() => {
    teardownTestEnvironment();
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
        if (url && url.includes(encodeURIComponent('Вечный портфель'))) {
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
        } else if (url && url.includes(encodeURIComponent('Крупнейшие компании РФ'))) {
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

        if (url && url.includes(encodeURIComponent('Крупнейшие компании РФ'))) {
          // Simulate failure for TMOS
          throw new Error('Network error for TMOS');
        } else if (url && url.includes(encodeURIComponent('Вечный портфель'))) {
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
          return '/tmp/test-workspace/etf_metrics';
        }
        return args.join('/');
      });

      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));

      // Test the metrics collection - should not throw even if one symbol fails
      await expect(collectOnceForSymbols(['TRUR', 'TMOS'])).resolves.toBeUndefined();

      // Verify that metrics were written for both symbols (even if one fails)
      expect(Object.keys(writtenMetrics)).toHaveLength(2);
      expect(writtenMetrics).toHaveProperty('TRUR');
      expect(writtenMetrics).toHaveProperty('TMOS');

      // Verify that TRUR has correct data
      expect(writtenMetrics.TRUR.sharesCount).toBe(50000000);

      // Verify that TMOS has null sharesCount due to API failure
      expect(writtenMetrics.TMOS.sharesCount).toBeNull();
    });
  });
});