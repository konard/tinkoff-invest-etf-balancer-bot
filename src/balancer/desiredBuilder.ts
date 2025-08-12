import _ from 'lodash';
import { DesiredWallet } from '../types.d';
import { normalizeTicker } from '../utils';
import { DesiredMode } from '../config';
import { buildAumMapSmart, getEtfMarketCapRUB, getShareMarketCapRUB, getFxRateToRub, AumEntry } from '../tools/etfCap';
import { promises as fs } from 'fs';
import path from 'path';

const debug = require('debug')('bot').extend('desiredBuilder');

type Metric = number; // RUB

const toRubFromAum = async (entry: AumEntry | undefined): Promise<number> => {
  if (!entry || !entry.amount) return 0;
  const rate = await getFxRateToRub(entry.currency);
  return entry.amount * (rate || 0);
};

export const buildDesiredWalletByMode = async (mode: DesiredMode, baseDesired: DesiredWallet): Promise<DesiredWallet> => {
  if (mode === 'manual') return baseDesired;

  const originalTickers = Object.keys(baseDesired);
  const normalizedTickers = originalTickers.map((t) => normalizeTicker(t) || t);

  // Gather metrics in RUB per normalized ticker
  const metricByNormalized: Record<string, Metric> = {};

  const metricsDir = path.resolve(process.cwd(), 'etf_metrics');

  const readMetricFromJson = async (ticker: string): Promise<{ marketCap?: number | null; aum?: number | null } | null> => {
    try {
      const p = path.join(metricsDir, `${ticker}.json`);
      const raw = await fs.readFile(p, 'utf-8');
      const j = JSON.parse(raw);
      return { marketCap: typeof j?.marketCap === 'number' ? j.marketCap : null, aum: typeof j?.aum === 'number' ? j.aum : null };
    } catch {
      return null;
    }
  };

  const calcMarketcap = async (nt: string): Promise<number> => {
    // 1) локальный JSON, 2) live для ETF, 3) live для акций
    const json = await readMetricFromJson(nt);
    if (json && typeof json.marketCap === 'number' && Number.isFinite(json.marketCap)) return json.marketCap;
    const etfCap = await getEtfMarketCapRUB(nt);
    if (etfCap?.marketCapRUB) return Number(etfCap.marketCapRUB) || 0;
    const shareCap = await getShareMarketCapRUB(nt);
    if (shareCap?.marketCapRUB) return Number(shareCap.marketCapRUB) || 0;
    return 0;
  };

  const calcAumRub = async (nt: string): Promise<number> => {
    // 1) локальный JSON, 2) live через T-Capital + FX
    const json = await readMetricFromJson(nt);
    if (json && typeof json.aum === 'number' && Number.isFinite(json.aum)) return json.aum;
    const aumMap = await buildAumMapSmart([nt]);
    return await toRubFromAum(aumMap[nt]);
  };

  if (mode === 'marketcap' || mode === 'aum' || mode === 'marketcap_aum') {
    for (const nt of normalizedTickers) {
      let metric = 0;
      if (mode === 'marketcap') {
        metric = await calcMarketcap(nt);
      } else if (mode === 'aum') {
        metric = await calcAumRub(nt);
      } else if (mode === 'marketcap_aum') {
        metric = await calcMarketcap(nt);
        if (!metric) {
          metric = await calcAumRub(nt);
        }
      }
      metricByNormalized[nt] = Number(metric) || 0;
    }
  }

  const totalMetric = _.sum(Object.values(metricByNormalized));
  if (!totalMetric || !Number.isFinite(totalMetric) || totalMetric <= 0) {
    debug('Total metric is zero, return baseDesired as-is');
    return baseDesired;
  }

  // Map back to original keys to preserve user-specified tickers; use normalized for lookup
  const result: DesiredWallet = {};
  for (const orig of originalTickers) {
    const nt = normalizeTicker(orig) || orig;
    const m = metricByNormalized[nt] || 0;
    // Convert to percents; exact normalization will be done in balancer as well
    result[orig] = (m / totalMetric) * 100;
  }
  return result;
};


