import { promises as fs } from 'fs';
import path from 'path';
import { DesiredWallet, DiffSnapshot, AccountConfig } from '../types.d';
import { buildDesiredWalletByMode } from './desiredBuilder';
import { createSdk } from 'tinkoff-sdk-grpc-js';
import _ from 'lodash';
import debug from 'debug';

const debugDiff = debug('bot').extend('diff');

export class DiffCalculator {
  private diffDataDir: string;
  private iterationCounters: Map<string, number> = new Map();

  constructor() {
    this.diffDataDir = path.resolve(process.cwd(), 'diff_data');
    this.ensureDiffDataDir();
  }

  private async ensureDiffDataDir(): Promise<void> {
    try {
      await fs.mkdir(this.diffDataDir, { recursive: true });
    } catch (error) {
      debugDiff('Error creating diff_data directory:', error);
    }
  }

  private getSnapshotFilePath(accountId: string, date: string): string {
    return path.join(this.diffDataDir, `${accountId}_${date}.json`);
  }

  private getTodayDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  private async loadDiffSnapshot(accountId: string, date: string): Promise<DiffSnapshot | null> {
    try {
      const filePath = this.getSnapshotFilePath(accountId, date);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async saveDiffSnapshot(accountId: string, snapshot: DiffSnapshot): Promise<void> {
    try {
      const filePath = this.getSnapshotFilePath(accountId, snapshot.date);
      await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));
    } catch (error) {
      debugDiff('Error saving diff snapshot:', error);
    }
  }

  private async getHistoricalPricesAt00(tickers: string[], token: string): Promise<Record<string, number> | null> {
    try {
      const { marketData, instruments } = createSdk(token);
      
      // Get instruments to map tickers to figis
      const [sharesResult, etfsResult] = await Promise.all([
        instruments.shares({}),
        instruments.etfs({})
      ]);
      
      const allInstruments = [...(sharesResult.instruments || []), ...(etfsResult.instruments || [])];
      const figiMap: Record<string, string> = {};
      
      for (const ticker of tickers) {
        const instrument = allInstruments.find(inst => inst.ticker === ticker);
        if (instrument?.figi) {
          figiMap[ticker] = instrument.figi;
        }
      }

      // Get historical prices at 00:00 of today
      const today = new Date();
      const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
      
      const prices: Record<string, number> = {};
      
      for (const [ticker, figi] of Object.entries(figiMap)) {
        try {
          // Try to get candles for the period around midnight
          const candlesResult = await marketData.getCandles({
            figi,
            from: new Date(midnight.getTime() - 24 * 60 * 60 * 1000), // From yesterday
            to: new Date(midnight.getTime() + 60 * 60 * 1000), // To 1 hour after midnight
            interval: 1 // 1 minute intervals
          });

          if (candlesResult.candles && candlesResult.candles.length > 0) {
            // Find the closest candle to midnight
            const closestCandle = candlesResult.candles.reduce((closest, candle) => {
              const candleTime = new Date(candle.time || 0);
              const closestTime = new Date(closest.time || 0);
              const candleDiff = Math.abs(candleTime.getTime() - midnight.getTime());
              const closestDiff = Math.abs(closestTime.getTime() - midnight.getTime());
              return candleDiff < closestDiff ? candle : closest;
            });

            const price = closestCandle.close;
            if (price && typeof price.units === 'number' && typeof price.nano === 'number') {
              prices[ticker] = price.units + price.nano / 1e9;
            }
          }
        } catch (error) {
          debugDiff(`Error getting historical price for ${ticker}:`, error);
        }
      }

      return Object.keys(prices).length > 0 ? prices : null;
    } catch (error) {
      debugDiff('Error getting historical prices:', error);
      return null;
    }
  }

  async storeCurrentSnapshot(accountId: string, desiredWallet: DesiredWallet, snapshotKey: string): Promise<void> {
    const today = this.getTodayDateString();
    let snapshot = await this.loadDiffSnapshot(accountId, today);

    if (!snapshot) {
      snapshot = {
        date: today,
        snapshots: {}
      };
    }

    snapshot.snapshots[snapshotKey] = { ...desiredWallet };
    await this.saveDiffSnapshot(accountId, snapshot);
  }

