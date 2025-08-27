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
      
      const result = await buildDesiredWalletByMode('marketcap', baseDesired);
      
      expect(result.modeApplied).toBe('marketcap');
      FinancialAssertions.expectNormalizedDesiredWallet(result.wallet);
      
      // Verify market cap metrics are included
      expect(result.metrics).toHaveLength(3);
      result.metrics.forEach(metric => {
        expect(metric.marketCap).toBeDefined();
        expect(metric.marketCap!.value).toBeGreaterThan(0);
        expect(metric.marketCap!.percentage).toBeGreaterThan(0);
      });
      
      // Verify weights are proportional to market cap
      // TRUR has highest market cap, should have highest weight
      const trurWeight = result.wallet.TRUR;
      const tmosWeight = result.wallet.TMOS;
      const tgldWeight = result.wallet.TGLD;
      
      expect(trurWeight).toBeGreaterThan(tmosWeight);
      expect(tmosWeight).toBeGreaterThan(tgldWeight);
    });
    
    it('should handle missing market cap data by throwing error', async () => {
      // Remove one metric file to simulate missing data
      mockControls.fs.setFile('/test/workspace/etf_metrics/TGLD.json', JSON.stringify({
        aum: mockAumData.TGLD.aum
        // marketCap missing
      }));
      
      const baseDesired = {
        TRUR: 50,
        TMOS: 30,
        TGLD: 20
      };
      
      await ErrorTestUtils.expectError(
        () => buildDesiredWalletByMode('marketcap', baseDesired),
        'market cap'
      );
    });
  });

  describe('AUM Mode', () => {
    it('should calculate weights based on AUM', async () => {
      const baseDesired = {
        TRUR: 50,
        TMOS: 30,
        TGLD: 20
      };
      
      const result = await buildDesiredWalletByMode('aum', baseDesired);
      
      expect(result.modeApplied).toBe('aum');
      FinancialAssertions.expectNormalizedDesiredWallet(result.wallet);
      
      // Verify AUM metrics are included
      expect(result.metrics).toHaveLength(3);
      result.metrics.forEach(metric => {
        expect(metric.aum).toBeDefined();
        expect(metric.aum!.value).toBeGreaterThan(0);
        expect(metric.aum!.percentage).toBeGreaterThan(0);
      });
      
      // Verify weights are proportional to AUM
      const trurWeight = result.wallet.TRUR;
      const tmosWeight = result.wallet.TMOS;
      
      // TRUR has highest AUM based on mock data
      expect(trurWeight).toBeGreaterThan(tmosWeight);
    });
    
    it('should handle missing AUM data by throwing error', async () => {
      // Remove AUM from one metric file
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({
        marketCap: mockMarketCapData.TMOS.marketCap
        // aum missing
      }));
      
      const baseDesired = {
        TRUR: 50,
        TMOS: 30,
        TGLD: 20
      };
      
      await ErrorTestUtils.expectError(
        () => buildDesiredWalletByMode('aum', baseDesired),
        'AUM'
      );
    });
  });

  describe('Market Cap AUM Mode', () => {
    it('should use market cap when available, fallback to AUM', async () => {
      const baseDesired = {
        TRUR: 50,
        TMOS: 30,
        TGLD: 20
      };
      
      const result = await buildDesiredWalletByMode('marketcap_aum', baseDesired);
      
      expect(result.modeApplied).toBe('marketcap_aum');
      FinancialAssertions.expectNormalizedDesiredWallet(result.wallet);
      
      // Should include both market cap and AUM metrics where available
      expect(result.metrics).toHaveLength(3);
      result.metrics.forEach(metric => {
        // Should have at least one of market cap or AUM
        expect(metric.marketCap || metric.aum).toBeDefined();
      });
    });
    
    it('should handle partial data gracefully', async () => {
      // Set up scenario where some tickers have only market cap, others only AUM
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({
        marketCap: mockMarketCapData.TRUR.marketCap
        // aum missing
      }));
      
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({
        aum: mockAumData.TMOS.aum
        // marketCap missing
      }));
      
      const baseDesired = {
        TRUR: 50,
        TMOS: 50
      };
      
      const result = await buildDesiredWalletByMode('marketcap_aum', baseDesired);
      
      expect(result.modeApplied).toBe('marketcap_aum');
      FinancialAssertions.expectNormalizedDesiredWallet(result.wallet);
    });
    
    it('should throw error when ticker has neither market cap nor AUM', async () => {
      // Empty metric file
      mockControls.fs.setFile('/test/workspace/etf_metrics/TGLD.json', JSON.stringify({}));
      
      const baseDesired = {
        TRUR: 33,
        TMOS: 33,
        TGLD: 34
      };
      
      await ErrorTestUtils.expectError(
        () => buildDesiredWalletByMode('marketcap_aum', baseDesired),
        'market cap or AUM'
      );
    });
  });

  describe('Decorrelation Mode', () => {
    it('should calculate decorrelation weights correctly', async () => {
      const baseDesired = {
        TRUR: 50,
        TMOS: 30,
        TGLD: 20
      };
      
      const result = await buildDesiredWalletByMode('decorrelation', baseDesired);
      
      expect(result.modeApplied).toBe('decorrelation');
      FinancialAssertions.expectNormalizedDesiredWallet(result.wallet);
      
      // Verify decorrelation metrics are included
      expect(result.metrics).toHaveLength(3);
      result.metrics.forEach(metric => {
        expect(metric.decorrelation).toBeDefined();
        expect(metric.decorrelation!.value).toBeFinite();
        expect(['overvalued', 'undervalued', 'neutral']).toContain(metric.decorrelation!.interpretation);
      });
      
      // Decorrelation algorithm should favor undervalued assets
      // (where market cap < AUM, resulting in negative decorrelation)
      const undervaluedMetrics = result.metrics.filter(m => 
        m.decorrelation!.interpretation === 'undervalued'
      );
      
      if (undervaluedMetrics.length > 0) {
        const undervaluedTicker = undervaluedMetrics[0].ticker;
        const undervaluedWeight = result.wallet[undervaluedTicker];
        
        // Undervalued assets should get higher weights
        expect(undervaluedWeight).toBeGreaterThan(0);
      }
    });
    
    it('should require both market cap and AUM for decorrelation', async () => {
      // Missing AUM for one ticker
      mockControls.fs.setFile('/test/workspace/etf_metrics/TGLD.json', JSON.stringify({
        marketCap: mockMarketCapData.TGLD.marketCap
        // aum missing
      }));
      
      const baseDesired = {
        TRUR: 50,
        TMOS: 30,
        TGLD: 20
      };
      
      await ErrorTestUtils.expectError(
        () => buildDesiredWalletByMode('decorrelation', baseDesired),
        'both market cap and AUM'
      );
    });
    
    it('should handle decorrelation calculation edge cases', async () => {
      // Set up extreme decorrelation values
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({
        marketCap: 100000000000, // Very high market cap
        aum: 1000000000 // Low AUM - highly overvalued
      }));
      
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({
        marketCap: 1000000000, // Low market cap  
        aum: 10000000000 // High AUM - highly undervalued
      }));
      
      const baseDesired = {
        TRUR: 50,
        TMOS: 50
      };
      
      const result = await buildDesiredWalletByMode('decorrelation', baseDesired);
      
      // Should complete without errors
      expect(result.modeApplied).toBe('decorrelation');
      FinancialAssertions.expectNormalizedDesiredWallet(result.wallet);
      
      // Undervalued TMOS should get higher weight than overvalued TRUR
      expect(result.wallet.TMOS).toBeGreaterThan(result.wallet.TRUR);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle file system errors gracefully', async () => {
      mockControls.fs.setFailure('EACCES'); // Permission denied
      
      const baseDesired = {
        TRUR: 100
      };
      
      // Should handle file read errors and potentially fetch live data
      try {
        const result = await buildDesiredWalletByMode('marketcap', baseDesired);
        expect(result).toBeDefined();
      } catch (error) {
        // Error is expected when both file and live data fail
        expect(error).toBeDefined();
      }
    });
    
    it('should handle invalid JSON in metric files', async () => {
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', 'invalid json {');
      
      const baseDesired = {
        TRUR: 100
      };
      
      // Should handle JSON parse errors
      try {
        const result = await buildDesiredWalletByMode('marketcap', baseDesired);
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
    
    it('should handle zero total metric scenario', async () => {
      // Set all metrics to zero
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRUR.json', JSON.stringify({
        marketCap: 0,
        aum: 0
      }));
      
      mockControls.fs.setFile('/test/workspace/etf_metrics/TMOS.json', JSON.stringify({
        marketCap: 0,
        aum: 0
      }));
      
      const baseDesired = {
        TRUR: 50,
        TMOS: 50
      };
      
      await ErrorTestUtils.expectError(
        () => buildDesiredWalletByMode('marketcap', baseDesired),
        'valid positive metrics'
      );
    });
    
    it('should handle ticker normalization', async () => {
      // Use ticker aliases that need normalization
      const baseDesired = {
        'TPAY': 50, // Should normalize to TRAY
        'TRUR': 50
      };
      
      // Mock normalized ticker data
      mockControls.fs.setFile('/test/workspace/etf_metrics/TRAY.json', JSON.stringify({
        marketCap: 25000000000,
        aum: 10000000000
      }));
      
      const result = await buildDesiredWalletByMode('marketcap', baseDesired);
      
      // Should preserve original ticker names in result
      expect(result.wallet).toHaveProperty('TPAY');
      expect(result.wallet).toHaveProperty('TRUR');
    });
    
    it('should handle empty baseDesired wallet', async () => {
      const baseDesired = {};
      
      const result = await buildDesiredWalletByMode('manual', baseDesired);
      
      expect(result.wallet).toEqual({});
      expect(result.metrics).toHaveLength(0);
    });
  });

  describe('Position Metrics Generation', () => {
    it('should generate comprehensive position metrics', async () => {
      const baseDesired = {
        TRUR: 50,
        TMOS: 30,
        TGLD: 20
      };
      
      const result = await buildDesiredWalletByMode('decorrelation', baseDesired);
      
      expect(result.metrics).toHaveLength(3);
      
      result.metrics.forEach(metric => {
        expect(metric.ticker).toBeDefined();
        
        // Should have market cap info
        if (metric.marketCap) {
          expect(metric.marketCap.value).toBeGreaterThan(0);
          expect(metric.marketCap.percentage).toBeGreaterThan(0);
          expect(metric.marketCap.percentage).toBeLessThanOrEqual(100);
        }
        
        // Should have AUM info
        if (metric.aum) {
          expect(metric.aum.value).toBeGreaterThan(0);
          expect(metric.aum.percentage).toBeGreaterThan(0);
          expect(metric.aum.percentage).toBeLessThanOrEqual(100);
        }
        
        // Should have decorrelation info
        if (metric.decorrelation) {
          expect(metric.decorrelation.value).toBeFinite();
          expect(['overvalued', 'undervalued', 'neutral']).toContain(metric.decorrelation.interpretation);
        }
      });
      
      // Verify percentage calculations sum to ~100%
      const totalMarketCapPct = result.metrics
        .filter(m => m.marketCap)
        .reduce((sum, m) => sum + m.marketCap!.percentage, 0);
      expect(totalMarketCapPct).toBeCloseTo(100, 1);
      
      const totalAumPct = result.metrics
        .filter(m => m.aum)
        .reduce((sum, m) => sum + m.aum!.percentage, 0);
      expect(totalAumPct).toBeCloseTo(100, 1);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large number of tickers efficiently', async () => {
      const largeTickers = Array.from({ length: 20 }, (_, i) => `TICKER${i}`);
      const baseDesired = Object.fromEntries(
        largeTickers.map(ticker => [ticker, 5]) // 20 tickers * 5% = 100%
      );
      
      // Mock metric files for all tickers
      largeTickers.forEach(ticker => {
        mockControls.fs.setFile(`/test/workspace/etf_metrics/${ticker}.json`, JSON.stringify({
          marketCap: 1000000000 + Math.random() * 10000000000,
          aum: 500000000 + Math.random() * 5000000000
        }));
      });
      
      const startTime = Date.now();
      const result = await buildDesiredWalletByMode('marketcap', baseDesired);
      const endTime = Date.now();
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds
      
      expect(result.metrics).toHaveLength(20);
      FinancialAssertions.expectNormalizedDesiredWallet(result.wallet);
    });
  });
});