import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";
import { setupMocks } from './shared-mocks';

// Setup all the necessary mocks
const { mockFs, mockPath, mockConfigLoader, mockRp } = setupMocks();

// Mock process.exit to prevent tests from exiting the process
const mockProcessExit = mock((code?: number) => {
  throw new Error(`Process would exit with code ${code}`);
});

// Store original process.exit
const originalProcessExit = process.exit;
const originalProcessArgv = process.argv;
const originalEnv = process.env;

// Import test utilities
import { 
  TestEnvironment, 
  FinancialAssertions, 
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { mockControls } from '../__mocks__/external-deps';

testSuite('PollEtfMetrics Metrics Collection Tests', () => {
  let testWorkspace: string;
  
  beforeEach(() => {
    // Setup mocks
    mockControls.resetAll();
    mockFs.promises.readFile.mockClear();
    mockFs.promises.writeFile.mockClear();
    mockFs.promises.access.mockClear();
    mockFs.promises.mkdir.mockClear();
    mockFs.promises.readdir.mockClear();
    mockPath.resolve.mockClear();
    mockPath.join.mockClear();
    mockPath.dirname.mockClear();
    mockConfigLoader.getAccountById.mockClear();
    mockConfigLoader.loadConfig.mockClear();
    mockConfigLoader.getAllAccounts.mockClear();
    
    // Mock process.exit
    process.exit = mockProcessExit as any;
    
    // Set up test workspace in a writable temp directory
    testWorkspace = '/tmp/test-workspace';
    process.cwd = () => testWorkspace;
    
    // Set default mock responses
    mockFs.promises.readFile.mockResolvedValue('');
    mockFs.promises.writeFile.mockResolvedValue(undefined);
    mockFs.promises.access.mockResolvedValue(undefined);
    mockFs.promises.mkdir.mockResolvedValue(undefined);
    mockFs.promises.readdir.mockResolvedValue([]);
    mockPath.resolve.mockImplementation((...args: string[]) => args.join('/'));
    mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
    mockPath.dirname.mockImplementation((p: string) => p.split('/').slice(0, -1).join('/'));
    
    // Set default env vars
    process.env = {
      ...originalEnv,
      TOKEN: 'test_token',
      ACCOUNT_ID: 'test-account-1'
    };
    
    // Set default argv
    process.argv = ['node', 'pollEtfMetrics.ts'];
  });

  afterEach(() => {
    // Restore process.exit
    process.exit = originalProcessExit;
    process.argv = originalProcessArgv;
    process.env = originalEnv;
    process.cwd = originalProcessArgv.includes('pollEtfMetrics.ts') ? () => process.argv[1] : () => '.';
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
        desired_wallet: { TRUR: 30, TMOS: 40, TGLD: 30 },
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
      await collectOnceForSymbols(['TRUR', 'TMOS', 'TGLD']);
      
      // Verify that the necessary functions were called
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalledTimes(3); // Once for each symbol
      expect(mockRp).toHaveBeenCalled();
    });
    
    it('should handle partial failures in multi-symbol collection', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      // Mock request-promise to fail for one symbol but succeed for others
      mockRp.mockImplementation(async (options: any) => {
        const url = typeof options === 'string' ? options : options.uri || options.url;
        if (url && url.includes('TMOS')) {
          // Simulate failure for TMOS
          throw new Error('Network error for TMOS');
        }
        // Success for other symbols
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
      
      // Test the metrics collection - should not throw even if one symbol fails
      await expect(collectOnceForSymbols(['TRUR', 'TMOS'])).resolves.toBeUndefined();
      
      // Verify that the necessary functions were called
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalled(); // Should still write for successful symbols
      expect(mockRp).toHaveBeenCalled();
    });
  });

  describe('Shares Count Collection Methods', () => {
    it('should collect shares count from Smartfeed API', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      // Mock request-promise for Smartfeed API with specific shares count
      mockRp.mockResolvedValue(JSON.stringify({
        payload: {
          news: [
            {
              id: 12345,
              title: 'В фонд поступили новые деньги',
              additional_fields: [
                {
                  name: 'Общее количество паёв',
                  value: '75,500,000'
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
      
      // Test the metrics collection
      await collectOnceForSymbols(['TRUR']);
      
      // Verify that the Smartfeed API was called
      expect(mockRp).toHaveBeenCalled();
      
      // Verify that metrics were written
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
    });
    
    it('should fallback to local cache when Smartfeed API fails', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      mockFs.promises.readFile.mockImplementation(async (filePath: string) => {
        if (typeof filePath === 'string' && filePath.includes('shares_count') && filePath.includes('TRUR.json')) {
          // Return cached shares count
          return '60000000';
        }
        // For other files, simulate not found
        const error = new Error('ENOENT: no such file or directory');
        (error as any).code = 'ENOENT';
        throw error;
      });
      
      // Mock request-promise to fail
      mockRp.mockImplementation(async () => {
        throw new Error('Smartfeed API error');
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
        if (args.includes('shares_count')) {
          return '/test/workspace/shares_count';
        }
        return args.join('/');
      });
      
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
      
      // Test the metrics collection
      await collectOnceForSymbols(['TRUR']);
      
      // Verify that both Smartfeed API and local cache were attempted
      expect(mockRp).toHaveBeenCalled();
      expect(mockFs.promises.readFile).toHaveBeenCalled();
      
      // Verify that metrics were written
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
    });
  });

  describe('Metrics Data Structure and Content', () => {
    it('should create metrics with all required fields', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        // Capture the written data for verification
        if (typeof filePath === 'string' && filePath.includes('TRUR.json')) {
          const metrics = JSON.parse(data);
          
          // Verify required fields exist
          expect(metrics).toHaveProperty('symbol');
          expect(metrics).toHaveProperty('timestamp');
          expect(metrics).toHaveProperty('sharesCount');
          expect(metrics).toHaveProperty('price');
          expect(metrics).toHaveProperty('marketCap');
          expect(metrics).toHaveProperty('aum');
          expect(metrics).toHaveProperty('decorrelationPct');
          expect(metrics).toHaveProperty('sharesSearchUrl');
          expect(metrics).toHaveProperty('sharesSourceUrl');
          expect(metrics).toHaveProperty('figi');
          expect(metrics).toHaveProperty('uid');
          expect(metrics).toHaveProperty('smartfeedBrand');
          expect(metrics).toHaveProperty('smartfeedUrl');
          
          // Verify field types
          expect(typeof metrics.symbol).toBe('string');
          expect(typeof metrics.timestamp).toBe('string');
          expect(typeof metrics.sharesCount).toBe('number');
          expect(typeof metrics.price).toBe('number');
          expect(typeof metrics.marketCap).toBe('number');
          expect(typeof metrics.aum).toBe('number');
          expect(typeof metrics.decorrelationPct).toBe('number');
          expect(typeof metrics.sharesSearchUrl).toBe('string');
          expect(typeof metrics.figi).toBe('string');
          expect(typeof metrics.uid).toBe('string');
        }
        return undefined;
      });
      
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
      
      // Test the metrics collection
      await collectOnceForSymbols(['TRUR']);
      
      // Verify that the necessary functions were called
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
      expect(mockRp).toHaveBeenCalled();
    });
    
    it('should calculate decorrelation percentage correctly', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        // Capture the written data for verification
        if (typeof filePath === 'string' && filePath.includes('TRUR.json')) {
          const metrics = JSON.parse(data);
          
          // Verify decorrelation percentage calculation
          // Formula: (marketCap - AUM) / AUM * 100
          const expectedDecorrelation = ((metrics.marketCap - metrics.aum) / metrics.aum) * 100;
          expect(metrics.decorrelationPct).toBeCloseTo(expectedDecorrelation, 2);
        }
        return undefined;
      });
      
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
      
      // Test the metrics collection
      await collectOnceForSymbols(['TRUR']);
      
      // Verify that the necessary functions were called
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
      expect(mockRp).toHaveBeenCalled();
    });
  });

  describe('Metrics Collection Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      // Mock request-promise to throw network error
      mockRp.mockImplementation(async () => {
        throw new Error('Network timeout');
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
        if (args.includes('shares_count')) {
          return '/test/workspace/shares_count';
        }
        return args.join('/');
      });
      
      mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
      
      // Test the metrics collection - should not throw
      await expect(collectOnceForSymbols(['TRUR'])).resolves.toBeUndefined();
      
      // Verify that the necessary functions were called
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalled(); // Should still write metrics with default values
      expect(mockRp).toHaveBeenCalled();
    });
    
    it('should handle file system errors gracefully', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations to fail
      mockFs.promises.mkdir.mockImplementation(async () => {
        throw new Error('Permission denied');
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
      
      // Test the metrics collection - should not throw
      await expect(collectOnceForSymbols(['TRUR'])).resolves.toBeUndefined();
      
      // Verify that the necessary functions were called
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
    });
  });

  describe('Metrics Collection Edge Cases', () => {
    it('should handle empty symbols array', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      // Test the metrics collection with empty array
      await collectOnceForSymbols([]);
      
      // Verify that no file operations were performed
      expect(mockFs.promises.writeFile).not.toHaveBeenCalled();
    });
    
    it('should handle symbols with special characters', async () => {
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
        desired_wallet: { 'T@GLD': 100 },
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
      
      // Test the metrics collection
      await collectOnceForSymbols(['T@GLD']);
      
      // Verify that the necessary functions were called
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
      expect(mockRp).toHaveBeenCalled();
    });
  });

  describe('Performance Tests for Metrics Collection', () => {
    it('should collect metrics for single symbol within reasonable time', async () => {
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
      
      // Measure performance
      const startTime = performance.now();
      await collectOnceForSymbols(['TRUR']);
      const endTime = performance.now();
      
      // Should complete within reasonable time (less than 2 seconds for mock)
      expect(endTime - startTime).toBeLessThan(2000);
      
      // Verify that the necessary functions were called
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
      expect(mockRp).toHaveBeenCalled();
    });
    
    it('should handle concurrent metrics collection requests', async () => {
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
        desired_wallet: { TRUR: 30, TMOS: 40, TGLD: 30 },
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
      
      // Test concurrent metrics collection
      const promises = [
        collectOnceForSymbols(['TRUR']),
        collectOnceForSymbols(['TMOS']),
        collectOnceForSymbols(['TGLD'])
      ];
      
      const startTime = performance.now();
      await Promise.all(promises);
      const endTime = performance.now();
      
      // Should complete within reasonable time (less than 3 seconds for mock)
      expect(endTime - startTime).toBeLessThan(3000);
      
      // Verify that the necessary functions were called
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalledTimes(3); // Once for each symbol
      expect(mockRp).toHaveBeenCalledTimes(3); // Once for each symbol
    });
  });
});