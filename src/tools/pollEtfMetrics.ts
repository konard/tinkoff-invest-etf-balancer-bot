import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { configLoader } from '../configLoader';
import { normalizeTicker } from '../utils';
import { getFxRateToRub, AumEntry, getEtfMarketCapRUB } from './etfCap';
import { buildAumMapSmart } from './etfCap';
import fetch from 'node-fetch';

type Nullable<T> = T | null | undefined;

const LOG_PREFIX = '[pollEtfMetrics]';

// Функция для получения конфигурации аккаунта
const getAccountConfig = () => {
  const accountId = process.env.ACCOUNT_ID || '0'; // По умолчанию используем аккаунт '0'
  const account = configLoader.getAccountById(accountId);

  if (!account) {
    throw new Error(`Account with id '${accountId}' not found in CONFIG.json`);
  }

  return account;
};

function getTickersFromArgs(): string[] {
  const args = process.argv.slice(2);
  if (!args.length || args[0].startsWith('--')) {
    const accountConfig = getAccountConfig();
    return Object.keys(accountConfig.desired_wallet);
  }
  return args[0]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Получаем URL новостей фонда из существующих метрик или создаем новый
async function getSharesSearchUrl(symbol: string): Promise<string> {
  const normalized = normalizeTicker(symbol) || symbol;
  
  // Пробуем прочитать из существующих метрик
  try {
    const metricsPath = path.join(getMetricsDir(), `${normalized}.json`);
    const metricsData = await fs.readFile(metricsPath, 'utf-8');
    const metrics = JSON.parse(metricsData);
    if (metrics.sharesSearchUrl) {
      return metrics.sharesSearchUrl;
    }
  } catch {
    // Файл метрик не существует или не читается
  }
  
  // Если метрик нет, проверяем оба варианта URL
  const candidates = [
    `https://www.tbank.ru/invest/etfs/${normalized}@/news/`,
    `https://www.tbank.ru/invest/etfs/${normalized}/news/`,
  ];
  
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { method: 'GET' });
      const status = resp.status;
      const body = await resp.text();
      const notFound = /Такой страницы нет/i.test(body);
      if (status === 200 && !notFound) {
        return url;
      }
    } catch {
      // ignore and try next candidate
    }
  }
  
  // fallback — стандартный URL
  return `https://www.tbank.ru/invest/etfs/${normalized}/news/`;
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
  TLCB: 'Локальные валютные облигации',
  TOFZ: 'Государственные облигации',
  TBRU: 'Российские облигации',
  TMON: 'Денежный рынок',
  TMOS: 'Крупнейшие компании РФ',
  TITR: 'Российские Технологии',
  TDIV: 'Дивидендные акции',
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

async function fetchLatestSharesCountFromSmartfeed(symbol: string): Promise<{ count: number; sourceUrl: string; sourceTitle?: string; brand: string; apiUrl: string } | null> {
  const brand = getBrandNameForTicker(symbol);
  if (!brand) return null;

  const base = 'https://www.tbank.ru/api/invest/smartfeed-public/v1/feed/api/brands';
  const encBrand = encodeURIComponent(brand);
  let cursor: string | null = null;
  let pages = 0;

  const titleMatches = (t?: string) => !!t && (/количеств[оа] па[её]в|в фонд поступили новые деньги/i).test(t);
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
      const resp = await fetch(url, { method: 'GET' });
      const raw = await resp.text();
      const data = JSON.parse(raw);
      const news: SmartfeedNewsItem[] = data?.payload?.news || [];
      const nextCursor: string | null = data?.payload?.meta?.cursor || null;
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} smartfeed brand=${brand} news=${news.length} cursorNext=${nextCursor ? nextCursor.slice(0, 16) + '…' : 'null'}`);
      
      // Детальное логирование для отладки AUM
      if (symbol === 'TBRU') {
        console.log(`${LOG_PREFIX} [DEBUG] Parsing API: ${url}`);
        console.log(`${LOG_PREFIX} [DEBUG] Found ${news.length} news items`);
        
        for (let i = 0; i < Math.min(5, news.length); i++) {
          const item = news[i];
          console.log(`${LOG_PREFIX} [DEBUG] News ${i+1}: id=${item.id}, title="${item.title}"`);
          if (item.additional_fields && item.additional_fields.length > 0) {
            console.log(`${LOG_PREFIX} [DEBUG] Additional fields: ${JSON.stringify(item.additional_fields)}`);
          }
        }
      }
      
      for (const item of news) {
        if (!titleMatches(item.title)) continue;
        const count = extractCountFromItem(item);
        if (count) {
          const sourceUrl = `https://www.tbank.ru/invest/fund-news/${item.id}/`;
          // eslint-disable-next-line no-console
          console.log(`${LOG_PREFIX} smartfeed hit id=${item.id} title=${item.title} count=${count}`);
          return { count, sourceUrl, sourceTitle: item.title, brand, apiUrl: `${base}/${encBrand}/fund-news?limit=50` };
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

