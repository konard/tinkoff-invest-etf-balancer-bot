import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { DESIRED_WALLET } from '../config';
import { normalizeTicker } from '../utils';
import { buildAumMapSmart, getFxRateToRub, AumEntry, getEtfMarketCapRUB } from './etfCap';
import puppeteer, { Page } from 'puppeteer';
import rp from 'request-promise';

type Nullable<T> = T | null | undefined;

const LOG_PREFIX = '[pollEtfMetrics]';

function getTickersFromArgs(): string[] {
  const args = process.argv.slice(2);
  if (!args.length || args[0].startsWith('--')) return Object.keys(DESIRED_WALLET);
  return args[0]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getSharesSearchUrl(symbol: string): string {
  // Базовая страница списка новостей фонда в Т‑Банке
  return `https://www.tbank.ru/invest/etfs/${symbol}/news/`;
}

function getSharesPath(symbol: string): string {
  return path.resolve(process.cwd(), 'shares_count', `${symbol}.json`);
}

function getMetricsDir(): string {
  return path.resolve(process.cwd(), 'etf_metrics');
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readSharesCount(symbol: string): Promise<number | null> {
  try {
    const s = await fs.readFile(getSharesPath(symbol), 'utf-8');
    const num = Number(String(s).trim());
    return Number.isFinite(num) && num > 0 ? num : null;
  } catch {
    return null;
  }
}

function parseTotalSharesFromText(text: string): number | null {
  const guard = /(всего па[её]в|общее количество па[её]в)/i;
  if (!guard.test(text)) return null;
  const re = /(всего па[её]в|общее количество па[её]в)[^\d]{0,20}(\d[\d\s]*[\,\.]?\d*)\s*(млн|тыс)?/i;
  const m = text.match(re);
  if (!m) return null;
  const numRaw = (m[2] || '').replace(/\s+/g, '').replace(',', '.');
  const unit = (m[3] || '').toLowerCase();
  const base = parseFloat(numRaw);
  if (!isFinite(base)) return null;
  if (unit.includes('млн')) return Math.round(base * 1_000_000);
  if (unit.includes('тыс')) return Math.round(base * 1_000);
  return Math.round(base);
}

// Маппинг тикеров на брендовые названия в смартфиде (кириллица)
const TICKER_TO_BRAND: Record<string, string> = {
  TPAY: 'Пассивный доход',
  TRUR: 'Вечный портфель',
  TGLD: 'Золото',
};

function getBrandNameForTicker(symbol: string): string | null {
  const s = normalizeTicker(symbol) || symbol;
  return TICKER_TO_BRAND[s] || null;
}

type SmartfeedNewsItem = {
  id: number;
  title?: string;
  body?: string;
  additional_fields?: Array<{ name: string; value: string }>;
};

async function fetchLatestSharesCountFromSmartfeed(symbol: string): Promise<{ count: number; sourceUrl: string; sourceTitle?: string } | null> {
  const brand = getBrandNameForTicker(symbol);
  if (!brand) return null;

  const base = 'https://www.tbank.ru/api/invest/smartfeed-public/v1/feed/api/brands';
  const encBrand = encodeURIComponent(brand);
  let cursor: string | null = null;
  let pages = 0;

  const titleMatches = (t?: string) => !!t && /количеств[оа] паев/i.test(t);
  const extractCountFromItem = (item: SmartfeedNewsItem): number | null => {
    const fields = item.additional_fields || [];
    for (const f of fields) {
      if (/всего паев|общее количество паев/i.test(f.name)) {
        const n = parseTotalSharesFromText(`${f.name}: ${f.value}`);
        if (n) return n;
      }
    }
    // Фолбэк — пробуем по body, если он приходит в API
    if (item.body) {
      const n = parseTotalSharesFromText(item.body);
      if (n) return n;
    }
    return null;
  };

  while (pages < 200) { // хардлимит безопасности
    const url = `${base}/${encBrand}/fund-news?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    try {
      const raw = await rp({ uri: url, method: 'GET' });
      const data = JSON.parse(raw);
      const news: SmartfeedNewsItem[] = data?.payload?.news || [];
      const nextCursor: string | null = data?.payload?.meta?.cursor || null;
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} smartfeed brand=${brand} news=${news.length} cursorNext=${nextCursor ? nextCursor.slice(0, 16) + '…' : 'null'}`);
      for (const item of news) {
        if (!titleMatches(item.title)) continue;
        const count = extractCountFromItem(item);
        if (count) {
          const sourceUrl = `https://www.tbank.ru/invest/fund-news/${item.id}/`;
          // eslint-disable-next-line no-console
          console.log(`${LOG_PREFIX} smartfeed hit id=${item.id} title=${item.title} count=${count}`);
          return { count, sourceUrl, sourceTitle: item.title };
        }
      }
      if (!nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
      pages += 1;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} smartfeed error:`, e);
      break;
    }
  }
  return null;
}

async function extractSharesCountFromNewsPage(page: Page): Promise<number | null> {
  const res = await extractSharesCountFromNewsPageDetailed(page);
  return res.count;
}

async function extractSharesCountFromNewsPageDetailed(page: Page): Promise<{ count: number | null; textLen: number; matchContext: string | null }> {
  const text = await page.evaluate(() => {
    const container = document.querySelector('div[data-qa-file="TradingNewsItemPure"]') as HTMLElement | null;
    const target = container || document.body;
    return (target?.innerText || '').replace(/\u00a0/g, ' ');
  });
  const textLen = (text || '').length;
  const re = /(всего па[её]в|общее количество па[её]в)[^\d]{0,20}(\d[\d\s]*[\,\.]?\d*)\s*(млн|тыс)?/i;
  const m = (text || '').match(re);
  const count = parseTotalSharesFromText(text || '');
  let matchContext: string | null = null;
  if (m && m.index !== undefined) {
    const start = Math.max(0, m.index - 60);
    const end = Math.min(textLen, m.index + (m[0]?.length || 0) + 60);
    matchContext = (text || '').slice(start, end).replace(/\s+/g, ' ').trim();
  }
  return { count, textLen, matchContext };
}

async function fetchLatestSharesCountFromTbank(
  symbol: string,
  maxClicks = 30,
  symbolTimeoutMs = 90000,
  forcedCandidateUrl?: string,
): Promise<{ count: number; sourceUrl: string; sourceTitle?: string; searchUrl: string } | null> {
  const urlWithAt = `https://www.tbank.ru/invest/etfs/${symbol}@/news/`;
  const urlPlain = `https://www.tbank.ru/invest/etfs/${symbol}/news/`;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
    try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const t = req.resourceType();
      if (t === 'image' || t === 'media' || t === 'font' || t === 'stylesheet') req.abort().catch(() => undefined);
      else req.continue().catch(() => undefined);
    });

    let listUrl = urlWithAt;
    try {
      await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const hasNews = await page.$$eval('a[href^="/invest/fund-news/"]', (links) => links.length > 0).catch(() => false);
      if (!hasNews) {
        listUrl = urlPlain;
        await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      }
    } catch {
      listUrl = urlPlain;
      await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} list=${listUrl}`);
    try {
      const stats = await page.evaluate(() => ({
        cards: document.querySelectorAll('div[data-qa-file="FundNewsItem"], div[data-qa-file="TradingNewsItemPure"], [data-qa-file="NewsCard"], article').length,
        anchors: document.querySelectorAll('a[href^="/invest/fund-news/"]').length,
      }));
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} list.stats cards=${stats.cards} anchors=${stats.anchors}`);
    } catch {}

    const start = Date.now();
    const effectiveTimeoutMs = Math.max(symbolTimeoutMs, maxClicks * 2000 + 15000);

    const findTargetLink = async (): Promise<{ href: string | null; matchedCount: number; scannedCards: number; sampleTitles: string[]; reason: string } | null> => {
      return page.evaluate(() => {
        const norm = (s: string) => s.replace(/\u00a0/g, ' ').trim().toLowerCase().replace(/ё/g, 'е');
        const titleMatches = (title: string) => {
          const t = norm(title);
          return (
            t.includes('количество паев') ||
            t.includes('количества паев')
          );
        };
        // Ищем карточки разных типов, включая FundNewsItem/CapitalEtfNews
        const cards = Array.from(document.querySelectorAll(
          'div[data-qa-file="TradingNewsItemPure"], [data-qa-file="NewsCard"], article, div[data-qa-file="FundNewsItem"], div[data-qa-file="CapitalEtfNews"]'
        )) as HTMLElement[];
        const sampleTitles: string[] = [];
        const matchedTitle: string[] = [];
        for (const card of cards) {
          const titleEl = card.querySelector('[data-qa-file="FundNewsItem"], h3, h2, .FundNewsItem__title_b1jc9');
          const titleText = titleEl ? norm((titleEl as HTMLElement).textContent || '') : '';
          if (titleText) sampleTitles.push(titleText);
          if (titleText && titleMatches(titleText)) {
            const a = card.querySelector('a[href^="/invest/fund-news/"]') as HTMLAnchorElement | null;
            const href = a ? (a.href || a.getAttribute('href') || '') : '';
            if (href) matchedTitle.push(href.startsWith('http') ? href : `${location.origin}${href}`);
          }
        }
        const href = matchedTitle[0] || null;
        const matchedCount = matchedTitle.length;
        const reason = matchedTitle.length > 0 ? 'title' : 'none';
        return { href, matchedCount, scannedCards: cards.length, sampleTitles: sampleTitles.slice(0, 5), reason };
      });
    };

    // Если передан конкретный URL новости — откроем сразу
    if (forcedCandidateUrl) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} forcedCandidateUrl=${forcedCandidateUrl}`);
      const news = await browser.newPage();
      try {
        await news.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        await news.setRequestInterception(true);
        news.on('request', (req) => {
          const t = req.resourceType();
          if (t === 'image' || t === 'media' || t === 'font' || t === 'stylesheet') req.abort().catch(() => undefined);
          else req.continue().catch(() => undefined);
        });
        await news.goto(forcedCandidateUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        // eslint-disable-next-line no-console
        console.log(`${LOG_PREFIX} visiting(forced)=${forcedCandidateUrl}`);
        const details = await extractSharesCountFromNewsPageDetailed(news);
        // eslint-disable-next-line no-console
        console.log(`${LOG_PREFIX} article.textLen=${details.textLen} matchContext=${details.matchContext ? '...' + details.matchContext + '...' : 'null'}`);
        if (details.count) {
          let title = '' as string;
          try { title = await news.evaluate(() => (document.querySelector('h1')?.textContent || '').replace(/\u00a0/g, ' ').trim()); } catch {}
          console.log(`${LOG_PREFIX} sharesCount=${details.count} from ${forcedCandidateUrl}`);
          return { count: details.count, sourceUrl: forcedCandidateUrl, sourceTitle: title, searchUrl: listUrl };
        }
      } finally {
        await news.close().catch(() => undefined);
      }
    }

    let clicks = 0;
    while (clicks < maxClicks && (Date.now() - start) < effectiveTimeoutMs) {
      const candidate = await findTargetLink();
      if (candidate && candidate.href) {
        // eslint-disable-next-line no-console
        console.log(`${LOG_PREFIX} candidate=${candidate.href} matched=${candidate.matchedCount} reason=${candidate.reason} scannedCards=${candidate.scannedCards} sampleTitles=${(candidate.sampleTitles || []).join(' | ')}`);
        const news = await browser.newPage();
        try {
          await news.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
          await news.setRequestInterception(true);
          news.on('request', (req) => {
            const t = req.resourceType();
            if (t === 'image' || t === 'media' || t === 'font' || t === 'stylesheet') req.abort().catch(() => undefined);
            else req.continue().catch(() => undefined);
          });
          await news.goto(candidate.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
          // eslint-disable-next-line no-console
          console.log(`${LOG_PREFIX} visiting=${candidate.href}`);
          const details = await extractSharesCountFromNewsPageDetailed(news);
          // eslint-disable-next-line no-console
          console.log(`${LOG_PREFIX} article.textLen=${details.textLen} matchContext=${details.matchContext ? '...' + details.matchContext + '...' : 'null'}`);
          if (details.count) {
            let title = '' as string;
            try {
              title = await news.evaluate(() => (document.querySelector('h1')?.textContent || '').replace(/\u00a0/g, ' ').trim());
            } catch {}
            // eslint-disable-next-line no-console
            console.log(`${LOG_PREFIX} sharesCount=${details.count} from ${candidate.href}`);
            return { count: details.count, sourceUrl: candidate.href, sourceTitle: title, searchUrl: listUrl };
          } else {
            // eslint-disable-next-line no-console
            console.log(`${LOG_PREFIX} no total shares on ${candidate.href}`);
          }
        } finally {
          await news.close().catch(() => undefined);
        }
      }
      if (clicks >= maxClicks) break;
      clicks += 1;
      const didClick = await page.evaluate(() => {
        const normalize = (s: string) => s.replace(/\u00a0/g, ' ').trim().toLowerCase();
        const clickable = Array.from(document.querySelectorAll('button, a')) as HTMLElement[];
        const isLoadMore = (el: HTMLElement) => {
          const t = normalize(el.textContent || '');
          return (
            (t.includes('показать') && t.includes('ещ')) ||
            t === 'далее' ||
            t.includes('загрузить еще')
          );
        };
        const candidates = clickable.filter(isLoadMore);
        const enabled = candidates.filter((b) => !b.hasAttribute('disabled') && (b.getAttribute('aria-busy') !== 'true'));
        if (!enabled.length) return false as any;
        const bottom = enabled.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[enabled.length - 1];
        bottom.scrollIntoView({ behavior: 'instant', block: 'end' });
        (bottom as any).click();
        return true as any;
      });
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} show-more click=${didClick} (${clicks}/${maxClicks})`);
      await new Promise((r) => setTimeout(r, 1500));
    }
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} no new shares-count news found for ${symbol} (clicks=${clicks}/${maxClicks})`);
    return null;
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function writeMetrics(symbol: string, data: any): Promise<void> {
  const outDir = getMetricsDir();
  await ensureDir(outDir);
  const outPath = path.join(outDir, `${symbol}.json`);
  await fs.writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  // eslint-disable-next-line no-console
  console.log(`${LOG_PREFIX} saved ${outPath}`);
}

async function collectOnceForSymbols(symbols: string[]): Promise<void> {
  const normalized = symbols.map((t) => normalizeTicker(t) || t);
  const aumMap = await buildAumMapSmart(normalized);
  const usdToRub = await getFxRateToRub('USD');
  const eurToRub = await getFxRateToRub('EUR');
  const nowIso = new Date().toISOString();
  const argv = process.argv.slice(2);
  const debugNewsHtmlArg = argv.find((a) => a.startsWith('--news-html='));
  const debugNewsHtmlPath = debugNewsHtmlArg ? debugNewsHtmlArg.split('=')[1] : null;
  const forceNewsIdArg = argv.find((a) => a.startsWith('--force-news-id='));
  const forceNewsId = forceNewsIdArg ? forceNewsIdArg.split('=')[1] : null;
  const maxClicksArg = argv.find((a) => a.startsWith('--max-clicks='));
  const maxClicks = maxClicksArg ? parseInt(maxClicksArg.split('=')[1], 10) : 1000; // по требованию: 1000 проходов
  const symbolTimeoutMs = Math.max(90000, maxClicks * 2000 + 15000);

  for (const s of symbols) {
    const sym = normalizeTicker(s) || s;
    // 1) Попробуем найти количество паёв в свежих новостях Т‑Банка
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} symbol=${sym} search sharesCount via T‑Bank news`);
    let sharesCount: number | null = null;
    let sharesSourceUrl: string | null = null;
    try {
      // Сначала — быстрый и надёжный Smartfeed API по бренду
      const apiFound = await fetchLatestSharesCountFromSmartfeed(sym);
      if (apiFound) {
        sharesCount = apiFound.count;
        sharesSourceUrl = apiFound.sourceUrl;
      }
      let found: { count: number; sourceUrl: string; sourceTitle?: string; searchUrl: string } | null = null;
      let forcedUrl: string | undefined;
      if (debugNewsHtmlPath) {
        // eslint-disable-next-line no-console
        console.log(`${LOG_PREFIX} using local news HTML for debug: ${debugNewsHtmlPath}`);
        try {
          const html = await fs.readFile(debugNewsHtmlPath, 'utf-8');
          const textNorm = html.replace(/\u00a0/g, ' ').replace(/ё/g, 'е');
          const idx = textNorm.toLowerCase().indexOf('количество паев');
          if (idx !== -1) {
            const windowStart = Math.max(0, idx - 5000);
            const windowEnd = Math.min(textNorm.length, idx + 5000);
            const snippet = textNorm.slice(windowStart, windowEnd);
            const m = snippet.match(/href\s*=\s*"(\/invest\/fund-news\/\d+\/?)"/i);
            if (m && m[1]) {
              forcedUrl = `https://www.tbank.ru${m[1]}`;
            }
          }
        } catch (e) {
          console.log(`${LOG_PREFIX} failed to parse --news-html file:`, e);
        }
      }
      if (!forcedUrl && forceNewsId) {
        forcedUrl = `https://www.tbank.ru/invest/fund-news/${forceNewsId}/`;
      }
      if (!sharesCount && !found) {
        found = await fetchLatestSharesCountFromTbank(sym, maxClicks, symbolTimeoutMs, forcedUrl);
      }
      if (!sharesCount && found && typeof found.count === 'number') {
        sharesCount = found.count;
        sharesSourceUrl = found.sourceUrl;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} news search failed for ${sym}:`, e);
    }
    // 2) Фолбэк — читаем локальный кэш из shares_count/<symbol>.json
    if (!sharesCount) {
      sharesCount = await readSharesCount(sym);
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} symbol=${sym} sharesCount from local cache: ${sharesCount}`);
    }
    const aum: AumEntry | undefined = aumMap[sym];
    const aumRUB = aum
      ? aum.currency === 'RUB'
        ? aum.amount
        : aum.currency === 'USD'
          ? (usdToRub > 0 ? aum.amount * usdToRub : null)
          : (eurToRub > 0 ? aum.amount * eurToRub : null)
      : null;

    // Fetch last price for ETF to compute market cap as sharesCount * price
    let priceRUB: number | null = null;
    try {
      const etfInfo = await getEtfMarketCapRUB(sym);
      if (etfInfo && typeof etfInfo.lastPriceRUB === 'number') {
        priceRUB = etfInfo.lastPriceRUB || null;
      }
    } catch {
      // ignore
    }

    const marketCap = sharesCount && priceRUB ? sharesCount * priceRUB : null;
    const decorrelationPct = aumRUB && marketCap ? Math.abs(marketCap - aumRUB) / aumRUB * 100 : null;

    const payload = {
      symbol: sym,
      timestamp: nowIso,
      sharesCount, // integer шт или null
      price: priceRUB,
      marketCap: marketCap,
      aum: aumRUB ?? null,
      decorrelationPct: decorrelationPct,
      sharesSearchUrl: getSharesSearchUrl(sym),
      sharesSourceUrl: sharesSourceUrl || null,
    };
    await writeMetrics(sym, payload);
  }
}

async function run(): Promise<void> {
  const symbols = getTickersFromArgs();
  const argv = process.argv.slice(2);
  const runOnce = argv.includes('--once');
  const intervalArg = argv.find((a) => a.startsWith('--interval='));
  const intervalMs = intervalArg ? parseInt(intervalArg.split('=')[1], 10) : 3600000; // 1 час по умолчанию

  const iterate = async () => {
    try {
      await collectOnceForSymbols(symbols);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`${LOG_PREFIX} iteration error:`, e);
    }
  };

  if (runOnce) {
    await iterate();
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`${LOG_PREFIX} entering loop intervalMs=${intervalMs}`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await iterate();
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});


