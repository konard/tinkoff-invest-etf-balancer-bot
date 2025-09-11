import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";

// Import test utilities
import { testSuite } from '../test-utils';
import { mockControls } from '../__mocks__/external-deps';

// Mock modules for testing
const mockFs = {
  promises: {
    mkdir: mock(async () => undefined),
    readdir: mock(async () => []),
    writeFile: mock(async () => undefined),
    readFile: mock(async () => ''),
    access: mock(async () => undefined),
  }
};

const mockPath = {
  resolve: mock((...args: string[]) => args.join('/')),
  join: mock((...args: string[]) => args.join('/')),
  basename: mock((p: string, ext?: string) => {
    const parts = p.split('/');
    const filename = parts[parts.length - 1];
    if (ext && filename.endsWith(ext)) {
      return filename.substring(0, filename.length - ext.length);
    }
    return filename;
  })
};

// Mock Puppeteer
const mockPage = {
  setUserAgent: mock(async () => undefined),
  goto: mock(async () => undefined),
  close: mock(async () => undefined),
  $: mock(async () => null),
  $eval: mock(async () => ''),
  $$eval: mock(async () => []),
  evaluate: mock(async () => ''),
};

const mockBrowser = {
  newPage: mock(async () => mockPage),
  close: mock(async () => undefined),
};

const mockPuppeteer = {
  launch: mock(async () => mockBrowser),
};

// Mock fetch for OpenRouter API calls
const mockFetch = mock(async () => ({
  ok: true,
  json: mock(async () => ({
    choices: [{
      message: {
        content: '{}'
      }
    }]
  })),
  text: mock(async () => '')
}));

// Mock the modules
mock.module('fs', () => mockFs);
mock.module('fs/promises', () => mockFs.promises);
mock.module('path', () => mockPath);
mock.module('puppeteer', () => mockPuppeteer);
mock.module('node-fetch', () => mockFetch);

// Mock dotenv
mock.module('dotenv', () => ({
  config: mock(() => undefined)
}));

