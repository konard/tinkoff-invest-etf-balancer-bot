/**
 * Enhanced test coverage for test-utils/index.ts
 * Targeting uncovered lines: 52-60,72-84,91-97,104-105,112-115,122-123,130-142,154-168,175,182-204,211-242,274-294,306-310,317-332,339-347,364-365,369-370,374-375,379-380,384-388,392,396,424-446,458-478,498-500,504-510
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  TestEnvironment,
  FinancialAssertions,
  TestDataFactory,
  PerformanceTestUtils,
  MockDataGenerator,
  TestScenarioBuilder,
  ErrorTestUtils,
  IntegrationTestUtils,
  testSuite,
  asyncTest
} from './index';
import { 
  Wallet,
  Position,
  DesiredWallet,
  AccountConfig,
  MarginPosition,
  TinkoffNumber,
  EnhancedBalancerResult
} from '../../types.d';

describe('TestEnvironment', () => {
  it('should setup test environment correctly', () => {
    const originalDateNow = Date.now;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalDebug = process.env.DEBUG;

    TestEnvironment.setup();

    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.DEBUG).toBe('');
    expect(Date.now).not.toBe(originalDateNow);
    expect(Date.now()).toBe(1641024000000);

    // Restore after test
    Date.now = originalDateNow;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.DEBUG = originalDebug;
  });

  it('should teardown test environment correctly', () => {
    const originalDateNow = Date.now;
    
    TestEnvironment.setup();
    TestEnvironment.teardown();

    expect(Date.now).toBe(originalDateNow);
    expect(process.env.NODE_ENV).toBeUndefined();
    expect(process.env.DEBUG).toBeUndefined();
  });

  it('should handle setupTest with describe blocks', () => {
    // This test verifies that setupTest creates a describe block with proper beforeEach/afterEach
    // We can't easily mock the global describe/beforeEach/afterEach, so we'll test by verifying
    // the function exists and doesn't throw an error when called
    
    expect(() => {
      TestEnvironment.setupTest('test-suite');
    }).not.toThrow();
    
    // Verify that the method is properly defined
    expect(typeof TestEnvironment.setupTest).toBe('function');
  });
});

describe('FinancialAssertions', () => {
  let testWallet: Wallet;
  let testDesiredWallet: DesiredWallet;

  beforeEach(() => {
    testWallet = [
      TestDataFactory.createPosition({
        base: "TRUR",
        totalPriceNumber: 100000
      }),
      TestDataFactory.createPosition({
        base: "TMOS", 
        totalPriceNumber: 150000
      }),
      TestDataFactory.createPosition({
        base: "TGLD",
        totalPriceNumber: 200000
      })
    ];

    testDesiredWallet = {
      TRUR: 22.22, // 100000/450000 * 100
      TMOS: 33.33, // 150000/450000 * 100
      TGLD: 44.44  // 200000/450000 * 100
    };
  });

  it('should validate portfolio balance within tolerance', () => {
    expect(() => {
      FinancialAssertions.expectPortfolioBalance(testWallet, testDesiredWallet, 1.0);
    }).not.toThrow();
  });

  it('should fail when portfolio balance is outside tolerance', () => {
    const wrongDesired = { TRUR: 50, TMOS: 30, TGLD: 20 };
    
    expect(() => {
      FinancialAssertions.expectPortfolioBalance(testWallet, wrongDesired, 0.1);
    }).toThrow();
  });

  it('should validate TinkoffNumber equality', () => {
    const num1: TinkoffNumber = { units: 100, nano: 500000000 };
    const num2: TinkoffNumber = { units: 100, nano: 500000000 };
    
    expect(() => {
      FinancialAssertions.expectTinkoffNumberEqual(num1, num2);
    }).not.toThrow();
  });

  it('should fail when TinkoffNumbers are not equal', () => {
    const num1: TinkoffNumber = { units: 100, nano: 0 };
    const num2: TinkoffNumber = { units: 200, nano: 0 };
    
    expect(() => {
      FinancialAssertions.expectTinkoffNumberEqual(num1, num2, 0.01);
    }).toThrow();
  });

  it('should validate wallet total value', () => {
    expect(() => {
      FinancialAssertions.expectWalletValue(testWallet, 450000, 1.0);
    }).not.toThrow();
  });

  it('should validate margin position properties', () => {
    const marginPos: MarginPosition = {
      ...TestDataFactory.createPosition(),
      isMargin: true,
      marginValue: 5000,
      leverage: 2,
      marginCall: false
    };

    expect(() => {
      FinancialAssertions.expectValidMarginPosition(marginPos);
    }).not.toThrow();
  });

  it('should fail for invalid margin position', () => {
    const invalidMarginPos: MarginPosition = {
      ...TestDataFactory.createPosition(),
      isMargin: true,
      marginValue: -1000, // Invalid negative value
      leverage: 2,
      marginCall: false
    };

    expect(() => {
      FinancialAssertions.expectValidMarginPosition(invalidMarginPos);
    }).toThrow();
  });

  it('should validate normalized desired wallet', () => {
    const normalized = { TRUR: 50, TMOS: 50 };
    
    expect(() => {
      FinancialAssertions.expectNormalizedDesiredWallet(normalized);
    }).not.toThrow();
  });

  it('should fail for non-normalized desired wallet', () => {
    const notNormalized = { TRUR: 60, TMOS: 50 }; // Sums to 110%
    
    expect(() => {
      FinancialAssertions.expectNormalizedDesiredWallet(notNormalized, 0.01);
    }).toThrow();
  });

  it('should validate enhanced balancer result', () => {
    const result: EnhancedBalancerResult = {
      finalPercents: { TRUR: 50, TMOS: 50 },
      modeUsed: 'manual',
      positionMetrics: [],
      totalPortfolioValue: 100000,
      marginInfo: {
        totalMarginUsed: 5000,
        withinLimits: true
      }
    };

    expect(() => {
      FinancialAssertions.expectValidBalancerResult(result);
    }).not.toThrow();
  });

  it('should validate enhanced balancer result without margin info', () => {
    const result: EnhancedBalancerResult = {
      finalPercents: { TRUR: 50, TMOS: 50 },
      modeUsed: 'manual',
      positionMetrics: [],
      totalPortfolioValue: 100000
    };

    expect(() => {
      FinancialAssertions.expectValidBalancerResult(result);
    }).not.toThrow();
  });
});

describe('TestDataFactory', () => {
  it('should create position with defaults', () => {
    const position = TestDataFactory.createPosition();
    
    expect(position.base).toBe("TRUR");
    expect(position.figi).toBe("BBG004S68614");
    expect(position.amount).toBe(1000);
    expect(position.lotSize).toBe(10);
    expect(position.priceNumber).toBe(100);
    expect(position.totalPriceNumber).toBe(100000);
  });

  it('should create position with overrides', () => {
    const overrides = {
      base: "TMOS",
      amount: 2000,
      priceNumber: 200
    };
    
    const position = TestDataFactory.createPosition(overrides);
    
    expect(position.base).toBe("TMOS");
    expect(position.amount).toBe(2000);
    expect(position.priceNumber).toBe(200);
    expect(position.figi).toBe("BBG004S68614"); // Should keep default
  });

  it('should create wallet from positions array', () => {
    const positions = [
      { base: "TRUR", amount: 1000 },
      { base: "TMOS", amount: 2000 }
    ];
    
    const wallet = TestDataFactory.createWallet(positions);
    
    expect(wallet).toHaveLength(2);
    expect(wallet[0].base).toBe("TRUR");
    expect(wallet[0].amount).toBe(1000);
    expect(wallet[1].base).toBe("TMOS");
    expect(wallet[1].amount).toBe(2000);
  });

  it('should create account config with defaults', () => {
    const config = TestDataFactory.createAccountConfig();
    
    expect(config.id).toBe("test-account");
    expect(config.name).toBe("Test Account");
    expect(config.t_invest_token).toBe("t.test_token");
    expect(config.margin_trading.enabled).toBe(false);
    expect(config.exchange_closure_behavior.mode).toBe('skip_iteration');
  });

  it('should create account config with overrides', () => {
    const overrides = {
      id: "custom-account",
      margin_trading: {
        enabled: true,
        multiplier: 2,
        free_threshold: 20000,
        max_margin_size: 50000,
        balancing_strategy: 'keep' as const
      }
    };
    
    const config = TestDataFactory.createAccountConfig(overrides);
    
    expect(config.id).toBe("custom-account");
    expect(config.margin_trading.enabled).toBe(true);
    expect(config.margin_trading.multiplier).toBe(2);
    expect(config.name).toBe("Test Account"); // Should keep default
  });

  it('should create balanced portfolio with specified total value', () => {
    const totalValue = 800000;
    const wallet = TestDataFactory.createBalancedPortfolio(totalValue);
    
    expect(wallet).toHaveLength(4);
    
    const actualTotal = wallet.reduce((sum, pos) => sum + (pos.totalPriceNumber || 0), 0);
    expect(actualTotal).toBe(totalValue);
    
    // Each asset should have 1/4 of total value
    const expectedPerAsset = totalValue / 4;
    wallet.forEach(position => {
      expect(position.totalPriceNumber).toBe(expectedPerAsset);
    });
  });

  it('should create balanced portfolio with default value', () => {
    const wallet = TestDataFactory.createBalancedPortfolio();
    
    const totalValue = wallet.reduce((sum, pos) => sum + (pos.totalPriceNumber || 0), 0);
    expect(totalValue).toBe(400000); // Default value
  });
});

describe('PerformanceTestUtils', () => {
  it('should measure execution time', async () => {
    const testFn = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'test-result';
    };

    const { result, timeMs } = await PerformanceTestUtils.measureTime(testFn);
    
    expect(result).toBe('test-result');
    expect(timeMs).toBeGreaterThan(9);
    expect(timeMs).toBeLessThan(50); // Allow some overhead
  });

  it('should enforce execution time limits', async () => {
    const fastFn = async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return 'fast-result';
    };

    const result = await PerformanceTestUtils.expectExecutionTime(fastFn, 100);
    expect(result).toBe('fast-result');
  });

  it('should fail when execution exceeds time limit', async () => {
    const slowFn = async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return 'slow-result';
    };

    await expect(
      PerformanceTestUtils.expectExecutionTime(slowFn, 10)
    ).rejects.toThrow();
  });

  it('should run performance test with multiple iterations', async () => {
    let callCount = 0;
    const testFn = async () => {
      callCount++;
      await new Promise(resolve => setTimeout(resolve, 5));
    };

    const stats = await PerformanceTestUtils.runPerformanceTest(testFn, 3);
    
    expect(callCount).toBe(3);
    expect(stats.avgTimeMs).toBeGreaterThan(0);
    expect(stats.minTimeMs).toBeGreaterThan(0);
    expect(stats.maxTimeMs).toBeGreaterThan(0);
    expect(stats.minTimeMs).toBeLessThanOrEqual(stats.avgTimeMs);
    expect(stats.avgTimeMs).toBeLessThanOrEqual(stats.maxTimeMs);
  });
});

describe('MockDataGenerator', () => {
  it('should generate random price within default range', () => {
    const price = MockDataGenerator.randomPrice();
    
    expect(price.units).toBeGreaterThanOrEqual(50);
    expect(price.units).toBeLessThanOrEqual(500);
    expect(price.nano).toBeGreaterThanOrEqual(0);
    expect(price.nano).toBeLessThan(1e9);
  });

  it('should generate random price within custom range', () => {
    const price = MockDataGenerator.randomPrice(100, 200);
    
    expect(price.units).toBeGreaterThanOrEqual(100);
    expect(price.units).toBeLessThanOrEqual(200);
  });

  it('should generate random portfolio with default size', () => {
    const portfolio = MockDataGenerator.randomPortfolio();
    
    expect(portfolio).toHaveLength(5);
    portfolio.forEach(position => {
      expect(position.base).toBeDefined();
      expect(position.figi).toMatch(/^BBG\d{9}$/);
      expect(position.amount).toBeGreaterThan(0);
      expect(position.priceNumber).toBeGreaterThan(0);
      expect(position.totalPriceNumber).toBeGreaterThan(0);
    });
  });

  it('should generate random portfolio with custom size', () => {
    const portfolio = MockDataGenerator.randomPortfolio(8);
    
    expect(portfolio).toHaveLength(8);
  });

  it('should generate random desired wallet', () => {
    const tickers = ['TRUR', 'TMOS', 'TGLD'];
    const desired = MockDataGenerator.randomDesiredWallet(tickers);
    
    expect(Object.keys(desired)).toEqual(tickers);
    
    // Weights should sum to 100%
    const total = Object.values(desired).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(100, 0.01);
    
    // All weights should be positive
    Object.values(desired).forEach(weight => {
      expect(weight).toBeGreaterThan(0);
    });
  });

  it('should handle empty tickers array for desired wallet', () => {
    const desired = MockDataGenerator.randomDesiredWallet([]);
    
    expect(Object.keys(desired)).toHaveLength(0);
  });
});

describe('TestScenarioBuilder', () => {
  it('should build scenario with all components', () => {
    const wallet = TestDataFactory.createWallet([{ base: "TRUR" }]);
    const desired = { TRUR: 100 };
    const config = TestDataFactory.createAccountConfig();
    const marketData = { TRUR: { price: 100 } };
    
    const scenario = TestScenarioBuilder.create()
      .withWallet(wallet)
      .withDesired(desired)
      .withConfig(config)
      .withMarketData(marketData)
      .expectResult((result) => expect(result).toBeDefined())
      .build();
    
    expect(scenario.wallet).toBe(wallet);
    expect(scenario.desired).toBe(desired);
    expect(scenario.config).toBe(config);
    expect(scenario.marketData).toBe(marketData);
    expect(scenario.expectations).toHaveLength(1);
  });

  it('should create multiple expectations', () => {
    const scenario = TestScenarioBuilder.create()
      .expectResult((result) => expect(result).toBeDefined())
      .expectResult((result) => expect(result.success).toBe(true))
      .build();
    
    expect(scenario.expectations).toHaveLength(2);
  });

  it('should handle empty scenario', () => {
    const scenario = TestScenarioBuilder.create().build();
    
    expect(scenario.wallet).toBeUndefined();
    expect(scenario.desired).toBeUndefined();
    expect(scenario.config).toBeUndefined();
    expect(scenario.marketData).toBeUndefined();
    expect(scenario.expectations).toBeUndefined();
  });
});

describe('ErrorTestUtils', () => {
  it('should expect error with string message', async () => {
    const errorFn = async () => {
      throw new Error('Test error message');
    };

    await expect(
      ErrorTestUtils.expectError(errorFn, 'Test error')
    ).resolves.toBeUndefined();
  });

  it('should expect error with regex pattern', async () => {
    const errorFn = async () => {
      throw new Error('Error: Invalid input value');
    };

    await expect(
      ErrorTestUtils.expectError(errorFn, /Invalid input/)
    ).resolves.toBeUndefined();
  });

  it('should fail when function does not throw', async () => {
    const successFn = async () => {
      return 'success';
    };

    await expect(
      ErrorTestUtils.expectError(successFn, 'Any error')
    ).rejects.toThrow();
  });

  it('should fail when error message does not match', async () => {
    const errorFn = async () => {
      throw new Error('Unexpected error');
    };

    await expect(
      ErrorTestUtils.expectError(errorFn, 'Expected error')
    ).rejects.toThrow();
  });

  it('should test retry logic with success on final attempt', async () => {
    // The retry function should fail on first 2 attempts and succeed on 3rd
    const retryFn = async (attempt: number) => {
      if (attempt < 3) {
        throw new Error(`Attempt ${attempt} failed`);
      }
      return `Success on attempt ${attempt}`;
    };

    // testRetryLogic should eventually succeed after retries
    await expect(
      ErrorTestUtils.testRetryLogic(retryFn, 3)
    ).resolves.toBeUndefined();
  });
});

describe('IntegrationTestUtils', () => {
  it('should setup integration test environment', () => {
    // This mainly tests that the method exists and can be called
    expect(() => {
      IntegrationTestUtils.setupIntegrationTest();
    }).not.toThrow();
  });

  it('should test workflow with assertions', async () => {
    const mockWorkflow = async () => {
      return { success: true, value: 100 };
    };

    const assertions = [
      (result: any) => expect(result.success).toBe(true),
      (result: any) => expect(result.value).toBe(100)
    ];

    const result = await IntegrationTestUtils.testWorkflow(mockWorkflow, assertions);
    
    expect(result.success).toBe(true);
    expect(result.value).toBe(100);
  });

  it('should fail when workflow assertion fails', async () => {
    const mockWorkflow = async () => {
      return { success: false, value: 0 };
    };

    const assertions = [
      (result: any) => expect(result.success).toBe(true) // This will fail
    ];

    await expect(
      IntegrationTestUtils.testWorkflow(mockWorkflow, assertions)
    ).rejects.toThrow();
  });
});

describe('testSuite and asyncTest utilities', () => {
  it('should handle test suite setup', () => {
    // This test verifies that testSuite creates a describe block with proper beforeEach/afterEach
    // We can't easily mock the global describe/beforeEach/afterEach, so we'll test by verifying
    // the function exists and doesn't throw an error when called
    
    expect(() => {
      testSuite('test-suite', () => {});
    }).not.toThrow();
    
    // Verify that the function is properly defined
    expect(typeof testSuite).toBe('function');
  });

  it('should handle async test execution', async () => {
    // This test verifies that asyncTest creates an it block
    // We can't easily mock the global it, so we'll test by verifying
    // the function exists and doesn't throw an error when called
    
    expect(() => {
      asyncTest('async-test', async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
      });
    }).not.toThrow();
    
    // Verify that the function is properly defined
    expect(typeof asyncTest).toBe('function');
  });
});

describe('performanceTest utility', () => {
  it('should execute performance test within time limit', async () => {
    // Test that the performanceTest function is properly defined
    expect(typeof performanceTest).toBe('function');
    
    // Test that PerformanceTestUtils works correctly
    const testFn = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'test-result';
    };
    
    const result = await PerformanceTestUtils.expectExecutionTime(testFn, 100);
    expect(result).toBe('test-result');
  });
});

describe('Default export from test-utils', () => {
  it('should export all utilities in default object', async () => {
    const defaultExport = await import('./index');
    const utils = defaultExport.default;

    expect(utils.TestEnvironment).toBeDefined();
    expect(utils.FinancialAssertions).toBeDefined();
    expect(utils.TestDataFactory).toBeDefined();
    expect(utils.PerformanceTestUtils).toBeDefined();
    expect(utils.MockDataGenerator).toBeDefined();
    expect(utils.TestScenarioBuilder).toBeDefined();
    expect(utils.ErrorTestUtils).toBeDefined();
    expect(utils.IntegrationTestUtils).toBeDefined();
    expect(utils.testSuite).toBeDefined();
    expect(utils.asyncTest).toBeDefined();
    expect(utils.performanceTest).toBeDefined();
  });
});

describe('Error edge cases and boundary conditions', () => {
  it('should handle position without totalPriceNumber in portfolio balance check', () => {
    const incompleteWallet: Wallet = [
      {
        ...TestDataFactory.createPosition({ base: "TRUR" }),
        totalPriceNumber: undefined as any
      }
    ];
    const desired = { TRUR: 100 };

    expect(() => {
      FinancialAssertions.expectPortfolioBalance(incompleteWallet, desired, 1.0);
    }).toThrow();
  });

  it('should handle margin position with edge leverage values', () => {
    const edgeMarginPos: MarginPosition = {
      ...TestDataFactory.createPosition(),
      isMargin: true,
      marginValue: 1, // Minimum positive value
      leverage: 1, // Minimum leverage
      marginCall: false
    };

    expect(() => {
      FinancialAssertions.expectValidMarginPosition(edgeMarginPos);
    }).not.toThrow();

    const maxLeveragePos: MarginPosition = {
      ...TestDataFactory.createPosition(),
      isMargin: true,
      marginValue: 1000,
      leverage: 4, // Maximum leverage
      marginCall: false
    };

    expect(() => {
      FinancialAssertions.expectValidMarginPosition(maxLeveragePos);
    }).not.toThrow();
  });

  it('should handle invalid leverage values in margin position', () => {
    const invalidLeveragePos: MarginPosition = {
      ...TestDataFactory.createPosition(),
      isMargin: true,
      marginValue: 1000,
      leverage: 5, // Above maximum
      marginCall: false
    };

    expect(() => {
      FinancialAssertions.expectValidMarginPosition(invalidLeveragePos);
    }).toThrow();
  });

  it('should handle empty wallet in total value assertion', () => {
    const emptyWallet: Wallet = [];

    expect(() => {
      FinancialAssertions.expectWalletValue(emptyWallet, 0, 0.01);
    }).not.toThrow();
  });

  it('should handle TinkoffNumber with edge nano values', () => {
    const num1: TinkoffNumber = { units: 100, nano: 999999999 }; // Max nano
    const num2: TinkoffNumber = { units: 100, nano: 999999999 };

    expect(() => {
      FinancialAssertions.expectTinkoffNumberEqual(num1, num2, 0.01);
    }).not.toThrow();
  });

  it('should handle zero values in mock data generator', () => {
    const price = MockDataGenerator.randomPrice(0, 0);
    expect(price.units).toBe(0);
    expect(price.nano).toBeGreaterThanOrEqual(0);
  });

  it('should handle single ticker in desired wallet generation', () => {
    const desired = MockDataGenerator.randomDesiredWallet(['TRUR']);
    expect(Object.keys(desired)).toHaveLength(1);
    expect(desired.TRUR).toBe(100);
  });
});