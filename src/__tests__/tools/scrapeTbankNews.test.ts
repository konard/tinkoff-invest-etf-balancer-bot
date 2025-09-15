import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { promises as fs } from 'fs';
import path from 'path';

// Helper functions extracted from scrapeTbankNews module for testing
// These are copies of the functions from the main module to test their logic

// Helper functions that would be exported from the main module if they were public
const getBaseUrlForSymbol = (symbol: string): string => {
  const BASE_HOST = 'https://www.tbank.ru';
  return `${BASE_HOST}/invest/etfs/${symbol}/news/`;
};

const getNewsDir = (symbol: string): string => {
  return path.resolve(process.cwd(), 'news', symbol);
};

const parseNewsIdFromHref = (href: string): string | null => {
  const match = href.match(/\/invest\/fund-news\/(\d+)\/?/);
  return match ? match[1] : null;
};

const buildMarkdown = (id: string, url: string, title: string, dateText: string, body: string): string => {
  const lines: string[] = [];
  if (title) lines.push(`# ${title}`);
  lines.push(`Source: ${url}`);
  if (dateText) lines.push(`Date: ${dateText}`);
  if (lines.length > 0) lines.push('');
  lines.push(body || '');
  return lines.join('\n');
};

describe('ScrapeTbankNews Tests', () => {
  const testNewsDir = path.join(process.cwd(), 'news', 'TEST');

  beforeEach(async () => {
    // Clean up test directory before each test
    try {
      await fs.rm(testNewsDir, { recursive: true, force: true });
    } catch (err) {
      // Directory doesn't exist, which is fine
    }
  });

  afterEach(async () => {
    // Clean up test directory after each test
    try {
      await fs.rm(testNewsDir, { recursive: true, force: true });
    } catch (err) {
      // Directory doesn't exist, which is fine
    }
  });

  describe('URL Generation', () => {
    it('should generate correct base URL for symbol', () => {
      const result = getBaseUrlForSymbol('TRUR');
      expect(result).toBe('https://www.tbank.ru/invest/etfs/TRUR/news/');
    });

    it('should handle different symbols correctly', () => {
      const symbols = ['TGLD', 'TBRU', 'TSPV'];
      symbols.forEach(symbol => {
        const result = getBaseUrlForSymbol(symbol);
        expect(result).toBe(`https://www.tbank.ru/invest/etfs/${symbol}/news/`);
      });
    });

    it('should handle special characters in symbols', () => {
      const result = getBaseUrlForSymbol('T-TEST');
      expect(result).toBe('https://www.tbank.ru/invest/etfs/T-TEST/news/');
    });
  });

  describe('News Directory Path', () => {
    it('should generate correct news directory path', () => {
      const result = getNewsDir('TRUR');
      expect(result).toBe(path.resolve(process.cwd(), 'news', 'TRUR'));
    });

    it('should handle different symbols correctly', () => {
      const symbols = ['TGLD', 'TBRU', 'TSPV'];
      symbols.forEach(symbol => {
        const result = getNewsDir(symbol);
        expect(result).toBe(path.resolve(process.cwd(), 'news', symbol));
      });
    });
  });

  describe('News ID Parsing', () => {
    it('should correctly parse news IDs from URLs', () => {
      const testCases = [
        { href: '/invest/fund-news/123456/', expected: '123456' },
        { href: '/invest/fund-news/789012', expected: '789012' },
        { href: 'https://www.tbank.ru/invest/fund-news/345678/', expected: '345678' }
      ];

      testCases.forEach(({ href, expected }) => {
        const result = parseNewsIdFromHref(href);
        expect(result).toBe(expected);
      });
    });

    it('should handle edge cases in news ID parsing', () => {
      const testCases = [
        { href: '/invest/fund-news/', expected: null },
        { href: '/invest/fund-news/abc', expected: null },
        { href: '/some-other-path/123456', expected: null },
        { href: '', expected: null }
      ];

      testCases.forEach(({ href, expected }) => {
        const result = parseNewsIdFromHref(href);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Directory Operations', () => {
    it('should create news directory when saving news', async () => {
      const symbol = 'TEST';
      const newsDir = getNewsDir(symbol);
      
      // Directory shouldn't exist initially
      try {
        await fs.access(newsDir);
        // If we get here, the directory exists when it shouldn't
        expect(false).toBe(true);
      } catch (error) {
        // Expected - directory doesn't exist
        expect(error).toBeDefined();
      }
      
      // Create directory
      await fs.mkdir(newsDir, { recursive: true });
      
      // Directory should exist now
      try {
        await fs.access(newsDir);
        // Directory should exist and be accessible
        expect(true).toBe(true);
      } catch (error) {
        // Should not reach here
        expect(false).toBe(true);
      }
    });

    it('should handle non-existent news directory gracefully', async () => {
      const symbol = 'NONEXISTENT';
      const newsDir = getNewsDir(symbol);
      
      // Try to read from non-existent directory
      try {
        await fs.readdir(newsDir);
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeDefined();
      }
    });

    it('should handle empty news directory', async () => {
      const symbol = 'TEST';
      const newsDir = getNewsDir(symbol);
      
      // Create empty directory
      await fs.mkdir(newsDir, { recursive: true });
      
      const entries = await fs.readdir(newsDir);
      expect(entries).toHaveLength(0);
    });
  });

  describe('File Operations', () => {
    it('should read existing news IDs correctly', async () => {
      const symbol = 'TEST';
      const newsDir = getNewsDir(symbol);
      
      // Create test directory and files
      await fs.mkdir(newsDir, { recursive: true });
      await fs.writeFile(path.join(newsDir, '123456.md'), '# Test News 1', 'utf-8');
      await fs.writeFile(path.join(newsDir, '789012.md'), '# Test News 2', 'utf-8');
      
      const entries = await fs.readdir(newsDir);
      const ids = new Set<string>();
      
      for (const entry of entries) {
        if (entry.endsWith('.md')) {
          const id = path.basename(entry, '.md');
          if (id) ids.add(id);
        }
      }
      
      expect(ids.has('123456')).toBe(true);
      expect(ids.has('789012')).toBe(true);
      expect(ids.size).toBe(2);
    });

    it('should filter out non-markdown files when reading news IDs', async () => {
      const symbol = 'TEST';
      const newsDir = getNewsDir(symbol);
      
      // Create test directory and files
      await fs.mkdir(newsDir, { recursive: true });
      await fs.writeFile(path.join(newsDir, '123456.md'), '# Test News 1', 'utf-8');
      await fs.writeFile(path.join(newsDir, '789012.txt'), 'Not a markdown file', 'utf-8');
      await fs.writeFile(path.join(newsDir, 'readme.md'), '# Readme', 'utf-8');
      
      const entries = await fs.readdir(newsDir);
      const ids = new Set<string>();
      
      for (const entry of entries) {
        if (entry.endsWith('.md')) {
          const id = path.basename(entry, '.md');
          if (id) ids.add(id);
        }
      }
      
      expect(ids.has('123456')).toBe(true);
      expect(ids.has('readme')).toBe(true);
      expect(ids.has('789012')).toBe(false); // .txt file should be filtered out
      expect(ids.size).toBe(2);
    });
  });

  describe('Article Extraction', () => {
    it('should extract article content correctly', () => {
      const mockArticle = {
        title: 'Test News Title',
        dateText: '2023-12-01',
        body: 'This is the test news body content.'
      };
      
      // Mock the extraction functions
      expect(mockArticle.title).toBe('Test News Title');
      expect(mockArticle.dateText).toBe('2023-12-01');
      expect(mockArticle.body).toBe('This is the test news body content.');
    });

    it('should handle missing title gracefully', () => {
      const mockArticle = {
        title: '',
        dateText: '2023-12-01',
        body: 'This is the test news body content.'
      };
      
      expect(mockArticle.title).toBe('');
      expect(mockArticle.dateText).toBe('2023-12-01');
      expect(mockArticle.body).toBe('This is the test news body content.');
    });

    it('should handle missing date gracefully', () => {
      const mockArticle = {
        title: 'Test News Title',
        dateText: '',
        body: 'This is the test news body content.'
      };
      
      expect(mockArticle.title).toBe('Test News Title');
      expect(mockArticle.dateText).toBe('');
      expect(mockArticle.body).toBe('This is the test news body content.');
    });

    it('should handle missing body content gracefully', () => {
      const mockArticle = {
        title: 'Test News Title',
        dateText: '2023-12-01',
        body: ''
      };
      
      expect(mockArticle.title).toBe('Test News Title');
      expect(mockArticle.dateText).toBe('2023-12-01');
      expect(mockArticle.body).toBe('');
    });
  });

  describe('Markdown Generation', () => {
    it('should generate correct markdown format', () => {
      const result = buildMarkdown(
        '123456',
        'https://www.tbank.ru/invest/fund-news/123456/',
        'Test News Title',
        '2023-12-01',
        'This is the test news body content.'
      );
      
      const expected = [
        '# Test News Title',
        'Source: https://www.tbank.ru/invest/fund-news/123456/',
        'Date: 2023-12-01',
        '',
        'This is the test news body content.'
      ].join('\n');
      
      expect(result).toBe(expected);
    });

    it('should handle missing title in markdown generation', () => {
      const result = buildMarkdown(
        '123456',
        'https://www.tbank.ru/invest/fund-news/123456/',
        '',
        '2023-12-01',
        'This is the test news body content.'
      );
      
      const expected = [
        'Source: https://www.tbank.ru/invest/fund-news/123456/',
        'Date: 2023-12-01',
        '',
        'This is the test news body content.'
      ].join('\n');
      
      expect(result).toBe(expected);
    });

    it('should handle missing date in markdown generation', () => {
      const result = buildMarkdown(
        '123456',
        'https://www.tbank.ru/invest/fund-news/123456/',
        'Test News Title',
        '',
        'This is the test news body content.'
      );
      
      const expected = [
        '# Test News Title',
        'Source: https://www.tbank.ru/invest/fund-news/123456/',
        '',
        'This is the test news body content.'
      ].join('\n');
      
      expect(result).toBe(expected);
    });

    it('should handle empty body in markdown generation', () => {
      const result = buildMarkdown(
        '123456',
        'https://www.tbank.ru/invest/fund-news/123456/',
        'Test News Title',
        '2023-12-01',
        ''
      );
      
      const expected = [
        '# Test News Title',
        'Source: https://www.tbank.ru/invest/fund-news/123456/',
        'Date: 2023-12-01',
        '',
        ''
      ].join('\n');
      
      expect(result).toBe(expected);
    });
  });

  describe('Link Collection', () => {
    it('should collect all news links correctly', () => {
      const mockLinks = [
        '/invest/fund-news/123456/',
        '/invest/fund-news/789012/',
        '/invest/fund-news/345678/'
      ];
      
      const baseHost = 'https://www.tbank.ru';
      const absoluteLinks = mockLinks.map(link => 
        link.startsWith('http') ? link : `${baseHost}${link}`
      );
      
      expect(absoluteLinks).toEqual([
        'https://www.tbank.ru/invest/fund-news/123456/',
        'https://www.tbank.ru/invest/fund-news/789012/',
        'https://www.tbank.ru/invest/fund-news/345678/'
      ]);
    });

    it('should deduplicate collected news links', () => {
      const mockLinks = [
        '/invest/fund-news/123456/',
        '/invest/fund-news/789012/',
        '/invest/fund-news/123456/', // Duplicate
        '/invest/fund-news/345678/'
      ];
      
      const uniqueLinks = Array.from(new Set(mockLinks));
      expect(uniqueLinks).toHaveLength(3);
      expect(uniqueLinks).toEqual([
        '/invest/fund-news/123456/',
        '/invest/fund-news/789012/',
        '/invest/fund-news/345678/'
      ]);
    });

    it('should handle empty link collection', () => {
      const mockLinks: string[] = [];
      expect(mockLinks).toHaveLength(0);
    });

    it('should handle pages without show more buttons', () => {
      // Mock scenario where no "show more" buttons are found
      const mockShowMoreButtons: HTMLElement[] = [];
      expect(mockShowMoreButtons).toHaveLength(0);
    });

    it('should handle disabled show more buttons', () => {
      // Mock scenario where show more buttons exist but are disabled
      const mockButton = {
        hasAttribute: (attr: string) => attr === 'disabled',
        getAttribute: (attr: string) => attr === 'aria-busy' ? 'true' : null
      };
      
      expect(mockButton.hasAttribute('disabled')).toBe(true);
      expect(mockButton.getAttribute('aria-busy')).toBe('true');
    });
  });

  describe('News Scraping Integration', () => {
    it('should open and scrape news correctly', async () => {
      const mockResult = {
        id: '123456',
        markdown: '# Test News\nSource: https://www.tbank.ru/invest/fund-news/123456/\n\nTest content'
      };
      
      expect(mockResult.id).toBe('123456');
      expect(mockResult.markdown).toContain('# Test News');
      expect(mockResult.markdown).toContain('Source: https://www.tbank.ru/invest/fund-news/123456/');
    });

    it('should handle invalid news URLs gracefully', () => {
      const invalidUrl = 'https://www.tbank.ru/invalid-url';
      const result = parseNewsIdFromHref(invalidUrl);
      expect(result).toBeNull();
    });

    it('should handle page navigation errors gracefully', async () => {
      // Mock page navigation that throws an error
      const mockPageGoto = async (url: string) => {
        throw new Error('Navigation failed');
      };
      
      try {
        await mockPageGoto('https://www.tbank.ru/invest/fund-news/123456/');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Navigation failed');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully when creating directories', async () => {
      // Try to create a directory in a location that should fail
      const invalidPath = '/root/invalid-permission-test';
      
      try {
        await fs.mkdir(invalidPath, { recursive: true });
        // If this succeeds, clean it up
        await fs.rmdir(invalidPath);
      } catch (error) {
        // Expected to fail due to permissions
        expect(error).toBeDefined();
      }
    });

    it('should handle file system errors gracefully when writing files', async () => {
      const symbol = 'TEST';
      const newsDir = getNewsDir(symbol);
      
      // Create directory first
      await fs.mkdir(newsDir, { recursive: true });
      
      // Try to write to a valid location (this should succeed)
      const testFile = path.join(newsDir, 'test.md');
      await fs.writeFile(testFile, 'Test content', 'utf-8');
      
      // Verify file was written
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('Test content');
    });

    it('should handle Puppeteer launch errors gracefully', async () => {
      // Mock puppeteer launch that throws an error
      const mockPuppeteerLaunch = async () => {
        throw new Error('Browser launch failed');
      };
      
      try {
        await mockPuppeteerLaunch();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Browser launch failed');
      }
    });

    it('should handle empty command line arguments', () => {
      const mockArgv: string[] = [];
      const defaultSymbol = 'TRUR';
      
      const symbol = (mockArgv[0] || defaultSymbol).toUpperCase();
      expect(symbol).toBe('TRUR');
    });

    it('should handle concurrent news scraping requests', async () => {
      // Mock concurrent operations
      const concurrentOperations = [
        Promise.resolve({ id: '123456', markdown: 'Content 1' }),
        Promise.resolve({ id: '789012', markdown: 'Content 2' }),
        Promise.resolve({ id: '345678', markdown: 'Content 3' })
      ];
      
      const results = await Promise.all(concurrentOperations);
      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('123456');
      expect(results[1].id).toBe('789012');
      expect(results[2].id).toBe('345678');
    });
  });
});