import fs from 'fs';
import debug from 'debug';
import { TinkoffNumber } from '../types.d';

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
  if (ticker === undefined || ticker === null) {
    return undefined;
  }
  
  if (ticker === '') {
    return '';
  }
  
  // Handle edge case where ticker is just "@"
  if (ticker === '@') {
    return '';
  }
  
  // Trim whitespace
  let t = ticker.trim();
  
  // Remove '@' suffix if present (example: 'TGLD@' → 'TGLD')
  if (t.endsWith('@')) t = t.slice(0, -1);
  
  // Apply explicit aliases
  return TICKER_ALIASES[t] || t;
};

export const tickersEqual = (a: string | undefined, b: string | undefined): boolean => {
  // Handle undefined/null cases
  if (a === undefined || b === undefined ||
      a === null || b === null) {
    return false;
  }
  
  // Handle empty strings - they are not equal
  if (a === '' || b === '') {
    return false;
  }
  
  const norm1 = normalizeTicker(a);
  const norm2 = normalizeTicker(b);
  
  if (norm1 === undefined || norm2 === undefined) {
    return false;
  }
  
  return norm1 === norm2;
};

export const convertTinkoffNumberToNumber = (n: TinkoffNumber): number => {
  debugUtils('n', n);
  
  if (!n) return 0;
  
  // Handle undefined units by treating as 0
  const units = n.units ?? 0;
  const nano = n.nano ?? 0;
  
  // For negative units, the nano represents the fractional part that should be subtracted
  let result;
  if (units < 0) {
    result = units - nano / 1e9;
  } else {
    result = units + nano / 1e9;
  }
  
  debugUtils('convertTinkoffNumberToNumber', result);
  return result;
};

export const convertNumberToTinkoffNumber = (n: number): TinkoffNumber => {
  if (n >= 0) {
    const units = Math.floor(n);
    const nano = Math.round((n - units) * 1e9);
    return { units, nano };
  } else {
    // For negative numbers: units is negative, nano is positive (fractional part)
    const absValue = Math.abs(n);
    const units = -Math.floor(absValue);
    const nano = Math.round((absValue - Math.floor(absValue)) * 1e9);
    return { units, nano };
  }
};

export const sumValues = (obj: Record<string, any>): number => {
  if (!obj || Object.keys(obj).length === 0) return 0;
  return Object.values(obj)
    .filter(value => typeof value === 'number' && !isNaN(value))
    .reduce((sum: number, value: number) => sum + value, 0);
};

export const zeroPad = (num: number | string, places: number): string => String(num).padStart(places, '0');

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

// Export MarginCalculator
export { MarginCalculator } from './marginCalculator';
