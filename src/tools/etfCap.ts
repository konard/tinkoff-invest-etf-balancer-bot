import 'dotenv/config';
import { createSdk } from 'tinkoff-sdk-grpc-js';
import _ from 'lodash';
import { configLoader } from '../configLoader';
import { convertTinkoffNumberToNumber, normalizeTicker, tickersEqual } from '../utils';

// Используем request-promise из зависимостей проекта
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rp = require('request-promise');

type Quotation = { units: number; nano: number } | undefined;

const toNumber = (q: Quotation): number => {
  if (!q || typeof (q as any).units === 'undefined' || typeof (q as any).nano === 'undefined') {
    return 0;
  }
  return convertTinkoffNumberToNumber(q as any);
};

// Функция для получения конфигурации аккаунта
const getAccountConfig = () => {
  const accountId = process.env.ACCOUNT_ID || '0'; // По умолчанию используем аккаунт '0'
  const account = configLoader.getAccountById(accountId);

  if (!account) {
    throw new Error(`Account with id '${accountId}' not found in CONFIG.json`);
  }

  return account;
};

const getTickersFromArgs = (): string[] => {
  const args = process.argv.slice(2);
  if (!args.length) {
    const accountConfig = getAccountConfig();
    return Object.keys(accountConfig.desired_wallet);
  }
  const joined = args.join(',');
  return joined
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

// --- AUM (СЧА) парсинг с https://t-capital-funds.ru/statistics/ ---
const T_CAPITAL_URL = 'https://t-capital-funds.ru/statistics/';

const fetchStatisticsHtml = async (): Promise<string> => {
  const html: string = await rp({
    uri: T_CAPITAL_URL,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru,en;q=0.9',
    },
    timeout: 10000,
    resolveWithFullResponse: false,
    simple: true,
  });
  return html;
};

