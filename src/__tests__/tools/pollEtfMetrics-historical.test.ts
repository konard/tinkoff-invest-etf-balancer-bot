import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";
import { promises as fs } from 'fs';
import path from 'path';

// Mock modules first, before any other imports
const mockFs = {
  promises: {
    readFile: mock(async () => ''),
    writeFile: mock(async () => undefined),
    access: mock(async () => undefined),
    mkdir: mock(async () => undefined),
    readdir: mock(async () => []),
    stat: mock(async () => ({ mtime: new Date() }))
  }
};

const mockPath = {
  resolve: mock((...args: string[]) => args.join('/')),
  join: mock((...args: string[]) => args.join('/')),
  dirname: mock((p: string) => p.split('/').slice(0, -1).join('/'))
};

// Mock the modules
mock.module('fs', () => ({
  ...mockFs,
  promises: mockFs.promises
}));

mock.module('path', () => mockPath);

// Mock request-promise for HTTP requests
const mockRp = mock(async () => '');

mock.module('request-promise', () => mockRp);

// Mock configLoader
const mockConfigLoader = {
  getAccountById: mock((id: string) => {
    if (id === 'test-account-1') {
      return {
        id: 'test-account-1',
        name: 'Test Account 1',
        t_invest_token: 't.test_token_1',
        account_id: '123456789',
        desired_wallet: { TRUR: 50, TMOS: 50 },
        desired_mode: 'manual',
        balance_interval: 300000,
        sleep_between_orders: 1000,
        margin_trading: { enabled: false }
      };
    }
    return undefined;
  }),
  loadConfig: mock(() => ({
    accounts: []
  })),
  getAllAccounts: mock(() => [])
};

mock.module('../../configLoader', () => ({
  configLoader: mockConfigLoader
}));

// Mock dotenv
mock.module('dotenv', () => ({
  config: mock(() => undefined)
}));

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