export const toRubFromAum = async (aumEntry: AumEntry | undefined): Promise<number> => {
  if (!aumEntry || !aumEntry.amount || aumEntry.amount <= 0) return 0;

  if (aumEntry.currency === 'RUB') return aumEntry.amount;

  const fxRate = await getFxRateToRub(aumEntry.currency);
  if (fxRate <= 0) return 0;

  return aumEntry.amount * fxRate;
};

export async function collectOnceForSymbols(symbols: string[]): Promise<void> {
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
    let smartfeedBrand: string | null = null;
    let smartfeedApiUrl: string | null = null;
    // Всегда вычисляем бренд и базовый API-URL для сохранения в JSON
    try {
      const brand = getBrandNameForTicker(sym);
      if (brand) {
        const base = 'https://www.tbank.ru/api/invest/smartfeed-public/v1/feed/api/brands';
        const encBrand = encodeURIComponent(brand);
        smartfeedBrand = brand;
        smartfeedApiUrl = `${base}/${encBrand}/fund-news?limit=50`;
      }
    } catch {
      // noop
    }
    try {
      const apiFound = await fetchLatestSharesCountFromSmartfeed(sym);
      if (apiFound) {
        sharesCount = apiFound.count;
        sharesSourceUrl = apiFound.sourceUrl;
        smartfeedBrand = apiFound.brand || smartfeedBrand;
        smartfeedApiUrl = apiFound.apiUrl || smartfeedApiUrl;
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
    
    // Логирование AUM для отладки
    if (sym === 'TBRU') {
      console.log(`${LOG_PREFIX} [DEBUG] AUM search for TBRU:`);
      console.log(`${LOG_PREFIX} [DEBUG] AUM map entry: ${JSON.stringify(aumMap[sym])}`);
      console.log(`${LOG_PREFIX} [DEBUG] AUM result: ${aumMap[sym] ? 'found' : 'not found'}`);
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
    let figi: string | null = null;
    let uid: string | null = null;
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
        figi = etfInfo.figi;
        uid = etfInfo.uid;
        // eslint-disable-next-line no-console
        console.log(`${LOG_PREFIX} price: lastPriceRUB=${priceRUB} for ${sym}`);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} price: error fetching for ${sym}:`, e);
    }

    const marketCap = sharesCount && priceRUB ? sharesCount * priceRUB : null;
    // Знаковая метрика: (marketCap - AUM) / AUM * 100
    // Отрицательное значение — недооценка (AUM > marketCap), положительное — переоценка (marketCap > AUM)
    const decorrelationPct = aumRUB && marketCap ? ((marketCap - aumRUB) / aumRUB) * 100 : null;

    const sharesSearchUrl = await getSharesSearchUrl(sym);
    const payload = {
      symbol: sym,
      timestamp: nowIso,
      sharesCount, // integer шт или null
      price: priceRUB,
      marketCap: marketCap,
      aum: aumRUB ?? null,
      decorrelationPct: decorrelationPct,
      sharesSearchUrl: sharesSearchUrl,
      sharesSourceUrl: sharesSourceUrl || null,
      figi: figi,
      uid: uid,
      smartfeedBrand: smartfeedBrand,
      smartfeedUrl: smartfeedApiUrl,
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

// Запускать только при прямом вызове скрипта, чтобы при импорте не стартовал цикл
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isMain = process.argv[1] === import.meta.url || process.argv[1]?.endsWith('pollEtfMetrics.ts');
if (isMain) {
  run().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  });
}


