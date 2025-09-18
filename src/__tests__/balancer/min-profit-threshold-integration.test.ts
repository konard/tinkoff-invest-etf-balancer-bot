import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ConfigLoader } from '../../configLoader';
import { Position, Wallet, AccountConfig } from '../../types.d';
import * as buyRequiresModule from '../../utils/buyRequiresTotalMarginalSell';

// Mock provider module
mock.module('../../provider', () => ({
  getLastPrice: async () => ({ units: 100, nano: 0 }),
  generateOrders: async () => {},
  generateOrdersSequential: async () => {},
}));

// Set up global variables required by balancer
beforeEach(() => {
  // Mock global INSTRUMENTS
  (global as any).INSTRUMENTS = [
    { ticker: 'TMOS', figi: 'BBG000000001', lot: 1, name: 'Test MOS' },
    { ticker: 'TCSG', figi: 'BBG000000002', lot: 1, name: 'Test CSG' },
    { ticker: 'SBER', figi: 'BBG000000003', lot: 1, name: 'Test SBER' },
  ];

  // Set test environment
  process.env.NODE_ENV = 'test';
});

describe('Min Profit Threshold - Unit Tests', () => {
  describe('calculatePositionProfit', () => {
    it('should calculate profit correctly with threshold', () => {
      const position: Position = {
        base: 'TMOS',
        quote: 'RUB',
        figi: 'BBG000000001',
        amount: 10,
        lotSize: 1,
        priceNumber: 125,
        lotPriceNumber: 125,
        totalPriceNumber: 1250,
        averagePositionPriceFifoNumber: 100,
        averagePositionPriceNumber: 100,
      } as Position;

      // Test with 20% threshold
      const result = buyRequiresModule.calculatePositionProfit(position, 20);
      expect(result).not.toBeNull();
      expect(result?.profitPercent).toBe(25); // 25% profit
      expect(result?.meetsThreshold).toBe(true); // 25% > 20%
    });

    it('should reject positions below threshold', () => {
      const position: Position = {
        base: 'TCSG',
        quote: 'RUB',
        figi: 'BBG000000002',
        amount: 10,
        lotSize: 1,
        priceNumber: 110,
        lotPriceNumber: 110,
        totalPriceNumber: 1100,
        averagePositionPriceFifoNumber: 100,
        averagePositionPriceNumber: 100,
      } as Position;

      // Test with 20% threshold
      const result = buyRequiresModule.calculatePositionProfit(position, 20);
      expect(result).not.toBeNull();
      expect(result?.profitPercent).toBe(10); // 10% profit
      expect(result?.meetsThreshold).toBe(false); // 10% < 20%
    });

    it('should handle negative thresholds (stop-loss)', () => {
      const position: Position = {
        base: 'SBER',
        quote: 'RUB',
        figi: 'BBG000000003',
        amount: 10,
        lotSize: 1,
        priceNumber: 95,
        lotPriceNumber: 95,
        totalPriceNumber: 950,
        averagePositionPriceFifoNumber: 100,
        averagePositionPriceNumber: 100,
      } as Position;

      // Test with -10% threshold (stop-loss)
      const result = buyRequiresModule.calculatePositionProfit(position, -10);
      expect(result).not.toBeNull();
      expect(result?.profitPercent).toBe(-5); // -5% loss
      expect(result?.meetsThreshold).toBe(true); // -5% > -10%
    });

    it('should handle exactly meeting threshold', () => {
      const position: Position = {
        base: 'TMOS',
        quote: 'RUB',
        figi: 'BBG000000001',
        amount: 10,
        lotSize: 1,
        priceNumber: 110,
        lotPriceNumber: 110,
        totalPriceNumber: 1100,
        averagePositionPriceFifoNumber: 100,
        averagePositionPriceNumber: 100,
      } as Position;

      // Test with 10% threshold
      const result = buyRequiresModule.calculatePositionProfit(position, 10);
      expect(result).not.toBeNull();
      expect(result?.profitPercent).toBe(10); // 10% profit
      expect(result?.meetsThreshold).toBe(true); // 10% >= 10%
    });

    it('should handle missing profit data', () => {
      const position: Position = {
        base: 'TMOS',
        quote: 'RUB',
        figi: 'BBG000000001',
        amount: 10,
        lotSize: 1,
        priceNumber: 110,
        lotPriceNumber: 110,
        totalPriceNumber: 1100,
        // No averagePositionPrice data
      } as Position;

      const result = buyRequiresModule.calculatePositionProfit(position, 10);
      expect(result).toBeNull();
    });
  });

  describe('identifyProfitablePositions', () => {
    let wallet: Wallet;

    beforeEach(() => {
      wallet = [
        {
          base: 'RUB',
          quote: 'RUB',
          figi: '',
          amount: 10000,
          lotSize: 1,
          priceNumber: 1,
          lotPriceNumber: 1,
          totalPriceNumber: 10000,
        } as Position,
        {
          base: 'TMOS',
          quote: 'RUB',
          figi: 'BBG000000001',
          amount: 10,
          lotSize: 1,
          priceNumber: 125,
          lotPriceNumber: 125,
          totalPriceNumber: 1250,
          averagePositionPriceFifoNumber: 100,
          averagePositionPriceNumber: 100,
        } as Position,
        {
          base: 'TCSG',
          quote: 'RUB',
          figi: 'BBG000000002',
          amount: 10,
          lotSize: 1,
          priceNumber: 110,
          lotPriceNumber: 110,
          totalPriceNumber: 1100,
          averagePositionPriceFifoNumber: 100,
          averagePositionPriceNumber: 100,
        } as Position,
        {
          base: 'SBER',
          quote: 'RUB',
          figi: 'BBG000000003',
          amount: 10,
          lotSize: 1,
          priceNumber: 95,
          lotPriceNumber: 95,
          totalPriceNumber: 950,
          averagePositionPriceFifoNumber: 100,
          averagePositionPriceNumber: 100,
        } as Position,
      ];
    });

    it('should filter positions by profit threshold', () => {
      const config = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell' as const,
        },
        min_buy_rebalance_percent: 0.1,
      };

      // With 20% threshold - only TMOS should be profitable enough
      const result = buyRequiresModule.identifyProfitablePositions(wallet, config, 20);
      expect(result).toHaveLength(1);
      expect(result[0].base).toBe('TMOS');
    });

    it('should include all profitable positions when no threshold', () => {
      const config = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell' as const,
        },
        min_buy_rebalance_percent: 0.1,
      };

      // Without threshold - TMOS and TCSG should be included (both profitable)
      const result = buyRequiresModule.identifyProfitablePositions(wallet, config);
      expect(result).toHaveLength(2);
      expect(result.map(p => p.base)).toContain('TMOS');
      expect(result.map(p => p.base)).toContain('TCSG');
    });

    it('should handle negative threshold (stop-loss)', () => {
      const config = {
        enabled: true,
        instruments: ['TMON'],
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell' as const,
        },
        min_buy_rebalance_percent: 0.1,
      };

      // With -10% threshold - only profitable positions are included
      // The function only identifies PROFITABLE positions, even with negative threshold
      const result = buyRequiresModule.identifyProfitablePositions(wallet, config, -10);
      expect(result).toHaveLength(2); // Only TMOS and TCSG are profitable
    });
  });

  describe('identifyPositionsForSelling', () => {
    let wallet: Wallet;

    beforeEach(() => {
      wallet = [
        {
          base: 'RUB',
          quote: 'RUB',
          figi: '',
          amount: 10000,
          lotSize: 1,
          priceNumber: 1,
          lotPriceNumber: 1,
          totalPriceNumber: 10000,
        } as Position,
        {
          base: 'TMOS',
          quote: 'RUB',
          figi: 'BBG000000001',
          amount: 10,
          lotSize: 1,
          priceNumber: 125,
          lotPriceNumber: 125,
          totalPriceNumber: 1250,
          averagePositionPriceFifoNumber: 100,
          averagePositionPriceNumber: 100,
        } as Position,
        {
          base: 'TCSG',
          quote: 'RUB',
          figi: 'BBG000000002',
          amount: 10,
          lotSize: 1,
          priceNumber: 110,
          lotPriceNumber: 110,
          totalPriceNumber: 1100,
          averagePositionPriceFifoNumber: 100,
          averagePositionPriceNumber: 100,
        } as Position,
      ];
    });

    it('should apply threshold to only_positive_positions_sell mode', () => {
      const config = {
        enabled: true,
        instruments: [], // Empty instruments list so nothing is excluded
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'only_positive_positions_sell' as const,
        },
        min_buy_rebalance_percent: 0.1,
      };

      // With 15% threshold
      const result = buyRequiresModule.identifyPositionsForSelling(wallet, config, 'only_positive_positions_sell', 15);
      expect(result).toHaveLength(1);
      expect(result[0].base).toBe('TMOS'); // Only TMOS has 25% profit > 15%
    });

    it('should apply threshold to equal_in_percents mode', () => {
      const config = {
        enabled: true,
        instruments: [], // Empty instruments list so nothing is excluded
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'equal_in_percents' as const,
        },
        min_buy_rebalance_percent: 0.1,
      };

      // With 5% threshold
      const result = buyRequiresModule.identifyPositionsForSelling(wallet, config, 'equal_in_percents', 5);
      expect(result).toHaveLength(2);
      // Both TMOS (25%) and TCSG (10%) meet 5% threshold
      expect(result.map(p => p.base)).toContain('TMOS');
      expect(result.map(p => p.base)).toContain('TCSG');
    });

    it('should include all positions when no threshold in equal_in_percents mode', () => {
      const config = {
        enabled: true,
        instruments: [], // Empty instruments list so nothing is excluded
        allow_to_sell_others_positions_to_buy_non_marginal_positions: {
          mode: 'equal_in_percents' as const,
        },
        min_buy_rebalance_percent: 0.1,
      };

      const result = buyRequiresModule.identifyPositionsForSelling(wallet, config, 'equal_in_percents');
      expect(result).toHaveLength(2); // All non-RUB positions
    });
  });
});

