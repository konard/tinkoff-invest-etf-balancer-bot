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

// Export MarginCalculator
export { MarginCalculator } from './marginCalculator';
