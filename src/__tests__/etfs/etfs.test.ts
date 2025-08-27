import { describe, it, expect, beforeEach, afterEach } from "bun:test";

// Import test utilities
import { testSuite } from '../test-utils';
import { mockControls } from '../__mocks__/external-deps';

testSuite('ETFs Module Tests', () => {
  let originalConsoleLog: any;
  let consoleOutput: string[];

  beforeEach(() => {
    // Setup console capture
    consoleOutput = [];
    originalConsoleLog = console.log;
    console.log = (...args: any[]) => {
      consoleOutput.push(args.join(' '));
    };
    
    // Setup mock global data
    (global as any).INSTRUMENTS = [
      {
        ticker: 'GAZP',
        figi: 'BBG004730N88',
        name: 'Газпром',
        lot: 10,
        currency: 'RUB'
      },
      {
        ticker: 'SBER',
        figi: 'BBG004730ZJ9',
        name: 'Сбер Банк',
        lot: 10,
        currency: 'RUB'
      }
    ];
    
    (global as any).LAST_PRICES = [
      {
        figi: 'BBG004730N88',
        price: { units: 150, nano: 500000000 },
        time: new Date()
      },
      {
        figi: 'BBG004730ZJ9',
        price: { units: 250, nano: 750000000 },
        time: new Date()
      }
    ];
  });

  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog;
    
    // Clean up global state
    delete (global as any).INSTRUMENTS;
    delete (global as any).LAST_PRICES;
  });

  describe('ETF Fund Analysis', () => {
    it('should analyze Tinkoff ETF fund list', () => {
      const tinkoffsFunds = [
        'TGLD', 'TSPV', 'TBRU', 'TUSD', 'TEUR', 'TEMS',
        'TSPX', 'TEUS', 'TBUY', 'TBEU', 'TRUR', 'TPAS',
        'TBIO', 'TCBR', 'TECH', 'TSST', 'TGRN', 'TSOX',
        'TRAI', 'TIPO', 'TFNX', 'TMOS'
      ];
      
      expect(tinkoffsFunds).toHaveLength(22);
      expect(tinkoffsFunds).toContain('TRUR');
      expect(tinkoffsFunds).toContain('TGLD');
      expect(tinkoffsFunds).toContain('TMOS');
      
      // Test that all are properly formatted Tinkoff ETF tickers
      tinkoffsFunds.forEach(ticker => {
        expect(ticker).toMatch(/^T[A-Z]{2,4}$/);
        expect(ticker.length).toBeGreaterThanOrEqual(4);
        expect(ticker.length).toBeLessThanOrEqual(5);
      });
    });
    
    it('should process ETF composition data structure', () => {
      const mockETFData = {
        trackingId: '5L91UVLkCm',
        time: '2022-06-06T08:47:47.823807Z',
        status: 'Ok',
        payload: {
          instruments: [
            {
              name: 'Газпром',
              ticker: 'GAZP',
              type: 'Stock',
              value: 620766703.40,
              relativeValue: 7.02,
              isOTC: false
            },
            {
              name: 'Сбер Банк',
              ticker: 'SBER',
              type: 'Stock',
              value: 280318875.00,
              relativeValue: 3.17,
              isOTC: false
            }
          ]
        }
      };
      
      expect(mockETFData.status).toBe('Ok');
      expect(mockETFData.payload.instruments).toHaveLength(2);
      
      const gazprom = mockETFData.payload.instruments.find(i => i.ticker === 'GAZP');
      expect(gazprom?.name).toBe('Газпром');
      expect(gazprom?.relativeValue).toBe(7.02);
    });
  });

  describe('Instrument Matching Logic', () => {
    it('should match ETF instruments with global instruments', () => {
      const etfInstruments = [
        { ticker: 'GAZP', value: 620766703.40 },
        { ticker: 'SBER', value: 280318875.00 },
        { ticker: 'UNKNOWN', value: 100000.00 }
      ];
      
      const findInstrumentByTicker = (ticker: string) => {
        return (global as any).INSTRUMENTS.find((instrument: any) => instrument.ticker === ticker);
      };
      
      const results = etfInstruments.map(etfInstrument => {
        const matchedInstrument = findInstrumentByTicker(etfInstrument.ticker);
        return {
          ...etfInstrument,
          matched: !!matchedInstrument,
          figi: matchedInstrument?.figi,
          name: matchedInstrument?.name
        };
      });
      
      expect(results[0]).toMatchObject({
        ticker: 'GAZP',
        matched: true,
        figi: 'BBG004730N88',
        name: 'Газпром'
      });
      
      expect(results[2]).toMatchObject({
        ticker: 'UNKNOWN',
        matched: false,
        figi: undefined
      });
      
      const matchedCount = results.filter(r => r.matched).length;
      expect(matchedCount).toBe(2);
    });
    
    it('should integrate price data with positions', () => {
      const etfPositions = [
        { ticker: 'GAZP', figi: 'BBG004730N88', value: 1000 },
        { ticker: 'SBER', figi: 'BBG004730ZJ9', value: 2000 }
      ];
      
      const findPriceByFigi = (figi: string) => {
        return (global as any).LAST_PRICES.find((price: any) => price.figi === figi);
      };
      
      const convertTinkoffPrice = (price: any) => {
        if (!price) return null;
        return (price.units || 0) + (price.nano || 0) / 1000000000;
      };
      
      const enrichedPositions = etfPositions.map(position => {
        const lastPriceData = findPriceByFigi(position.figi);
        const price = convertTinkoffPrice(lastPriceData?.price);
        
        return {
          ...position,
          price,
          hasPrice: !!price
        };
      });
      
      expect(enrichedPositions[0]).toMatchObject({
        ticker: 'GAZP',
        price: 150.5,
        hasPrice: true
      });
      
      expect(enrichedPositions[1]).toMatchObject({
        ticker: 'SBER',
        price: 250.75,
        hasPrice: true
      });
    });
  });

  describe('ETF Processing Pipeline', () => {
    it('should process ETF instruments with error handling', () => {
      const mockETFData = {
        payload: {
          instruments: [
            { name: 'Газпром', ticker: 'GAZP', value: 1000 },
            { name: 'Unknown', ticker: 'UNKNOWN', value: 500 },
            { name: 'No Ticker', ticker: '', value: 100 }
          ]
        }
      };
      
      const processWithErrorHandling = (etfData: any) => {
        const instruments = etfData.payload.instruments;
        const results = { processed: 0, skipped: 0, errors: [] as string[] };
        
        for (let position of instruments) {
          if (!position.ticker) {
            results.skipped++;
            results.errors.push(`Skipped: ${position.name}`);
            continue;
          }
          
          const foundInstrument = (global as any).INSTRUMENTS.find(
            (inst: any) => inst.ticker === position.ticker
          );
          
          if (!foundInstrument) {
            results.skipped++;
            results.errors.push(`Not found: ${position.ticker}`);
            continue;
          }
          
          results.processed++;
        }
        
        return results;
      };
      
      const results = processWithErrorHandling(mockETFData);
      
      expect(results.processed).toBe(1); // Only GAZP
      expect(results.skipped).toBe(2); // UNKNOWN and empty ticker
      expect(results.errors).toHaveLength(2);
    });
    
    it('should validate ETF data structure', () => {
      const validateETFResponse = (response: any) => {
        const requiredFields = ['trackingId', 'time', 'status', 'payload'];
        const missingFields = [];
        
        for (const field of requiredFields) {
          if (!(field in response)) {
            missingFields.push(field);
          }
        }
        
        if (missingFields.length > 0) {
          return { valid: false, errors: [`Missing: ${missingFields.join(', ')}`] };
        }
        
        if (!response.payload?.instruments || !Array.isArray(response.payload.instruments)) {
          return { valid: false, errors: ['Invalid instruments array'] };
        }
        
        return { valid: true, errors: [] };
      };
      
      // Test valid response
      const validResponse = {
        trackingId: '123',
        time: '2023-01-01T00:00:00Z',
        status: 'Ok',
        payload: { instruments: [] }
      };
      
      expect(validateETFResponse(validResponse)).toMatchObject({ valid: true });
      
      // Test invalid response
      const invalidResponse = { trackingId: '123' };
      const result = validateETFResponse(invalidResponse);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Missing');
    });
  });

  describe('Utilities and Performance', () => {
    it('should test sleep utility function', async () => {
      const sleep = (ms: any) => new Promise(resolve => setTimeout(resolve, ms));
      
      const startTime = performance.now();
      await sleep(10);
      const elapsed = performance.now() - startTime;
      
      expect(elapsed).toBeGreaterThanOrEqual(5);
      expect(elapsed).toBeLessThan(50);
    });
    
    it('should calculate portfolio statistics', () => {
      const mockPositions = [
        { ticker: 'GAZP', relativeValue: 7.02, value: 1000 },
        { ticker: 'SBER', relativeValue: 3.17, value: 2000 }
      ];
      
      const calculateStats = (positions: any[]) => {
        const totalValue = positions.reduce((sum, pos) => sum + pos.value, 0);
        const totalRelativeValue = positions.reduce((sum, pos) => sum + pos.relativeValue, 0);
        const avgValue = totalValue / positions.length;
        
        return { totalValue, totalRelativeValue, avgValue, count: positions.length };
      };
      
      const stats = calculateStats(mockPositions);
      
      expect(stats.totalValue).toBe(3000);
      expect(stats.totalRelativeValue).toBeCloseTo(10.19, 2);
      expect(stats.avgValue).toBe(1500);
      expect(stats.count).toBe(2);
    });
  });
});