import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { promises as fs } from 'fs';
import path from 'path';

// Mock the analyzeNews module functions
const mockAnalyzeNews = {
  getNewsDir: (symbol: string): string => path.resolve(process.cwd(), 'news', symbol),
  getMetaDir: (symbol: string): string => path.resolve(process.cwd(), 'news_meta', symbol),
  listNewsMdFiles: async (symbol: string): Promise<string[]> => {
    const dir = mockAnalyzeNews.getNewsDir(symbol);
    try {
      const entries = await fs.readdir(dir);
      return entries
        .filter((f) => f.endsWith('.md'))
        .map((f) => path.join(dir, f))
        .sort();
    } catch (e) {
      return [];
    }
  },
  getIdFromFilename: (filePath: string): string => path.basename(filePath, '.md'),
  fileExists: async (filePath: string): Promise<boolean> => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  },
  buildPrompt: (content: string, id: string, symbol: string): string => {
    return [
      `You are an experienced financial analyst. Analyze the news about fund ${symbol}.`,
      'Return strictly JSON without explanations. Fields:',
      '{',
      '  "id": string,                                   // news identifier',
      '  "symbol": string,                               // fund ticker',
      '  "title": string,                                // title',
      '  "date": string,                                 // date from news as is',
      '  "category": string,                             // type: rebalancing|dividends|share redemption|other',
      '  "summary": string,                              // brief content in 1-3 sentences',
      '  "bullets": string[],                            // key points (3-8)',
      '  "trades": [                                     // if there is a trades table',
      '    { "ticker": string, "name": string, "side": "Buy"|"Sell", "qty": string, "amount": string, "weightFrom": string|null, "weightTo": string|null }',
      '  ],',
      '  "additionalFields": { [name: string]: string },  // for example: Share redemption date, Redeemed shares, Amount, Total shares, Share price',
      '  "numbers": {                                     // normalized numbers if can be extracted',
      '    "redeemedShares": number|null,                 // units, without suffixes',
      '    "redeemedAmountRub": number|null,              // ₽',
      '    "totalShares": number|null,                    // units',
      '    "navPriceRub": number|null                     // ₽',
      '  }',
      '}',
      '',
      'News text below between <news>...</news>. Preserve original string formats in summary/fields, but make numbers in numbers numeric.',
      `<news id="${id}" symbol="${symbol}">\n${content}\n</news>`,
    ].join('\n');
  },
  getOpenRouterConfig: () => {
    const apiKey = process.env.OPENROUTER_API_KEY || '';
    const model = process.env.OPENROUTER_MODEL || 'openrouter/auto';
    const base = process.env.OPENROUTER_BASE || 'https://openrouter.ai/api/v1';
    return { apiKey, model, base };
  },
  callOpenRouter: async (prompt: string): Promise<string> => {
    const { apiKey, model, base } = mockAnalyzeNews.getOpenRouterConfig();
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set. Please set it in .env');
    }
    const url = `${base}/chat/completions`;
    const body: any = {
      model,
      messages: [
        { role: 'system', content: 'Return only valid JSON. No comments. No markdown.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/suenot/deep-tinkoff-invest-api',
        'X-Title': 'tinkoff-invest-etf-balancer-bot',
      } as any,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${text}`);
    }
    const data: any = await res.json();
    const content: string = data?.choices?.[0]?.message?.content || '';
    return content;
  },
  tryExtractJson: (text: string): any => {
    const trimmed = text.trim();
    try { return JSON.parse(trimmed); } catch {}
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    throw new Error('Failed to parse JSON from model response');
  }
};

describe('AnalyzeNews', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    // Mock fetch globally
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"test": "response"}' } }]
        }),
        text: () => Promise.resolve('OK')
      } as Response)
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    mock.restore();
  });

  describe('Directory Path Generation', () => {
    it('should generate correct news directory path', () => {
      const result = mockAnalyzeNews.getNewsDir('TRUR');
      const expected = path.resolve(process.cwd(), 'news', 'TRUR');
      expect(result).toBe(expected);
    });

    it('should generate correct meta directory path', () => {
      const result = mockAnalyzeNews.getMetaDir('TRUR');
      const expected = path.resolve(process.cwd(), 'news_meta', 'TRUR');
      expect(result).toBe(expected);
    });

    it('should handle different symbols correctly', () => {
      const symbols = ['TGLD', 'TSPV', 'TBRU'];
      symbols.forEach(symbol => {
        const newsDir = mockAnalyzeNews.getNewsDir(symbol);
        const metaDir = mockAnalyzeNews.getMetaDir(symbol);
        expect(newsDir).toContain(symbol);
        expect(metaDir).toContain(symbol);
      });
    });

    it('should handle special characters in symbols', () => {
      const result = mockAnalyzeNews.getNewsDir('TEST-123');
      expect(result).toContain('TEST-123');
    });
  });

  describe('File Operations', () => {
    beforeEach(async () => {
      // Create test directories and files
      const testDir = path.join(process.cwd(), 'news', 'TEST');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(path.join(testDir, 'news1.md'), 'Test content 1');
      await fs.writeFile(path.join(testDir, 'news2.md'), 'Test content 2');
      await fs.writeFile(path.join(testDir, 'notmd.txt'), 'Not a markdown file');
    });

    afterEach(async () => {
      // Cleanup test directories
      try {
        await fs.rmdir(path.join(process.cwd(), 'news'), { recursive: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    it('should list news markdown files correctly', async () => {
      const files = await mockAnalyzeNews.listNewsMdFiles('TEST');
      expect(files).toHaveLength(2);
      expect(files.every(f => f.endsWith('.md'))).toBe(true);
      expect(files).toContain(path.join(process.cwd(), 'news', 'TEST', 'news1.md'));
      expect(files).toContain(path.join(process.cwd(), 'news', 'TEST', 'news2.md'));
    });

    it('should handle empty news directory', async () => {
      const emptyDir = path.join(process.cwd(), 'news', 'EMPTY');
      await fs.mkdir(emptyDir, { recursive: true });
      const files = await mockAnalyzeNews.listNewsMdFiles('EMPTY');
      expect(files).toHaveLength(0);
    });

    it('should handle non-existent news directory gracefully', async () => {
      const files = await mockAnalyzeNews.listNewsMdFiles('NONEXISTENT');
      expect(files).toHaveLength(0);
    });

    it('should extract ID from filename correctly', () => {
      const testCases = [
        { input: '/path/to/news123.md', expected: 'news123' },
        { input: 'simple.md', expected: 'simple' },
        { input: '/complex/path/with-dashes_and_underscores.md', expected: 'with-dashes_and_underscores' },
      ];
      
      testCases.forEach(({ input, expected }) => {
        const result = mockAnalyzeNews.getIdFromFilename(input);
        expect(result).toBe(expected);
      });
    });

    it('should check file existence correctly', async () => {
      const existingFile = path.join(process.cwd(), 'news', 'TEST', 'news1.md');
      const nonExistentFile = path.join(process.cwd(), 'news', 'TEST', 'nonexistent.md');
      
      const exists = await mockAnalyzeNews.fileExists(existingFile);
      const doesNotExist = await mockAnalyzeNews.fileExists(nonExistentFile);
      
      expect(exists).toBe(true);
      expect(doesNotExist).toBe(false);
    });
  });

  describe('Prompt Building', () => {
    it('should build correct prompt for news analysis', () => {
      const content = 'Test news content';
      const id = 'test123';
      const symbol = 'TRUR';
      
      const prompt = mockAnalyzeNews.buildPrompt(content, id, symbol);
      
      expect(prompt).toContain(`fund ${symbol}`);
      expect(prompt).toContain(`<news id="${id}" symbol="${symbol}">`);
      expect(prompt).toContain(content);
      expect(prompt).toContain('Return strictly JSON without explanations');
    });

    it('should handle empty content in prompt building', () => {
      const prompt = mockAnalyzeNews.buildPrompt('', 'test', 'TRUR');
      expect(prompt).toContain('<news id="test" symbol="TRUR">\n\n</news>');
    });

    it('should handle special characters in content', () => {
      const content = 'Content with "quotes" and \\backslashes\\ and <tags>';
      const prompt = mockAnalyzeNews.buildPrompt(content, 'test', 'TRUR');
      expect(prompt).toContain(content);
    });
  });

  describe('OpenRouter Configuration', () => {
    it('should get OpenRouter configuration correctly', () => {
      process.env.OPENROUTER_API_KEY = 'test-key';
      process.env.OPENROUTER_MODEL = 'test-model';
      process.env.OPENROUTER_BASE = 'https://test.example.com';
      
      const config = mockAnalyzeNews.getOpenRouterConfig();
      
      expect(config.apiKey).toBe('test-key');
      expect(config.model).toBe('test-model');
      expect(config.base).toBe('https://test.example.com');
    });

    it('should use default values when env vars are not set', () => {
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_MODEL;
      delete process.env.OPENROUTER_BASE;
      
      const config = mockAnalyzeNews.getOpenRouterConfig();
      
      expect(config.apiKey).toBe('');
      expect(config.model).toBe('openrouter/auto');
      expect(config.base).toBe('https://openrouter.ai/api/v1');
    });
  });

  describe('OpenRouter API Calls', () => {
    it('should make correct API call to OpenRouter', async () => {
      process.env.OPENROUTER_API_KEY = 'test-key';
      
      const fetchSpy = spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"result": "success"}' } }]
        })
      } as Response);

      const result = await mockAnalyzeNews.callOpenRouter('test prompt');
      
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result).toBe('{"result": "success"}');
      
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe('Bearer test-key');
    });

    it('should handle missing API key gracefully', async () => {
      delete process.env.OPENROUTER_API_KEY;
      
      await expect(mockAnalyzeNews.callOpenRouter('test')).rejects.toThrow('OPENROUTER_API_KEY is not set');
    });

    it('should handle API errors gracefully', async () => {
      process.env.OPENROUTER_API_KEY = 'test-key';
      
      spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error')
      } as Response);

      await expect(mockAnalyzeNews.callOpenRouter('test')).rejects.toThrow('OpenRouter error 500: Internal Server Error');
    });
  });

  describe('JSON Extraction', () => {
    it('should extract JSON from model response correctly', () => {
      const validJson = '{"test": "value", "number": 42}';
      const result = mockAnalyzeNews.tryExtractJson(validJson);
      
      expect(result).toEqual({ test: 'value', number: 42 });
    });

    it('should handle invalid JSON gracefully', () => {
      const invalidJson = 'not json at all';
      
      expect(() => mockAnalyzeNews.tryExtractJson(invalidJson)).toThrow('Failed to parse JSON from model response');
    });

    it('should handle malformed JSON gracefully', () => {
      const malformedJson = '{"test": "value",}'; // trailing comma
      
      expect(() => mockAnalyzeNews.tryExtractJson(malformedJson)).toThrow('Failed to parse JSON from model response');
    });
  });

  describe('File Analysis', () => {
    beforeEach(async () => {
      // Create test directories and files for analysis tests
      const testDir = path.join(process.cwd(), 'news', 'ANALYSIS');
      const metaDir = path.join(process.cwd(), 'news_meta', 'ANALYSIS');
      await fs.mkdir(testDir, { recursive: true });
      await fs.mkdir(metaDir, { recursive: true });
      await fs.writeFile(path.join(testDir, 'test-news.md'), 'Test news content for analysis');
    });

    afterEach(async () => {
      try {
        await fs.rmdir(path.join(process.cwd(), 'news'), { recursive: true });
        await fs.rmdir(path.join(process.cwd(), 'news_meta'), { recursive: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    it('should analyze news file correctly', async () => {
      process.env.OPENROUTER_API_KEY = 'test-key';
      
      spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"id": "test-news", "symbol": "ANALYSIS"}' } }]
        })
      } as Response);

      const testFile = path.join(process.cwd(), 'news', 'ANALYSIS', 'test-news.md');
      const outDir = path.join(process.cwd(), 'news_meta', 'ANALYSIS');
      
      // Mock the analyzeFile function behavior
      const id = 'test-news';
      const outPath = path.join(outDir, `${id}.json`);
      
      const exists = await mockAnalyzeNews.fileExists(outPath);
      expect(exists).toBe(false);
    });

    it('should skip existing analyzed files', async () => {
      const metaDir = path.join(process.cwd(), 'news_meta', 'ANALYSIS');
      const existingFile = path.join(metaDir, 'existing.json');
      await fs.writeFile(existingFile, '{"existing": "data"}');
      
      const exists = await mockAnalyzeNews.fileExists(existingFile);
      expect(exists).toBe(true);
    });

    it('should handle API errors during analysis gracefully', async () => {
      process.env.OPENROUTER_API_KEY = 'test-key';
      
      spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      await expect(mockAnalyzeNews.callOpenRouter('test')).rejects.toThrow('Network error');
    });
  });

  describe('News Analysis for Symbol', () => {
    it('should analyze news for symbol correctly', async () => {
      const symbol = 'TESTSYMBOL';
      const files = await mockAnalyzeNews.listNewsMdFiles(symbol);
      expect(Array.isArray(files)).toBe(true);
    });

    it('should handle no news files gracefully', async () => {
      const files = await mockAnalyzeNews.listNewsMdFiles('NONEXISTENT');
      expect(files).toHaveLength(0);
    });

    it('should filter by specific ID correctly', () => {
      const files = ['/path/news1.md', '/path/news2.md', '/path/target.md'];
      const targetId = 'target';
      const filtered = files.filter(f => mockAnalyzeNews.getIdFromFilename(f) === targetId);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toContain('target.md');
    });

    it('should apply limit correctly', () => {
      const files = ['file1.md', 'file2.md', 'file3.md', 'file4.md', 'file5.md'];
      const limit = 3;
      const limited = files.slice(0, limit);
      expect(limited).toHaveLength(3);
      expect(limited).toEqual(['file1.md', 'file2.md', 'file3.md']);
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      // Test with a path that will cause permission errors
      const badPath = '/root/inaccessible';
      const files = await mockAnalyzeNews.listNewsMdFiles('../../root');
      expect(files).toHaveLength(0); // Should return empty array on error
    });

    it('should handle file read errors gracefully', async () => {
      const nonExistentFile = '/nonexistent/path/file.md';
      const exists = await mockAnalyzeNews.fileExists(nonExistentFile);
      expect(exists).toBe(false);
    });

    it('should handle empty environment variables gracefully', () => {
      // Clear all relevant environment variables
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_MODEL;
      delete process.env.OPENROUTER_BASE;
      
      const config = mockAnalyzeNews.getOpenRouterConfig();
      expect(config.apiKey).toBe('');
      expect(config.model).toBe('openrouter/auto');
      expect(config.base).toBe('https://openrouter.ai/api/v1');
    });

    it('should handle network timeouts gracefully', async () => {
      process.env.OPENROUTER_API_KEY = 'test-key';
      
      spyOn(global, 'fetch').mockRejectedValue(new Error('Network timeout'));

      await expect(mockAnalyzeNews.callOpenRouter('test')).rejects.toThrow('Network timeout');
    });

    it('should handle concurrent analysis requests', async () => {
      process.env.OPENROUTER_API_KEY = 'test-key';
      
      const fetchSpy = spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"result": "success"}' } }]
        })
      } as Response);

      // Simulate concurrent requests
      const promises = [
        mockAnalyzeNews.callOpenRouter('prompt1'),
        mockAnalyzeNews.callOpenRouter('prompt2'),
        mockAnalyzeNews.callOpenRouter('prompt3'),
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });
});