import _ from 'lodash';
import { DesiredWallet } from '../types.d';
import { normalizeTicker } from '../utils';
import { DesiredMode } from '../config';
import { buildAumMapSmart, getEtfMarketCapRUB, getShareMarketCapRUB, getFxRateToRub, AumEntry } from '../tools/etfCap';

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

  if (mode === 'market_cap') {
    for (const nt of normalizedTickers) {
      // Try ETF first
      const etfCap = await getEtfMarketCapRUB(nt);
      let metric = Number(etfCap?.marketCapRUB || 0);
      if (!metric) {
        // Try share
        const shareCap = await getShareMarketCapRUB(nt);
        metric = Number(shareCap?.marketCapRUB || 0);
      }
      if (!metric) {
        // As a last resort, fall back to AUM if available
        const aumMap = await buildAumMapSmart([nt]);
        metric = await toRubFromAum(aumMap[nt]);
      }
      metricByNormalized[nt] = metric || 0;
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


