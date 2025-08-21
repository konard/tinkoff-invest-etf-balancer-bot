import { promises as fs } from 'fs';
import path from 'path';
import puppeteer, { Browser, Page } from 'puppeteer';

type Nullable<T> = T | null | undefined;

const DEFAULT_SYMBOL = 'TRUR';
const BASE_HOST = 'https://www.tbank.ru';
const LOG_PREFIX = '[scrapeTbankNews]';

function getBaseUrlForSymbol(symbol: string): string {
  return `${BASE_HOST}/invest/etfs/${symbol}/news/`;
}

function getNewsDir(symbol: string): string {
  // Place news at repo root when running from project root
  return path.resolve(process.cwd(), 'news', symbol);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readSavedNewsIds(symbol: string): Promise<Set<string>> {
  const dir = getNewsDir(symbol);
  try {
    const entries = await fs.readdir(dir);
    const ids = new Set<string>();
    for (const entry of entries) {
      if (entry.endsWith('.md')) {
        const id = path.basename(entry, '.md');
        if (id) ids.add(id);
      }
    }
    return ids;
  } catch (err) {
    // Directory might not exist on the first run
    return new Set<string>();
  }
}

async function saveNewsMarkdown(symbol: string, id: string, content: string): Promise<string> {
  const dir = getNewsDir(symbol);
  await ensureDir(dir);
  const filePath = path.join(dir, `${id}.md`);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

async function getInnerText(page: Page, selectors: string[]): Promise<string> {
  for (const selector of selectors) {
    const exists = await page.$(selector);
    if (exists) {
      const value = await page.$eval(selector, (el) => (el as HTMLElement).innerText.trim());
      if (value && value.length > 0) return value;
    }
  }
  return '';
}

async function extractArticle(page: Page, url: string): Promise<{ title: string; dateText: string; body: string }> {
  // Try a set of selectors that are likely stable on T‑Bank pages, with graceful fallback
  const title = await getInnerText(page, [
    'h1[data-qa-file="NewsHeader"]',
    'h1[data-qa-type="uikit/article.title"]',
    'article h1',
    'main h1',
    'h1',
  ]);

  const dateText = await getInnerText(page, [
    '[data-qa-file="NewsCard"] time',
    'time',
  ]);

  // Prefer the main TradingNewsItem container specified by user
  let body = await page.evaluate(() => {
    const normalizeText = (s: string) => s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const containers = Array.from(document.querySelectorAll('div[data-qa-file="TradingNewsItemPure"]')) as HTMLElement[];
    if (containers.length === 0) return '';
    // Heuristic: pick the container with the largest text length that contains either table or additional fields blocks
    const score = (el: HTMLElement) => {
      const textLen = (el.innerText || '').length;
      const hasTable = !!el.querySelector('table');
      const hasAdditional = !!el.querySelector('[data-qa-file="AdditionalFieldsPure"]');
      return textLen + (hasTable ? 5000 : 0) + (hasAdditional ? 2000 : 0);
    };
    const sorted = containers
      .map((el) => ({ el, s: score(el) }))
      .sort((a, b) => a.s - b.s);
    const best = sorted.length > 0 ? sorted[sorted.length - 1].el : containers[0];
    return normalizeText(best.innerText || '');
  });
  if (!body) {
    body = await getInnerText(page, [
      '[data-qa-file="RichText"]',
      'article [data-qa-file="RichText"]',
      'article',
      'main article',
      'div[role="article"]',
      'div[data-qa-type="uikit/article"]',
      'body',
    ]);
  }

  return { title, dateText, body };
}

function buildMarkdown(id: string, url: string, title: string, dateText: string, body: string): string {
  const lines: string[] = [];
  if (title) lines.push(`# ${title}`);
  lines.push(`Source: ${url}`);
  if (dateText) lines.push(`Date: ${dateText}`);
  if (lines.length > 0) lines.push('');
  lines.push(body || '');
  return lines.join('\n');
}

async function clickShowMoreUntilExhausted(page: Page, targetLinks: number | null = null): Promise<void> {
  // Iteratively click the bottom-most "Show more" button with a fixed 2s wait after each click
  let iteration = 0;
  for (;;) {
    iteration += 1;
    const beforeCount = await page.$$eval('a[href^="/invest/fund-news/"]', (links) => links.length).catch(() => 0);
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} [load-more] iteration=${iteration} linksBefore=${beforeCount}`);

    const clickResult = await page.evaluate(() => {
      const normalizeText = (t: string) => t.replace(/\u00a0/g, ' ').trim().toLowerCase();
      const isShowMore = (el: HTMLElement) => {
        const text = normalizeText(el.textContent || '');
        return text.includes('show') && text.includes('more');
      };
      const allButtons = Array.from(document.querySelectorAll('button')) as HTMLElement[];
      const candidates = allButtons.filter(isShowMore);
      if (candidates.length === 0) return { found: false, disabled: true, clicked: false } as const;
      const enabled = candidates.filter((b) => !b.hasAttribute('disabled') && b.getAttribute('aria-busy') !== 'true');
      if (enabled.length === 0) return { found: true, disabled: true, clicked: false } as const;
      const bottomMost = enabled.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[enabled.length - 1];
      bottomMost.scrollIntoView({ behavior: 'instant', block: 'end' });
      try { window.scrollTo(0, document.body.scrollHeight); } catch (e) { /* noop */ }
      bottomMost.click();
      return { found: true, disabled: false, clicked: true } as const;
    });
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} [load-more] found=${clickResult.found} disabled=${clickResult.disabled} clicked=${(clickResult as any).clicked ?? false}`);
    if (!clickResult.found) { /* eslint-disable-next-line no-console */ console.log(`${LOG_PREFIX} [load-more] no more buttons, stopping`); break; }
    if (clickResult.disabled) { /* eslint-disable-next-line no-console */ console.log(`${LOG_PREFIX} [load-more] button disabled, waiting 2s and retry`); await delay(2000); continue; }
    await delay(2000);
    const afterCount = await page.$$eval('a[href^="/invest/fund-news/"]', (links) => links.length).catch(() => beforeCount);
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} [load-more] linksAfter=${afterCount} delta=${(afterCount || 0) - (beforeCount || 0)}`);
    if (targetLinks && afterCount >= targetLinks) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} [load-more] reached targetLinks=${targetLinks}, stop clicking`);
      break;
    }
  }
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function parseNewsIdFromHref(href: string): Nullable<string> {
  const match = href.match(/\/invest\/fund-news\/(\d+)\/?/);
  return match ? match[1] : null;
}

