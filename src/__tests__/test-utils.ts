/**
 * Test utilities and helper functions
 * Provides common testing patterns, setup, and assertion helpers
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { 
  Wallet, 
  Position, 
  DesiredWallet, 
  AccountConfig, 
  MarginPosition,
  TinkoffNumber,
  EnhancedBalancerResult 
} from '../../types.d';

import { mockTinkoffSDKControls } from './__mocks__/tinkoff-sdk';
import { mockControls } from './__mocks__/external-deps';

// Mock Date.now for consistent testing
const originalDateNow = Date.now;
let mockNow = 1641024000000; // 2022-01-01T12:00:00Z

const mockDateNow = () => mockNow;

/**
 * Test environment setup and teardown
 */
export class TestEnvironment {
  static setup() {
    // Reset all mocks before each test
    mockTinkoffSDKControls.reset();
    mockControls.resetAll();
    
    // Set consistent test environment
    process.env.NODE_ENV = 'test';
    process.env.DEBUG = '';
    
    // Mock Date.now for consistent timestamps
    Date.now = mockDateNow;
  }
  
  static teardown() {
    // Restore Date.now
    Date.now = originalDateNow;
    
    // Reset environment variables
    delete process.env.NODE_ENV;
    delete process.env.DEBUG;
  }
  
  static setupTest(testSuite: string) {
    describe(testSuite, () => {
      beforeEach(() => {
        TestEnvironment.setup();
      });
      
      afterEach(() => {
        TestEnvironment.teardown();
      });
    });
  }
}

/**
 * Custom assertions for portfolio and financial data
 */
export class FinancialAssertions {
  /**
   * Assert that portfolio allocation matches expected percentages within tolerance
   */
  static expectPortfolioBalance(
    wallet: Wallet, 
    expected: DesiredWallet, 
    tolerance: number = 1.0
  ) {
    const totalValue = wallet.reduce((sum, pos) => sum + (pos.totalPriceNumber || 0), 0);
    
    Object.entries(expected).forEach(([ticker, expectedPercent]) => {
      const position = wallet.find(pos => pos.base === ticker);
      expect(position).toBeDefined();
      
      const actualPercent = ((position?.totalPriceNumber || 0) / totalValue) * 100;
      expect(actualPercent).toBeCloseTo(expectedPercent, tolerance);
    });
  }
  
  /**
   * Assert that TinkoffNumber values are equal
   */
  static expectTinkoffNumberEqual(
    actual: TinkoffNumber, 
    expected: TinkoffNumber, 
    tolerance: number = 0.01
  ) {
    const actualValue = actual.units + actual.nano / 1e9;
    const expectedValue = expected.units + expected.nano / 1e9;
    expect(actualValue).toBeCloseTo(expectedValue, tolerance);
  }
  
  /**
   * Assert that wallet has expected total value
   */
  static expectWalletValue(wallet: Wallet, expectedValue: number, tolerance: number = 0.01) {
    const totalValue = wallet.reduce((sum, pos) => sum + (pos.totalPriceNumber || 0), 0);
    expect(totalValue).toBeCloseTo(expectedValue, tolerance);
  }
  
  /**
   * Assert that margin position is valid
   */
  static expectValidMarginPosition(position: MarginPosition) {
    expect(position.isMargin).toBe(true);
    expect(position.marginValue).toBeGreaterThan(0);
    expect(position.leverage).toBeGreaterThanOrEqual(1);
    expect(position.leverage).toBeLessThanOrEqual(4);
  }
  
  /**
   * Assert that desired wallet percentages sum to 100%
   */
  static expectNormalizedDesiredWallet(desired: DesiredWallet, tolerance: number = 0.01) {
    const total = Object.values(desired).reduce((sum, percent) => sum + percent, 0);
    expect(total).toBeCloseTo(100, tolerance);
  }
  
  /**
   * Assert that enhanced balancer result is valid
   */
  static expectValidBalancerResult(result: EnhancedBalancerResult) {
    expect(result.finalPercents).toBeDefined();
    expect(result.modeUsed).toBeDefined();
    expect(result.positionMetrics).toBeDefined();
    expect(result.totalPortfolioValue).toBeGreaterThan(0);
    
    // Verify percentages sum to 100%
    this.expectNormalizedDesiredWallet(result.finalPercents);
    
    // If margin info exists, validate it
    if (result.marginInfo) {
      expect(result.marginInfo.totalMarginUsed).toBeGreaterThanOrEqual(0);
      expect(result.marginInfo.withinLimits).toBeDefined();
    }
  }
}

/**
 * Test data factories for creating consistent test objects
 */
