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

testSuite('PollEtfMetrics Error Handling and Edge Cases Tests', () => {
  let testWorkspace: string;

  beforeEach(() => {
    testWorkspace = setupCollectionTestEnvironment();
    mockControls.resetAll();
  });

  afterEach(() => {
    teardownCollectionTestEnvironment();
  });

  describe('Metrics Collection Error Handling', () => {
    it('should handle API failures gracefully', async () => {
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      let writtenData: any = null;

      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('.json')) {
          writtenData = JSON.parse(data);
        }
        return undefined;
      });

      // Mock API failure
      mockRp.mockRejectedValue(new Error('Network timeout'));

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

      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) return '/test/workspace/etf_metrics';
        return args.join('/');
      });
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));

      // Should not throw despite API failure
      await expect(collectOnceForSymbols(['TRUR'])).resolves.toBeUndefined();

      // Should still write metrics file with null values
      expect(writtenData).not.toBeNull();
      expect(writtenData.symbol).toBe('TRUR');
      expect(writtenData.sharesCount).toBeNull();
    });

    it('should handle malformed API responses', async () => {
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      let writtenData: any = null;

      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('.json')) {
          writtenData = JSON.parse(data);
        }
        return undefined;
      });

      // Mock malformed JSON response
      mockRp.mockResolvedValue('{"invalid": json}');

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

      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) return '/test/workspace/etf_metrics';
        return args.join('/');
      });
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));

      await expect(collectOnceForSymbols(['TRUR'])).resolves.toBeUndefined();

      expect(writtenData).not.toBeNull();
      expect(writtenData.symbol).toBe('TRUR');
      expect(writtenData.sharesCount).toBeNull();
    });

    it('should handle file system errors gracefully', async () => {
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      // Mock file system failures
      mockFs.promises.mkdir.mockRejectedValue(new Error('Permission denied'));
      mockFs.promises.writeFile.mockRejectedValue(new Error('Disk full'));

      mockRp.mockResolvedValue(JSON.stringify({
        payload: {
          news: [{
            id: 12345,
            title: 'В фонд поступили новые деньги',
            additional_fields: [{
              name: 'Общее количество паёв',
              value: '50,000,000'
            }]
          }],
          meta: { cursor: null }
        }
      }));

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

      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) return '/test/workspace/etf_metrics';
        return args.join('/');
      });
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));

      // Should not throw despite file system errors
      await expect(collectOnceForSymbols(['TRUR'])).resolves.toBeUndefined();
    });
  });

  describe('Metrics Collection Edge Cases', () => {
    it('should handle symbols with special characters', async () => {
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      let writtenData: any = null;

      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('.json')) {
          writtenData = JSON.parse(data);
        }
        return undefined;
      });

      mockRp.mockResolvedValue(JSON.stringify({
        payload: {
          news: [{
            id: 12345,
            title: 'В фонд поступили новые деньги',
            additional_fields: [{
              name: 'Общее количество паёв',
              value: '50,000,000'
            }]
          }],
          meta: { cursor: null }
        }
      }));

      mockConfigLoader.getAccountById.mockReturnValue({
        id: 'test-account-1',
        name: 'Test Account 1',
        t_invest_token: 't.test_token_1',
        account_id: '123456789',
        desired_wallet: { 'T@GLD': 100 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { enabled: false }
      });

      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) return '/test/workspace/etf_metrics';
        return args.join('/');
      });
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));

      await collectOnceForSymbols(['T@GLD']);

      expect(writtenData).not.toBeNull();
      expect(writtenData.symbol).toBe('T@GLD');
      expect(typeof writtenData.sharesCount).toBe('number');
    });

    it('should handle extremely large numeric values', async () => {
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      let writtenData: any = null;

      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('.json')) {
          writtenData = JSON.parse(data);
        }
        return undefined;
      });

      mockRp.mockResolvedValue(JSON.stringify({
        payload: {
          news: [{
            id: 12345,
            title: 'В фонд поступили новые деньги',
            additional_fields: [{
              name: 'Общее количество паёв',
              value: '999,999,999,999' // Very large number
            }]
          }],
          meta: { cursor: null }
        }
      }));

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

      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) return '/test/workspace/etf_metrics';
        return args.join('/');
      });
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));

      await collectOnceForSymbols(['TRUR']);

      expect(writtenData).not.toBeNull();
      expect(writtenData.sharesCount).toBe(999999999999);
      expect(Number.isFinite(writtenData.marketCap)).toBe(true);
      expect(Number.isFinite(writtenData.aum)).toBe(true);
    });

    it('should handle empty or null data fields gracefully', async () => {
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      let writtenData: any = null;

      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('.json')) {
          writtenData = JSON.parse(data);
        }
        return undefined;
      });

      mockRp.mockResolvedValue(JSON.stringify({
        payload: {
          news: [{
            id: 12345,
            title: 'В фонд поступили новые деньги',
            additional_fields: [{
              name: 'Общее количество паёв',
              value: '' // Empty value
            }]
          }],
          meta: { cursor: null }
        }
      }));

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

      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) return '/test/workspace/etf_metrics';
        return args.join('/');
      });
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));

      await collectOnceForSymbols(['TRUR']);

      expect(writtenData).not.toBeNull();
      expect(writtenData.symbol).toBe('TRUR');
      expect(writtenData.sharesCount).toBeNull();
    });
  });

  describe('Performance Tests for Metrics Collection', () => {
    it('should complete collection within reasonable time limits', async () => {
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      mockRp.mockResolvedValue(JSON.stringify({
        payload: {
          news: [{
            id: 12345,
            title: 'В фонд поступили новые деньги',
            additional_fields: [{
              name: 'Общее количество паёв',
              value: '50,000,000'
            }]
          }],
          meta: { cursor: null }
        }
      }));

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

      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) return '/test/workspace/etf_metrics';
        return args.join('/');
      });
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));

      const startTime = performance.now();
      await collectOnceForSymbols(['TRUR']);
      const endTime = performance.now();

      // Should complete within 1 second
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle concurrent collection requests', async () => {
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      mockRp.mockResolvedValue(JSON.stringify({
        payload: {
          news: [{
            id: 12345,
            title: 'В фонд поступили новые деньги',
            additional_fields: [{
              name: 'Общее количество паёв',
              value: '50,000,000'
            }]
          }],
          meta: { cursor: null }
        }
      }));

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

      mockPath.resolve.mockImplementation((...args: string[]) => {
        if (args.includes('etf_metrics')) return '/test/workspace/etf_metrics';
        return args.join('/');
      });
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));

      // Run multiple collections concurrently
      const promises = [
        collectOnceForSymbols(['TRUR']),
        collectOnceForSymbols(['TMOS']),
        collectOnceForSymbols(['TRUR', 'TMOS'])
      ];

      await expect(Promise.all(promises)).resolves.toBeDefined();
    });
  });
});