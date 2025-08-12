import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { DESIRED_WALLET } from '../config';
import { normalizeTicker } from '../utils';
import { buildAumMapSmart, getFxRateToRub, AumEntry, getEtfMarketCapRUB } from './etfCap';
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
  // Страница новостей фонда (для ссылки-источника)
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
  TRND: 'Трендовые акции',
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

  const titleMatches = (t?: string) => !!t && /количеств[оа] па[её]в/i.test(t);
  const extractCountFromItem = (item: SmartfeedNewsItem): number | null => {
    const fields = item.additional_fields || [];
    for (const f of fields) {
      if (/всего па[её]в|общее количество па[её]в/i.test(f.name)) {
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

// HTML-парсинг и браузерный проход по ленте удалены: используем только Smartfeed API

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

  for (const s of symbols) {
    const sym = normalizeTicker(s) || s;
    // 1) Количество паёв через Smartfeed API (по бренду)
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} symbol=${sym} search sharesCount via Smartfeed API`);
    let sharesCount: number | null = null;
    let sharesSourceUrl: string | null = null;
    try {
      const apiFound = await fetchLatestSharesCountFromSmartfeed(sym);
      if (apiFound) {
        sharesCount = apiFound.count;
        sharesSourceUrl = apiFound.sourceUrl;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} smartfeed search failed for ${sym}:`, e);
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
      if (!etfInfo) {
        // eslint-disable-next-line no-console
        console.log(`${LOG_PREFIX} price: instrument not found for ${sym} (check TOKEN/env and instrument list)`);
      } else if (typeof etfInfo.lastPriceRUB !== 'number' || !Number.isFinite(etfInfo.lastPriceRUB)) {
        // eslint-disable-next-line no-console
        console.log(`${LOG_PREFIX} price: lastPriceRUB missing for ${sym} figi=${etfInfo.figi} uid=${etfInfo.uid} raw=${JSON.stringify({ lastPriceRUB: etfInfo.lastPriceRUB })}`);
      } else {
        priceRUB = etfInfo.lastPriceRUB || null;
        // eslint-disable-next-line no-console
        console.log(`${LOG_PREFIX} price: lastPriceRUB=${priceRUB} for ${sym}`);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} price: error fetching for ${sym}:`, e);
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
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} payload ${sym}: price=${priceRUB} shares=${sharesCount} aum=${aumRUB ?? null} mcap=${marketCap}`);
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


