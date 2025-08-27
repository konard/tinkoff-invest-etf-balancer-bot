import { describe, it, expect, beforeEach } from "bun:test";

// Import test utilities
import { 
  TestEnvironment, 
  testSuite
} from '../test-utils';

// Import simple tools to test
import { getShareMarketCapRUB } from "../../tools/shareCap";
import { demoDetailedOutput } from "../../tools/demoDetailedOutput";

testSuite('Simple Tools Tests', () => {
  describe('ShareCap Tool', () => {
    it('should return null for any ticker (stub implementation)', async () => {
      const result = await getShareMarketCapRUB('SBER');
      expect(result).toBeNull();
    });
    
    it('should handle empty ticker', async () => {
      const result = await getShareMarketCapRUB('');
      expect(result).toBeNull();
    });
    
    it('should handle undefined ticker', async () => {
      const result = await getShareMarketCapRUB(undefined as any);
      expect(result).toBeNull();
    });
  });

  describe('DemoDetailedOutput Tool', () => {
    let consoleSpy: any;
    let originalConsoleLog: any;
    
    beforeEach(() => {
      consoleSpy = {
        calls: [] as any[],
        log: (...args: any[]) => {
          consoleSpy.calls.push(args);
        }
      };
      
      originalConsoleLog = console.log;
      console.log = consoleSpy.log;
    });
    
    it('should run demonstration without errors', () => {
      expect(() => demoDetailedOutput()).not.toThrow();
    });
    
    it('should output balancing demonstration to console', () => {
      demoDetailedOutput();
      
      expect(consoleSpy.calls.length).toBeGreaterThan(0);
      
      // Check for expected output patterns
      const output = consoleSpy.calls.flat().join(' ');
      expect(output).toContain('DEMONSTRATION OF DETAILED BALANCING OUTPUT');
      expect(output).toContain('BALANCING RESULT');
      expect(output).toContain('CHANGE ANALYSIS');
    });
    
    it('should display portfolio data correctly', () => {
      demoDetailedOutput();
      
      const output = consoleSpy.calls.flat().join(' ');
      
      // Should contain some ticker symbols
      expect(output).toContain('TPAY');
      expect(output).toContain('TGLD');
      expect(output).toContain('TRUR');
      expect(output).toContain('TMOS');
      
      // Should contain percentage symbols
      expect(output).toContain('%');
      
      // Should contain RUB balance
      expect(output).toContain('RUR:');
    });
    
    afterEach(() => {
      console.log = originalConsoleLog;
    });
  });

  describe('Portfolio Calculation Logic', () => {
    it('should demonstrate sorting by portfolio share', () => {
      let capturedOutput: string[] = [];
      
      const mockConsole = {
        log: (...args: any[]) => {
          capturedOutput.push(args.join(' '));
        }
      };
      
      const originalConsoleLog = console.log;
      console.log = mockConsole.log;
      
      demoDetailedOutput();
      
      console.log = originalConsoleLog;
      
      // Find the balancing result section
      const balancingLines = capturedOutput.filter(line => 
        line.includes('%') && line.includes('->') && !line.includes('BALANCING RESULT')
      );
      
      expect(balancingLines.length).toBeGreaterThan(0);
      
      // Should contain ticker analysis
      const hasTickerData = balancingLines.some(line => 
        /[A-Z]{3,5}:/.test(line) && line.includes('%')
      );
      expect(hasTickerData).toBe(true);
    });
    
    it('should handle zero and non-zero portfolio positions', () => {
      let capturedOutput: string[] = [];
      
      const mockConsole = {
        log: (...args: any[]) => {
          capturedOutput.push(args.join(' '));
        }
      };
      
      const originalConsoleLog = console.log;
      console.log = mockConsole.log;
      
      demoDetailedOutput();
      
      console.log = originalConsoleLog;
      
      const output = capturedOutput.join(' ');
      
      // Should handle both zero positions (like TMON: 0%) and non-zero positions
      expect(output).toContain('0%');
      expect(output.match(/\d+\.\d+%/)).toBeTruthy(); // Should contain decimal percentages
    });
  });

  describe('Output Formatting', () => {
    it('should format percentage changes correctly', () => {
      let capturedOutput: string[] = [];
      
      const mockConsole = {
        log: (...args: any[]) => {
          capturedOutput.push(args.join(' '));
        }
      };
      
      const originalConsoleLog = console.log;
      console.log = mockConsole.log;
      
      demoDetailedOutput();
      
      console.log = originalConsoleLog;
      
      const output = capturedOutput.join(' ');
      
      // Should contain properly formatted change indicators
      const hasChangeFormat = /[+-]?\d+\.\d+%/.test(output);
      expect(hasChangeFormat).toBe(true);
      
      // Should contain the arrow format (before -> after)
      expect(output).toContain('->');
      
      // Should contain target format (target%)
      expect(output).toMatch(/\(\d+\.\d+%\)/);
    });
    
    it('should display section headers clearly', () => {
      let capturedOutput: string[] = [];
      
      const mockConsole = {
        log: (...args: any[]) => {
          capturedOutput.push(args.join(' '));
        }
      };
      
      const originalConsoleLog = console.log;
      console.log = mockConsole.log;
      
      demoDetailedOutput();
      
      console.log = originalConsoleLog;
      
      // Should have clear section separators
      const hasSectionHeaders = capturedOutput.some(line => 
        line.includes('===') || line.includes('BALANCING RESULT') || line.includes('CHANGE ANALYSIS')
      );
      expect(hasSectionHeaders).toBe(true);
      
      // Should have format explanation
      const hasFormatInfo = capturedOutput.some(line => 
        line.includes('Format:') && line.includes('before%') && line.includes('after%')
      );
      expect(hasFormatInfo).toBe(true);
    });
  });

  describe('Change Analysis', () => {
    it('should analyze portfolio changes correctly', () => {
      let capturedOutput: string[] = [];
      
      const mockConsole = {
        log: (...args: any[]) => {
          capturedOutput.push(args.join(' '));
        }
      };
      
      const originalConsoleLog = console.log;
      console.log = mockConsole.log;
      
      demoDetailedOutput();
      
      console.log = originalConsoleLog;
      
      // Find change analysis section
      const changeAnalysisIndex = capturedOutput.findIndex(line => 
        line.includes('CHANGE ANALYSIS')
      );
      
      expect(changeAnalysisIndex).toBeGreaterThanOrEqual(0);
      
      // Should have change analysis content after the header
      const changeLines = capturedOutput.slice(changeAnalysisIndex + 1);
      expect(changeLines.length).toBeGreaterThan(0);
      
      // Should contain analysis for various tickers
      const hasTickerAnalysis = changeLines.some(line => 
        /[A-Z]{3,5}:/.test(line)
      );
      expect(hasTickerAnalysis).toBe(true);
    });
    
    it('should categorize changes appropriately', () => {
      let capturedOutput: string[] = [];
      
      const mockConsole = {
        log: (...args: any[]) => {
          capturedOutput.push(args.join(' '));
        }
      };
      
      const originalConsoleLog = console.log;
      console.log = mockConsole.log;
      
      demoDetailedOutput();
      
      console.log = originalConsoleLog;
      
      const output = capturedOutput.join(' ');
      
      // Should contain different types of change descriptions
      const hasChangeTypes = 
        output.includes('no changes') ||
        output.includes('already balanced') ||
        /[+-]\d+%/.test(output);
      
      expect(hasChangeTypes).toBe(true);
    });
  });

  describe('Data Consistency', () => {
    it('should have consistent data between sections', () => {
      let capturedOutput: string[] = [];
      
      const mockConsole = {
        log: (...args: any[]) => {
          capturedOutput.push(args.join(' '));
        }
      };
      
      const originalConsoleLog = console.log;
      console.log = mockConsole.log;
      
      demoDetailedOutput();
      
      console.log = originalConsoleLog;
      
      // Extract ticker mentions from both sections
      const tickerMentions = capturedOutput
        .filter(line => /[A-Z]{3,5}:/.test(line))
        .map(line => {
          const match = line.match(/([A-Z]{3,5}):/);
          return match ? match[1] : null;
        })
        .filter(Boolean);
      
      expect(tickerMentions.length).toBeGreaterThan(0);
      
      // Should mention common ETF tickers
      expect(tickerMentions).toContain('TPAY');
      expect(tickerMentions).toContain('TGLD');
    });
    
    it('should have valid percentage values', () => {
      let capturedOutput: string[] = [];
      
      const mockConsole = {
        log: (...args: any[]) => {
          capturedOutput.push(args.join(' '));
        }
      };
      
      const originalConsoleLog = console.log;
      console.log = mockConsole.log;
      
      demoDetailedOutput();
      
      console.log = originalConsoleLog;
      
      const output = capturedOutput.join(' ');
      
      // Extract all percentage values
      const percentages = output.match(/\d+\.\d+%/g) || [];
      
      expect(percentages.length).toBeGreaterThan(0);
      
      // All percentages should be valid numbers
      percentages.forEach(percent => {
        const value = parseFloat(percent.replace('%', ''));
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      });
    });
  });
});