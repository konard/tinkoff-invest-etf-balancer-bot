import { mock } from "bun:test";

// Mock file system operations to prevent real file access and permission errors
const mockFs = {
  promises: {
    readFile: mock(async () => ''),
    writeFile: mock(async () => undefined),
    access: mock(async () => undefined),
    mkdir: mock(async () => undefined),
    readdir: mock(async () => [])
  }
};

const mockPath = {
  resolve: mock((...args: string[]) => args.join('/')),
  join: mock((...args: string[]) => args.join('/')),
  dirname: mock((p: string) => p.split('/').slice(0, -1).join('/')),
  basename: mock((p: string, ext?: string) => {
    const name = p.split('/').pop() || p;
    return ext ? name.replace(new RegExp(ext.replace('.', '\\.') + '$'), '') : name;
  })
};

export const setupMocks = () => {
  // Mock the modules
  mock.module('fs', () => ({
    ...mockFs,
    promises: mockFs.promises
  }));

  // Mock node:fs specifically
  mock.module('node:fs', () => ({
    default: {
      promises: mockFs.promises
    },
    promises: mockFs.promises
  }));

  mock.module('path', () => mockPath);

  // Mock node:path specifically
  mock.module('node:path', () => ({
    default: mockPath,
    ...mockPath
  }));

  // Mock request-promise for HTTP requests
  const mockRp = mock(async () => '');

  mock.module('request-promise', () => ({
    default: mockRp,
    ...mockRp
  }));

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

  // Mock utils module
  mock.module('../../utils', () => ({
    normalizeTicker: mock((ticker: string) => ticker)
  }));

  // Mock etfCap module
  mock.module('../../tools/etfCap', () => ({
    getFxRateToRub: mock(async () => 100),
    getEtfMarketCapRUB: mock(async () => ({ lastPriceRUB: 100, figi: 'test-figi', uid: 'test-uid' })),
    buildAumMapSmart: mock(async () => ({}))
  }));

  // Mock dotenv
  mock.module('dotenv', () => ({
    config: mock(() => undefined)
  }));

  // Mock dotenv/config specifically
  mock.module('dotenv/config', () => ({}));

  // Mock debug
  const mockDebugFunction = mock(() => ({}));
  mockDebugFunction.extend = mock(() => mockDebugFunction);

  mock.module('debug', () => ({
    default: mock(() => mockDebugFunction)
  }));

  // Mock tinkoff-sdk-grpc-js
  mock.module('tinkoff-sdk-grpc-js', () => ({
    TinkoffInvestApi: mock(() => ({})),
    createSdk: mock(() => ({})),
    SdkApi: mock(() => ({}))
  }));

  // Mock lodash
  mock.module('lodash', () => ({
    default: {},
    ...Object.fromEntries(['map', 'filter', 'find', 'reduce', 'forEach', 'groupBy', 'sortBy', 'uniq', 'flatten', 'isEqual', 'cloneDeep'].map(fn => [fn, mock(() => [])]))
  }));

  // Mock uniqid
  mock.module('uniqid', () => mock(() => 'test-unique-id'));

  // Mock nice-grpc
  mock.module('nice-grpc', () => ({
    createChannel: mock(() => ({})),
    createClient: mock(() => ({}))
  }));

  return { mockFs, mockPath, mockConfigLoader, mockRp };
};