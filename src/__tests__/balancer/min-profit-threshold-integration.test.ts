import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { balancer, getAccountConfig } from '../../balancer';
import { ConfigLoader } from '../../configLoader';
import { Position, Wallet } from '../../types.d';

// Mock the provider functions
const mockProvider = {
  getLastPrice: () => Promise.resolve({ units: 120, nano: 0 }),
  generateOrders: () => Promise.resolve(),
  generateOrdersSequential: () => Promise.resolve(),
};

// Mock global INSTRUMENTS
(global as any).INSTRUMENTS = [
  {
    ticker: 'TMOS',
    figi: 'BBG000000001',
    lot: 1,
  },
  {
    ticker: 'TCSG',
    figi: 'BBG000000002',
    lot: 1,
  },
  {
    ticker: 'SBER',
    figi: 'BBG000000003',
    lot: 1,
  },
];

describe('Balancer Integration - min_profit_percent_for_close_position', () => {
  let mockWallet: Wallet;
  let originalAccountId: string | undefined;

  beforeEach(() => {
    ConfigLoader.resetInstance();
    originalAccountId = process.env.ACCOUNT_ID;

    // Mock wallet with profitable and losing positions
    mockWallet = [
      {
        base: 'RUB',
        quote: 'RUB',
        figi: '',
        amount: 10000,
        lotSize: 1,
        priceNumber: 1,
        lotPriceNumber: 1,
        totalPriceNumber: 10000,
      },
      {
        base: 'TMOS',
        quote: 'RUB',
        figi: 'BBG000000001',
        amount: 100,
        lotSize: 1,
        priceNumber: 150,
        lotPriceNumber: 150,
        totalPriceNumber: 15000,
        averagePositionPriceFifoNumber: 120, // 25% profit
        toBuyLots: -50, // Planned to sell 50 lots
        toBuyNumber: -7500,
      },
      {
        base: 'TCSG',
        quote: 'RUB',
        figi: 'BBG000000002',
        amount: 50,
        lotSize: 1,
        priceNumber: 110,
        lotPriceNumber: 110,
        totalPriceNumber: 5500,
        averagePositionPriceFifoNumber: 100, // 10% profit
        toBuyLots: -25, // Planned to sell 25 lots
        toBuyNumber: -2750,
      },
      {
        base: 'SBER',
        quote: 'RUB',
        figi: 'BBG000000003',
        amount: 200,
        lotSize: 1,
        priceNumber: 95,
        lotPriceNumber: 95,
        totalPriceNumber: 19000,
        averagePositionPriceFifoNumber: 100, // -5% loss
        toBuyLots: -100, // Planned to sell 100 lots
        toBuyNumber: -9500,
      },
    ];
  });

  afterEach(() => {
    ConfigLoader.resetInstance();
    if (originalAccountId !== undefined) {
      process.env.ACCOUNT_ID = originalAccountId;
    } else {
      delete process.env.ACCOUNT_ID;
    }
  });

  describe('Without min_profit_percent_for_close_position', () => {
    it('should allow all selling orders when threshold is not configured', async () => {
      process.env.ACCOUNT_ID = 'test-no-threshold';
      process.env.NODE_ENV = 'test';

      const desiredWallet = { TMOS: 40, TCSG: 30, SBER: 30 };

      const result = await balancer(mockWallet, desiredWallet, [], 'manual', true);

      // Should not filter out any selling orders
      const sellOrders = result.ordersPlanned?.filter(p => (p.toBuyLots || 0) < 0) || [];
      expect(sellOrders).toHaveLength(3); // All 3 positions should be sellable
    });
  });

  describe('With positive min_profit_percent_for_close_position threshold', () => {
    it('should filter out positions that do not meet 20% profit threshold', async () => {
      process.env.ACCOUNT_ID = 'test-threshold-20';
      process.env.NODE_ENV = 'test';

      // Mock account config with 20% threshold
      const getAccountConfigSpy = spyOn(require('../../balancer'), 'getAccountConfig')
        .mockReturnValue({
          id: 'test-threshold-20',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account-id',
          desired_wallet: { TMOS: 40, TCSG: 30, SBER: 30 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 10000, max_margin_size: 0, balancing_strategy: 'keep' },
          exchange_closure_behavior: { mode: 'skip_iteration', update_iteration_result: false },
          min_profit_percent_for_close_position: 20 // 20% threshold
        });

      const desiredWallet = { TMOS: 40, TCSG: 30, SBER: 30 };

      const result = await balancer(mockWallet, desiredWallet, [], 'manual', true);

      // Check which positions have their sell orders cancelled
      const tmos = result.ordersPlanned?.find(p => p.base === 'TMOS');
      const tcsg = result.ordersPlanned?.find(p => p.base === 'TCSG');
      const sber = result.ordersPlanned?.find(p => p.base === 'SBER');

      // TMOS: 25% profit -> should be allowed to sell
      expect(tmos?.toBuyLots).toBeLessThan(0);

      // TCSG: 10% profit -> should be blocked (below 20% threshold)
      expect(tcsg?.toBuyLots).toBe(0);

      // SBER: -5% loss -> should be blocked (below 20% threshold)
      expect(sber?.toBuyLots).toBe(0);

      getAccountConfigSpy.mockRestore();
    });

    it('should filter out positions that do not meet 15% profit threshold', async () => {
      process.env.ACCOUNT_ID = 'test-threshold-15';
      process.env.NODE_ENV = 'test';

      const getAccountConfigSpy = spyOn(require('../../balancer'), 'getAccountConfig')
        .mockReturnValue({
          id: 'test-threshold-15',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account-id',
          desired_wallet: { TMOS: 40, TCSG: 30, SBER: 30 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 10000, max_margin_size: 0, balancing_strategy: 'keep' },
          exchange_closure_behavior: { mode: 'skip_iteration', update_iteration_result: false },
          min_profit_percent_for_close_position: 15 // 15% threshold
        });

      const desiredWallet = { TMOS: 40, TCSG: 30, SBER: 30 };

      const result = await balancer(mockWallet, desiredWallet, [], 'manual', true);

      const tmos = result.ordersPlanned?.find(p => p.base === 'TMOS');
      const tcsg = result.ordersPlanned?.find(p => p.base === 'TCSG');
      const sber = result.ordersPlanned?.find(p => p.base === 'SBER');

      // TMOS: 25% profit -> should be allowed to sell
      expect(tmos?.toBuyLots).toBeLessThan(0);

      // TCSG: 10% profit -> should be blocked (below 15% threshold)
      expect(tcsg?.toBuyLots).toBe(0);

      // SBER: -5% loss -> should be blocked (below 15% threshold)
      expect(sber?.toBuyLots).toBe(0);

      getAccountConfigSpy.mockRestore();
    });

    it('should allow positions that exactly meet the threshold', async () => {
      process.env.ACCOUNT_ID = 'test-threshold-exact';
      process.env.NODE_ENV = 'test';

      // Create wallet with position that has exactly 10% profit
      const walletWithExactProfit: Wallet = [
        {
          base: 'RUB',
          quote: 'RUB',
          figi: '',
          amount: 10000,
          lotSize: 1,
          priceNumber: 1,
          lotPriceNumber: 1,
          totalPriceNumber: 10000,
        },
        {
          base: 'TMOS',
          quote: 'RUB',
          figi: 'BBG000000001',
          amount: 100,
          lotSize: 1,
          priceNumber: 110,
          lotPriceNumber: 110,
          totalPriceNumber: 11000,
          averagePositionPriceFifoNumber: 100, // Exactly 10% profit
          toBuyLots: -50,
          toBuyNumber: -5500,
        },
      ];

      const getAccountConfigSpy = spyOn(require('../../balancer'), 'getAccountConfig')
        .mockReturnValue({
          id: 'test-threshold-exact',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account-id',
          desired_wallet: { TMOS: 100 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 10000, max_margin_size: 0, balancing_strategy: 'keep' },
          exchange_closure_behavior: { mode: 'skip_iteration', update_iteration_result: false },
          min_profit_percent_for_close_position: 10 // Exactly 10% threshold
        });

      const desiredWallet = { TMOS: 100 };

      const result = await balancer(walletWithExactProfit, desiredWallet, [], 'manual', true);

      const tmos = result.ordersPlanned?.find(p => p.base === 'TMOS');

      // Should be allowed to sell (10% >= 10%)
      expect(tmos?.toBuyLots).toBeLessThan(0);

      getAccountConfigSpy.mockRestore();
    });
  });

  describe('With negative min_profit_percent_for_close_position (stop-loss)', () => {
    it('should allow selling positions with losses within the stop-loss limit', async () => {
      process.env.ACCOUNT_ID = 'test-stop-loss';
      process.env.NODE_ENV = 'test';

      // Create wallet with positions at various loss levels
      const walletWithLosses: Wallet = [
        {
          base: 'RUB',
          quote: 'RUB',
          figi: '',
          amount: 10000,
          lotSize: 1,
          priceNumber: 1,
          lotPriceNumber: 1,
          totalPriceNumber: 10000,
        },
        {
          base: 'TMOS',
          quote: 'RUB',
          figi: 'BBG000000001',
          amount: 100,
          lotSize: 1,
          priceNumber: 97,
          lotPriceNumber: 97,
          totalPriceNumber: 9700,
          averagePositionPriceFifoNumber: 100, // -3% loss (within -5% limit)
          toBuyLots: -50,
          toBuyNumber: -4850,
        },
        {
          base: 'TCSG',
          quote: 'RUB',
          figi: 'BBG000000002',
          amount: 50,
          lotSize: 1,
          priceNumber: 90,
          lotPriceNumber: 90,
          totalPriceNumber: 4500,
          averagePositionPriceFifoNumber: 100, // -10% loss (exceeds -5% limit)
          toBuyLots: -25,
          toBuyNumber: -2250,
        },
      ];

      const getAccountConfigSpy = spyOn(require('../../balancer'), 'getAccountConfig')
        .mockReturnValue({
          id: 'test-stop-loss',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account-id',
          desired_wallet: { TMOS: 50, TCSG: 50 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 10000, max_margin_size: 0, balancing_strategy: 'keep' },
          exchange_closure_behavior: { mode: 'skip_iteration', update_iteration_result: false },
          min_profit_percent_for_close_position: -5 // Allow up to 5% loss
        });

      const desiredWallet = { TMOS: 50, TCSG: 50 };

      const result = await balancer(walletWithLosses, desiredWallet, [], 'manual', true);

      const tmos = result.ordersPlanned?.find(p => p.base === 'TMOS');
      const tcsg = result.ordersPlanned?.find(p => p.base === 'TCSG');

      // TMOS: -3% loss -> should be allowed to sell (within -5% limit)
      expect(tmos?.toBuyLots).toBeLessThan(0);

      // TCSG: -10% loss -> should be blocked (exceeds -5% limit)
      expect(tcsg?.toBuyLots).toBe(0);

      getAccountConfigSpy.mockRestore();
    });
  });

  describe('Integration with buy_requires_total_marginal_sell', () => {
    it('should apply threshold to buy_requires_total_marginal_sell selling decisions', async () => {
      process.env.ACCOUNT_ID = 'test-buy-requires-with-threshold';
      process.env.NODE_ENV = 'test';

      const getAccountConfigSpy = spyOn(require('../../balancer'), 'getAccountConfig')
        .mockReturnValue({
          id: 'test-buy-requires-with-threshold',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account-id',
          desired_wallet: { TMOS: 30, TCSG: 30, TGLD: 40 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 10000, max_margin_size: 0, balancing_strategy: 'keep' },
          exchange_closure_behavior: { mode: 'skip_iteration', update_iteration_result: false },
          min_profit_percent_for_close_position: 15, // 15% threshold
          buy_requires_total_marginal_sell: {
            enabled: true,
            instruments: ['TGLD'],
            allow_to_sell_others_positions_to_buy_non_marginal_positions: {
              mode: 'only_positive_positions_sell'
            },
            min_buy_rebalance_percent: 0.5
          }
        });

      // Add TGLD position that needs buying
      const walletWithTGLD: Wallet = [
        ...mockWallet,
        {
          base: 'TGLD',
          quote: 'RUB',
          figi: 'BBG000000004',
          amount: 0,
          lotSize: 1,
          priceNumber: 200,
          lotPriceNumber: 200,
          totalPriceNumber: 0,
          toBuyLots: 20, // Need to buy TGLD
          toBuyNumber: 4000,
        },
      ];

      const desiredWallet = { TMOS: 30, TCSG: 30, TGLD: 40 };

      const result = await balancer(walletWithTGLD, desiredWallet, [], 'manual', true);

      // Should apply threshold to selling decisions for funding TGLD purchases
      // Only TMOS (25% profit) should be available for selling to fund TGLD
      // TCSG (10% profit) and SBER (-5% loss) should be blocked

      const sellOrders = result.ordersPlanned?.filter(p => (p.toBuyLots || 0) < 0) || [];

      // Should only sell positions that meet the 15% threshold
      const allowedSellPositions = sellOrders.filter(p => p.base === 'TMOS');
      expect(allowedSellPositions).toHaveLength(1);

      getAccountConfigSpy.mockRestore();
    });
  });

  describe('Edge cases', () => {
    it('should handle positions without profit data gracefully', async () => {
      process.env.ACCOUNT_ID = 'test-no-profit-data';
      process.env.NODE_ENV = 'test';

      const walletWithoutProfitData: Wallet = [
        {
          base: 'RUB',
          quote: 'RUB',
          figi: '',
          amount: 10000,
          lotSize: 1,
          priceNumber: 1,
          lotPriceNumber: 1,
          totalPriceNumber: 10000,
        },
        {
          base: 'TMOS',
          quote: 'RUB',
          figi: 'BBG000000001',
          amount: 100,
          lotSize: 1,
          priceNumber: 150,
          lotPriceNumber: 150,
          totalPriceNumber: 15000,
          // No averagePositionPriceFifoNumber or averagePositionPriceNumber
          toBuyLots: -50,
          toBuyNumber: -7500,
        },
      ];

      const getAccountConfigSpy = spyOn(require('../../balancer'), 'getAccountConfig')
        .mockReturnValue({
          id: 'test-no-profit-data',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account-id',
          desired_wallet: { TMOS: 100 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 10000, max_margin_size: 0, balancing_strategy: 'keep' },
          exchange_closure_behavior: { mode: 'skip_iteration', update_iteration_result: false },
          min_profit_percent_for_close_position: 10
        });

      const desiredWallet = { TMOS: 100 };

      const result = await balancer(walletWithoutProfitData, desiredWallet, [], 'manual', true);

      const tmos = result.ordersPlanned?.find(p => p.base === 'TMOS');

      // Should block selling when profit data is not available
      expect(tmos?.toBuyLots).toBe(0);

      getAccountConfigSpy.mockRestore();
    });

    it('should not affect buy orders', async () => {
      process.env.ACCOUNT_ID = 'test-buy-orders-unaffected';
      process.env.NODE_ENV = 'test';

      const walletWithBuyOrders: Wallet = [
        {
          base: 'RUB',
          quote: 'RUB',
          figi: '',
          amount: 20000,
          lotSize: 1,
          priceNumber: 1,
          lotPriceNumber: 1,
          totalPriceNumber: 20000,
        },
        {
          base: 'TMOS',
          quote: 'RUB',
          figi: 'BBG000000001',
          amount: 50,
          lotSize: 1,
          priceNumber: 150,
          lotPriceNumber: 150,
          totalPriceNumber: 7500,
          toBuyLots: 50, // Planned to buy more
          toBuyNumber: 7500,
        },
      ];

      const getAccountConfigSpy = spyOn(require('../../balancer'), 'getAccountConfig')
        .mockReturnValue({
          id: 'test-buy-orders-unaffected',
          name: 'Test Account',
          t_invest_token: 'test-token',
          account_id: 'test-account-id',
          desired_wallet: { TMOS: 100 },
          desired_mode: 'manual',
          balance_interval: 3600,
          sleep_between_orders: 1000,
          margin_trading: { enabled: false, multiplier: 1, free_threshold: 10000, max_margin_size: 0, balancing_strategy: 'keep' },
          exchange_closure_behavior: { mode: 'skip_iteration', update_iteration_result: false },
          min_profit_percent_for_close_position: 50 // Very high threshold
        });

      const desiredWallet = { TMOS: 100 };

      const result = await balancer(walletWithBuyOrders, desiredWallet, [], 'manual', true);

      const tmos = result.ordersPlanned?.find(p => p.base === 'TMOS');

      // Buy orders should not be affected by profit threshold
      expect(tmos?.toBuyLots).toBeGreaterThan(0);

      getAccountConfigSpy.mockRestore();
    });
  });
});