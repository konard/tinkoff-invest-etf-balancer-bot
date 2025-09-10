import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";

// Mock modules first, before any other imports
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
mock.module('node-fetch', () => mockFetch);

// Mock dotenv
mock.module('dotenv', () => ({
  config: mock(() => undefined)
}));

// Store original env
const originalEnv = process.env;

// Import the rest
import { 
  TestEnvironment, 
  FinancialAssertions, 
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { mockControls } from '../__mocks__/external-deps';

testSuite('AnalyzeNews Sentiment Processing Tests', () => {
  beforeEach(() => {
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
    mockFetch.mockClear();
    
    // Set default mock responses
    mockFs.promises.readdir.mockResolvedValue([]);
    mockFs.promises.readFile.mockResolvedValue('');
    mockFs.promises.access.mockResolvedValue(undefined);
    
    // Set default env vars
    process.env = {
      ...originalEnv,
      OPENROUTER_API_KEY: 'test-api-key',
      OPENROUTER_MODEL: 'test-model',
      OPENROUTER_BASE: 'https://test.openrouter.ai/api/v1'
    };
  });

  afterEach(() => {
    // Restore env
    process.env = originalEnv;
  });

  describe('Sentiment Analysis in Content Processing', () => {
    it('should handle positive sentiment in news content', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter } = await import('../../tools/analyzeNews');
      
      const positiveContent = `
# Strong Quarterly Results for TRUR ETF

The TRUR ETF has reported exceptional performance this quarter with a 15% increase in NAV.
Investors are thrilled with the results, and analysts have upgraded their ratings.

Key highlights:
- Net inflows of 2.5 billion RUB
- Dividend yield increased to 4.2%
- Expense ratio remains competitive at 0.5%

Market experts predict continued strong performance.
      `;
      
      const prompt = buildPrompt(positiveContent, '12345', 'TRUR');
      
      // Mock API response with positive sentiment analysis
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                id: "12345",
                symbol: "TRUR",
                title: "Strong Quarterly Results for TRUR ETF",
                date: "",
                category: "other",
                summary: "The TRUR ETF has reported exceptional performance this quarter with a 15% increase in NAV.",
                bullets: [
                  "Net inflows of 2.5 billion RUB",
                  "Dividend yield increased to 4.2%",
                  "Expense ratio remains competitive at 0.5%"
                ],
                trades: [],
                additionalFields: {},
                numbers: {
                  "redeemedShares": null,
                  "redeemedAmountRub": null,
                  "totalShares": null,
                  "navPriceRub": null
                }
              })
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      const result = await callOpenRouter(prompt);
      const parsed = JSON.parse(result);
      
      expect(parsed.title).toBe("Strong Quarterly Results for TRUR ETF");
      expect(parsed.summary).toContain("exceptional performance");
      expect(parsed.bullets).toHaveLength(3);
      expect(parsed.category).toBe("other");
    });
    
    it('should handle negative sentiment in news content', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter } = await import('../../tools/analyzeNews');
      
      const negativeContent = `
# TRUR ETF Faces Challenges Amid Market Downturn

The TRUR ETF has experienced a significant decline in performance, dropping 8% this quarter.
Investors are concerned about the fund's exposure to volatile sectors.

Key issues:
- Outflows of 1.2 billion RUB
- Underperformance compared to benchmark
- Management changes announced

Market analysts suggest caution for new investments.
      `;
      
      const prompt = buildPrompt(negativeContent, '12345', 'TRUR');
      
      // Mock API response with negative sentiment analysis
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                id: "12345",
                symbol: "TRUR",
                title: "TRUR ETF Faces Challenges Amid Market Downturn",
                date: "",
                category: "other",
                summary: "The TRUR ETF has experienced a significant decline in performance, dropping 8% this quarter.",
                bullets: [
                  "Outflows of 1.2 billion RUB",
                  "Underperformance compared to benchmark",
                  "Management changes announced"
                ],
                trades: [],
                additionalFields: {},
                numbers: {
                  "redeemedShares": null,
                  "redeemedAmountRub": null,
                  "totalShares": null,
                  "navPriceRub": null
                }
              })
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      const result = await callOpenRouter(prompt);
      const parsed = JSON.parse(result);
      
      expect(parsed.title).toBe("TRUR ETF Faces Challenges Amid Market Downturn");
      expect(parsed.summary).toContain("significant decline");
      expect(parsed.bullets).toHaveLength(3);
      expect(parsed.category).toBe("other");
    });
    
    it('should handle neutral sentiment in news content', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter } = await import('../../tools/analyzeNews');
      
      const neutralContent = `
# TRUR ETF Reports Steady Performance

The TRUR ETF has maintained consistent performance with minor fluctuations.
No significant changes to portfolio or management structure.

Regular updates:
- Quarterly dividend of 1.5 RUB per share
- Portfolio rebalancing completed
- No major inflows or outflows

Performance remains in line with expectations.
      `;
      
      const prompt = buildPrompt(neutralContent, '12345', 'TRUR');
      
      // Mock API response with neutral sentiment analysis
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                id: "12345",
                symbol: "TRUR",
                title: "TRUR ETF Reports Steady Performance",
                date: "",
                category: "other",
                summary: "The TRUR ETF has maintained consistent performance with minor fluctuations.",
                bullets: [
                  "Quarterly dividend of 1.5 RUB per share",
                  "Portfolio rebalancing completed",
                  "No major inflows or outflows"
                ],
                trades: [],
                additionalFields: {},
                numbers: {
                  "redeemedShares": null,
                  "redeemedAmountRub": null,
                  "totalShares": null,
                  "navPriceRub": null
                }
              })
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      const result = await callOpenRouter(prompt);
      const parsed = JSON.parse(result);
      
      expect(parsed.title).toBe("TRUR ETF Reports Steady Performance");
      expect(parsed.summary).toContain("consistent performance");
      expect(parsed.bullets).toHaveLength(3);
      expect(parsed.category).toBe("other");
    });
  });

  describe('Sentiment-Related Category Classification', () => {
    it('should correctly classify rebalancing sentiment', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter } = await import('../../tools/analyzeNews');
      
      const rebalancingContent = `
# TRUR ETF Portfolio Rebalancing Announcement

The fund manager has announced a quarterly portfolio rebalancing to optimize performance.
Several positions will be adjusted to align with market conditions.

Changes include:
- Increased allocation to technology sector by 5%
- Reduced exposure to energy sector by 3%
- New positions in emerging markets

The rebalancing is expected to enhance long-term returns.
      `;
      
      const prompt = buildPrompt(rebalancingContent, '12345', 'TRUR');
      
      // Mock API response with rebalancing category
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                id: "12345",
                symbol: "TRUR",
                title: "TRUR ETF Portfolio Rebalancing Announcement",
                date: "",
                category: "rebalancing",
                summary: "The fund manager has announced a quarterly portfolio rebalancing to optimize performance.",
                bullets: [
                  "Increased allocation to technology sector by 5%",
                  "Reduced exposure to energy sector by 3%",
                  "New positions in emerging markets"
                ],
                trades: [],
                additionalFields: {},
                numbers: {
                  "redeemedShares": null,
                  "redeemedAmountRub": null,
                  "totalShares": null,
                  "navPriceRub": null
                }
              })
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      const result = await callOpenRouter(prompt);
      const parsed = JSON.parse(result);
      
      expect(parsed.category).toBe("rebalancing");
      expect(parsed.summary).toContain("portfolio rebalancing");
    });
    
    it('should correctly classify dividend sentiment', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter } = await import('../../tools/analyzeNews');
      
      const dividendContent = `
# TRUR ETF Declares Quarterly Dividend

The board of directors has declared a quarterly dividend of 2.5 RUB per share.
This represents a 10% increase compared to the previous quarter.

Key details:
- Payment date: March 15, 2024
- Record date: March 10, 2024
- Ex-dividend date: March 8, 2024

The dividend reflects the fund's strong performance and commitment to shareholder returns.
      `;
      
      const prompt = buildPrompt(dividendContent, '12345', 'TRUR');
      
      // Mock API response with dividend category
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                id: "12345",
                symbol: "TRUR",
                title: "TRUR ETF Declares Quarterly Dividend",
                date: "",
                category: "dividends",
                summary: "The board of directors has declared a quarterly dividend of 2.5 RUB per share.",
                bullets: [
                  "Payment date: March 15, 2024",
                  "Record date: March 10, 2024",
                  "Ex-dividend date: March 8, 2024"
                ],
                trades: [],
                additionalFields: {},
                numbers: {
                  "redeemedShares": null,
                  "redeemedAmountRub": null,
                  "totalShares": null,
                  "navPriceRub": null
                }
              })
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      const result = await callOpenRouter(prompt);
      const parsed = JSON.parse(result);
      
      expect(parsed.category).toBe("dividends");
      expect(parsed.summary).toContain("quarterly dividend");
    });
    
    it('should correctly classify share redemption sentiment', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter } = await import('../../tools/analyzeNews');
      
      const redemptionContent = `
# TRUR ETF Share Redemption Program

The fund has announced a share redemption program to return capital to investors.
This initiative is part of the fund's strategy to optimize structure and improve efficiency.

Program details:
- Redemption date: April 1, 2024
- Number of shares to be redeemed: 500,000
- Total value: 25 million RUB
- Impact on remaining shareholders: Minimal

The redemption will be conducted at fair market value.
      `;
      
      const prompt = buildPrompt(redemptionContent, '12345', 'TRUR');
      
      // Mock API response with share redemption category
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                id: "12345",
                symbol: "TRUR",
                title: "TRUR ETF Share Redemption Program",
                date: "",
                category: "share redemption",
                summary: "The fund has announced a share redemption program to return capital to investors.",
                bullets: [
                  "Redemption date: April 1, 2024",
                  "Number of shares to be redeemed: 500,000",
                  "Total value: 25 million RUB"
                ],
                trades: [],
                additionalFields: {},
                numbers: {
                  "redeemedShares": 500000,
                  "redeemedAmountRub": 25000000,
                  "totalShares": null,
                  "navPriceRub": null
                }
              })
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      const result = await callOpenRouter(prompt);
      const parsed = JSON.parse(result);
      
      expect(parsed.category).toBe("share redemption");
      expect(parsed.summary).toContain("share redemption program");
      expect(parsed.numbers.redeemedShares).toBe(500000);
      expect(parsed.numbers.redeemedAmountRub).toBe(25000000);
    });
  });

  describe('Sentiment Processing with Financial Numbers', () => {
    it('should extract and process positive financial sentiment', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter } = await import('../../tools/analyzeNews');
      
      const positiveFinancialContent = `
# TRUR ETF Reports Strong Financial Results

The fund has delivered outstanding financial performance with key metrics showing significant improvement.

Financial highlights:
- Net Asset Value (NAV) increased by 12% to 1,250 RUB per share
- Total assets under management grew to 15 billion RUB
- Expense ratio reduced to 0.45%
- Dividend yield improved to 3.8%

These results demonstrate effective fund management and strong market positioning.
      `;
      
      const prompt = buildPrompt(positiveFinancialContent, '12345', 'TRUR');
      
      // Mock API response with positive financial numbers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                id: "12345",
                symbol: "TRUR",
                title: "TRUR ETF Reports Strong Financial Results",
                date: "",
                category: "other",
                summary: "The fund has delivered outstanding financial performance with key metrics showing significant improvement.",
                bullets: [
                  "Net Asset Value (NAV) increased by 12% to 1,250 RUB per share",
                  "Total assets under management grew to 15 billion RUB",
                  "Expense ratio reduced to 0.45%"
                ],
                trades: [],
                additionalFields: {},
                numbers: {
                  "redeemedShares": null,
                  "redeemedAmountRub": null,
                  "totalShares": null,
                  "navPriceRub": 1250
                }
              })
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      const result = await callOpenRouter(prompt);
      const parsed = JSON.parse(result);
      
      expect(parsed.summary).toContain("outstanding financial performance");
      expect(parsed.numbers.navPriceRub).toBe(1250);
      expect(parsed.bullets).toHaveLength(3);
    });
    
    it('should extract and process negative financial sentiment', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter } = await import('../../tools/analyzeNews');
      
      const negativeFinancialContent = `
# TRUR ETF Faces Financial Challenges

The fund has encountered difficulties with declining financial metrics that require attention.

Financial concerns:
- Net Asset Value (NAV) decreased by 5% to 950 RUB per share
- Assets under management fell to 12 billion RUB
- Increased expense ratio to 0.65%
- Dividend yield reduced to 2.1%

Management is working on strategies to address these challenges.
      `;
      
      const prompt = buildPrompt(negativeFinancialContent, '12345', 'TRUR');
      
      // Mock API response with negative financial numbers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                id: "12345",
                symbol: "TRUR",
                title: "TRUR ETF Faces Financial Challenges",
                date: "",
                category: "other",
                summary: "The fund has encountered difficulties with declining financial metrics that require attention.",
                bullets: [
                  "Net Asset Value (NAV) decreased by 5% to 950 RUB per share",
                  "Assets under management fell to 12 billion RUB",
                  "Increased expense ratio to 0.65%"
                ],
                trades: [],
                additionalFields: {},
                numbers: {
                  "redeemedShares": null,
                  "redeemedAmountRub": null,
                  "totalShares": null,
                  "navPriceRub": 950
                }
              })
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      const result = await callOpenRouter(prompt);
      const parsed = JSON.parse(result);
      
      expect(parsed.summary).toContain("difficulties with declining financial metrics");
      expect(parsed.numbers.navPriceRub).toBe(950);
      expect(parsed.bullets).toHaveLength(3);
    });
  });

  describe('Sentiment Processing with Trade Information', () => {
    it('should process buy sentiment with trade details', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter } = await import('../../tools/analyzeNews');
      
      const buyContent = `
# TRUR ETF Executes Strategic Purchases

The fund manager has executed several strategic purchases to enhance portfolio positioning.

Recent transactions:
- Bought 100,000 shares of SBER at 280 RUB
- Acquired 50,000 shares of GAZP at 190 RUB
- Purchased 75,000 shares of LKOH at 6,200 RUB

These acquisitions align with the fund's growth strategy and market outlook.
      `;
      
      const prompt = buildPrompt(buyContent, '12345', 'TRUR');
      
      // Mock API response with buy trades
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                id: "12345",
                symbol: "TRUR",
                title: "TRUR ETF Executes Strategic Purchases",
                date: "",
                category: "other",
                summary: "The fund manager has executed several strategic purchases to enhance portfolio positioning.",
                bullets: [
                  "Bought 100,000 shares of SBER at 280 RUB",
                  "Acquired 50,000 shares of GAZP at 190 RUB",
                  "Purchased 75,000 shares of LKOH at 6,200 RUB"
                ],
                trades: [
                  { ticker: "SBER", name: "Sberbank", side: "Buy", qty: "100,000", amount: "28,000,000", weightFrom: null, weightTo: null },
                  { ticker: "GAZP", name: "Gazprom", side: "Buy", qty: "50,000", amount: "9,500,000", weightFrom: null, weightTo: null },
                  { ticker: "LKOH", name: "Lukoil", side: "Buy", qty: "75,000", amount: "465,000,000", weightFrom: null, weightTo: null }
                ],
                additionalFields: {},
                numbers: {
                  "redeemedShares": null,
                  "redeemedAmountRub": null,
                  "totalShares": null,
                  "navPriceRub": null
                }
              })
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      const result = await callOpenRouter(prompt);
      const parsed = JSON.parse(result);
      
      expect(parsed.summary).toContain("strategic purchases");
      expect(parsed.trades).toHaveLength(3);
      expect(parsed.trades[0].side).toBe("Buy");
      expect(parsed.trades[0].ticker).toBe("SBER");
    });
    
    it('should process sell sentiment with trade details', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter } = await import('../../tools/analyzeNews');
      
      const sellContent = `
# TRUR ETF Reduces Positions in Certain Holdings

The fund manager has decided to reduce positions in several holdings to optimize portfolio performance.

Transactions executed:
- Sold 50,000 shares of SBER at 290 RUB
- Reduced GAZP position by 25,000 shares at 195 RUB
- Exited LKOH position entirely, 40,000 shares at 6,250 RUB

These adjustments reflect the fund's strategic realignment and risk management approach.
      `;
      
      const prompt = buildPrompt(sellContent, '12345', 'TRUR');
      
      // Mock API response with sell trades
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                id: "12345",
                symbol: "TRUR",
                title: "TRUR ETF Reduces Positions in Certain Holdings",
                date: "",
                category: "other",
                summary: "The fund manager has decided to reduce positions in several holdings to optimize portfolio performance.",
                bullets: [
                  "Sold 50,000 shares of SBER at 290 RUB",
                  "Reduced GAZP position by 25,000 shares at 195 RUB",
                  "Exited LKOH position entirely, 40,000 shares at 6,250 RUB"
                ],
                trades: [
                  { ticker: "SBER", name: "Sberbank", side: "Sell", qty: "50,000", amount: "14,500,000", weightFrom: null, weightTo: null },
                  { ticker: "GAZP", name: "Gazprom", side: "Sell", qty: "25,000", amount: "4,875,000", weightFrom: null, weightTo: null },
                  { ticker: "LKOH", name: "Lukoil", side: "Sell", qty: "40,000", amount: "250,000,000", weightFrom: null, weightTo: null }
                ],
                additionalFields: {},
                numbers: {
                  "redeemedShares": null,
                  "redeemedAmountRub": null,
                  "totalShares": null,
                  "navPriceRub": null
                }
              })
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      const result = await callOpenRouter(prompt);
      const parsed = JSON.parse(result);
      
      expect(parsed.summary).toContain("reduce positions");
      expect(parsed.trades).toHaveLength(3);
      expect(parsed.trades[0].side).toBe("Sell");
      expect(parsed.trades[0].ticker).toBe("SBER");
    });
  });

  describe('Sentiment Processing Edge Cases', () => {
    it('should handle mixed sentiment in news content', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter } = await import('../../tools/analyzeNews');
      
      const mixedContent = `
# TRUR ETF: Mixed Results with Strategic Moves

The fund has shown mixed performance with both positive and negative developments.

Positive developments:
- NAV increased by 3% to 1,050 RUB
- New strategic partnerships announced
- Expense ratio maintained at 0.5%

Challenges:
- Assets under management decreased by 2%
- Some holdings underperformed expectations
- Market volatility affected short-term results

Management remains optimistic about long-term prospects while addressing current challenges.
      `;
      
      const prompt = buildPrompt(mixedContent, '12345', 'TRUR');
      
      // Mock API response with mixed sentiment analysis
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                id: "12345",
                symbol: "TRUR",
                title: "TRUR ETF: Mixed Results with Strategic Moves",
                date: "",
                category: "other",
                summary: "The fund has shown mixed performance with both positive and negative developments.",
                bullets: [
                  "NAV increased by 3% to 1,050 RUB",
                  "New strategic partnerships announced",
                  "Assets under management decreased by 2%"
                ],
                trades: [],
                additionalFields: {},
                numbers: {
                  "redeemedShares": null,
                  "redeemedAmountRub": null,
                  "totalShares": null,
                  "navPriceRub": 1050
                }
              })
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      const result = await callOpenRouter(prompt);
      const parsed = JSON.parse(result);
      
      expect(parsed.summary).toContain("mixed performance");
      expect(parsed.numbers.navPriceRub).toBe(1050);
      expect(parsed.bullets).toHaveLength(3);
    });
    
    it('should handle ambiguous sentiment in news content', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter } = await import('../../tools/analyzeNews');
      
      const ambiguousContent = `
# TRUR ETF: Market Conditions Impact Performance

The fund's performance has been influenced by broader market conditions and economic factors.

Market factors:
- Global economic uncertainty affected investment decisions
- Currency fluctuations impacted international holdings
- Regulatory changes in key sectors

The fund continues to follow its established investment strategy while adapting to changing conditions.
      `;
      
      const prompt = buildPrompt(ambiguousContent, '12345', 'TRUR');
      
      // Mock API response with neutral/ambiguous sentiment analysis
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                id: "12345",
                symbol: "TRUR",
                title: "TRUR ETF: Market Conditions Impact Performance",
                date: "",
                category: "other",
                summary: "The fund's performance has been influenced by broader market conditions and economic factors.",
                bullets: [
                  "Global economic uncertainty affected investment decisions",
                  "Currency fluctuations impacted international holdings",
                  "Regulatory changes in key sectors"
                ],
                trades: [],
                additionalFields: {},
                numbers: {
                  "redeemedShares": null,
                  "redeemedAmountRub": null,
                  "totalShares": null,
                  "navPriceRub": null
                }
              })
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      const result = await callOpenRouter(prompt);
      const parsed = JSON.parse(result);
      
      expect(parsed.summary).toContain("influenced by broader market conditions");
      expect(parsed.bullets).toHaveLength(3);
      expect(parsed.category).toBe("other");
    });
  });

  describe('Sentiment Processing Error Handling', () => {
    it('should handle sentiment analysis API errors gracefully', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter } = await import('../../tools/analyzeNews');
      
      const content = '# Test News\n\nThis is a test news article.';
      const prompt = buildPrompt(content, '12345', 'TRUR');
      
      // Mock API error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: mock(async () => 'Internal Server Error')
      });
      
      await expect(callOpenRouter(prompt)).rejects.toThrow('OpenRouter error 500: Internal Server Error');
    });
    
    it('should handle malformed sentiment analysis responses', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter, tryExtractJson } = await import('../../tools/analyzeNews');
      
      const content = '# Test News\n\nThis is a test news article.';
      const prompt = buildPrompt(content, '12345', 'TRUR');
      
      // Mock API response with malformed JSON
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: 'This is not JSON at all'
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      const result = await callOpenRouter(prompt);
      
      // Should throw error when trying to parse malformed JSON
      expect(() => tryExtractJson(result)).toThrow('Failed to parse JSON from model response');
    });
    
    it('should handle empty sentiment analysis responses', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter, tryExtractJson } = await import('../../tools/analyzeNews');
      
      const content = '# Test News\n\nThis is a test news article.';
      const prompt = buildPrompt(content, '12345', 'TRUR');
      
      // Mock API response with empty content
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: ''
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      const result = await callOpenRouter(prompt);
      
      // Should throw error when trying to parse empty JSON
      expect(() => tryExtractJson(result)).toThrow('Failed to parse JSON from model response');
    });
  });

  describe('Sentiment Processing Performance', () => {
    it('should handle concurrent sentiment analysis requests', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter } = await import('../../tools/analyzeNews');
      
      const contents = [
        '# Positive News\n\nGreat results!',
        '# Negative News\n\nPoor performance.',
        '# Neutral News\n\nSteady performance.'
      ];
      
      // Mock API responses for concurrent requests
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: mock(async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  id: `${12345 + i}`,
                  symbol: "TRUR",
                  title: `Test News ${i + 1}`,
                  date: "",
                  category: "other",
                  summary: `Summary for news ${i + 1}`,
                  bullets: [],
                  trades: [],
                  additionalFields: {},
                  numbers: {
                    "redeemedShares": null,
                    "redeemedAmountRub": null,
                    "totalShares": null,
                    "navPriceRub": null
                  }
                })
              }
            }]
          })),
          text: mock(async () => '')
        });
      }
      
      // Test concurrent requests
      const promises = contents.map((content, i) => {
        const prompt = buildPrompt(content, `${12345 + i}`, 'TRUR');
        return callOpenRouter(prompt);
      });
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      results.forEach((result, i) => {
        const parsed = JSON.parse(result);
        expect(parsed.title).toBe(`Test News ${i + 1}`);
        expect(parsed.summary).toContain(`news ${i + 1}`);
      });
    });
    
    it('should handle large sentiment analysis responses efficiently', async () => {
      // Dynamically import the functions to test
      const { buildPrompt, callOpenRouter } = await import('../../tools/analyzeNews');
      
      // Create large content
      const largeContent = `
# Large News Article with Extensive Details

${Array.from({ length: 100 }, (_, i) => `Paragraph ${i + 1}: This is a detailed paragraph about fund performance and market conditions.`).join('\n\n')}

${Array.from({ length: 50 }, (_, i) => `- Bullet point ${i + 1}: Important detail about the fund's strategy and positioning.`).join('\n')}
      `;
      
      const prompt = buildPrompt(largeContent, '12345', 'TRUR');
      
      // Mock API response with large JSON
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mock(async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                id: "12345",
                symbol: "TRUR",
                title: "Large News Article with Extensive Details",
                date: "",
                category: "other",
                summary: "This is a summary of a very large news article with extensive details about fund performance.",
                bullets: Array.from({ length: 50 }, (_, i) => `Bullet point ${i + 1}: Important detail about the fund's strategy and positioning.`),
                trades: [],
                additionalFields: {},
                numbers: {
                  "redeemedShares": null,
                  "redeemedAmountRub": null,
                  "totalShares": null,
                  "navPriceRub": null
                }
              })
            }
          }]
        })),
        text: mock(async () => '')
      });
      
      const result = await callOpenRouter(prompt);
      const parsed = JSON.parse(result);
      
      expect(parsed.title).toBe("Large News Article with Extensive Details");
      expect(parsed.bullets).toHaveLength(50);
      expect(parsed.summary).toContain("extensive details");
    });
  });
});