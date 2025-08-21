import { promises as fs } from 'fs';
import path from 'path';

type Nullable<T> = T | null | undefined;

const LOG_PREFIX = '[updateSharesCount]';
const DEFAULT_SYMBOL = 'TRUR';

function getNewsDir(symbol: string): string {
  return path.resolve(process.cwd(), 'news', symbol);
}

function getOutputDir(): string {
  return path.resolve(process.cwd(), 'shares_count');
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function listNewsMdFiles(symbol: string): Promise<string[]> {
  const dir = getNewsDir(symbol);
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((f: string) => f.endsWith('.md'))
      .map((f: string) => path.join(dir, f))
      .sort((a: string, b: string) => {
        const ida = parseInt(path.basename(a, '.md'), 10) || 0;
        const idb = parseInt(path.basename(b, '.md'), 10) || 0;
        return idb - ida; // newest first by id
      });
  } catch {
    return [];
  }
}

function parseRussianNumberWithUnits(text: string): number | null {
  // Only parse lines that explicitly mention total shares
  // Support both "shares" and "units"
  const guard = /(total shares|total units|general quantity of shares)/i;
  if (!guard.test(text)) return null;
  // Examples: "Total shares 1799.1 million units", "General quantity of shares — 1799.1 million units"
  const re = /(total shares|total units|general quantity of shares)[^\d]{0,20}(\d[\d\s]*[\,\.]?\d*)\s*(million|thousand)?/i;
  const m = text.match(re);
  if (!m) return null;
  const numRaw = (m[2] || '').replace(/\s+/g, '').replace(',', '.');
  const unit = (m[3] || '').toLowerCase();
  const base = parseFloat(numRaw);
  if (!isFinite(base)) return null;
  if (unit.includes('million')) return Math.round(base * 1_000_000);
  if (unit.includes('thousand')) return Math.round(base * 1_000);
  return Math.round(base);
}

async function extractLatestSharesCountFromFile(filePath: string): Promise<number | null> {
  const content = await fs.readFile(filePath, 'utf-8');
  // Quick prefilter by title/keywords
  const lower = content.toLowerCase();
  // Extract title from markdown: first line starting with '# '
  const firstTitleLine = content.split(/\r?\n/).find((l: string) => l.trim().startsWith('# ')) || '';
  const titleLower = firstTitleLine.toLowerCase();
  const hasSharesKeywords = [
    'shares count',
    'quantity of shares',
    'number of shares',
    'total shares',
  ].some((kw) => lower.includes(kw));
  const hasGuardPhrases = /(total shares|total units|general quantity of shares)/i.test(lower);
  const isMoneyInflowTitle = titleLower.includes('new money received in fund');
  const prefilterMatches = hasSharesKeywords || hasGuardPhrases || isMoneyInflowTitle;
  if (!prefilterMatches) {
    // Might still contain the field, but to be efficient we only consider targeted news
    return null;
  }
  // Try to extract the "Total shares"/"General quantity of shares" number from the body
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const value = parseRussianNumberWithUnits(line);
    if (value !== null) return value;
  }
  // Fallback: try full content regex
  return parseRussianNumberWithUnits(content);
}

async function updateSymbol(symbol: string): Promise<{ symbol: string; value: number | null }> {
  const files = await listNewsMdFiles(symbol);
  if (files.length === 0) {
    console.log(`${LOG_PREFIX} no news files for ${symbol}`);
    return { symbol, value: null };
  }
  for (const f of files) {
    const value = await extractLatestSharesCountFromFile(f);
    if (value !== null) {
      const outDir = getOutputDir();
      await ensureDir(outDir);
      const outPath = path.join(outDir, `${symbol}.json`);
      await fs.writeFile(outPath, String(value), 'utf-8');
      console.log(`${LOG_PREFIX} ${symbol} shares_count=${value} -> ${outPath}`);
      return { symbol, value };
    }
  }
  console.log(`${LOG_PREFIX} no matching "Shares count" news found for ${symbol}`);
  return { symbol, value: null };
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2);
  const rawSymbols = (argv[0] || DEFAULT_SYMBOL).toUpperCase();
  const symbols = rawSymbols.split(',').map((s) => s.trim()).filter(Boolean);
  const runOnce = argv.includes('--once') || true; // default once if not specified
  const intervalArg = argv.find((a) => a.startsWith('--interval='));
  const intervalMs = intervalArg ? parseInt(intervalArg.split('=')[1], 10) : 300000;

  const iterate = async () => {
    for (const sym of symbols) {
      try {
        await updateSymbol(sym);
      } catch (e) {
        console.error(`${LOG_PREFIX} error for ${sym}:`, e);
      }
    }
  };

  if (runOnce) {
    await iterate();
    return;
  }
  // Loop mode
  console.log(`${LOG_PREFIX} entering loop intervalMs=${intervalMs}`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await iterate();
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});


