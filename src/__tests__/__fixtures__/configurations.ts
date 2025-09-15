import { 
  AccountConfig, 
  ProjectConfig, 
  DesiredWallet, 
  DesiredMode, 
  AccountMarginConfig,
  ExchangeClosureBehavior,
  ExchangeClosureMode 
} from '../../types.d';

/**
 * Test fixtures for configuration data
 * Used across multiple test suites for configuration testing
 */

// Valid margin configurations
export const mockMarginConfigs: Record<string, AccountMarginConfig> = {
  disabled: {
    enabled: false,
    multiplier: 1,
    free_threshold: 10000,
    max_margin_size: 0,
    balancing_strategy: 'remove',
  },
  
  conservative: {
    enabled: true,
    multiplier: 1.5,
    free_threshold: 50000,
    max_margin_size: 100000,
    balancing_strategy: 'keep_if_small',
  },
  
  aggressive: {
    enabled: true,
    multiplier: 3,
    free_threshold: 20000,
    max_margin_size: 500000,
    balancing_strategy: 'keep',
  },
  
  maximum: {
    enabled: true,
    multiplier: 4,
    free_threshold: 100000,
    max_margin_size: 1000000,
    balancing_strategy: 'keep',
  },
};

// Exchange closure behavior configurations
export const mockExchangeClosureConfigs: Record<string, ExchangeClosureBehavior> = {
  skip: {
    mode: 'skip_iteration',
    update_iteration_result: false,
  },
  
  force: {
    mode: 'force_orders',
    update_iteration_result: true,
  },
  
  dryRun: {
    mode: 'dry_run',
    update_iteration_result: true,
  },
};

// Valid desired wallet configurations
export const mockDesiredWallets: Record<string, DesiredWallet> = {
  balanced: {
    TRUR: 25,
    TMOS: 25,
    TGLD: 25,
    RUB: 25,
  },
  
  etfOnly: {
    TRUR: 40,
    TMOS: 30,
    TGLD: 20,
    TRAY: 10,
  },
  
  simple: {
    TRUR: 50,
    TMOS: 50,
  },
  
  single: {
    TRUR: 100,
  },
  
  complex: {
    TRUR: 15,
    TMOS: 15,
    TGLD: 15,
    TRAY: 15,
    TLCB: 10,
    TOFZ: 10,
    TBRU: 10,
    TMON: 5,
    TITR: 5,
  },
};

// Valid account configurations
export const mockAccountConfigs: Record<string, AccountConfig> = {
  basic: {
    id: "test-account-1",
    name: "Test Account 1",
    t_invest_token: "t.test_token_123",
    account_id: "123456789",
    desired_wallet: mockDesiredWallets.balanced,
    desired_mode: 'manual',
    balance_interval: 3600,
    sleep_between_orders: 1000,
    margin_trading: mockMarginConfigs.disabled,
    exchange_closure_behavior: mockExchangeClosureConfigs.skip,
  },
  
  withMargin: {
    id: "test-account-2",
    name: "Test Account 2 (Margin)",
    t_invest_token: "t.test_token_456",
    account_id: "987654321",
    desired_wallet: mockDesiredWallets.etfOnly,
    desired_mode: 'marketcap',
    balance_interval: 1800,
    sleep_between_orders: 2000,
    margin_trading: mockMarginConfigs.conservative,
    exchange_closure_behavior: mockExchangeClosureConfigs.dryRun,
  },
  
  aggressive: {
    id: "test-account-3",
    name: "Test Account 3 (Aggressive)",
    t_invest_token: "t.test_token_789",
    account_id: "456789123",
    desired_wallet: mockDesiredWallets.complex,
    desired_mode: 'decorrelation',
    balance_interval: 900,
    sleep_between_orders: 500,
    margin_trading: mockMarginConfigs.aggressive,
    exchange_closure_behavior: mockExchangeClosureConfigs.force,
  },
  
  minimal: {
    id: "test-account-4",
    name: "Minimal Account",
    t_invest_token: "t.minimal_token",
    account_id: "999999999",
    desired_wallet: mockDesiredWallets.single,
    desired_mode: 'manual',
    balance_interval: 3600,
    sleep_between_orders: 1000,
    margin_trading: mockMarginConfigs.disabled,
    exchange_closure_behavior: mockExchangeClosureConfigs.skip,
  },
};

// Valid project configurations
export const mockProjectConfigs: Record<string, ProjectConfig> = {
  singleAccount: {
    accounts: [mockAccountConfigs.basic],
  },
  
  multiAccount: {
    accounts: [
      mockAccountConfigs.basic,
      mockAccountConfigs.withMargin,
      mockAccountConfigs.aggressive,
    ],
  },
  
  empty: {
    accounts: [],
  },
};

