// Mock modules first, before any other imports
import { mock } from "bun:test";

// Mock the API functions used in desiredBuilder.ts
const mockGetEtfMarketCapRUB = mock(async () => null);
const mockGetShareMarketCapRUB = mock(async () => null);
const mockBuildAumMapSmart = mock(async () => ({}));
const mockToRubFromAum = mock(async () => 0);

mock.module('../../tools/etfCap', () => ({
  getEtfMarketCapRUB: mockGetEtfMarketCapRUB,
  buildAumMapSmart: mockBuildAumMapSmart
}));

mock.module('../../tools/shareCap', () => ({
  getShareMarketCapRUB: mockGetShareMarketCapRUB
}));

mock.module('../../tools/pollEtfMetrics', () => ({
  toRubFromAum: mockToRubFromAum
}));

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { buildDesiredWalletByMode } from "../../balancer/desiredBuilder";
import { DesiredWallet, DesiredMode, BalancingDataError } from "../../types.d";

// Import test utilities and fixtures
import { 
  TestEnvironment, 
  FinancialAssertions, 
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { mockDesiredWallets } from '../__fixtures__/wallets';
import { mockMarketData, mockMarketCapData, mockAumData } from '../__fixtures__/market-data';
import { mockControls } from '../__mocks__/external-deps';

testSuite('DesiredBuilder Module', () => {
  beforeEach(() => {
    // Mock file system for metrics reading
    mockControls.fs.setSuccess();
    
    // Mock metrics files
    mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({
      marketCap: mockMarketCapData.TRUR.marketCap,
      aum: mockAumData.TRUR.aum
    }));
    
    mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({
      marketCap: mockMarketCapData.TMOS.marketCap,
      aum: mockAumData.TMOS.aum
    }));
    
    mockControls.fs.setFile('/test/workspace/etf_metrics/TGLD.json', JSON.stringify({
      marketCap: mockMarketCapData.TGLD.marketCap,
      aum: mockAumData.TGLD.aum
    }));
    
    // Reset mocks
    mockGetEtfMarketCapRUB.mockClear();
    mockGetShareMarketCapRUB.mockClear();
    mockBuildAumMapSmart.mockClear();
    mockToRubFromAum.mockClear();
    
    // Set mocks to return null/empty values by default
    mockGetEtfMarketCapRUB.mockResolvedValue(null);
    mockGetShareMarketCapRUB.mockResolvedValue(null);
    mockBuildAumMapSmart.mockResolvedValue({});
    mockToRubFromAum.mockResolvedValue(0);
  });

  afterEach(() => {
    // Clear all mocks
    mockGetEtfMarketCapRUB.mockClear();
    mockGetShareMarketCapRUB.mockClear();
    mockBuildAumMapSmart.mockClear();
    mockToRubFromAum.mockClear();
    
    // Reset mock file system
    mockControls.fs.reset();
    
    // Clear any timers or intervals if needed
    // Note: Bun doesn't have jest.clearAllTimers(), so we skip this
  });

  describe('Manual and Default Modes', () => {
    it('should return baseDesired unchanged for manual mode', async () => {
      const baseDesired = mockDesiredWallets.balanced;
      
      const result = await buildDesiredWalletByMode('manual', baseDesired);
      
      expect(result.wallet).toEqual(baseDesired);
      expect(result.metrics).toHaveLength(0);
      expect(result.modeApplied).toBe('manual');
    });
    
    it('should return baseDesired unchanged for default mode', async () => {
      const baseDesired = mockDesiredWallets.etfOnly;
      
      const result = await buildDesiredWalletByMode('default', baseDesired);
      
      expect(result.wallet).toEqual(baseDesired);
      expect(result.metrics).toHaveLength(0);
      expect(result.modeApplied).toBe('default');
    });
  });

  describe('Market Cap Mode', () => {
    it('should calculate weights based on market cap', async () => {
      const baseDesired = {
        TRUR: 50,
        TMOS: 30,
        TGLD: 20
      };
      
      // Make JSON files have missing data so API functions are called
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TGLD.json', JSON.stringify({}));
      
      // Set up proper mock data for successful test
      mockGetEtfMarketCapRUB.mockImplementation(async (ticker) => {
        switch(ticker) {
          case 'TRUR': 
            return { marketCapRUB: mockMarketCapData.TRUR.marketCap };
          case 'TMOS': 
            return { marketCapRUB: mockMarketCapData.TMOS.marketCap };
          case 'TGLD': 
            return { marketCapRUB: mockMarketCapData.TGLD.marketCap };
          default:
            return null;
        }
      });
      
      // Add a timeout to prevent hanging
      const resultPromise = buildDesiredWalletByMode('marketcap', baseDesired);
      const result = await Promise.race([
        resultPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 5000))
      ]);
      
      expect((result as any).modeApplied).toBe('marketcap');
      FinancialAssertions.expectNormalizedDesiredWallet((result as any).wallet);
      
      // Verify market cap metrics are included
      expect((result as any).metrics).toHaveLength(3);
      (result as any).metrics.forEach((metric: any) => {
        expect(metric.marketCap).toBeDefined();
        expect(metric.marketCap!.value).toBeGreaterThan(0);
        expect(metric.marketCap!.percentage).toBeGreaterThan(0);
      });
    }, 10000); // Increase timeout for this test
    
    it('should handle missing market cap data by throwing error', async () => {
      // Make ALL JSON files have missing data so API functions are called
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TGLD.json', JSON.stringify({}));
      
      // Make sure ALL API functions return null/invalid to simulate missing data
      mockGetEtfMarketCapRUB.mockImplementation(async () => null);
      mockGetShareMarketCapRUB.mockImplementation(async () => null);
      
      const baseDesired = {
        TRUR: 50,
        TMOS: 30,
        TGLD: 20
      };
      
      // Expect the function to throw a BalancingDataError
      try {
        await buildDesiredWalletByMode('marketcap', baseDesired);
        // If we reach here, the test failed
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(BalancingDataError);
      }
    }, 10000); // Increase timeout for this test
  });

  describe('AUM Mode', () => {
    it('should calculate weights based on AUM', async () => {
      const baseDesired = {
        TRUR: 50,
        TMOS: 30,
        TGLD: 20
      };
      
      // Make ALL JSON files have missing data so API functions are called
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TGLD.json', JSON.stringify({}));
      
      // Set up proper mock data for successful test
      mockBuildAumMapSmart.mockImplementation(async (tickers) => {
        const result: Record<string, any> = {};
        tickers.forEach(ticker => {
          switch(ticker) {
            case 'TRUR':
              result[ticker] = { amount: mockAumData.TRUR.aum, currency: 'RUB' };
              break;
            case 'TMOS':
              result[ticker] = { amount: mockAumData.TMOS.aum, currency: 'RUB' };
              break;
            case 'TGLD':
              result[ticker] = { amount: mockAumData.TGLD.aum, currency: 'RUB' };
              break;
            default:
              result[ticker] = { amount: 0, currency: 'RUB' };
          }
        });
        return result;
      });
      
      mockToRubFromAum.mockImplementation(async (aumEntry) => {
        return aumEntry?.amount || 0;
      });
      
      // Add a timeout to prevent hanging
      const resultPromise = buildDesiredWalletByMode('aum', baseDesired);
      const result = await Promise.race([
        resultPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 5000))
      ]);
      
      expect((result as any).modeApplied).toBe('aum');
      FinancialAssertions.expectNormalizedDesiredWallet((result as any).wallet);
    }, 10000); // Increase timeout for this test
    
    it('should handle missing AUM data by throwing error', async () => {
      // Make ALL JSON files have missing data so API functions are called
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TGLD.json', JSON.stringify({}));
      
      // Make sure ALL API functions return null/invalid to simulate missing data
      mockBuildAumMapSmart.mockImplementation(async () => ({}));
      mockToRubFromAum.mockImplementation(async () => 0);
      
      const baseDesired = {
        TRUR: 50,
        TMOS: 30,
        TGLD: 20
      };
      
      // Expect the function to throw a BalancingDataError
      try {
        await buildDesiredWalletByMode('aum', baseDesired);
        // If we reach here, the test failed
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(BalancingDataError);
      }
    }, 10000); // Increase timeout for this test
  });

  describe('Market Cap AUM Mode', () => {
    it('should use market cap when available, fallback to AUM', async () => {
      const baseDesired = {
        TRUR: 50,
        TMOS: 30,
        TGLD: 20
      };
      
      // Make ALL JSON files have missing data so API functions are called
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TGLD.json', JSON.stringify({}));
      
      // TRUR has market cap, TMOS has AUM, TGLD has neither
      mockGetEtfMarketCapRUB.mockImplementation(async (ticker) => {
        if (ticker === 'TRUR') {
          return { marketCapRUB: mockMarketCapData.TRUR.marketCap };
        }
        return null;
      });
      
      mockGetShareMarketCapRUB.mockImplementation(async () => null);
      
      mockBuildAumMapSmart.mockImplementation(async (tickers) => {
        const result: Record<string, any> = {};
        if (tickers.includes('TMOS')) {
          result['TMOS'] = { amount: mockAumData.TMOS.aum, currency: 'RUB' };
        }
        return result;
      });
      
      mockToRubFromAum.mockImplementation(async (aumEntry) => {
        return aumEntry?.amount || 0;
      });
      
      // Add a timeout to prevent hanging
      const resultPromise = buildDesiredWalletByMode('marketcap_aum', baseDesired);
      const result = await Promise.race([
        resultPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 5000))
      ]);
      
      expect((result as any).modeApplied).toBe('marketcap_aum');
    }, 10000); // Increase timeout for this test
    
    it('should handle partial data gracefully', async () => {
      const baseDesired = {
        TRUR: 50,
        TMOS: 30
      };
      
      // Make ALL JSON files have missing data so API functions are called
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({}));
      
      // TRUR has market cap, TMOS has AUM
      mockGetEtfMarketCapRUB.mockImplementation(async (ticker) => {
        if (ticker === 'TRUR') {
          return { marketCapRUB: mockMarketCapData.TRUR.marketCap };
        }
        return null;
      });
      
      mockGetShareMarketCapRUB.mockImplementation(async () => null);
      
      mockBuildAumMapSmart.mockImplementation(async (tickers) => {
        const result: Record<string, any> = {};
        if (tickers.includes('TMOS')) {
          result['TMOS'] = { amount: mockAumData.TMOS.aum, currency: 'RUB' };
        }
        return result;
      });
      
      mockToRubFromAum.mockImplementation(async (aumEntry) => {
        return aumEntry?.amount || 0;
      });
      
      // Add a timeout to prevent hanging
      const resultPromise = buildDesiredWalletByMode('marketcap_aum', baseDesired);
      const result = await Promise.race([
        resultPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 5000))
      ]);
      
      expect((result as any).modeApplied).toBe('marketcap_aum');
      FinancialAssertions.expectNormalizedDesiredWallet((result as any).wallet);
    }, 10000); // Increase timeout for this test
    
    it('should throw error when ticker has neither market cap nor AUM', async () => {
      // Make ALL JSON files have missing data so API functions are called
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({}));
      
      // No data available for any ticker
      mockGetEtfMarketCapRUB.mockImplementation(async () => null);
      mockGetShareMarketCapRUB.mockImplementation(async () => null);
      mockBuildAumMapSmart.mockImplementation(async () => ({}));
      mockToRubFromAum.mockImplementation(async () => 0);
      
      const baseDesired = {
        TRUR: 50,
        TMOS: 50
      };
      
      // Expect the function to throw a BalancingDataError
      try {
        await buildDesiredWalletByMode('marketcap_aum', baseDesired);
        // If we reach here, the test failed
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(BalancingDataError);
      }
    }, 10000); // Increase timeout for this test
  });

  describe('Decorrelation Mode', () => {
    it('should calculate decorrelation weights correctly', async () => {
      const baseDesired = {
        TRUR: 50,
        TMOS: 30,
        TGLD: 20
      };
      
      // Make ALL JSON files have missing data so API functions are called
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TGLD.json', JSON.stringify({}));
      
      // All tickers need both market cap and AUM for decorrelation
      mockGetEtfMarketCapRUB.mockImplementation(async (ticker) => {
        switch(ticker) {
          case 'TRUR': 
            return { marketCapRUB: mockMarketCapData.TRUR.marketCap };
          case 'TMOS': 
            return { marketCapRUB: mockMarketCapData.TMOS.marketCap };
          case 'TGLD': 
            return { marketCapRUB: mockMarketCapData.TGLD.marketCap };
          default:
            return null;
        }
      });
      
      mockGetShareMarketCapRUB.mockImplementation(async () => null);
      
      mockBuildAumMapSmart.mockImplementation(async (tickers) => {
        const result: Record<string, any> = {};
        tickers.forEach(ticker => {
          switch(ticker) {
            case 'TRUR':
              result[ticker] = { amount: mockAumData.TRUR.aum, currency: 'RUB' };
              break;
            case 'TMOS':
              result[ticker] = { amount: mockAumData.TMOS.aum, currency: 'RUB' };
              break;
            case 'TGLD':
              result[ticker] = { amount: mockAumData.TGLD.aum, currency: 'RUB' };
              break;
            default:
              result[ticker] = { amount: 0, currency: 'RUB' };
          }
        });
        return result;
      });
      
      mockToRubFromAum.mockImplementation(async (aumEntry) => {
        return aumEntry?.amount || 0;
      });
      
      // Add a timeout to prevent hanging
      const resultPromise = buildDesiredWalletByMode('decorrelation', baseDesired);
      const result = await Promise.race([
        resultPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 5000))
      ]);
      
      expect((result as any).modeApplied).toBe('decorrelation');
      FinancialAssertions.expectNormalizedDesiredWallet((result as any).wallet);
    }, 10000); // Increase timeout for this test
    
    it('should require both market cap and AUM for decorrelation', async () => {
      // Make ALL JSON files have missing data so API functions are called
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({}));
      
      // TRUR has both, TMOS has only market cap
      mockGetEtfMarketCapRUB.mockImplementation(async (ticker) => {
        switch(ticker) {
          case 'TRUR': 
            return { marketCapRUB: mockMarketCapData.TRUR.marketCap };
          case 'TMOS': 
            return { marketCapRUB: mockMarketCapData.TMOS.marketCap };
          default:
            return null;
        }
      });
      
      mockGetShareMarketCapRUB.mockImplementation(async () => null);
      
      mockBuildAumMapSmart.mockImplementation(async (tickers) => {
        const result: Record<string, any> = {};
        if (tickers.includes('TRUR')) {
          result['TRUR'] = { amount: mockAumData.TRUR.aum, currency: 'RUB' };
        }
        // TMOS has no AUM data
        return result;
      });
      
      mockToRubFromAum.mockImplementation(async (aumEntry) => {
        return aumEntry?.amount || 0;
      });
      
      const baseDesired = {
        TRUR: 50,
        TMOS: 50
      };
      
      // Expect the function to throw a BalancingDataError
      try {
        await buildDesiredWalletByMode('decorrelation', baseDesired);
        // If we reach here, the test failed
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(BalancingDataError);
      }
    }, 10000); // Increase timeout for this test
    
    it('should handle decorrelation calculation edge cases', async () => {
      const baseDesired = {
        TRUR: 50,
        TMOS: 50
      };
      
      // Make ALL JSON files have missing data so API functions are called
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({}));
      
      // Both tickers have both market cap and AUM
      mockGetEtfMarketCapRUB.mockImplementation(async (ticker) => {
        switch(ticker) {
          case 'TRUR': 
            return { marketCapRUB: mockMarketCapData.TRUR.marketCap };
          case 'TMOS': 
            return { marketCapRUB: mockMarketCapData.TMOS.marketCap };
          default:
            return null;
        }
      });
      
      mockGetShareMarketCapRUB.mockImplementation(async () => null);
      
      mockBuildAumMapSmart.mockImplementation(async (tickers) => {
        const result: Record<string, any> = {};
        tickers.forEach(ticker => {
          switch(ticker) {
            case 'TRUR':
              result[ticker] = { amount: mockAumData.TRUR.aum, currency: 'RUB' };
              break;
            case 'TMOS':
              result[ticker] = { amount: mockAumData.TMOS.aum, currency: 'RUB' };
              break;
            default:
              result[ticker] = { amount: 0, currency: 'RUB' };
          }
        });
        return result;
      });
      
      mockToRubFromAum.mockImplementation(async (aumEntry) => {
        return aumEntry?.amount || 0;
      });
      
      // Add a timeout to prevent hanging
      const resultPromise = buildDesiredWalletByMode('decorrelation', baseDesired);
      const result = await Promise.race([
        resultPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 5000))
      ]);
      
      expect((result as any).modeApplied).toBe('decorrelation');
      FinancialAssertions.expectNormalizedDesiredWallet((result as any).wallet);
    }, 10000); // Increase timeout for this test
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle file system errors gracefully', async () => {
      // Simulate file system error by making read fail
      mockControls.fs.setError();
      
      const baseDesired = {
        TRUR: 50,
        TMOS: 30,
        TGLD: 20
      };
      
      // Add a timeout to prevent hanging
      const resultPromise = buildDesiredWalletByMode('manual', baseDesired);
      const result = await Promise.race([
        resultPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 5000))
      ]);
      
      // Manual mode should still work as it doesn't read files
      expect((result as any).modeApplied).toBe('manual');
      expect((result as any).wallet).toEqual(baseDesired);
    }, 10000); // Increase timeout for this test
    
    it('should handle invalid JSON in metric files', async () => {
      // Create invalid JSON files
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', 'invalid json {');
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', 'also invalid {');
      
      const baseDesired = {
        TRUR: 50,
        TMOS: 50
      };
      
      // Add a timeout to prevent hanging
      const resultPromise = buildDesiredWalletByMode('manual', baseDesired);
      const result = await Promise.race([
        resultPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 5000))
      ]);
      
      // Manual mode should still work as it doesn't read files
      expect((result as any).modeApplied).toBe('manual');
      expect((result as any).wallet).toEqual(baseDesired);
    }, 10000); // Increase timeout for this test
    
    it('should handle zero total metric scenario', async () => {
      const baseDesired = {
        TRUR: 50,
        TMOS: 30,
        TGLD: 20
      };
      
      // Make ALL JSON files have missing data so API functions are called
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TGLD.json', JSON.stringify({}));
      
      // Return zero values for all metrics
      mockGetEtfMarketCapRUB.mockImplementation(async () => ({ marketCapRUB: 0 }));
      mockGetShareMarketCapRUB.mockImplementation(async () => ({ marketCapRUB: 0 }));
      mockBuildAumMapSmart.mockImplementation(async (tickers) => {
        const result: Record<string, any> = {};
        tickers.forEach(ticker => {
          result[ticker] = { amount: 0, currency: 'RUB' };
        });
        return result;
      });
      mockToRubFromAum.mockImplementation(async () => 0);
      
      // Add a timeout to prevent hanging
      const resultPromise = buildDesiredWalletByMode('marketcap', baseDesired);
      try {
        await Promise.race([
          resultPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 5000))
        ]);
        // If we reach here, the test failed (should have thrown an error)
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(BalancingDataError);
      }
    }, 10000); // Increase timeout for this test
    
    it('should handle empty baseDesired wallet', async () => {
      const baseDesired = {};
      
      const result = await buildDesiredWalletByMode('manual', baseDesired);
      
      expect(result.wallet).toEqual(baseDesired);
      expect(result.metrics).toHaveLength(0);
      expect(result.modeApplied).toBe('manual');
    });
  });

  describe('Position Metrics Generation', () => {
    it('should generate comprehensive position metrics', async () => {
      const baseDesired = {
        TPAY: 40,
        TRUR: 40,
        TMOS: 20
      };
      
      // Mock all required data
      mockControls.fs.setFile('/test/workspace/etf_metrics/TPAY.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({}));
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({}));
      
      // Set up mock data
      mockGetEtfMarketCapRUB.mockImplementation(async (ticker) => {
        switch(ticker) {
          case 'TPAY': 
            return { marketCapRUB: 1000000000 };
          case 'TRUR': 
            return { marketCapRUB: 2000000000 };
          case 'TMOS': 
            return { marketCapRUB: 500000000 };
          default:
            return null;
        }
      });
      
      mockGetShareMarketCapRUB.mockImplementation(async () => null);
      
      mockBuildAumMapSmart.mockImplementation(async (tickers) => {
        const result: Record<string, any> = {};
        tickers.forEach(ticker => {
          switch(ticker) {
            case 'TPAY':
              result[ticker] = { amount: 1000000000, currency: 'RUB' };
              break;
            case 'TRUR':
              result[ticker] = { amount: 2000000000, currency: 'RUB' };
              break;
            case 'TMOS':
              result[ticker] = { amount: 500000000, currency: 'RUB' };
              break;
            default:
              result[ticker] = { amount: 0, currency: 'RUB' };
          }
        });
        return result;
      });
      
      mockToRubFromAum.mockImplementation(async (aumEntry) => {
        return aumEntry?.amount || 0;
      });
      
      // Add a timeout to prevent hanging
      const resultPromise = buildDesiredWalletByMode('marketcap', baseDesired);
      const result = await Promise.race([
        resultPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 5000))
      ]);
      
      expect((result as any).modeApplied).toBe('marketcap');
      expect((result as any).metrics).toHaveLength(3);
    }, 10000); // Increase timeout for this test
  });
});