export class TestDataFactory {
  /**
   * Create a mock position with default values
   */
  static createPosition(overrides: Partial<Position> = {}): Position {
    const defaults: Position = {
      base: "TRUR",
      figi: "BBG004S68614",
      amount: 1000,
      lotSize: 10,
      price: { units: 100, nano: 0 },
      priceNumber: 100,
      lotPrice: { units: 1000, nano: 0 },
      lotPriceNumber: 1000,
      totalPrice: { units: 100000, nano: 0 },
      totalPriceNumber: 100000,
      toBuyLots: 0,
    };
    
    return { ...defaults, ...overrides };
  }
  
  /**
   * Create a mock wallet with specified positions
   */
  static createWallet(positions: Partial<Position>[]): Wallet {
    return positions.map(pos => this.createPosition(pos));
  }
  
  /**
   * Create a mock account configuration
   */
  static createAccountConfig(overrides: Partial<AccountConfig> = {}): AccountConfig {
    const defaults: AccountConfig = {
      id: "test-account",
      name: "Test Account",
      t_invest_token: "t.test_token",
      account_id: "123456789",
      desired_wallet: { TRUR: 50, TMOS: 50 },
      desired_mode: 'manual',
      balance_interval: 3600,
      sleep_between_orders: 1000,
      margin_trading: {
        enabled: false,
        multiplier: 1,
        free_threshold: 10000,
        max_margin_size: 0,
        balancing_strategy: 'remove',
      },
      exchange_closure_behavior: {
        mode: 'skip_iteration',
        update_iteration_result: false,
      },
    };
    
    return { ...defaults, ...overrides };
  }
  
  /**
   * Create a balanced portfolio for testing
   */
  static createBalancedPortfolio(totalValue: number = 400000): Wallet {
    const valuePerAsset = totalValue / 4;
    
    return [
      this.createPosition({
        base: "TRUR",
        figi: "BBG004S68614",
        amount: valuePerAsset / 100,
        priceNumber: 100,
        totalPriceNumber: valuePerAsset,
      }),
      this.createPosition({
        base: "TMOS",
        figi: "BBG004S68B31",
        amount: valuePerAsset / 200,
        priceNumber: 200,
        totalPriceNumber: valuePerAsset,
      }),
      this.createPosition({
        base: "TGLD",
        figi: "BBG004S687G5",
        amount: valuePerAsset / 500,
        priceNumber: 500,
        totalPriceNumber: valuePerAsset,
      }),
      this.createPosition({
        base: "RUB",
        figi: "RUB000UTSTOM",
        amount: valuePerAsset,
        priceNumber: 1,
        totalPriceNumber: valuePerAsset,
      }),
    ];
  }
}

/**
 * Performance testing utilities
 */
export class PerformanceTestUtils {
  /**
   * Measure execution time of a function
   */
  static async measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; timeMs: number }> {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    
    return {
      result,
      timeMs: end - start,
    };
  }
  
  /**
   * Assert that function executes within time limit
   */
  static async expectExecutionTime<T>(
    fn: () => Promise<T>, 
    maxTimeMs: number
  ): Promise<T> {
    const { result, timeMs } = await this.measureTime(fn);
    expect(timeMs).toBeLessThan(maxTimeMs);
    return result;
  }
  
  /**
   * Run performance test with multiple iterations
   */
  static async runPerformanceTest(
    fn: () => Promise<void>,
    iterations: number = 10
  ): Promise<{ avgTimeMs: number; minTimeMs: number; maxTimeMs: number }> {
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const { timeMs } = await this.measureTime(fn);
      times.push(timeMs);
    }
    
    return {
      avgTimeMs: times.reduce((sum, time) => sum + time, 0) / times.length,
      minTimeMs: Math.min(...times),
      maxTimeMs: Math.max(...times),
    };
  }
}

/**
 * Mock data generators for testing
 */
export class MockDataGenerator {
  /**
   * Generate random price within range
   */
  static randomPrice(min: number = 50, max: number = 500): TinkoffNumber {
    const price = Math.random() * (max - min) + min;
    const units = Math.floor(price);
    const nano = Math.floor((price - units) * 1e9);
    
    return { units, nano };
  }
  
  /**
   * Generate random portfolio with specified size
   */
  static randomPortfolio(size: number = 5): Wallet {
    const tickers = ['TRUR', 'TMOS', 'TGLD', 'TRAY', 'TRND', 'TLCB', 'TOFZ', 'TBRU', 'TMON', 'TITR'];
    
    return Array.from({ length: size }, (_, i) => {
      const ticker = tickers[i % tickers.length];
      const price = this.randomPrice();
      const amount = Math.floor(Math.random() * 1000) + 100;
      
      return TestDataFactory.createPosition({
        base: ticker,
        figi: `BBG${String(i).padStart(9, '0')}`,
        amount,
        price,
        priceNumber: price.units + price.nano / 1e9,
        totalPriceNumber: amount * (price.units + price.nano / 1e9),
      });
    });
  }
  
