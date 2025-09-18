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

testSuite('PollEtfMetrics Cross-Symbol Data Aggregation Tests', () => {
  let testWorkspace: string;

  beforeEach(() => {
    testWorkspace = setupTestEnvironment();
    // Setup specific test mocks
    mockControls.resetAll();
  });

  afterEach(() => {
    teardownTestEnvironment();
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
          const parsed = JSON.parse(data);
          console.log(`[TEST DEBUG] Writing metrics for ${fileName}:`, parsed);
          writtenMetrics[fileName] = parsed;
        }
        return undefined;
      });

      // Mock request-promise for Smartfeed API with different data for each symbol
      mockRp.mockImplementation(async (options: any) => {
        const url = typeof options === 'string' ? options : options.uri || options.url;
        console.log('[TEST DEBUG] Mock request to:', url);

        if (url && url.includes(encodeURIComponent('Вечный портфель'))) {
          // TRUR brand
          const response = JSON.stringify({
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
          console.log('[TEST DEBUG] Returning TRUR response with shares:', '50,000,000');
          return response;
        } else if (url && url.includes(encodeURIComponent('Крупнейшие компании РФ'))) {
          // TMOS brand
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
        } else if (url && url.includes(encodeURIComponent('Золото'))) {
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
          return '/tmp/test-workspace/etf_metrics';
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
      mockRp.mockImplementation(async (options: any) => {
        const url = typeof options === 'string' ? options : options.uri || options.url;

        if (url && (url.includes(encodeURIComponent('Вечный портфель')) ||
                     url.includes(encodeURIComponent('Крупнейшие компании РФ')) ||
                     url.includes(encodeURIComponent('Золото')))) {
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
          return '/tmp/test-workspace/etf_metrics';
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
});