testSuite('PollEtfMetrics Historical Data Processing Tests', () => {
  let testWorkspace: string;
  
  beforeEach(() => {
    // Setup mocks
    mockControls.resetAll();
    mockFs.promises.readFile.mockClear();
    mockFs.promises.writeFile.mockClear();
    mockFs.promises.access.mockClear();
    mockFs.promises.mkdir.mockClear();
    mockFs.promises.readdir.mockClear();
    mockFs.promises.stat.mockClear();
    mockPath.resolve.mockClear();
    mockPath.join.mockClear();
    mockPath.dirname.mockClear();
    mockRp.mockClear();
    mockConfigLoader.getAccountById.mockClear();
    mockConfigLoader.loadConfig.mockClear();
    mockConfigLoader.getAllAccounts.mockClear();
    
    // Mock process.exit
    process.exit = mockProcessExit as any;
    
    // Set up test workspace
    testWorkspace = '/test/workspace';
    process.cwd = () => testWorkspace;
    
    // Set default mock responses
    mockFs.promises.readFile.mockResolvedValue('');
    mockFs.promises.writeFile.mockResolvedValue(undefined);
    mockFs.promises.access.mockResolvedValue(undefined);
    mockFs.promises.mkdir.mockResolvedValue(undefined);
    mockFs.promises.readdir.mockResolvedValue([]);
    mockFs.promises.stat.mockResolvedValue({ mtime: new Date() });
    mockPath.resolve.mockImplementation((...args: string[]) => args.join('/'));
    mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
    mockPath.dirname.mockImplementation((p: string) => p.split('/').slice(0, -1).join('/'));
    mockRp.mockResolvedValue('');
    
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

  describe('Historical Metric Comparison', () => {
    it('should compare current metrics with historical averages', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations to simulate existing historical data
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Mock existing historical data
      const historicalMetrics = [
        { sharesCount: 45000000, price: 1200, aum: 54000000000 },
        { sharesCount: 47000000, price: 1250, aum: 58750000000 },
        { sharesCount: 49000000, price: 1300, aum: 63700000000 }
      ];
      
      // Track current metrics
      let currentMetrics: any = null;
      
      mockFs.promises.readFile.mockImplementation(async (filePath: string) => {
        if (typeof filePath === 'string' && filePath.includes('TRUR_historical.json')) {
          return JSON.stringify(historicalMetrics);
        }
        // For other files, return empty string or throw ENOENT
        const error = new Error('ENOENT: no such file or directory');
        (error as any).code = 'ENOENT';
        throw error;
      });
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('TRUR.json')) {
          currentMetrics = JSON.parse(data);
        }
        return undefined;
      });
      
      // Mock request-promise for current data
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
      
      // Collect current metrics
      await collectOnceForSymbols(['TRUR']);
      
      // Verify that current metrics were collected
      expect(currentMetrics).not.toBeNull();
      expect(currentMetrics.symbol).toBe('TRUR');
      expect(typeof currentMetrics.sharesCount).toBe('number');
      
      // Calculate historical averages
      const avgSharesCount = historicalMetrics.reduce((sum, m) => sum + m.sharesCount, 0) / historicalMetrics.length;
      const avgPrice = historicalMetrics.reduce((sum, m) => sum + m.price, 0) / historicalMetrics.length;
      const avgAum = historicalMetrics.reduce((sum, m) => sum + m.aum, 0) / historicalMetrics.length;
      
      // Compare current metrics with historical averages
      const sharesChangePct = ((currentMetrics.sharesCount - avgSharesCount) / avgSharesCount) * 100;
      const priceChangePct = ((currentMetrics.price - avgPrice) / avgPrice) * 100;
      const aumChangePct = ((currentMetrics.aum - avgAum) / avgAum) * 100;
      
      // Verify that comparison calculations are valid
      expect(typeof sharesChangePct).toBe('number');
      expect(typeof priceChangePct).toBe('number');
      expect(typeof aumChangePct).toBe('number');
      
      // Verify that values are finite
      expect(Number.isFinite(sharesChangePct)).toBe(true);
      expect(Number.isFinite(priceChangePct)).toBe(true);
      expect(Number.isFinite(aumChangePct)).toBe(true);
    });
    
    it('should detect anomalies in historical data patterns', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Track metrics for anomaly detection
      const metricsHistory: any[] = [];
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('TRUR.json')) {
          metricsHistory.push(JSON.parse(data));
        }
        return undefined;
      });
      
      // Mock request-promise to return data with an anomaly
      let callCount = 0;
      // Normal pattern with one anomalous value
      const dataWithAnomaly = [45000000, 46000000, 47000000, 100000000, 48000000, 49000000];
      
      mockRp.mockImplementation(async () => {
        const value = dataWithAnomaly[callCount] || 49000000;
        callCount = (callCount + 1) % dataWithAnomaly.length;
        
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
      
      // Collect metrics over time
      for (let i = 0; i < 6; i++) {
        await collectOnceForSymbols(['TRUR']);
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      
      // Verify we have the data
      expect(metricsHistory).toHaveLength(6);
      
      // Simple anomaly detection using standard deviation
      const sharesValues = metricsHistory.map(m => m.sharesCount);
      const mean = sharesValues.reduce((sum, val) => sum + val, 0) / sharesValues.length;
      const squaredDifferences = sharesValues.map(val => Math.pow(val - mean, 2));
      const variance = squaredDifferences.reduce((sum, val) => sum + val, 0) / sharesValues.length;
      const standardDeviation = Math.sqrt(variance);
      
      // Detect anomalies (values more than 2 standard deviations from mean)
      const anomalies: { index: number; value: number; zScore: number }[] = [];
      
      sharesValues.forEach((value, index) => {
        const zScore = Math.abs((value - mean) / standardDeviation);
        if (zScore > 2) { // 2 standard deviations threshold
          anomalies.push({
            index,
            value,
            zScore
          });
        }
      });
      
      // Verify that we detected the anomaly
      expect(anomalies.length).toBeGreaterThan(0);
      
      // Verify the anomaly details
      const anomaly = anomalies[0];
      expect(anomaly.value).toBe(100000000); // The anomalous value
      expect(anomaly.index).toBe(3); // Should be at index 3
      expect(anomaly.zScore).toBeGreaterThan(2);
    });
  });

  describe('Long-Term Data Storage and Validation', () => {
    it('should validate historical data integrity over time', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Track all written data for integrity validation
      const allWrittenData: { filePath: string; data: any; timestamp: Date }[] = [];
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        allWrittenData.push({
          filePath: filePath as string,
          data: JSON.parse(data),
          timestamp: new Date()
        });
        return undefined;
      });
      
      // Mock file stats to simulate file modification times
      const fileStats: Record<string, any> = {};
      mockFs.promises.stat.mockImplementation(async (filePath: string) => {
        if (typeof filePath === 'string') {
          if (!fileStats[filePath]) {
            fileStats[filePath] = { mtime: new Date() };
          }
          return fileStats[filePath];
        }
        return { mtime: new Date() };
      });
      
      // Mock request-promise
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
      
      // Collect metrics multiple times
      for (let i = 0; i < 3; i++) {
        await collectOnceForSymbols(['TRUR']);
        await new Promise(resolve => setTimeout(resolve, 100)); // Longer delay to simulate time passing
      }
      
      // Verify that data was written
      expect(allWrittenData).toHaveLength(3);
      
      // Validate data integrity for each written file
      allWrittenData.forEach((entry, index) => {
        // Verify file path structure
        expect(entry.filePath).toContain('TRUR.json');
        expect(entry.filePath).toContain('etf_metrics');
        
        // Verify data structure
        const data = entry.data;
        expect(data).toHaveProperty('symbol', 'TRUR');
        expect(data).toHaveProperty('timestamp');
        expect(data).toHaveProperty('sharesCount');
        expect(data).toHaveProperty('price');
        expect(data).toHaveProperty('marketCap');
        expect(data).toHaveProperty('aum');
        
        // Verify data types
        expect(typeof data.symbol).toBe('string');
        expect(typeof data.timestamp).toBe('string');
        expect(typeof data.sharesCount).toBe('number');
        expect(typeof data.price).toBe('number');
        expect(typeof data.marketCap).toBe('number');
        expect(typeof data.aum).toBe('number');
        
        // Verify positive values where expected
        expect(data.sharesCount).toBeGreaterThan(0);
        expect(data.price).toBeGreaterThan(0);
        expect(data.marketCap).toBeGreaterThan(0);
        
        // Verify calculated relationships
        const calculatedMarketCap = data.sharesCount * data.price;
        expect(data.marketCap).toBeCloseTo(calculatedMarketCap, 2);
      });
      
      // Verify that timestamps are sequential
      const timestamps = allWrittenData.map(entry => new Date(entry.data.timestamp).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });
    
    it('should handle large historical datasets efficiently', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Track performance metrics
      const writeTimes: number[] = [];
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        const startTime = performance.now();
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 1));
        const endTime = performance.now();
        writeTimes.push(endTime - startTime);
        return undefined;
      });
      
      // Mock request-promise for multiple symbols
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
      
      // Mock configLoader with many symbols
      const manySymbols = Array.from({ length: 15 }, (_, i) => `ETF${i + 1}`);
      const desiredWallet: Record<string, number> = {};
      manySymbols.forEach(symbol => {
        desiredWallet[symbol] = 100 / manySymbols.length;
      });
      
      mockConfigLoader.getAccountById.mockReturnValue({
        id: 'test-account-1',
        name: 'Test Account 1',
        t_invest_token: 't.test_token_1',
        account_id: '123456789',
        desired_wallet: desiredWallet,
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
      
      // Measure performance with large dataset
      const startTime = performance.now();
      await collectOnceForSymbols(manySymbols);
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Verify that all symbols were processed
      expect(mockFs.promises.writeFile).toHaveBeenCalledTimes(manySymbols.length);
      expect(mockRp).toHaveBeenCalledTimes(manySymbols.length);
      
      // Verify performance is acceptable (less than 3 seconds for 15 symbols)
      expect(totalTime).toBeLessThan(3000);
      
      // Verify individual write operations are efficient
      const avgWriteTime = writeTimes.reduce((sum, time) => sum + time, 0) / writeTimes.length;
      expect(avgWriteTime).toBeLessThan(100); // Average write time less than 100ms
    });
  });

  describe('Historical Data Edge Cases', () => {
    it('should handle corrupted historical data gracefully', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations with corrupted data
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Mock readFile to return corrupted data for some files
      mockFs.promises.readFile.mockImplementation(async (filePath: string) => {
        if (typeof filePath === 'string' && filePath.includes('TRUR_historical.json')) {
          // Return corrupted JSON
          return '{ invalid json content';
        } else if (typeof filePath === 'string' && filePath.includes('TMOS_historical.json')) {
          // Return valid but empty data
          return '[]';
        }
        // For other files, throw ENOENT
        const error = new Error('ENOENT: no such file or directory');
        (error as any).code = 'ENOENT';
        throw error;
      });
      
      // Track successfully written metrics
      let writtenMetrics: any = null;
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string' && filePath.includes('TRUR.json')) {
          writtenMetrics = JSON.parse(data);
        }
        return undefined;
      });
      
      // Mock request-promise
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
      
      // Collect metrics - should not throw even with corrupted historical data
      await expect(collectOnceForSymbols(['TRUR'])).resolves.toBeUndefined();
      
      // Verify that current metrics were still written successfully
      expect(writtenMetrics).not.toBeNull();
      expect(writtenMetrics.symbol).toBe('TRUR');
      expect(typeof writtenMetrics.sharesCount).toBe('number');
      expect(writtenMetrics.sharesCount).toBeGreaterThan(0);
    });
    
    it('should handle historical data with special characters', async () => {
      // Dynamically import the collectOnceForSymbols function
      const pollEtfMetricsModule = await import('../../tools/pollEtfMetrics');
      const collectOnceForSymbols = pollEtfMetricsModule.collectOnceForSymbols;
      
      // Mock file system operations
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      
      // Track written metrics with special characters
      const writtenMetrics: Record<string, any> = {};
      
      mockFs.promises.writeFile.mockImplementation(async (filePath: string, data: string) => {
        if (typeof filePath === 'string') {
          const fileName = path.basename(filePath, '.json');
          writtenMetrics[fileName] = JSON.parse(data);
        }
        return undefined;
      });
      
      // Mock request-promise for symbols with special characters
      mockRp.mockImplementation(async (options: any) => {
        const url = typeof options === 'string' ? options : options.uri || options.url;
        
        if (url && url.includes('T@GLD')) {
          return JSON.stringify({
            payload: {
              news: [
                {
                  id: 12345,
                  title: 'В фонд поступили новые деньги',
                  additional_fields: [
                    {
                      name: 'Общее количество паёв',
                      value: '25,000,000'
                    }
                  ]
                }
              ],
              meta: {
                cursor: null
              }
            }
          });
        } else if (url && url.includes('T#MOS')) {
          return JSON.stringify({
            payload: {
              news: [
                {
                  id: 67890,
                  title: 'В фонд поступили новые деньги',
                  additional_fields: [
                    {
                      name: 'Общее количество паёв',
                      value: '35,000,000'
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
        desired_wallet: { 'T@GLD': 40, 'T#MOS': 60 },
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
      
      // Collect metrics for symbols with special characters
      await collectOnceForSymbols(['T@GLD', 'T#MOS']);
      
      // Verify that metrics were written successfully
      expect(Object.keys(writtenMetrics)).toHaveLength(2);
      expect(writtenMetrics).toHaveProperty('T@GLD');
      expect(writtenMetrics).toHaveProperty('T#MOS');
      
      // Verify data integrity
      expect(writtenMetrics['T@GLD'].sharesCount).toBe(25000000);
      expect(writtenMetrics['T#MOS'].sharesCount).toBe(35000000);
      
      // Verify that file names are properly handled
      expect(typeof writtenMetrics['T@GLD'].symbol).toBe('string');
      expect(typeof writtenMetrics['T#MOS'].symbol).toBe('string');
    });
  });
});