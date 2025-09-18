import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import path from 'path';
import {
  setupCollectionTestEnvironment,
  teardownCollectionTestEnvironment,
  mockFs,
  mockPath,
  mockRp,
  mockConfigLoader
} from './pollEtfMetrics-collection-setup';

// Import test utilities
import {
  TestEnvironment,
  FinancialAssertions,
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { mockControls } from '../__mocks__/external-deps';

testSuite('PollEtfMetrics Basic Collection Tests', () => {
  let testWorkspace: string;

  beforeEach(() => {
    testWorkspace = setupCollectionTestEnvironment();
    // Setup specific test mocks
    mockControls.resetAll();
  });

  afterEach(() => {
    teardownCollectionTestEnvironment();
  });

  describe('Single Symbol Metrics Collection', () => {
    it('should collect metrics for a single ETF symbol', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

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
        if (args.includes('shares_count')) {
          return '/test/workspace/shares_count';
        }
        return args.join('/');
      });

      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));

      // Test the metrics collection
      await collectOnceForSymbols(['TRUR']);

      // Verify that the necessary functions were called
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
      expect(mockRp).toHaveBeenCalled();

      // Verify that the metrics directory was created
      expect(mockFs.promises.mkdir).toHaveBeenCalledWith('/test/workspace/etf_metrics', { recursive: true });
    });

    it('should handle missing shares count gracefully', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      mockFs.promises.readFile.mockImplementation(async (filePath: string) => {
        if (typeof filePath === 'string' && filePath.includes('shares_count')) {
          // Simulate file not found
          const error = new Error('ENOENT: no such file or directory');
          (error as any).code = 'ENOENT';
          throw error;
        }
        return '';
      });

      // Mock request-promise to return empty results
      mockRp.mockResolvedValue(JSON.stringify({
        payload: {
          news: [],
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
        if (args.includes('shares_count')) {
          return '/test/workspace/shares_count';
        }
        return args.join('/');
      });

      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));

      // Test the metrics collection
      await collectOnceForSymbols(['UNKNOWN']);

      // Verify that the necessary functions were called
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalled();

      // Verify that shares count file was attempted to be read
      expect(mockFs.promises.readFile).toHaveBeenCalled();
    });

    it('should collect metrics with AUM data', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

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
        if (args.includes('shares_count')) {
          return '/test/workspace/shares_count';
        }
        return args.join('/');
      });

      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));

      // Test the metrics collection
      await collectOnceForSymbols(['TRUR']);

      // Verify that the necessary functions were called
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
      expect(mockRp).toHaveBeenCalled();
    });
  });

  describe('Multiple Symbols Metrics Collection', () => {
    it('should collect metrics for multiple ETF symbols', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      // Mock request-promise for different symbols
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

      // Test the metrics collection for multiple symbols
      await collectOnceForSymbols(['TRUR', 'TMOS']);

      // Verify that the necessary functions were called
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalledTimes(2); // Once for each symbol
      expect(mockRp).toHaveBeenCalled();
    });

    it('should handle partial failures in multiple symbol collection', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      // Mock request-promise to fail for some symbols
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
          throw new Error('Network error for TMOS');
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

      // Should not throw despite one symbol failing
      await expect(collectOnceForSymbols(['TRUR', 'TMOS'])).resolves.toBeUndefined();

      // Verify that collection was attempted for both symbols
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      // Should have two writeFile calls - successful for TRUR and fallback for TMOS
      expect(mockFs.promises.writeFile).toHaveBeenCalledTimes(2);
    });
  });
});