async function collectAllNewsLinks(page: Page): Promise<string[]> {
  const hrefs = await page.$$eval('a[href^="/invest/fund-news/"]', (links) => links.map((a) => (a as HTMLAnchorElement).getAttribute('href') || '').filter(Boolean));
  // eslint-disable-next-line no-console
  console.log(`${LOG_PREFIX} collected link elements: ${hrefs.length}`);
  // Normalize to absolute URLs and deduplicate
  return unique(
    hrefs.map((h) => (h.startsWith('http') ? h : `${BASE_HOST}${h}`))
  );
}

async function openAndScrapeNews(browser: Browser, url: string): Promise<{ id: string; markdown: string } | null> {
  const id = parseNewsIdFromHref(url);
  if (!id) return null;

  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // A short extra wait to allow client-side render to finish
    await delay(500);

    const { title, dateText, body } = await extractArticle(page, url);
    const markdown = buildMarkdown(id, url, title, dateText, body);
    return { id, markdown };
  } finally {
    await page.close().catch(() => undefined);
  }
}

type ScrapeOptions = {
  limitAll: number | null;
  firstRunLimit: number | null;
};

async function runSingleScrape(symbol: string, opts: ScrapeOptions): Promise<void> {
  const argv = process.argv.slice(2);
  // symbol is already provided
  // Flags: --limit=N (always), --first-limit=N (first run only), positional number treated as --limit
  let limitAll: number | null = opts.limitAll;
  let firstRunLimit: number | null = opts.firstRunLimit;
  for (const arg of argv.slice(1)) {
    const m = arg.match(/^--(?:(first-limit)|(limit|n))=(\d+)$/);
    if (m) {
      const value = parseInt(m[3], 10);
      if (m[1]) firstRunLimit = value; else limitAll = value;
    } else if (/^\d+$/.test(arg)) {
      limitAll = parseInt(arg, 10);
    }
  }
  const baseUrl = getBaseUrlForSymbol(symbol);

  const savedIds = await readSavedNewsIds(symbol);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  const page = await browser.newPage();
  try {
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} start symbol=${symbol} url=${baseUrl}`);
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(500);

    // Determine target number of links to load
    const isFirstRun = savedIds.size === 0;
    const targetLinks = (limitAll ?? (isFirstRun ? firstRunLimit : null)) || null;
    if (targetLinks) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} applying targetLinks=${targetLinks} (isFirstRun=${isFirstRun})`);
    }
    await clickShowMoreUntilExhausted(page, targetLinks);

    const links = await collectAllNewsLinks(page);
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} unique links: ${links.length}`);

    let toFetch = links.filter((u) => {
      const id = parseNewsIdFromHref(u);
      return id && !savedIds.has(id);
    });
    if (limitAll && toFetch.length > limitAll) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} applying limit=${limitAll} (from ${toFetch.length})`);
      toFetch = toFetch.slice(0, limitAll);
    } else if (!limitAll && isFirstRun && firstRunLimit && toFetch.length > firstRunLimit) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} applying firstRunLimit=${firstRunLimit} (from ${toFetch.length})`);
      toFetch = toFetch.slice(0, firstRunLimit);
    }
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} alreadySaved=${savedIds.size} toFetch=${toFetch.length}`);

    if (toFetch.length === 0) {
      // Nothing to do
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} nothing to fetch`);
      return;
    }

    // Process with small concurrency to be polite
    const concurrency = 3;
    const queue = [...toFetch];
    const workers: Array<Promise<void>> = [];

    for (let i = 0; i < concurrency; i += 1) {
      workers.push((async () => {
        while (queue.length > 0) {
          const nextUrl = queue.shift();
          if (!nextUrl) break;
          // eslint-disable-next-line no-console
          console.log(`${LOG_PREFIX} fetching ${nextUrl}`);
          const result = await openAndScrapeNews(browser, nextUrl);
          if (!result) continue;
          const { id, markdown } = result;
          await saveNewsMarkdown(symbol, id, markdown);
          // eslint-disable-next-line no-console
          console.log(`Saved news ${symbol}/${id}.md`);
        }
      })());
    }

    await Promise.all(workers);
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2);
  const symbol = (argv[0] || DEFAULT_SYMBOL).toUpperCase();
  const runOnce = argv.includes('--once');
  const intervalArg = argv.find((a) => a.startsWith('--interval='));
  const intervalMs = intervalArg ? parseInt(intervalArg.split('=')[1], 10) : 300000; // 5 min default

  const baseOpts: ScrapeOptions = { limitAll: null, firstRunLimit: null };

  if (runOnce) {
    await runSingleScrape(symbol, baseOpts);
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`${LOG_PREFIX} entering loop intervalMs=${intervalMs}`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runSingleScrape(symbol, baseOpts);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`${LOG_PREFIX} iteration error:`, err);
    }
    await delay(intervalMs);
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});


