import { mock } from "bun:test";

// Mock modules first, before any other imports
export const mockFs = {
  promises: {
    readFile: mock(async () => ''),
    writeFile: mock(async () => undefined),
    access: mock(async () => undefined),
    mkdir: mock(async () => undefined),
    readdir: mock(async () => [])
  }
};

export const mockPath = {
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
export const mockRp = mock(async () => '');

mock.module('request-promise', () => ({
  default: mockRp
}));

// Mock configLoader
export const mockConfigLoader = {
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

// Mock etfCap module
export const mockGetEtfMarketCapRUB = mock(async (symbol: string) => ({
  figi: `BBG_${symbol}`,
  uid: `UID_${symbol}`,
  lastPriceRUB: 100.0,
  ticker: symbol
}));

export const mockGetFxRateToRub = mock(async (currency: string) => {
  if (currency === 'USD') return 100;
  if (currency === 'EUR') return 110;
  return 1;
});

export const mockBuildAumMapSmart = mock(async () => ({}));

mock.module('../../tools/etfCap', () => ({
  getEtfMarketCapRUB: mockGetEtfMarketCapRUB,
  getFxRateToRub: mockGetFxRateToRub,
  buildAumMapSmart: mockBuildAumMapSmart
}));

// Mock process.exit to prevent tests from exiting the process
export const mockProcessExit = mock((code?: number) => {
  throw new Error(`Process would exit with code ${code}`);
});

// Store original values
export const originalProcessExit = process.exit;
export const originalProcessArgv = process.argv;
export const originalEnv = process.env;

// Test utilities
export function setupTestEnvironment() {
  // Setup mocks
  mockFs.promises.readFile.mockClear();
  mockFs.promises.writeFile.mockClear();
  mockFs.promises.access.mockClear();
  mockFs.promises.mkdir.mockClear();
  mockFs.promises.readdir.mockClear();
  mockPath.resolve.mockClear();
  mockPath.join.mockClear();
  mockPath.dirname.mockClear();
  mockRp.mockClear();
  mockConfigLoader.getAccountById.mockClear();
  mockConfigLoader.loadConfig.mockClear();
  mockConfigLoader.getAllAccounts.mockClear();
  mockGetEtfMarketCapRUB.mockClear();
  mockGetFxRateToRub.mockClear();
  mockBuildAumMapSmart.mockClear();

  // Mock process.exit
  process.exit = mockProcessExit as any;

  // Set up test workspace to use a temp directory that's writable
  const testWorkspace = '/tmp/test-workspace';
  process.cwd = () => testWorkspace;

  // Set default mock responses
  mockFs.promises.readFile.mockResolvedValue('');
  mockFs.promises.writeFile.mockResolvedValue(undefined);
  mockFs.promises.access.mockResolvedValue(undefined);
  mockFs.promises.mkdir.mockResolvedValue(undefined);
  mockFs.promises.readdir.mockResolvedValue([]);
  mockPath.resolve.mockImplementation((...args: string[]) => {
    // Handle etf_metrics directory resolution
    if (args.length === 2 && args[1] === 'etf_metrics') {
      return `${args[0]}/etf_metrics`;
    }
    return args.join('/');
  });
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

  // Set default mock responses for etfCap
  mockGetEtfMarketCapRUB.mockImplementation(async (symbol: string) => ({
    figi: `BBG_${symbol}`,
    uid: `UID_${symbol}`,
    lastPriceRUB: 100.0,
    ticker: symbol
  }));

  mockGetFxRateToRub.mockImplementation(async (currency: string) => {
    if (currency === 'USD') return 100;
    if (currency === 'EUR') return 110;
    return 1;
  });

  mockBuildAumMapSmart.mockResolvedValue({
    TRUR: { amount: 1000000000, currency: 'RUB' },
    TMOS: { amount: 500000000, currency: 'RUB' },
    TGLD: { amount: 300000000, currency: 'RUB' }
  });

  return testWorkspace;
}

export function teardownTestEnvironment() {
  // Restore process.exit
  process.exit = originalProcessExit;
  process.argv = originalProcessArgv;
  process.env = originalEnv;
  process.cwd = originalProcessArgv.includes('pollEtfMetrics.ts') ? () => process.argv[1] : () => '.';
}