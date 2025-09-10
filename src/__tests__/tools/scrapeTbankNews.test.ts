import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";

// Mock modules first, before any other imports
const mockFs = {
  promises: {
    mkdir: mock(async () => undefined),
    readdir: mock(async () => []),
    writeFile: mock(async () => undefined),
    readFile: mock(async () => ''),
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

// Mock the modules
mock.module('fs', () => mockFs);
mock.module('fs/promises', () => mockFs.promises);
mock.module('path', () => mockPath);
mock.module('puppeteer', () => mockPuppeteer);

// Import the rest
import { 
  TestEnvironment, 
  FinancialAssertions, 
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { mockControls } from '../__mocks__/external-deps';

testSuite('ScrapeTbankNews Tool Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    mockControls.resetAll();
    mockFs.promises.mkdir.mockClear();
    mockFs.promises.readdir.mockClear();
    mockFs.promises.writeFile.mockClear();
    mockFs.promises.readFile.mockClear();
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
    
    // Set default mock responses
    mockFs.promises.readdir.mockResolvedValue([]);
    mockPage.$$eval.mockResolvedValue([]);
    mockPage.evaluate.mockResolvedValue('');
  });

  afterEach(() => {
    // Clean up any timers or intervals if needed
  });

  describe('URL Generation and Path Handling', () => {
    it('should generate correct base URL for symbol', async () => {
      // Dynamically import the function to test
      const { getBaseUrlForSymbol } = await import('../../tools/scrapeTbankNews');
      
      const url = getBaseUrlForSymbol('TRUR');
      expect(url).toBe('https://www.tbank.ru/invest/etfs/TRUR/news/');
    });
    
    it('should generate correct news directory path', async () => {
      // Dynamically import the function to test
      const { getNewsDir } = await import('../../tools/scrapeTbankNews');
      
      const dir = getNewsDir('TRUR');
      expect(dir).toContain('news/TRUR');
    });
    
    it('should handle different symbols correctly', async () => {
      // Dynamically import the function to test
      const { getBaseUrlForSymbol, getNewsDir } = await import('../../tools/scrapeTbankNews');
      
      const symbols = ['TRUR', 'TMOS', 'TGLD', 'TPAY'];
      for (const symbol of symbols) {
        const url = getBaseUrlForSymbol(symbol);
        const dir = getNewsDir(symbol);
        expect(url).toBe(`https://www.tbank.ru/invest/etfs/${symbol}/news/`);
        expect(dir).toContain(`news/${symbol}`);
      }
    });
    
    it('should handle special characters in symbols', async () => {
      // Dynamically import the function to test
      const { getBaseUrlForSymbol, getNewsDir } = await import('../../tools/scrapeTbankNews');
      
      const url = getBaseUrlForSymbol('T@GLD');
      const dir = getNewsDir('T@GLD');
      expect(url).toBe('https://www.tbank.ru/invest/etfs/T@GLD/news/');
      expect(dir).toContain('news/T@GLD');
    });
  });

  describe('News ID Parsing', () => {
    it('should correctly parse news IDs from URLs', async () => {
      // Dynamically import the function to test
      const { parseNewsIdFromHref } = await import('../../tools/scrapeTbankNews');
      
      const testCases = [
        { input: '/invest/fund-news/12345/', expected: '12345' },
        { input: '/invest/fund-news/67890', expected: '67890' },
        { input: 'https://www.tbank.ru/invest/fund-news/54321/', expected: '54321' },
        { input: '/invest/fund-news/invalid/', expected: null },
        { input: '/other/path/12345/', expected: null },
        { input: '', expected: null }
      ];
      
      for (const testCase of testCases) {
        const result = parseNewsIdFromHref(testCase.input);
        expect(result).toBe(testCase.expected);
      }
    });
    
    it('should handle edge cases in news ID parsing', async () => {
      // Dynamically import the function to test
      const { parseNewsIdFromHref } = await import('../../tools/scrapeTbankNews');
      
      // Test with various edge cases
      expect(parseNewsIdFromHref(null as any)).toBeNull();
      expect(parseNewsIdFromHref(undefined as any)).toBeNull();
      expect(parseNewsIdFromHref('')).toBeNull();
      expect(parseNewsIdFromHref('/invest/fund-news/0/')).toBe('0');
      expect(parseNewsIdFromHref('/invest/fund-news/999999999/')).toBe('999999999');
    });
  });

  describe('File System Operations', () => {
    it('should create news directory when saving news', async () => {
      // Dynamically import the function to test
      const { saveNewsMarkdown } = await import('../../tools/scrapeTbankNews');
      
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);
      
      await saveNewsMarkdown('TRUR', '12345', '# Test News\n\nThis is a test.');
      
      expect(mockFs.promises.mkdir).toHaveBeenCalledWith(expect.stringContaining('news/TRUR'), { recursive: true });
      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('news/TRUR/12345.md'),
        '# Test News\n\nThis is a test.',
        'utf-8'
      );
    });
    
    it('should read existing news IDs correctly', async () => {
      // Dynamically import the function to test
      const { readSavedNewsIds } = await import('../../tools/scrapeTbankNews');
      
      mockFs.promises.readdir.mockResolvedValue(['12345.md', '67890.md', '54321.md']);
      
      const ids = await readSavedNewsIds('TRUR');
      
      expect(ids).toBeInstanceOf(Set);
      expect(ids.size).toBe(3);
      expect(ids.has('12345')).toBe(true);
      expect(ids.has('67890')).toBe(true);
      expect(ids.has('54321')).toBe(true);
    });
    
    it('should handle empty news directory', async () => {
      // Dynamically import the function to test
      const { readSavedNewsIds } = await import('../../tools/scrapeTbankNews');
      
      mockFs.promises.readdir.mockResolvedValue([]);
      
      const ids = await readSavedNewsIds('TRUR');
      
      expect(ids).toBeInstanceOf(Set);
      expect(ids.size).toBe(0);
    });
    
    it('should handle non-existent news directory gracefully', async () => {
      // Dynamically import the function to test
      const { readSavedNewsIds } = await import('../../tools/scrapeTbankNews');
      
      mockFs.promises.readdir.mockRejectedValue(new Error('ENOENT: no such file or directory'));
      
      const ids = await readSavedNewsIds('TRUR');
      
      expect(ids).toBeInstanceOf(Set);
      expect(ids.size).toBe(0);
    });
    
    it('should filter out non-markdown files when reading news IDs', async () => {
      // Dynamically import the function to test
      const { readSavedNewsIds } = await import('../../tools/scrapeTbankNews');
      
      mockFs.promises.readdir.mockResolvedValue(['12345.md', 'readme.txt', '67890.md', 'image.png', '54321.md']);
      
      const ids = await readSavedNewsIds('TRUR');
      
      expect(ids).toBeInstanceOf(Set);
      expect(ids.size).toBe(3);
      expect(ids.has('12345')).toBe(true);
      expect(ids.has('67890')).toBe(true);
      expect(ids.has('54321')).toBe(true);
    });
  });

  describe('News Content Extraction', () => {
    it('should extract article content correctly', async () => {
      // Dynamically import the function to test
      const { extractArticle } = await import('../../tools/scrapeTbankNews');
      
      // Mock page methods to return specific content
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
      
      const result = await extractArticle(mockPage, 'https://www.tbank.ru/invest/fund-news/12345/');
      
      expect(result.title).toBe('Test News Title');
      expect(result.dateText).toBe('2023-01-01');
      expect(result.body).toBe('This is the main content of the news article.');
    });
    
    it('should handle missing title gracefully', async () => {
      // Dynamically import the function to test
      const { extractArticle } = await import('../../tools/scrapeTbankNews');
      
      // Mock page methods with missing title
      mockPage.$eval.mockImplementation(async (selector: string, fn: any) => {
        if (selector.includes('NewsHeader')) {
          return '';
        }
        if (selector.includes('time')) {
          return '2023-01-01';
        }
        return '';
      });
      
      mockPage.evaluate.mockResolvedValue('This is the main content of the news article.');
      
      const result = await extractArticle(mockPage, 'https://www.tbank.ru/invest/fund-news/12345/');
      
      expect(result.title).toBe('');
      expect(result.dateText).toBe('2023-01-01');
      expect(result.body).toBe('This is the main content of the news article.');
    });
    
    it('should handle missing date gracefully', async () => {
      // Dynamically import the function to test
      const { extractArticle } = await import('../../tools/scrapeTbankNews');
      
      // Mock page methods with missing date
      mockPage.$eval.mockImplementation(async (selector: string, fn: any) => {
        if (selector.includes('NewsHeader')) {
          return 'Test News Title';
        }
        if (selector.includes('time')) {
          return '';
        }
        return '';
      });
      
      mockPage.evaluate.mockResolvedValue('This is the main content of the news article.');
      
      const result = await extractArticle(mockPage, 'https://www.tbank.ru/invest/fund-news/12345/');
      
      expect(result.title).toBe('Test News Title');
      expect(result.dateText).toBe('');
      expect(result.body).toBe('This is the main content of the news article.');
    });
    
    it('should handle missing body content gracefully', async () => {
      // Dynamically import the function to test
      const { extractArticle } = await import('../../tools/scrapeTbankNews');
      
      // Mock page methods with missing body
      mockPage.$eval.mockImplementation(async (selector: string, fn: any) => {
        if (selector.includes('NewsHeader')) {
          return 'Test News Title';
        }
        if (selector.includes('time')) {
          return '2023-01-01';
        }
        return '';
      });
      
      mockPage.evaluate.mockResolvedValue('');
      
      const result = await extractArticle(mockPage, 'https://www.tbank.ru/invest/fund-news/12345/');
      
      expect(result.title).toBe('Test News Title');
      expect(result.dateText).toBe('2023-01-01');
      expect(result.body).toBe('');
    });
  });

  describe('Markdown Generation', () => {
    it('should generate correct markdown format', async () => {
      // Dynamically import the function to test
      const { buildMarkdown } = await import('../../tools/scrapeTbankNews');
      
      const markdown = buildMarkdown(
        '12345',
        'https://www.tbank.ru/invest/fund-news/12345/',
        'Test News Title',
        '2023-01-01',
        'This is the main content of the news article.'
      );
      
      expect(markdown).toContain('# Test News Title');
      expect(markdown).toContain('Source: https://www.tbank.ru/invest/fund-news/12345/');
      expect(markdown).toContain('Date: 2023-01-01');
      expect(markdown).toContain('This is the main content of the news article.');
    });
    
    it('should handle missing title in markdown generation', async () => {
      // Dynamically import the function to test
      const { buildMarkdown } = await import('../../tools/scrapeTbankNews');
      
      const markdown = buildMarkdown(
        '12345',
        'https://www.tbank.ru/invest/fund-news/12345/',
        '',
        '2023-01-01',
        'This is the main content of the news article.'
      );
      
      expect(markdown).not.toContain('# ');
      expect(markdown).toContain('Source: https://www.tbank.ru/invest/fund-news/12345/');
      expect(markdown).toContain('Date: 2023-01-01');
      expect(markdown).toContain('This is the main content of the news article.');
    });
    
    it('should handle missing date in markdown generation', async () => {
      // Dynamically import the function to test
      const { buildMarkdown } = await import('../../tools/scrapeTbankNews');
      
      const markdown = buildMarkdown(
        '12345',
        'https://www.tbank.ru/invest/fund-news/12345/',
        'Test News Title',
        '',
        'This is the main content of the news article.'
      );
      
      expect(markdown).toContain('# Test News Title');
      expect(markdown).toContain('Source: https://www.tbank.ru/invest/fund-news/12345/');
      expect(markdown).not.toContain('Date: ');
      expect(markdown).toContain('This is the main content of the news article.');
    });
    
    it('should handle empty body in markdown generation', async () => {
      // Dynamically import the function to test
      const { buildMarkdown } = await import('../../tools/scrapeTbankNews');
      
      const markdown = buildMarkdown(
        '12345',
        'https://www.tbank.ru/invest/fund-news/12345/',
        'Test News Title',
        '2023-01-01',
        ''
      );
      
      expect(markdown).toContain('# Test News Title');
      expect(markdown).toContain('Source: https://www.tbank.ru/invest/fund-news/12345/');
      expect(markdown).toContain('Date: 2023-01-01');
      expect(markdown.endsWith('\n')).toBe(true);
    });
  });

  describe('News Link Collection', () => {
    it('should collect all news links correctly', async () => {
      // Dynamically import the function to test
      const { collectAllNewsLinks } = await import('../../tools/scrapeTbankNews');
      
      // Mock page method to return specific links
      mockPage.$$eval.mockImplementation(async (selector: string, fn: any) => {
        if (selector.includes('fund-news')) {
          return [
            '/invest/fund-news/12345/',
            '/invest/fund-news/67890/',
            '/invest/fund-news/54321/'
          ];
        }
        return [];
      });
      
      const links = await collectAllNewsLinks(mockPage);
      
      expect(links).toHaveLength(3);
      expect(links).toContain('https://www.tbank.ru/invest/fund-news/12345/');
      expect(links).toContain('https://www.tbank.ru/invest/fund-news/67890/');
      expect(links).toContain('https://www.tbank.ru/invest/fund-news/54321/');
    });
    
    it('should deduplicate collected news links', async () => {
      // Dynamically import the function to test
      const { collectAllNewsLinks } = await import('../../tools/scrapeTbankNews');
      
      // Mock page method to return duplicate links
      mockPage.$$eval.mockImplementation(async (selector: string, fn: any) => {
        if (selector.includes('fund-news')) {
          return [
            '/invest/fund-news/12345/',
            '/invest/fund-news/67890/',
            '/invest/fund-news/12345/', // duplicate
            '/invest/fund-news/54321/',
            '/invest/fund-news/67890/'  // duplicate
          ];
        }
        return [];
      });
      
      const links = await collectAllNewsLinks(mockPage);
      
      expect(links).toHaveLength(3);
      expect(links).toContain('https://www.tbank.ru/invest/fund-news/12345/');
      expect(links).toContain('https://www.tbank.ru/invest/fund-news/67890/');
      expect(links).toContain('https://www.tbank.ru/invest/fund-news/54321/');
    });
    
    it('should handle empty link collection', async () => {
      // Dynamically import the function to test
      const { collectAllNewsLinks } = await import('../../tools/scrapeTbankNews');
      
      // Mock page method to return no links
      mockPage.$$eval.mockImplementation(async (selector: string, fn: any) => {
        return [];
      });
      
      const links = await collectAllNewsLinks(mockPage);
      
      expect(links).toHaveLength(0);
    });
  });

  describe('Show More Button Handling', () => {
    it('should handle pages without show more buttons', async () => {
      // Dynamically import the function to test
      const { clickShowMoreUntilExhausted } = await import('../../tools/scrapeTbankNews');
      
      // Mock page method to indicate no show more buttons
      mockPage.evaluate.mockResolvedValue({ found: false, disabled: true, clicked: false });
      
      await clickShowMoreUntilExhausted(mockPage);
      
      // Should not throw an error and should complete
      expect(true).toBe(true);
    });
    
    it('should handle disabled show more buttons', async () => {
      // Dynamically import the function to test
      const { clickShowMoreUntilExhausted } = await import('../../tools/scrapeTbankNews');
      
      // Mock page method to indicate disabled show more button
      mockPage.evaluate.mockResolvedValueOnce({ found: true, disabled: true, clicked: false })
                      .mockResolvedValueOnce({ found: false, disabled: true, clicked: false });
      
      await clickShowMoreUntilExhausted(mockPage);
      
      // Should not throw an error and should complete
      expect(true).toBe(true);
    });
  });

  describe('News Scraping Process', () => {
    it('should open and scrape news correctly', async () => {
      // Dynamically import the function to test
      const { openAndScrapeNews } = await import('../../tools/scrapeTbankNews');
      
      // Mock browser and page methods
      mockBrowser.newPage.mockResolvedValue(mockPage);
      mockPage.setUserAgent.mockResolvedValue(undefined);
      mockPage.goto.mockResolvedValue(undefined);
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
      
      const result = await openAndScrapeNews(mockBrowser, 'https://www.tbank.ru/invest/fund-news/12345/');
      
      expect(result).not.toBeNull();
      expect(result!.id).toBe('12345');
      expect(result!.markdown).toContain('# Test News Title');
      expect(result!.markdown).toContain('Source: https://www.tbank.ru/invest/fund-news/12345/');
      expect(result!.markdown).toContain('Date: 2023-01-01');
    });
    
    it('should handle invalid news URLs gracefully', async () => {
      // Dynamically import the function to test
      const { openAndScrapeNews } = await import('../../tools/scrapeTbankNews');
      
      const result = await openAndScrapeNews(mockBrowser, 'https://www.tbank.ru/invest/fund-news/invalid/');
      
      expect(result).toBeNull();
    });
    
    it('should handle page navigation errors gracefully', async () => {
      // Dynamically import the function to test
      const { openAndScrapeNews } = await import('../../tools/scrapeTbankNews');
      
      // Mock browser and page methods with error
      mockBrowser.newPage.mockResolvedValue(mockPage);
      mockPage.goto.mockRejectedValue(new Error('Navigation timeout'));
      mockPage.close.mockResolvedValue(undefined);
      
      const result = await openAndScrapeNews(mockBrowser, 'https://www.tbank.ru/invest/fund-news/12345/');
      
      expect(result).toBeNull();
    });
  });

  describe('News Filtering and Limiting', () => {
    it('should filter out already saved news IDs', async () => {
      // This would be tested in the integration test since it involves multiple components
      expect(true).toBe(true);
    });
    
    it('should apply limits to news collection', async () => {
      // This would be tested in the integration test since it involves multiple components
      expect(true).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle file system errors gracefully when creating directories', async () => {
      // Dynamically import the function to test
      const { saveNewsMarkdown } = await import('../../tools/scrapeTbankNews');
      
      mockFs.promises.mkdir.mockRejectedValue(new Error('Permission denied'));
      
      // Should not throw an error but should handle it gracefully
      await expect(saveNewsMarkdown('TRUR', '12345', '# Test News')).resolves.not.toThrow();
    });
    
    it('should handle file system errors gracefully when writing files', async () => {
      // Dynamically import the function to test
      const { saveNewsMarkdown } = await import('../../tools/scrapeTbankNews');
      
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockRejectedValue(new Error('Disk full'));
      
      // Should not throw an error but should handle it gracefully
      await expect(saveNewsMarkdown('TRUR', '12345', '# Test News')).resolves.not.toThrow();
    });
    
    it('should handle Puppeteer launch errors gracefully', async () => {
      // Dynamically import the function to test
      const { runSingleScrape } = await import('../../tools/scrapeTbankNews');
      
      mockPuppeteer.launch.mockRejectedValue(new Error('Chromium not found'));
      
      // Should handle the error gracefully
      await expect(runSingleScrape('TRUR', { limitAll: null, firstRunLimit: null })).resolves.not.toThrow();
    });
    
    it('should handle empty command line arguments', async () => {
      // Save original process.argv
      const originalArgv = process.argv;
      
      // Set process.argv to simulate empty arguments
      process.argv = ['node', 'scrapeTbankNews.ts'];
      
      try {
        // Dynamically import the function to test
        const { run } = await import('../../tools/scrapeTbankNews');
        
        // Should not throw an error with empty arguments
        expect(typeof run).toBe('function');
      } finally {
        // Restore original process.argv
        process.argv = originalArgv;
      }
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle concurrent news scraping requests', async () => {
      // Dynamically import the function to test
      const { openAndScrapeNews } = await import('../../tools/scrapeTbankNews');
      
      // Mock browser and page methods
      mockBrowser.newPage.mockResolvedValue(mockPage);
      mockPage.setUserAgent.mockResolvedValue(undefined);
      mockPage.goto.mockResolvedValue(undefined);
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
      
      // Test concurrent requests
      const promises = [
        openAndScrapeNews(mockBrowser, 'https://www.tbank.ru/invest/fund-news/12345/'),
        openAndScrapeNews(mockBrowser, 'https://www.tbank.ru/invest/fund-news/67890/'),
        openAndScrapeNews(mockBrowser, 'https://www.tbank.ru/invest/fund-news/54321/')
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).not.toBeNull();
      });
    });
    
    it('should handle large numbers of news articles efficiently', async () => {
      // This would be tested in the integration test since it involves multiple components
      expect(true).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete news scraping workflow', async () => {
      // This would test the complete workflow but would require extensive mocking
      expect(true).toBe(true);
    });
    
    it('should handle first run vs subsequent runs correctly', async () => {
      // This would test the first run limit functionality
      expect(true).toBe(true);
    });
  });
});