  /**
   * Generate random desired wallet
   */
  static randomDesiredWallet(tickers: string[]): DesiredWallet {
    const weights = tickers.map(() => Math.random());
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    
    const desired: DesiredWallet = {};
    tickers.forEach((ticker, i) => {
      desired[ticker] = (weights[i] / totalWeight) * 100;
    });
    
    return desired;
  }
}

/**
 * Test scenario builder for complex test cases
 */
export class TestScenarioBuilder {
  private scenario: {
    wallet?: Wallet;
    desired?: DesiredWallet;
    config?: AccountConfig;
    marketData?: Record<string, any>;
    expectations?: any[];
  } = {};
  
  withWallet(wallet: Wallet): this {
    this.scenario.wallet = wallet;
    return this;
  }
  
  withDesired(desired: DesiredWallet): this {
    this.scenario.desired = desired;
    return this;
  }
  
  withConfig(config: AccountConfig): this {
    this.scenario.config = config;
    return this;
  }
  
  withMarketData(data: Record<string, any>): this {
    this.scenario.marketData = data;
    return this;
  }
  
  expectResult(assertion: (result: any) => void): this {
    if (!this.scenario.expectations) {
      this.scenario.expectations = [];
    }
    this.scenario.expectations.push(assertion);
    return this;
  }
  
  build() {
    return this.scenario;
  }
  
  static create(): TestScenarioBuilder {
    return new TestScenarioBuilder();
  }
}

/**
 * Error testing utilities
 */
export class ErrorTestUtils {
  /**
   * Test that function throws expected error
   */
  static async expectError<T>(
    fn: () => Promise<T>, 
    expectedError: string | RegExp
  ): Promise<void> {
    let thrownError: Error | null = null;
    
    try {
      await fn();
    } catch (error) {
      thrownError = error as Error;
    }
    
    expect(thrownError).toBeDefined();
    if (typeof expectedError === 'string') {
      expect(thrownError!.message).toContain(expectedError);
    } else {
      expect(thrownError!.message).toMatch(expectedError);
    }
  }
  
  /**
   * Test error handling with retry logic
   */
  static async testRetryLogic<T>(
    fn: (attempt: number) => Promise<T>,
    maxRetries: number = 3
  ): Promise<void> {
    let lastError: Error | null = null;
    let result: T | undefined = undefined;
    let success = false;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        result = await fn(attempt);
        success = true;
        break;
      } catch (error) {
        lastError = error as Error;
        // Continue to next attempt if not the last one
        if (attempt < maxRetries) {
          continue;
        }
      }
    }
    
    if (success) {
      expect(result).toBeDefined();
    } else {
      throw lastError || new Error('Unknown error occurred');
    }
  }
}

/**
 * Integration test helpers
 */
export class IntegrationTestUtils {
  /**
   * Setup integration test environment
   */
  static setupIntegrationTest() {
    // Configure mocks for integration testing
    mockTinkoffSDKControls.setSuccess();
    mockControls.fs.setSuccess();
    mockControls.network.setSuccess();
    mockControls.puppeteer.setSuccess();
  }
  
  /**
   * Test full workflow with assertions
   */
  static async testWorkflow<T>(
    workflow: () => Promise<T>,
    assertions: ((result: T) => void)[]
  ): Promise<T> {
    this.setupIntegrationTest();
    
    const result = await workflow();
    
    assertions.forEach(assertion => assertion(result));
    
    return result;
  }
}

// Export test suite helpers
export const testSuite = (name: string, tests: () => void) => {
  describe(name, () => {
    beforeEach(() => {
      TestEnvironment.setup();
    });
    
    afterEach(() => {
      TestEnvironment.teardown();
    });
    
    tests();
  });
};

export const asyncTest = (name: string, test: () => Promise<void>) => {
  it(name, async () => {
    await test();
  });
};

export const performanceTest = (
  name: string, 
  test: () => Promise<void>, 
  maxTimeMs: number
) => {
  it(name, async () => {
    await PerformanceTestUtils.expectExecutionTime(test, maxTimeMs);
  });
};

// Export all utilities as default
export default {
  TestEnvironment,
  FinancialAssertions,
  TestDataFactory,
  PerformanceTestUtils,
  MockDataGenerator,
  TestScenarioBuilder,
  ErrorTestUtils,
  IntegrationTestUtils,
  testSuite,
  asyncTest,
  performanceTest,
};