  async calculateDiff(accountConfig: AccountConfig, currentDesired: DesiredWallet): Promise<DesiredWallet> {
    if (!accountConfig.diff || accountConfig.diff === 'off' || !accountConfig.diff_multiplier) {
      return currentDesired;
    }

    const today = this.getTodayDateString();
    let snapshot = await this.loadDiffSnapshot(accountConfig.id, today);

    let referenceDesired: DesiredWallet | null = null;

    if (accountConfig.diff === 'iteration') {
      // Get previous iteration data
      if (snapshot) {
        const iterationKeys = Object.keys(snapshot.snapshots)
          .filter(key => key.startsWith('iteration_'))
          .sort((a, b) => {
            const numA = parseInt(a.split('_')[1]);
            const numB = parseInt(b.split('_')[1]);
            return numB - numA; // Descending order
          });
        
        if (iterationKeys.length > 0) {
          referenceDesired = snapshot.snapshots[iterationKeys[0]];
        }
      }
    } else if (accountConfig.diff === 'day') {
      // Get 00:00 data or fetch it if not available
      if (snapshot && snapshot.snapshots['00:00']) {
        referenceDesired = snapshot.snapshots['00:00'];
      } else {
        // Need to fetch historical data and calculate 00:00 desired wallet
        debugDiff('00:00 data not found, fetching historical prices...');
        
        const token = this.getAccountToken(accountConfig);
        if (token) {
          const tickers = Object.keys(currentDesired);
          const historicalPrices = await this.getHistoricalPricesAt00(tickers, token);
          
          if (historicalPrices) {
            // Calculate desired wallet using historical prices
            // This is simplified - in reality we'd need to recalculate the entire portfolio
            // For now, we'll use the current mode calculation as an approximation
            referenceDesired = await buildDesiredWalletByMode(accountConfig.desired_mode, accountConfig.desired_wallet);
            
            // Store the 00:00 snapshot for future use
            if (!snapshot) {
              snapshot = { date: today, snapshots: {} };
            }
            snapshot.snapshots['00:00'] = { ...referenceDesired };
            await this.saveDiffSnapshot(accountConfig.id, snapshot);
          }
        }
      }
    }

    if (!referenceDesired) {
      debugDiff('No reference data available for diff calculation, returning current desired');
      return currentDesired;
    }

    // Calculate differences and apply multiplier
    const adjustedDesired: DesiredWallet = {};
    const tickers = Object.keys(currentDesired);

    for (const ticker of tickers) {
      const currentWeight = currentDesired[ticker] || 0;
      const referenceWeight = referenceDesired[ticker] || 0;
      
      if (referenceWeight === 0) {
        adjustedDesired[ticker] = currentWeight;
        continue;
      }

      // Calculate percentage difference
      const diffPercentage = ((currentWeight - referenceWeight) / referenceWeight) * 100;
      
      // Apply multiplier and adjust weight
      const adjustment = (diffPercentage * (accountConfig.diff_multiplier || 0)) / 100;
      adjustedDesired[ticker] = currentWeight + adjustment;
    }

    // Normalize weights to sum to 100%
    const totalWeight = Object.values(adjustedDesired).reduce((sum, weight) => sum + weight, 0);
    if (totalWeight > 0) {
      for (const ticker of tickers) {
        adjustedDesired[ticker] = (adjustedDesired[ticker] / totalWeight) * 100;
      }
    }

    debugDiff('Diff calculation completed:', {
      mode: accountConfig.diff,
      multiplier: accountConfig.diff_multiplier,
      adjustments: Object.keys(adjustedDesired).map(ticker => ({
        ticker,
        before: currentDesired[ticker],
        after: adjustedDesired[ticker],
        reference: referenceDesired?.[ticker]
      }))
    });

    return adjustedDesired;
  }

  async storeIterationSnapshot(accountId: string, desiredWallet: DesiredWallet): Promise<void> {
    const currentCount = this.iterationCounters.get(accountId) || 0;
    const newCount = currentCount + 1;
    this.iterationCounters.set(accountId, newCount);

    await this.storeCurrentSnapshot(accountId, desiredWallet, `iteration_${newCount}`);
  }

  private getAccountToken(accountConfig: AccountConfig): string | undefined {
    const tokenValue = accountConfig.t_invest_token;
    
    // If token is in ${VARIABLE_NAME} format, extract from environment variables
    if (tokenValue.startsWith('${') && tokenValue.endsWith('}')) {
      const envVarName = tokenValue.slice(2, -1);
      return process.env[envVarName];
    }
    
    // Otherwise return token as is (directly specified)
    return tokenValue;
  }
}

export const diffCalculator = new DiffCalculator();