describe('Min Profit Threshold - Config Validation', () => {
  let configLoader: ConfigLoader;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    ConfigLoader.resetInstance();
    configLoader = ConfigLoader.getInstance();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should accept valid positive threshold values', () => {
    const config = {
      accounts: [
        {
          id: 'test',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account',
          desired_wallet: { TMOS: 100 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          min_profit_percent_for_close_position: 10,
        },
      ],
    };

    expect(() => configLoader['validateConfig'](config)).not.toThrow();
  });

  it('should accept valid negative threshold values (stop-loss)', () => {
    const config = {
      accounts: [
        {
          id: 'test',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account',
          desired_wallet: { TMOS: 100 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          min_profit_percent_for_close_position: -5,
        },
      ],
    };

    expect(() => configLoader['validateConfig'](config)).not.toThrow();
  });

  it('should accept zero threshold value', () => {
    const config = {
      accounts: [
        {
          id: 'test',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account',
          desired_wallet: { TMOS: 100 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          min_profit_percent_for_close_position: 0,
        },
      ],
    };

    expect(() => configLoader['validateConfig'](config)).not.toThrow();
  });

  it('should reject non-numeric threshold values', () => {
    const config = {
      accounts: [
        {
          id: 'test',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account',
          desired_wallet: { TMOS: 100 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          min_profit_percent_for_close_position: 'invalid' as any,
        },
      ],
    };

    expect(() => configLoader['validateConfig'](config)).toThrow(/must be a number/);
  });

  it('should reject infinite values', () => {
    const config = {
      accounts: [
        {
          id: 'test',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account',
          desired_wallet: { TMOS: 100 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          min_profit_percent_for_close_position: Infinity,
        },
      ],
    };

    expect(() => configLoader['validateConfig'](config)).toThrow(/must be a finite number/);
  });

  it('should reject values below -100%', () => {
    const config = {
      accounts: [
        {
          id: 'test',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account',
          desired_wallet: { TMOS: 100 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          min_profit_percent_for_close_position: -101,
        },
      ],
    };

    expect(() => configLoader['validateConfig'](config)).toThrow(/must be between -100 and 1000/);
  });

  it('should reject values above 1000%', () => {
    const config = {
      accounts: [
        {
          id: 'test',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account',
          desired_wallet: { TMOS: 100 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          min_profit_percent_for_close_position: 1001,
        },
      ],
    };

    expect(() => configLoader['validateConfig'](config)).toThrow(/must be between -100 and 1000/);
  });

  it('should work without threshold (undefined)', () => {
    const config = {
      accounts: [
        {
          id: 'test',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account',
          desired_wallet: { TMOS: 100 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          // min_profit_percent_for_close_position not specified
        },
      ],
    };

    expect(() => configLoader['validateConfig'](config)).not.toThrow();
  });
});