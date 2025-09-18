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

testSuite('PollEtfMetrics Data Methods Tests', () => {
  let testWorkspace: string;

  beforeEach(() => {
    testWorkspace = setupCollectionTestEnvironment();
    mockControls.resetAll();
  });

  afterEach(() => {
    teardownCollectionTestEnvironment();
  });

  describe('Shares Count Collection Methods', () => {
    it('should collect shares count from Smartfeed API', async () => {
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      // Track written data
      let writtenData: any = null;

      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('TRUR.json')) {
          writtenData = JSON.parse(data);
        }
        return undefined;
      });

      // Mock Smartfeed API response
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
      expect(writtenData.sharesCount).toBe(50000000);
      expect(writtenData.symbol).toBe('TRUR');
    });

    it('should parse shares count from different field formats', async () => {
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      let writtenData: any = null;
      let callCount = 0;

      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('.json')) {
          writtenData = JSON.parse(data);
        }
        return undefined;
      });

      // Mock different response formats
      mockRp.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            payload: {
              news: [{
                id: 1,
                title: 'Test',
                additional_fields: [{
                  name: 'Общее количество паёв',
                  value: '45,000,000' // Comma format
                }]
              }],
              meta: { cursor: null }
            }
          });
        }
        return JSON.stringify({
          payload: {
            news: [{
              id: 2,
              title: 'Test',
              additional_fields: [{
                name: 'Общее количество паёв',
                value: '45 000 000' // Space format
              }]
            }],
            meta: { cursor: null }
          }
        });
      });

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

      // Test comma format
      await collectOnceForSymbols(['TRUR']);
      expect(writtenData.sharesCount).toBe(45000000);

      // Test space format
      await collectOnceForSymbols(['TRUR']);
      expect(writtenData.sharesCount).toBe(45000000);
    });
  });

  describe('Metrics Data Structure and Content', () => {
    it('should create properly structured metrics data', async () => {
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      let writtenData: any = null;

      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('TRUR.json')) {
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

      // Verify data structure
      expect(writtenData).toHaveProperty('symbol');
      expect(writtenData).toHaveProperty('timestamp');
      expect(writtenData).toHaveProperty('sharesCount');
      expect(writtenData).toHaveProperty('price');
      expect(writtenData).toHaveProperty('marketCap');
      expect(writtenData).toHaveProperty('aum');

      // Verify data types
      expect(typeof writtenData.symbol).toBe('string');
      expect(typeof writtenData.timestamp).toBe('string');
      expect(typeof writtenData.sharesCount).toBe('number');
      expect(typeof writtenData.price).toBe('number');
      expect(typeof writtenData.marketCap).toBe('number');
      expect(typeof writtenData.aum).toBe('number');

      // Verify values
      expect(writtenData.symbol).toBe('TRUR');
      expect(writtenData.sharesCount).toBe(50000000);
      expect(writtenData.price).toBeGreaterThan(0);
    });

    it('should calculate derived metrics correctly', async () => {
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;

      let writtenData: any = null;

      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('TRUR.json')) {
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

      // Verify derived calculations
      const expectedMarketCap = writtenData.sharesCount * writtenData.price;
      expect(writtenData.marketCap).toBe(expectedMarketCap);

      // Verify decorrelation percentage calculation
      if (writtenData.aum > 0) {
        const expectedDecorrelation = ((writtenData.marketCap - writtenData.aum) / writtenData.aum) * 100;
        expect(writtenData.decorrelationPct).toBeCloseTo(expectedDecorrelation, 2);
      }

      // Verify timestamp format
      expect(new Date(writtenData.timestamp).getTime()).not.toBeNaN();
    });
  });
});