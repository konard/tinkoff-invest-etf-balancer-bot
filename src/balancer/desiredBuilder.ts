import path from 'path';
import { promises as fs } from 'fs';
import _ from 'lodash';
import { DesiredWallet, DesiredMode, AccountConfig } from '../types.d';
import { normalizeTicker } from '../utils';
import { getEtfMarketCapRUB } from '../tools/etfCap';
import { getShareMarketCapRUB } from '../tools/shareCap';
import { buildAumMapSmart } from '../tools/etfCap';
import { toRubFromAum } from '../tools/pollEtfMetrics';
import { diffCalculator } from './diffCalculator';

const debug = require('debug')('bot').extend('desiredBuilder');

interface Metric {
  marketCap?: number | null;
  aum?: number | null;
}

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
    // 1) local JSON, 2) live for ETF, 3) live for shares
    const json = await readMetricFromJson(nt);
    if (json && typeof json.marketCap === 'number' && Number.isFinite(json.marketCap)) return json.marketCap;
    const etfCap = await getEtfMarketCapRUB(nt);
    if (etfCap?.marketCapRUB) return Number(etfCap.marketCapRUB) || 0;
    const shareCap = await getShareMarketCapRUB(nt);
    if (shareCap?.marketCapRUB) return Number(shareCap.marketCapRUB) || 0;
    return 0;
  };

  const calcAumRub = async (nt: string): Promise<number> => {
    // 1) local JSON, 2) live via T-Capital + FX
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

  if (mode === 'decorrelation') {
    // Algorithm:
    // 1) decorrelationPct = (marketCap - AUM) / AUM * 100 (can be negative or positive)
    // 2) Find max among all decorrelationPct
    // 3) Build distribution metric: metric = max - decorrelationPct
    //    Example: [100, 0, -100] -> max=100 -> metrics=[0, 100, 200]
    // 4) Weights ∝ metric. If sum == 0 — return base portfolio

    const dPctByTicker: Record<string, number> = {};
    for (const nt of normalizedTickers) {
      const [mcap, aum] = await Promise.all([calcMarketcap(nt), calcAumRub(nt)]);
      const dPct = aum > 0 && Number.isFinite(mcap) ? ((mcap - aum) / aum) * 100 : 0;
      dPctByTicker[nt] = Number.isFinite(dPct) ? dPct : 0;
    }
    const maxDPct = _.max(Object.values(dPctByTicker));
    const maxVal = (typeof maxDPct === 'number' && Number.isFinite(maxDPct)) ? maxDPct : 0;
    for (const nt of normalizedTickers) {
      const m = maxVal - (dPctByTicker[nt] || 0);
      metricByNormalized[nt] = Number.isFinite(m) && m > 0 ? m : 0;
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

export const buildDesiredWalletWithDiff = async (accountConfig: AccountConfig): Promise<DesiredWallet> => {
  // First, calculate the base desired wallet using the existing mode
  const baseDesired = await buildDesiredWalletByMode(accountConfig.desired_mode, accountConfig.desired_wallet);
  
  // Then apply diff calculations if enabled
  const finalDesired = await diffCalculator.calculateDiff(accountConfig, baseDesired);
  
  // Store the result as current iteration snapshot for future diff calculations
  if (accountConfig.diff === 'iteration') {
    await diffCalculator.storeIterationSnapshot(accountConfig.id, finalDesired);
  }
  
  return finalDesired;
};


