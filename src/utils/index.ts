import fs from 'fs';
import debug from 'debug';
import { TinkoffNumber, Position, PositionProfitInfo } from '../types.d';

const debugUtils = debug('bot').extend('utils');

export const sleep = (ms: any) => new Promise(resolve => setTimeout(resolve, ms));

// TODO: Make write not to project root https://stackoverflow.com/questions/16316330/how-to-write-file-if-parent-folder-doesnt-exist
export const writeFile = (obj: object, filename: string) => {
  console.log(filename, JSON.stringify(obj, null, 2));
  const objStringify = JSON.stringify(obj, null, 2);

  const objExportedDefault = `export const data = ${objStringify}`;

  fs.writeFile(`${filename}Data.ts`, objExportedDefault, 'utf8', (err: any) => {
    if (err) return console.log(err);
    console.log('JSON file has been saved.');
  });
};

export const writeToFile = (obj: object, filename: string) => {
  console.log(filename, JSON.stringify(obj, null, 2));
  const objStringify = JSON.stringify(obj, null, 2);

  const objExportedDefault = `${objStringify}`;
  try {
    fs.appendFileSync(`${filename}Data.ts`, `\n\n${objExportedDefault}`, 'utf8');
  } catch(err) {
    console.log(err);
  }
};

// Ticker aliases for unified mapping (ticker changes on exchange)
const TICKER_ALIASES: Record<string, string> = {
  // TRAY (old) → TPAY (new)
  TRAY: 'TPAY',
  // Some instruments in API may have '@' suffix (e.g., TGLD@)
  // Normalize such tickers to base form without '@'
};

export const normalizeTicker = (ticker: string | undefined): string | undefined => {
  if (!ticker) return ticker;
  let t = ticker.trim();
  // Remove '@' suffix if present (example: 'TGLD@' → 'TGLD')
  if (t.endsWith('@')) t = t.slice(0, -1);
  // Apply explicit aliases
  return TICKER_ALIASES[t] || t;
};

export const tickersEqual = (a: string | undefined, b: string | undefined): boolean => {
  if (!a || !b) return false;
  return normalizeTicker(a) === normalizeTicker(b);
};

export const convertTinkoffNumberToNumber = (n: TinkoffNumber): number => {
  debugUtils('n', n);

  let result;
  if (n?.units ===  undefined) {
    result = Number(`0.${zeroPad(n?.nano, 9)}`);
  } else {
    result = Number(`${n.units}.${zeroPad(n?.nano, 9)}`);
  }
  debugUtils('convertTinkoffNumberToNumber', result);
  return result;
};

export const convertNumberToTinkoffNumber = (n: number): TinkoffNumber => {
  const [units, nano] = n.toFixed(9).split('.').map(item => Number(item));
  return {
    units,
    nano,
  };
};

export const sumValues = (obj: Record<string, any>): number => {
  if (!obj || Object.keys(obj).length === 0) return 0;
  return Object.values(obj)
    .filter(value => typeof value === 'number' && !isNaN(value))
    .reduce((sum: number, value: number) => sum + value, 0);
};

export const zeroPad = (num, places) => String(num).padStart(places, '0');

export const listAccounts = async (usersClient: any) => {
  try {
    const response = await usersClient.getAccounts({});
    const accounts = Array.isArray(response) ? response : (response?.accounts || []);
    return accounts.map((acc: any, index: number) => ({
      index,
      id: acc.id || acc.accountId || acc.account_id,
      name: acc.name,
      type: acc.type,
      openedDate: acc.openedDate || acc.opened_date,
      status: acc.status,
    }));
  } catch (err) {
    debugUtils('Error getting accounts list', err);
    return [];
  }
};

/**
 * Calculates position profit and checks if it meets the minimum threshold
 * @param position - The position to calculate profit for
 * @param currentPrice - Current market price (will use position.priceNumber if not provided)
 * @param minProfitPercent - Minimum profit percentage threshold (positive for profit, negative for allowed loss)
 * @returns PositionProfitInfo or null if calculation is not possible
 */
export const calculatePositionProfit = (
  position: Position,
  currentPrice?: number,
  minProfitPercent?: number
): PositionProfitInfo | null => {
  // Validate required position data
  if (!position.amount || !position.priceNumber || position.amount === 0) {
    debugUtils('Cannot calculate profit: position missing amount or priceNumber', position.base);
    return null;
  }

  // Use provided current price or fall back to position price
  const price = currentPrice !== undefined ? currentPrice : position.priceNumber;
  if (!price || price <= 0) {
    debugUtils('Cannot calculate profit: invalid current price', position.base);
    return null;
  }

  // Calculate profit amounts
  const currentValue = position.amount * price;
  const originalValue = position.amount * position.priceNumber;
  const profitAmount = currentValue - originalValue;

  // Calculate profit percentage
  const profitPercent = originalValue !== 0 ? (profitAmount / originalValue) * 100 : 0;

  // Check if threshold is met
  const meetsThreshold = minProfitPercent !== undefined
    ? profitPercent >= minProfitPercent
    : true; // If no threshold, always meets criteria

  debugUtils(`Profit calculation for ${position.base}: ${profitPercent.toFixed(2)}% (${profitAmount.toFixed(2)} RUB), threshold: ${minProfitPercent || 'disabled'}, meets: ${meetsThreshold}`);

  return {
    profitAmount,
    profitPercent,
    meetsThreshold
  };
};

/**
 * Checks if a position meets the minimum profit threshold for selling
 * @param position - The position to check
 * @param currentPrice - Current market price (optional)
 * @param minProfitPercent - Minimum profit percentage threshold
 * @returns true if position can be sold (meets threshold or threshold disabled)
 */
export const canSellPosition = (
  position: Position,
  currentPrice?: number,
  minProfitPercent?: number
): boolean => {
  if (minProfitPercent === undefined) {
    return true; // Feature disabled
  }

  const profitInfo = calculatePositionProfit(position, currentPrice, minProfitPercent);
  return profitInfo?.meetsThreshold ?? true; // Allow selling if profit calculation fails
};

// Export MarginCalculator
export { MarginCalculator } from './marginCalculator';
