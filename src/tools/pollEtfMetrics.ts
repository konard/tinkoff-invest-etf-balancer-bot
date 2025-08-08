import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { DESIRED_WALLET } from '../config';
import { normalizeTicker } from '../utils';
import { buildAumMapSmart, getFxRateToRub, AumEntry, getEtfMarketCapRUB } from './etfCap';

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

  for (const s of symbols) {
    const sym = normalizeTicker(s) || s;
    const sharesCount = await readSharesCount(sym);
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