// Invalid configurations for error testing
export const invalidConfigs = {
  // Missing required fields
  missingToken: {
    id: "invalid-1",
    name: "Invalid Account",
    // t_invest_token: missing
    account_id: "123456789",
    desired_wallet: mockDesiredWallets.balanced,
    desired_mode: 'manual' as DesiredMode,
    balance_interval: 3600,
    sleep_between_orders: 1000,
    margin_trading: mockMarginConfigs.disabled,
    exchange_closure_behavior: mockExchangeClosureConfigs.skip,
  },
  
  missingAccountId: {
    id: "invalid-2",
    name: "Invalid Account 2",
    t_invest_token: "t.test_token",
    // account_id: missing
    desired_wallet: mockDesiredWallets.balanced,
    desired_mode: 'manual' as DesiredMode,
    balance_interval: 3600,
    sleep_between_orders: 1000,
    margin_trading: mockMarginConfigs.disabled,
    exchange_closure_behavior: mockExchangeClosureConfigs.skip,
  },
  
  // Invalid values
  invalidMarginMultiplier: {
    ...mockAccountConfigs.basic,
    margin_trading: {
      enabled: true,
      multiplier: 5, // Invalid: > 4
      free_threshold: 10000,
      max_margin_size: 100000,
      balancing_strategy: 'keep' as const,
    },
  },
  
  invalidDesiredMode: {
    ...mockAccountConfigs.basic,
    desired_mode: 'invalid_mode' as DesiredMode,
  },
  
  negativeInterval: {
    ...mockAccountConfigs.basic,
    balance_interval: -1000,
  },
  
  invalidExchangeBehavior: {
    ...mockAccountConfigs.basic,
    exchange_closure_behavior: {
      mode: 'invalid_mode' as ExchangeClosureMode,
      update_iteration_result: true,
    },
  },
  
  // Empty desired wallet
  emptyDesiredWallet: {
    ...mockAccountConfigs.basic,
    desired_wallet: {},
  },
  
  // Desired wallet with negative values
  negativeDesiredWallet: {
    ...mockAccountConfigs.basic,
    desired_wallet: {
      TRUR: -50,
      TMOS: 150,
    },
  },
};

// Environment variable configurations
export const mockEnvConfigs = {
  complete: {
    DEBUG: "bot:*",
    NODE_ENV: "test",
    CONFIG_PATH: "./CONFIG.test.json",
    T_INVEST_TOKEN: "t.test_token_env",
    ACCOUNT_ID: "env_account_123",
  },
  
  minimal: {
    T_INVEST_TOKEN: "t.minimal_env_token",
  },
  
  production: {
    NODE_ENV: "production",
    DEBUG: "",
    CONFIG_PATH: "./CONFIG.json",
  },
};

// Config file contents for testing file loading
export const mockConfigFiles = {
  valid: JSON.stringify(mockProjectConfigs.multiAccount, null, 2),
  
  invalid_json: '{ "accounts": [ invalid json }',
  
  empty_file: '',
  
  valid_single: JSON.stringify(mockProjectConfigs.singleAccount, null, 2),
  
  // Legacy format for backward compatibility testing
  legacy: JSON.stringify({
    "0": {
      token: "t.legacy_token",
      account_id: "legacy_account",
      desired: mockDesiredWallets.balanced,
    },
  }, null, 2),
};

// Configuration validation test cases
export const validationTestCases = {
  requiredFields: [
    'id',
    'name', 
    't_invest_token',
    'account_id',
    'desired_wallet',
    'desired_mode',
    'balance_interval',
    'sleep_between_orders',
    'margin_trading',
    'exchange_closure_behavior',
  ],
  
  marginValidation: {
    validMultipliers: [1, 1.5, 2, 3, 4],
    invalidMultipliers: [0, -1, 4.1, 10],
    validThresholds: [0, 1000, 50000, 100000],
    invalidThresholds: [-1, -1000],
    validStrategies: ['remove', 'keep', 'keep_if_small'],
    invalidStrategies: ['invalid', '', null],
  },
  
  desiredModeValidation: {
    validModes: ['manual', 'default', 'marketcap_aum', 'marketcap', 'aum', 'decorrelation'],
    invalidModes: ['invalid', '', null, 'market_cap', 'manual_mode'],
  },
  
  exchangeClosureValidation: {
    validModes: ['skip_iteration', 'force_orders', 'dry_run'],
    invalidModes: ['skip', 'force', 'invalid', '', null],
  },
};

// Default configuration values
export const defaultValues = {
  balance_interval: 3600,
  sleep_between_orders: 1000,
  margin_trading: mockMarginConfigs.disabled,
  exchange_closure_behavior: mockExchangeClosureConfigs.skip,
  desired_mode: 'manual' as DesiredMode,
};

// Migration test data (for testing config format changes)
export const migrationTestData = {
  v1_to_v2: {
    old: {
      "0": {
        token: "t.old_token",
        account_id: "old_account",
        desired: { TRUR: 50, TMOS: 50 },
      },
    },
    expected: {
      accounts: [{
        id: "0",
        name: "Account 0",
        t_invest_token: "t.old_token",
        account_id: "old_account",
        desired_wallet: { TRUR: 50, TMOS: 50 },
        desired_mode: 'manual',
        ...defaultValues,
      }],
    },
  },
};