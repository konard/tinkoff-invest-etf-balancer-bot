import fs from 'fs';
import { TinkoffNumber } from '../types.d';

const debug = require('debug')('bot').extend('utils');

export const sleep = (ms: any) => new Promise(resolve => setTimeout(resolve, ms));

// TODO: Сделать запись не в корень проекта https://stackoverflow.com/questions/16316330/how-to-write-file-if-parent-folder-doesnt-exist
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

// Алиасы тикеров для унификации сопоставления (смены тикеров на бирже)
const TICKER_ALIASES: Record<string, string> = {
  // TRAY (стар.) → TPAY (нов.)
  TRAY: 'TPAY',
  // Некоторые инструменты в API могут иметь суффикс '@' (например, TGLD@)
  // Нормализуем такие тикеры к базовой форме без '@'
};

export const normalizeTicker = (ticker: string | undefined): string | undefined => {
  if (!ticker) return ticker;
  let t = ticker.trim();
  // Уберём суффикс '@' если присутствует (пример: 'TGLD@' → 'TGLD')
  if (t.endsWith('@')) t = t.slice(0, -1);
  // Применим явные алиасы
  return TICKER_ALIASES[t] || t;
};

export const tickersEqual = (a: string | undefined, b: string | undefined): boolean => {
  if (!a || !b) return false;
  return normalizeTicker(a) === normalizeTicker(b);
};

export const convertTinkoffNumberToNumber = (n: TinkoffNumber): number => {
  debug('n', n);

  let result;
  if (n?.units ===  undefined) {
    result = Number(`0.${zeroPad(n?.nano, 9)}`);
  } else {
    result = Number(`${n.units}.${zeroPad(n?.nano, 9)}`);
  }
  debug('convertTinkoffNumberToNumber', result);
  return result;
};

export const convertNumberToTinkoffNumber = (n: number): TinkoffNumber => {
  const [units, nano] = n.toFixed(9).split('.').map(item => Number(item));
  return {
    units,
    nano,
  };
};

export const sumValues = obj => Object.values(obj).reduce((a: any, b: any) => a + b);

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
    debug('Ошибка при получении списка счетов', err);
    return [];
  }
};