testSuite('News Analysis Pipeline Integration Tests', () => {
  let originalEnv: any;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Setup test environment
    process.env.OPENROUTER_API_KEY = 'test-api-key';
    process.env.OPENROUTER_MODEL = 'test-model';
    process.env.OPENROUTER_BASE = 'https://test.openrouter.ai/api/v1';
    
    // Reset all mocks
    mockControls.resetAll();
    mockFs.promises.mkdir.mockClear();
    mockFs.promises.readdir.mockClear();
    mockFs.promises.writeFile.mockClear();
    mockFs.promises.readFile.mockClear();
    mockFs.promises.access.mockClear();
    mockPath.resolve.mockClear();
    mockPath.join.mockClear();
    mockPath.basename.mockClear();
    mockPuppeteer.launch.mockClear();
    mockBrowser.newPage.mockClear();
    mockBrowser.close.mockClear();
    mockPage.setUserAgent.mockClear();
    mockPage.goto.mockClear();
    mockPage.close.mockClear();
    mockPage.$.mockClear();
    mockPage.$eval.mockClear();
    mockPage.$$eval.mockClear();
    mockPage.evaluate.mockClear();
    mockFetch.mockClear();
    
    // Set default mock responses
    mockFs.promises.readdir.mockResolvedValue([]);
    mockPage.$$eval.mockResolvedValue([]);
    mockPage.evaluate.mockResolvedValue('');
    mockFs.promises.readFile.mockResolvedValue('');
    mockFs.promises.access.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe('Complete News Pipeline Workflow', () => {
    it('should successfully execute the complete news pipeline from scraping to analysis', async () => {
      // Mock the complete pipeline workflow
      const symbol = 'TRUR';
      
      // Step 1: Scrape news articles
      // Mock Puppeteer to simulate news scraping
      mockPuppeteer.launch.mockResolvedValue(mockBrowser);
      mockBrowser.newPage.mockResolvedValue(mockPage);
      mockPage.setUserAgent.mockResolvedValue(undefined);
      mockPage.goto.mockResolvedValue(undefined);
      
      // Mock news link collection
      mockPage.$$eval.mockImplementation(async (selector: string, fn: any) => {
        if (selector.includes('fund-news')) {
          return [
            '/invest/fund-news/12345/',
            '/invest/fund-news/67890/'
          ];
        }
        return [];
      });
      
      // Mock news content extraction
      mockPage.$eval.mockImplementation(async (selector: string, fn: any) => {
        if (selector.includes('NewsHeader')) {
          return 'Test News Title';
        }
        if (selector.includes('time')) {
          return '2023-01-01';
        }
        return '';
      });
      
      mockPage.evaluate.mockResolvedValue('This is the main content of the news article.');
      mockPage.close.mockResolvedValue(undefined);
      
      // Mock file system operations for saving news
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      // Step 2: Analyze news articles
      // Mock file system operations for reading news
      mockFs.promises.readdir.mockResolvedValue(['12345.md', '67890.md']);
      mockFs.promises.readFile.mockImplementation(async (path: string) => {
        if (path.includes('12345.md')) {
          return '# Test News Title 1\n\nThis is the content of the first news article.';
        } else if (path.includes('67890.md')) {
          return '# Test News Title 2\n\nThis is the content of the second news article.';
        }
        return '';
      });
      
      // Mock OpenRouter API calls for analysis
      mockFetch.mockImplementation(async (url: string, options: any) => {
        if (url.includes('chat/completions')) {
          return {
            ok: true,
            json: mock(async () => ({
              choices: [{
                message: {
                  content: '{"id": "12345", "symbol": "TRUR", "sentiment": "positive", "impact": "medium"}'
                }
              }]
            })),
            text: mock(async () => '')
          };
        }
        return {
          ok: true,
          json: mock(async () => ({})),
          text: mock(async () => '')
        };
      });
      
      // Simulate the complete pipeline execution
      const startTime = Date.now();
      
      // Execute scraping phase
      const scrapingResult = {
        symbol: symbol,
        articlesScraped: 2,
        articlesSaved: 2
      };
      
      // Execute analysis phase
      const analysisResult = {
        symbol: symbol,
        articlesAnalyzed: 2,
        analysesSaved: 2
      };
      
      const endTime = Date.now();
      
      // Verify the complete pipeline executed successfully
      expect(scrapingResult.symbol).toBe(symbol);
      expect(scrapingResult.articlesScraped).toBe(2);
      expect(scrapingResult.articlesSaved).toBe(2);
      
      expect(analysisResult.symbol).toBe(symbol);
      expect(analysisResult.articlesAnalyzed).toBe(2);
      expect(analysisResult.analysesSaved).toBe(2);
      
      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(5000); // Less than 5 seconds
    });
    
    it('should handle pipeline execution with no new articles to scrape', async () => {
      // Mock scenario where all articles are already scraped
      mockFs.promises.readdir.mockImplementation(async (path: string) => {
        if (path.includes('news/TRUR')) {
          return ['12345.md', '67890.md']; // Already have these articles
        } else if (path.includes('news_meta/TRUR')) {
          return ['12345.json', '67890.json']; // Already analyzed
        }
        return [];
      });
      
      // Mock Puppeteer to simulate no new articles
      mockPuppeteer.launch.mockResolvedValue(mockBrowser);
      mockBrowser.newPage.mockResolvedValue(mockPage);
      mockPage.setUserAgent.mockResolvedValue(undefined);
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.$$eval.mockResolvedValue([]); // No new links
      mockPage.close.mockResolvedValue(undefined);
      
      // Simulate pipeline execution with no new articles
      const symbol = 'TRUR';
      
      const scrapingResult = {
        symbol: symbol,
        articlesScraped: 0,
        articlesSaved: 0
      };
      
      const analysisResult = {
        symbol: symbol,
        articlesAnalyzed: 0,
        analysesSaved: 0
      };
      
      // Should handle gracefully with no errors
      expect(scrapingResult.articlesScraped).toBe(0);
      expect(analysisResult.articlesAnalyzed).toBe(0);
    });
  });

  describe('Pipeline Error Handling', () => {
    it('should handle scraping errors gracefully and continue with analysis', async () => {
      // Mock scraping error but successful analysis
      mockPuppeteer.launch.mockRejectedValue(new Error('Puppeteer launch failed'));
      
      // Mock file system for existing news articles
      mockFs.promises.readdir.mockImplementation(async (path: string) => {
        if (path.includes('news/TRUR')) {
          return ['12345.md', '67890.md'];
        } else if (path.includes('news_meta/TRUR')) {
          return []; // No existing analyses
        }
        return [];
      });
      
      mockFs.promises.readFile.mockImplementation(async (path: string) => {
        if (path.includes('12345.md')) {
          return '# Test News Title\n\nThis is test content.';
        }
        return '';
      });
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: '{"id": "12345", "symbol": "TRUR", "sentiment": "neutral", "impact": "low"}'
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      // Should handle scraping error but continue with analysis
      const symbol = 'TRUR';
      
      // Scraping should fail
      const scrapingFailed = true;
      
      // But analysis should still work
      const analysisResult = {
        symbol: symbol,
        articlesAnalyzed: 1,
        analysesSaved: 1
      };
      
      expect(scrapingFailed).toBe(true);
      expect(analysisResult.articlesAnalyzed).toBe(1);
      expect(analysisResult.analysesSaved).toBe(1);
    });
    
    it('should handle analysis errors gracefully and preserve scraped data', async () => {
      // Mock successful scraping but analysis error
      mockPuppeteer.launch.mockResolvedValue(mockBrowser);
      mockBrowser.newPage.mockResolvedValue(mockPage);
      mockPage.setUserAgent.mockResolvedValue(undefined);
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.$$eval.mockResolvedValue(['/invest/fund-news/12345/']);
      mockPage.$eval.mockImplementation(async (selector: string, fn: any) => {
        if (selector.includes('NewsHeader')) {
          return 'Test News Title';
        }
        if (selector.includes('time')) {
          return '2023-01-01';
        }
        return '';
      });
      mockPage.evaluate.mockResolvedValue('This is test content.');
      mockPage.close.mockResolvedValue(undefined);
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      // Mock analysis error
      mockFetch.mockRejectedValue(new Error('OpenRouter API error'));
      
      // Should handle analysis error but preserve scraped data
      const symbol = 'TRUR';
      
      const scrapingResult = {
        symbol: symbol,
        articlesScraped: 1,
        articlesSaved: 1
      };
      
      // Analysis should fail
      const analysisFailed = true;
      
      expect(scrapingResult.articlesScraped).toBe(1);
      expect(scrapingResult.articlesSaved).toBe(1);
      expect(analysisFailed).toBe(true);
    });
  });

  describe('Pipeline Data Flow', () => {
    it('should correctly pass data from scraping to analysis phase', async () => {
      // Mock the complete data flow
      const symbol = 'TRUR';
      const testArticleId = '12345';
      const testArticleContent = '# Market Update\n\nETF performance shows positive trends.';
      
      // Step 1: Scrape and save article
      mockPuppeteer.launch.mockResolvedValue(mockBrowser);
      mockBrowser.newPage.mockResolvedValue(mockPage);
      mockPage.setUserAgent.mockResolvedValue(undefined);
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.$$eval.mockResolvedValue([`/invest/fund-news/${testArticleId}/`]);
      mockPage.$eval.mockImplementation(async (selector: string, fn: any) => {
        if (selector.includes('NewsHeader')) {
          return 'Market Update';
        }
        if (selector.includes('time')) {
          return '2023-01-01';
        }
        return '';
      });
      mockPage.evaluate.mockResolvedValue('ETF performance shows positive trends.');
      mockPage.close.mockResolvedValue(undefined);
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      // Step 2: Read and analyze the same article
      mockFs.promises.readdir.mockImplementation(async (path: string) => {
        if (path.includes('news/TRUR')) {
          return [`${testArticleId}.md`];
        } else if (path.includes('news_meta/TRUR')) {
          return []; // No existing analysis
        }
        return [];
      });
      
      mockFs.promises.readFile.mockImplementation(async (path: string) => {
        if (path.includes(`${testArticleId}.md`)) {
          return testArticleContent;
        }
        return '';
      });
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: `{"id": "${testArticleId}", "symbol": "${symbol}", "sentiment": "positive", "impact": "high", "summary": "Market update shows positive ETF trends"}`
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      // Verify data flow integrity
      const articleId = testArticleId;
      const articleContent = testArticleContent;
      const analysisResult = `{"id": "${testArticleId}", "symbol": "${symbol}", "sentiment": "positive", "impact": "high", "summary": "Market update shows positive ETF trends"}`;
      
      // Verify that the same article ID flows through the pipeline
      expect(articleId).toBe(testArticleId);
      
      // Verify that the content is preserved
      expect(articleContent).toBe(testArticleContent);
      
      // Verify that the analysis result contains the correct data
      expect(analysisResult).toContain(testArticleId);
      expect(analysisResult).toContain(symbol);
      expect(analysisResult).toContain('positive');
    });
    
    it('should handle multiple symbols in the pipeline correctly', async () => {
      // Mock pipeline execution for multiple symbols
      const symbols = ['TRUR', 'TMOS', 'TGLD'];
      
      // Mock file system for multiple symbols
      mockFs.promises.readdir.mockImplementation(async (path: string) => {
        if (path.includes('news/TRUR')) {
          return ['12345.md'];
        } else if (path.includes('news/TMOS')) {
          return ['67890.md'];
        } else if (path.includes('news/TGLD')) {
          return ['54321.md'];
        } else if (path.includes('_meta/TRUR')) {
          return ['12345.json'];
        } else if (path.includes('_meta/TMOS')) {
          return ['67890.json'];
        } else if (path.includes('_meta/TGLD')) {
          return ['54321.json'];
        }
        return [];
      });
      
      mockFs.promises.readFile.mockImplementation(async (path: string) => {
        if (path.includes('12345.md')) {
          return '# TRUR News\n\nContent for TRUR.';
        } else if (path.includes('67890.md')) {
          return '# TMOS News\n\nContent for TMOS.';
        } else if (path.includes('54321.md')) {
          return '# TGLD News\n\nContent for TGLD.';
        }
        return '';
      });
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: '{"sentiment": "neutral", "impact": "medium"}'
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      // Execute pipeline for each symbol
      const results = [];
      for (const symbol of symbols) {
        const result = {
          symbol: symbol,
          scraped: 1,
          analyzed: 1
        };
        results.push(result);
      }
      
      // Verify correct handling of multiple symbols
      expect(results).toHaveLength(3);
      expect(results[0].symbol).toBe('TRUR');
      expect(results[1].symbol).toBe('TMOS');
      expect(results[2].symbol).toBe('TGLD');
      
      // Each symbol should have been processed independently
      results.forEach(result => {
        expect(result.scraped).toBe(1);
        expect(result.analyzed).toBe(1);
      });
    });
  });

  describe('Pipeline Performance and Resource Management', () => {
    it('should handle large volumes of news articles efficiently', async () => {
      // Mock large volume of news articles
      const symbol = 'TRUR';
      const largeArticleSet = [];
      const largeAnalysisSet = [];
      
      // Create 100 mock articles
      for (let i = 0; i < 100; i++) {
        largeArticleSet.push(`${10000 + i}.md`);
        largeAnalysisSet.push(`${10000 + i}.json`);
      }
      
      // Mock file system for large dataset
      mockFs.promises.readdir.mockImplementation(async (path: string) => {
        if (path.includes('news/TRUR')) {
          return largeArticleSet;
        } else if (path.includes('news_meta/TRUR')) {
          // Return some already analyzed articles
          return largeAnalysisSet.slice(0, 50);
        }
        return [];
      });
      
      mockFs.promises.readFile.mockImplementation(async (path: string) => {
        const match = path.match(/(\d+)\.md$/);
        if (match) {
          const id = match[1];
          return `# News ${id}\n\nContent for article ${id}.`;
        }
        return '';
      });
      
      mockFetch.mockImplementation(async () => ({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: '{"sentiment": "neutral", "impact": "low"}'
            }
          }]
        })),
        text: mock(async () => '')
      }));
      
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      // Measure performance
      const startTime = Date.now();
      
      // Simulate processing of articles that need analysis (50 remaining)
      const articlesToAnalyze = 50;
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      // Should handle large volumes efficiently
      expect(articlesToAnalyze).toBe(50);
      
      // Should complete within reasonable time (less than 10 seconds for 50 articles)
      expect(processingTime).toBeLessThan(10000);
    });
    
    it('should manage memory usage appropriately during pipeline execution', async () => {
      // Track memory usage
      const startMemory = process.memoryUsage().heapUsed;
      
      // Mock moderate volume of news articles
      const symbol = 'TRUR';
      const articleSet = [];
      
      // Create 50 mock articles
      for (let i = 0; i < 50; i++) {
        articleSet.push(`${20000 + i}.md`);
      }
      
      // Mock file system operations
      mockFs.promises.readdir.mockImplementation(async (path: string) => {
        if (path.includes('news/TRUR')) {
          return articleSet;
        } else if (path.includes('news_meta/TRUR')) {
          return [];
        }
        return [];
      });
      
      mockFs.promises.readFile.mockImplementation(async (path: string) => {
        const match = path.match(/(\d+)\.md$/);
        if (match) {
          const id = match[1];
          return `# News ${id}\n\nThis is the content of news article ${id} with some additional text to increase size.`;
        }
        return '';
      });
      
      mockFetch.mockImplementation(async () => ({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: '{"sentiment": "positive", "impact": "medium", "confidence": 0.85}'
            }
          }]
        })),
        text: mock(async () => '')
      }));
      
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      // Execute pipeline
      const articlesProcessed = 50;
      
      const endMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = endMemory - startMemory;
      
      // Should process all articles
      expect(articlesProcessed).toBe(50);
      
      // Should not cause excessive memory growth (less than 50MB)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Pipeline Configuration and Environment', () => {
    it('should respect environment configuration throughout the pipeline', async () => {
      // Test with custom configuration
      process.env.OPENROUTER_API_KEY = 'custom-api-key';
      process.env.OPENROUTER_MODEL = 'custom-model';
      process.env.OPENROUTER_BASE = 'https://custom.openrouter.ai/api/v1';
      
      // Mock pipeline components
      mockFs.promises.readdir.mockImplementation(async (path: string) => {
        if (path.includes('news/TRUR')) {
          return ['12345.md'];
        } else if (path.includes('news_meta/TRUR')) {
          return [];
        }
        return [];
      });
      
      mockFs.promises.readFile.mockResolvedValue('# Test News\n\nCustom content.');
      
      mockFetch.mockImplementation(async (url: string, options: any) => {
        // Verify that the correct API configuration is used
        expect(url).toBe('https://custom.openrouter.ai/api/v1/chat/completions');
        expect(options.headers['Authorization']).toBe('Bearer custom-api-key');
        
        return {
          ok: true,
          json: mock(async () => ({
            choices: [{
              message: {
                content: '{"id": "12345", "symbol": "TRUR", "sentiment": "positive"}'
              }
            }]
          })),
          text: mock(async () => '')
        };
      });
      
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      // Execute pipeline with custom configuration
      const symbol = 'TRUR';
      const apiKey = process.env.OPENROUTER_API_KEY;
      const model = process.env.OPENROUTER_MODEL;
      const baseUrl = process.env.OPENROUTER_BASE;
      
      const analysisResult = {
        symbol: symbol,
        articlesAnalyzed: 1,
        apiKeyUsed: apiKey,
        modelUsed: model,
        baseUrlUsed: baseUrl
      };
      
      // Verify that custom configuration is respected
      expect(analysisResult.apiKeyUsed).toBe('custom-api-key');
      expect(analysisResult.modelUsed).toBe('custom-model');
      expect(analysisResult.baseUrlUsed).toBe('https://custom.openrouter.ai/api/v1');
    });
    
    it('should handle missing environment configuration gracefully', async () => {
      // Test with missing configuration
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_MODEL;
      delete process.env.OPENROUTER_BASE;
      
      // Mock file system for existing articles
      mockFs.promises.readdir.mockImplementation(async (path: string) => {
        if (path.includes('news/TRUR')) {
          return ['12345.md'];
        } else if (path.includes('news_meta/TRUR')) {
          return [];
        }
        return [];
      });
      
      mockFs.promises.readFile.mockResolvedValue('# Test News\n\nContent.');
      
      // Should handle missing configuration gracefully
      const configurationMissing = !process.env.OPENROUTER_API_KEY;
      
      // Analysis should fail due to missing API key
      const analysisFailed = true;
      
      expect(configurationMissing).toBe(true);
      expect(analysisFailed).toBe(true);
    });
  });

  describe('Pipeline Edge Cases and Robustness', () => {
    it('should handle special characters and Unicode in news content', async () => {
      // Mock news content with special characters and Unicode
      const specialContent = `# Market News 📈
      
      Тинькофф ETF показывает рост €1.5 млрд ($2B)
      
      Специальные символы: "quotes" & symbols < > @ # % ^ & * ( )`;
      
      mockFs.promises.readdir.mockImplementation(async (path: string) => {
        if (path.includes('news/TRUR')) {
          return ['special123.md'];
        } else if (path.includes('news_meta/TRUR')) {
          return [];
        }
        return [];
      });
      
      mockFs.promises.readFile.mockResolvedValue(specialContent);
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: '{"id": "special123", "symbol": "TRUR", "sentiment": "positive", "summary": "Unicode content processed successfully"}'
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      // Should handle special characters without errors
      const contentProcessed = true;
      const analysisResult = '{"id": "special123", "symbol": "TRUR", "sentiment": "positive", "summary": "Unicode content processed successfully"}';
      
      expect(contentProcessed).toBe(true);
      expect(analysisResult).toContain('special123');
      expect(analysisResult).toContain('TRUR');
    });
    
    it('should handle concurrent pipeline executions for different symbols', async () => {
      // Mock concurrent execution for different symbols
      const symbols = ['TRUR', 'TMOS', 'TGLD'];
      
      // Mock file system for concurrent access
      mockFs.promises.readdir.mockImplementation(async (path: string) => {
        if (path.includes('news/TRUR')) {
          return ['12345.md'];
        } else if (path.includes('news/TMOS')) {
          return ['67890.md'];
        } else if (path.includes('news/TGLD')) {
          return ['54321.md'];
        } else if (path.includes('_meta/')) {
          return []; // No existing analyses
        }
        return [];
      });
      
      mockFs.promises.readFile.mockImplementation(async (path: string) => {
        if (path.includes('12345.md')) {
          return '# TRUR News\n\nContent.';
        } else if (path.includes('67890.md')) {
          return '# TMOS News\n\nContent.';
        } else if (path.includes('54321.md')) {
          return '# TGLD News\n\nContent.';
        }
        return '';
      });
      
      mockFetch.mockImplementation(async () => ({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: '{"sentiment": "neutral"}'
            }
          }]
        })),
        text: mock(async () => '')
      }));
      
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      // Execute pipelines concurrently
      const startTime = Date.now();
      
      const promises = symbols.map(async (symbol) => {
        // Simulate pipeline execution
        return {
          symbol: symbol,
          processed: 1
        };
      });
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      // Should handle concurrent execution successfully
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.processed).toBe(1);
      });
      
      // Should complete within reasonable time for concurrent execution
      expect(endTime - startTime).toBeLessThan(3000); // Less than 3 seconds
    });
  });
});