const htmlToText = (html: string): string => {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseMoneyToNumber = (s: string): number | null => {
  // Убираем пробелы-разделители тысяч и валютные символы, заменяем запятую на точку
  const cleaned = s
    .replace(/[^0-9,\.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '')
    .replace(/,(?=\d{2}$)/, '.');
  const num = Number(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const extractStatisticsTableHtml = (html: string): string | null => {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  if (!tables.length) return null;
  for (const t of tables) {
    const headerRow = (t.match(/<tr[\s\S]*?<\/tr>/i) || [])[0] || '';
    const headerText = htmlToText(headerRow).toLowerCase();
    if (
      headerText.includes('сча за последний день') ||
      headerText.includes('стоимость чистых активов') ||
      headerText.includes('сча')
    ) {
      return t;
    }
  }
  // fallback: вернуть первую таблицу
  return tables[0] || null;
};

export type AumEntry = { amount: number; currency: 'RUB' | 'USD' | 'EUR' };

const parseAumTable = (tableHtml: string, interestedTickers: Set<string>): Record<string, AumEntry> => {
  const result: Record<string, AumEntry> = {};
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  const rows = tableHtml.match(rowRegex) || [];
  
  // Определим индекс колонки "СЧА за последний день"
  let lastDayIdx = -1;
  if (rows.length) {
    const header = rows[0];
    if (header) {
      const headers = (header.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || []).map((h) => htmlToText(h).toLowerCase());
      lastDayIdx = headers.findIndex((h) => h.includes('сча за последний день'));
    }
  }
  
  for (const rowHtml of rows) {
    const rowText = htmlToText(rowHtml);
    if (!rowText) continue;
    
    // Кандидаты на тикер: токены из ВЕРХНЕГО РЕГИСТРА 3-6 символов
    const tokens = rowText.split(/\s+/);
    let foundTicker: string | null = null;
    
    for (const token of tokens) {
      if (/^[A-Z]{3,6}$/.test(token)) {
        const normalized = normalizeTicker(token) || token;
        if (interestedTickers.has(normalized)) {
          foundTicker = normalized;
          break;
        }
      }
    }
    
    if (!foundTicker) continue;
    
    // Попытаемся вытащить конкретную ячейку колонки "СЧА за последний день"
    const cells = (rowHtml.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || []);
    let cellHtml = '';
    if (lastDayIdx >= 0 && cells[lastDayIdx]) {
      cellHtml = cells[lastDayIdx];
    } else {
      cellHtml = rowHtml;
    }
    
    const cellText = htmlToText(cellHtml);
    const currency: 'RUB' | 'USD' | 'EUR' = /\$/i.test(cellText)
      ? 'USD'
      : /€/.test(cellText)
      ? 'EUR'
      : 'RUB';
    
    const numberLikeMatches = cellText.match(/[0-9][0-9\s.,]*[0-9]/g) || [];
    const parsed = numberLikeMatches.map(parseMoneyToNumber).filter((n): n is number => typeof n === 'number');
    
    if (!parsed.length) continue;
    
    const aum = Math.max(...parsed);
    if (Number.isFinite(aum)) {
      result[foundTicker] = { amount: aum, currency };
    }
  }
  
  return result;
};

const fetchAumMapFromTCapital = async (normalizedTickers: string[]): Promise<Record<string, AumEntry>> => {
  try {
    const html: string = await fetchStatisticsHtml();
    // Ищем таблицу по заголовкам колонок
    const tableHtml = extractStatisticsTableHtml(html);
    if (!tableHtml) return {};
    const interested = new Set(normalizedTickers.map((t) => normalizeTicker(t) || t));
    return parseAumTable(tableHtml, interested);
  } catch (e) {
    return {};
  }
};

const ETF_TICKER_NAME_PATTERNS: Record<string, RegExp[]> = {
  // TRUR — «Стратегия вечного портфеля в рублях»
  TRUR: [/вечного\s+портфеля\s+в\s+рублях/i],
  // TPAY — «Пассивный доход» (TRAY → TPAY)
  TPAY: [/пассивный\s+доход/i],
  // TGLD — «Золото»
  TGLD: [/золото/i],
  // TRND — «Т-Капитал Трендовые акции»
  TRND: [/трендов.*акци/i],
  // TLCB — «Локальные валютные облигации»
  TLCB: [/локальные\s+валютные\s+облигации/i, /валютные\s+облигации/i, /т-капитал\s+локальные\s+валютные\s+облигации/i],
  // TOFZ — «БПИФ рыночных финансовых инструментов Т-Капитал ОФЗ»
  TOFZ: [/т-капитал\s+офз/i, /бпиф.*офз/i, /рыночных.*офз/i],
  // TBRU — «БПИФ рыночных финансовых инструментов Т-Капитал Облигации»
  TBRU: [/т-капитал\s+облигации/i, /бпиф.*облигации/i, /рыночных.*облигации/i],
  // TMON — «БПИФ рыночных финансовых инструментов Т-Капитал Денежный рынок»
  TMON: [/т-капитал\s+денежный\s+рынок/i, /бпиф.*денежный\s+рынок/i, /рыночных.*денежный\s+рынок/i],
  // TMOS — «БПИФ рыночных финансовых инструментов Т-Капитал Индекс МосБиржи»
  TMOS: [/т-капитал\s+индекс\s+мосбиржи/i, /бпиф.*индекс\s+мосбиржи/i, /рыночных.*индекс\s+мосбиржи/i],
  // TITR — «БПИФ рыночных финансовых инструментов Т-Капитал Российские Технологии»
  TITR: [/т-капитал\s+российские\s+технологии/i, /бпиф.*российские\s+технологии/i, /рыночных.*российские\s+технологии/i],
  // TDIV — «БПИФ рыночных финансовых инструментов Т-Капитал Дивидендные акции»
  TDIV: [/т-капитал\s+дивидендные\s+акции/i, /бпиф.*дивидендные\s+акции/i, /рыночных.*дивидендные\s+акции/i],
};

const findAumForTickerByName = (html: string, normalizedTicker: string): AumEntry | undefined => {
  const patterns = ETF_TICKER_NAME_PATTERNS[normalizedTicker];
  if (!patterns) return undefined;
  
  const tableHtml = extractStatisticsTableHtml(html);
  if (!tableHtml) return undefined;
  
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  const rows = tableHtml.match(rowRegex) || [];
  
  for (const rowHtml of rows) {
    const text = htmlToText(rowHtml);
    if (!text) continue;
    
    if (patterns.every((re) => re.test(text))) {
      // Используем общий парс ячеек, как в parseAumTable
      const dummy = parseAumTable(`<table>${rowHtml}</table>`, new Set([normalizedTicker]));
      if (dummy[normalizedTicker]) return dummy[normalizedTicker];
      
      // fallback: вытащим максимальное число из строки
      const currency: 'RUB' | 'USD' | 'EUR' = /\$/i.test(text) ? 'USD' : /€/i.test(text) ? 'EUR' : 'RUB';
      const nums = (text.match(/[0-9][0-9\s.,]*[0-9]/g) || []).map(parseMoneyToNumber).filter((n): n is number => typeof n === 'number');
      if (nums.length) {
        return { amount: Math.max(...nums), currency };
      }
    }
  }
  
  return undefined;
};

export const buildAumMapSmart = async (normalizedTickers: string[]): Promise<Record<string, AumEntry>> => {
  // Пытаемся сначала через авто-сопоставление тикеров, затем через паттерны имен
  const result: Record<string, AumEntry> = {};
  
  try {
    const html: string = await fetchStatisticsHtml();
    console.log(`[etfCap] buildAumMapSmart: fetched HTML length=${html.length}`);
    
    const auto = await fetchAumMapFromTCapital(normalizedTickers);
    console.log(`[etfCap] buildAumMapSmart: auto result:`, auto);
    
    Object.assign(result, auto);
    for (const t of normalizedTickers) {
      if (result[t]) continue;
      const byName = findAumForTickerByName(html, t);
      if (byName) result[t] = byName;
      
      // Детальное логирование для отладки AUM
      if (t === 'TBRU' || t === 'TOFZ' || t === 'TMON' || t === 'TMOS' || t === 'TITR' || t === 'TDIV') {
        console.log(`[etfCap] [DEBUG] ${t} AUM search: ${byName ? 'FOUND' : 'NOT FOUND'}`);
      }
    }
    
    console.log(`[etfCap] buildAumMapSmart: final result:`, result);
    return result;
  } catch (e) {
    console.error(`[etfCap] buildAumMapSmart error:`, e);
    return result;
  }
};

export const getFxRateToRub = async (currency: 'RUB' | 'USD' | 'EUR'): Promise<number> => {
  if (currency === 'RUB') return 1;
  const { instruments, marketData } = createSdk(process.env.TOKEN || '');
  const resp = await instruments.currencies({});
  const list = resp?.instruments || [];
  const findByPatterns = (patterns: RegExp[]): any | undefined =>
    _.find(list, (c: any) => patterns.some((re) => re.test(`${c?.ticker} ${c?.name} ${c?.classCode} ${c?.currency}`)));
  const target = currency === 'USD'
    ? (findByPatterns([/USDRUB/i, /USD.*RUB/i, /USD000UTS/i]) as any)
    : (findByPatterns([/EURRUB/i, /EUR.*RUB/i]) as any);
  if (!target?.figi) return 0;
  const last = await marketData.getLastPrices({ figi: [target.figi] });
  const price = convertTinkoffNumberToNumber(last?.lastPrices?.[0]?.price as any);
  return Number.isFinite(price) ? price : 0;
};

export const getEtfMarketCapRUB = async (tickerRaw: string) => {
  const ticker = normalizeTicker(tickerRaw) || tickerRaw;

  const { instruments, marketData } = createSdk(process.env.TOKEN || '');

  // 1) Найти ETF по тикеру
  const etfsResp = await instruments.etfs({});
  const etf = _.find(etfsResp?.instruments, (e: any) => tickersEqual(e?.ticker, ticker));
  if (!etf) {
    return null;
  }

  const figi: string = etf.figi;
  const uid: string = etf.uid; // может пригодиться для расширений
  let numShares: number = toNumber(etf.numShares);
  let numSharesSource: 'list' | 'etfBy' | 'asset' | 'derivedFromAUM' | undefined =
    Number.isFinite(numShares) && numShares > 0 ? 'list' : undefined;

  // Попробуем получить более детальную карточку инструмента, т.к. в списке поля могут быть пустыми
  if (!numShares || Number.isNaN(numShares)) {
    try {
      const etfByResp: any = await instruments.etfBy({ idType: 1, id: figi }); // 1 = FIGI
      const detailedNum = toNumber(etfByResp?.instrument?.numShares);
      if (detailedNum && !Number.isNaN(detailedNum)) {
        numShares = detailedNum;
        numSharesSource = 'etfBy';
      }
    } catch (e) {
      // ignore
    }
  }

  // Если у инструмента нет numShares, пробуем через Assets API получить AssetEtf.numShare по assetUid
  if ((!numShares || Number.isNaN(numShares)) && etf.assetUid) {
    try {
      const assetResp: any = await instruments.getAssetBy({ id: etf.assetUid });
      // Пробуем несколько возможных путей/имён поля в зависимости от версии API
      const candidateA = assetResp?.asset?.security?.etf?.numShares;
      const candidateB = assetResp?.asset?.security?.etf?.numShare;
      const candidateC = assetResp?.asset?.etf?.numShares;
      const num = toNumber(candidateA || candidateB || candidateC);
      if (num && !Number.isNaN(num)) {
        numShares = num;
        numSharesSource = numSharesSource || 'asset';
      }
    } catch (e) {
      // ignore, останется null
    }
  }

  // 2) Последняя цена
  const last = await marketData.getLastPrices({ figi: [figi] });
  const lastPriceQ = last?.lastPrices?.[0]?.price;
  const lastPriceRUB = toNumber(lastPriceQ);

  // 3) Капитализация (если есть всё)
  const marketCapRUB = numShares && lastPriceRUB ? numShares * lastPriceRUB : null;

  return {
    type: 'ETF',
    ticker: tickerRaw,
    normalizedTicker: ticker,
    figi,
    uid,
    lastPriceRUB,
    numShares,
    numSharesSource,
    marketCapRUB,
  };
};

export const getShareMarketCapRUB = async (tickerRaw: string) => {
  const ticker = normalizeTicker(tickerRaw) || tickerRaw;
  const { instruments, marketData } = createSdk(process.env.TOKEN || '');

  const sharesResp = await instruments.shares({});
  const share = _.find(sharesResp?.instruments, (s: any) => tickersEqual(s?.ticker, ticker));
  if (!share) return null;

  const figi: string = share.figi;
  const uid: string = share.uid;
  let issueSize: number = Number(share.issueSize || 0);

  if ((!issueSize || Number.isNaN(issueSize)) && share.assetUid) {
    try {
      const assetResp: any = await instruments.getAssetBy({ id: share.assetUid });
      const assetIssue = assetResp?.asset?.security?.share?.issueSize;
      const num = toNumber(assetIssue);
      if (num && !Number.isNaN(num)) issueSize = num;
    } catch (e) {
      // ignore
    }
  }

  const last = await marketData.getLastPrices({ figi: [figi] });
  const lastPriceQ = last?.lastPrices?.[0]?.price;
  const lastPriceRUB = toNumber(lastPriceQ);

  const marketCapRUB = issueSize && lastPriceRUB ? issueSize * lastPriceRUB : null;

  return {
    type: 'SHARE',
    ticker: tickerRaw,
    normalizedTicker: ticker,
    figi,
    uid,
    lastPriceRUB,
    numShares: issueSize,
    numSharesSource: undefined,
    marketCapRUB,
  };
};

const main = async () => {
  const tickers = getTickersFromArgs();
  const normalizedTickers = tickers.map((t) => normalizeTicker(t) || t);
  // Получаем карту AUM с сайта Т-Капитал (умный парс по тикерам и именам)
  const aumMap = await buildAumMapSmart(normalizedTickers);
  // Предзагружаем FX курсы
  const usdToRub = await getFxRateToRub('USD');
  const eurToRub = await getFxRateToRub('EUR');
  const results = [] as any[];
  for (const t of tickers) {
    try {
      // eslint-disable-next-line no-await-in-loop
      let r = await getEtfMarketCapRUB(t);
      if (!r) {
        r = await getShareMarketCapRUB(t);
      }
      if (!r) {
        results.push({ type: 'UNKNOWN', ticker: t, error: 'Instrument not found' });
      } else {
        const normalized = r.normalizedTicker || r.ticker;
        const aum = r.type === 'ETF' ? aumMap[normalized] || aumMap[normalizeTicker(normalized) || normalized] : undefined;
        let aumRUB: number | undefined;
        if (aum && aum.amount) {
          if (aum.currency === 'RUB') aumRUB = aum.amount;
          else if (aum.currency === 'USD' && usdToRub > 0) aumRUB = aum.amount * usdToRub;
          else if (aum.currency === 'EUR' && eurToRub > 0) aumRUB = aum.amount * eurToRub;
        }
        // Если это ETF и numShares пуст, попробуем вывести его из AUM/цены
        if (r.type === 'ETF' && (!r.numShares || r.numShares <= 0) && aumRUB && r.lastPriceRUB && r.lastPriceRUB > 0) {
          const derivedNumShares = Math.round(aumRUB / r.lastPriceRUB);
          r = {
            ...r,
            numShares: derivedNumShares,
            numSharesSource: r.numSharesSource || 'derivedFromAUM',
            marketCapRUB: aumRUB,
          } as any;
        }
        results.push({ ...r, aumRUB });
      }
    } catch (err) {
      results.push({ type: 'ERROR', ticker: t, error: (err as Error)?.message || String(err) });
    }
  }
  console.table(
    results.map((r) => ({
      type: r.type,
      ticker: r.ticker,
      normalized: r.normalizedTicker,
      figi: r.figi,
      priceRUB: r.lastPriceRUB,
      numShares: r.numShares,
      numSharesSource: r.numSharesSource,
      marketCapRUB: r.marketCapRUB,
      aumRUB: r.aumRUB,
      error: r.error,
    })),
  );
};

// Run only when executed directly, not when imported as a module
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isMain = process.argv[1] === import.meta.url || process.argv[1]?.endsWith('etfCap.ts');
if (isMain) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main();
}


