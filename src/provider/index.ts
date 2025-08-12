import 'dotenv/config';
import { createSdk } from 'tinkoff-sdk-grpc-js';
// import { createSdk } from '../provider/invest-nodejs-grpc-sdk/src/sdk';
import 'mocha';
import _ from 'lodash';
import uniqid from 'uniqid';
// import { OrderDirection, OrderType } from '../provider/invest-nodejs-grpc-sdk/src/generated/orders';
import { OrderDirection, OrderType } from 'tinkoff-sdk-grpc-js/dist/generated/orders';
import { DESIRED_WALLET, BALANCE_INTERVAL, SLEEP_BETWEEN_ORDERS, DESIRED_MODE } from '../config';
import { Wallet, Position } from '../types.d';
import { sleep, writeFile, convertNumberToTinkoffNumber, convertTinkoffNumberToNumber } from '../utils';
import { balancer } from '../balancer';
import { buildDesiredWalletByMode } from '../balancer/desiredBuilder';
import { collectOnceForSymbols } from '../tools/pollEtfMetrics';

(global as any).INSTRUMENTS = [];
(global as any).POSITIONS = [];
(global as any).LAST_PRICES = [];

const debug = require('debug')('bot').extend('provider');

const { orders, operations, marketData, users, instruments } = createSdk(process.env.TOKEN || '');

let ACCOUNT_ID: string;

export const provider = async (options?: { runOnce?: boolean }) => {
  ACCOUNT_ID = await getAccountId(process.env.ACCOUNT_ID);
  await getInstruments();
  await getPositionsCycle(options);
};

export const generateOrders = async (wallet: Wallet) => {
  debug('generateOrders');
  for (const position of wallet) {
    await generateOrder(position);
  }
};

export const generateOrder = async (position: Position) => {
  debug('generateOrder');
  debug('position', position);

  if (position.base === 'RUB') {
    debug('Если позиция это рубль, то ничего не делаем');
    return false;
  }

  debug('Позиция не валюта');

  debug('position.toBuyLots', position.toBuyLots);

  if (!isFinite(position.toBuyLots)) {
    debug('toBuyLots is NaN/Infinity. Пропускаем позицию.');
    return 0;
  }

  if ((-1 < position.toBuyLots) && (position.toBuyLots < 1)) {
    debug('Выставление ордера меньше 1 лота. Не имеет смысла выполнять.');
    return 0;
  }

  debug('Позиция больше или равно 1 лоту');

  const direction = position.toBuyLots >= 1 ? OrderDirection.ORDER_DIRECTION_BUY : OrderDirection.ORDER_DIRECTION_SELL;
  debug('direction', direction);

  // for (const i of _.range(position.toBuyLots)) {
  //   // Идея создавать однолотовые ордера, для того, чтобы они всегда исполнялись полностью, а не частично.
  //   // Могут быть сложности с:
  //   // - кол-вом разрешенных запросов к api, тогда придется реализовывать очередь.
  //   // - минимальный ордер может быть больше одного лота
  //   debug(`Создаем однолотовый ордер #${i} of ${_.range(position.toBuyLots).length}`);
  //   const order = {
  //     accountId: ACCOUNT_ID,
  //     figi: position.figi,
  //     quantity: 1,
  //     // price: { units: 40, nano: 0 },
  //     direction,
  //     orderType: OrderType.ORDER_TYPE_MARKET,
  //     orderId: uniqid(),
  //   };
  //   debug('Отправляем ордер', order);

  //   try {
  //     const setOrder = await orders.postOrder(order);
  //     debug('Успешно поставили ордер', setOrder);
  //   } catch (err) {
  //     debug('Ошибка при выставлении ордера');
  //     debug(err);
  //     console.trace(err);
  //   }
  //   await sleep(1000);
  // }

  // Или можно создавать обычные ордера
  debug('position', position);

  debug('Создаем рыночный ордер');
  const quantityLots = Math.floor(Math.abs(position.toBuyLots));

  if (quantityLots < 1) {
    debug('Количество лотов после округления < 1. Пропускаем ордер.');
    return 0;
  }

  if (!position.figi) {
    debug('У позиции отсутствует figi. Пропускаем ордер.');
    return 0;
  }

  const order = {
    accountId: ACCOUNT_ID,
    figi: position.figi,
    quantity: quantityLots, // Кол-во лотов должно быть целым
    // price: { units: 40, nano: 0 },
    direction,
    orderType: OrderType.ORDER_TYPE_MARKET,
    orderId: uniqid(),
  };
  debug('Отправляем рыночный ордер', order);

  try {
    const setOrder = await orders.postOrder(order);
    debug('Успешно поставили ордер', setOrder);
  } catch (err) {
    debug('Ошибка при выставлении ордера');
    debug(err);
    // console.trace(err);
  }
  await sleep(SLEEP_BETWEEN_ORDERS);

};

export const getAccountId = async (type) => {
  // Поддержка индекса: '3' или 'INDEX:3'
  const indexMatch = typeof type === 'string' && type.startsWith('INDEX:')
    ? Number(type.split(':')[1])
    : (typeof type === 'string' && /^\d+$/.test(type) ? Number(type) : null);

  // Если пришла конкретная строка id, возвращаем как есть
  if (indexMatch === null && type !== 'ISS' && type !== 'BROKER') {
    debug('Передан ACCOUNT_ID (как строка id)', type);
    return type;
  }

  debug('Получаем список аккаунтов');
  let accountsResponse: any;
  try {
    accountsResponse = await users.getAccounts({});
  } catch (err) {
    debug('Ошибка получения списка аккаунтов');
    debug(err);
  }
  debug('accountsResponse', accountsResponse);

  // Поддержка разных форматов ответа: { accounts: [...] } или сразу массив
  const accounts: any[] = Array.isArray(accountsResponse)
    ? accountsResponse
    : (accountsResponse?.accounts || []);

  // Выбор по индексу
  if (indexMatch !== null) {
    const byIndex = accounts[indexMatch];
    const byIndexId = byIndex?.id || byIndex?.accountId || byIndex?.account_id;
    debug('Выбран аккаунт по индексу', byIndex);
    if (!byIndexId) {
      throw new Error(`Не удалось определить ACCOUNT_ID по индексу ${indexMatch}.`);
    }
    return byIndexId;
  }

  // Выбор по типу
  if (type === 'ISS' || type === 'BROKER') {
    // 1 — брокерский, 2 — ИИС (по enum API v2)
    const desiredType = type === 'ISS' ? 2 : 1;
    const account = _.find(accounts, { type: desiredType });
    debug('Найден аккаунт по типу', account);
    const accountId = account?.id || account?.accountId || account?.account_id;
    if (!accountId) {
      throw new Error('Не удалось определить ACCOUNT_ID по типу. Проверьте доступ токена к нужному счету.');
    }
    return accountId;
  }

  // Фоллбек: вернуть как есть
  debug('Передан ACCOUNT_ID (как строка id фоллбек)', type);
  return type;
};

export const getPositionsCycle = async (options?: { runOnce?: boolean }) => {
  return await new Promise<void>((resolve) => {
    let count = 1;

    const tick = async () => {
      // Перед началом итерации проверяем, открыта ли биржа (MOEX)
      try {
        const isOpen = await isExchangeOpenNow('MOEX');
        if (!isOpen) {
          debug('Биржа закрыта (MOEX). Пропускаем балансировку и ждём следующей итерации.');
          if (options?.runOnce) {
            debug('runOnce=true и биржа закрыта: завершаем без выполнения балансировки');
            resolve();
            return;
          }
          return; // просто ждём следующий tick по интервалу
        }
      } catch (e) {
        debug('Не удалось проверить расписание торгов. Продолжаем по умолчанию.', e);
      }

      let portfolio: any;
      let portfolioPositions: any;
      try {
        debug('Получение портфолио');
        portfolio = await operations.getPortfolio({
          accountId: ACCOUNT_ID,
        });
        debug('portfolio', portfolio);

        portfolioPositions = portfolio.positions;
        debug('portfolioPositions', portfolioPositions);
      } catch (err) {
        console.warn('Ошибка при получении портфолио');
        debug(err);
        console.trace(err);
      }

      let positions: any;
      try {
        debug('Получение позиций');
        positions = await operations.getPositions({
          accountId: ACCOUNT_ID,
        });
        debug('positions', positions);
      } catch (err) {
        console.warn('Ошибка при получении позиций');
        debug(err);
        console.trace(err);
      }

      const coreWallet: Wallet = [];

      debug('Добавляем валюты в Wallet');
      for (const currency of positions.money) {
        const corePosition = {
          pair: `${currency.currency.toUpperCase()}/${currency.currency.toUpperCase()}`,
          base: currency.currency.toUpperCase(),
          quote: currency.currency.toUpperCase(),
          figi: undefined,
          amount: currency.units,
          lotSize: 1,
          price: {
            units: 1,
            nano: 0,
          },
          priceNumber: 1,
          lotPrice: {
            units: 1,
            nano: 0,
          },
        };
        debug('corePosition', corePosition);
        coreWallet.push(corePosition);
      }

      (global as any).POSITIONS = portfolioPositions;

      debug('Добавляем позиции в Wallet');
      for (const position of portfolioPositions) {
        debug('position', position);

        const instrument = _.find((global as any).INSTRUMENTS,  { figi: position.figi });
        debug('instrument', instrument);

        if (!instrument) {
          debug('instrument not found by figi, skip position', position.figi);
          continue;
        }

        const priceWhenAddToWallet = await getLastPrice(instrument.figi);
        debug('priceWhenAddToWallet', priceWhenAddToWallet);

        const corePosition = {
          pair: `${instrument.ticker}/${instrument.currency.toUpperCase()}`,
          base: instrument.ticker,
          quote: instrument.currency.toUpperCase(),
          figi: position.figi,
          amount: convertTinkoffNumberToNumber(position.quantity),
          lotSize: instrument.lot,
          price: priceWhenAddToWallet,
          priceNumber: convertTinkoffNumberToNumber(position.currentPrice),
          lotPrice: convertNumberToTinkoffNumber(instrument.lot * convertTinkoffNumberToNumber(priceWhenAddToWallet)),
        };
        debug('corePosition', corePosition);
        coreWallet.push(corePosition);
      }

      debug(coreWallet);

      // Перед расчетом желаемых весов можно собрать свежие метрики для нужных тикеров
      try {
        const tickers = Object.keys(DESIRED_WALLET);
        await collectOnceForSymbols(tickers);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('[provider] collectOnceForSymbols failed (will proceed with live APIs/fallbacks):', e);
      }

      const desiredForRun = await buildDesiredWalletByMode(DESIRED_MODE, DESIRED_WALLET);
      const { finalPercents } = await balancer(coreWallet, desiredForRun);
      // Форматированный вывод результата: только бумаги (исключая валюты), округлённые проценты
      const entries = Object.entries(finalPercents)
        .filter(([t]) => t && t !== 'RUB')
        .map(([t, v]) => [t, `${Math.round(v)}%`] as [string, string]);
      const resultObject = entries.reduce((acc, [k, v]) => { (acc as any)[k] = v; return acc; }, {} as Record<string, string>);
      // eslint-disable-next-line no-console
      console.log('RESULT:', resultObject);
      debug(`ITERATION #${count} FINISHED. TIME: ${new Date()}`);
      count++;

      if (options?.runOnce) {
        debug('runOnce=true: завершаем после первого тика');
        resolve();
        return;
      }
    };

    // Немедленный первый запуск для отладки, затем по интервалу
    tick();
    if (!options?.runOnce) {
      setInterval(tick, BALANCE_INTERVAL);
    }
  });
};

// Преобразование типов времени из ответа API к Date
const toDate = (t: any): Date | null => {
  if (!t) return null;
  if (t instanceof Date) return t;
  if (typeof t === 'string' || typeof t === 'number') return new Date(t);
  if (typeof t === 'object') {
    const seconds = (t.seconds !== undefined ? Number(t.seconds) : (t.sec !== undefined ? Number(t.sec) : undefined));
    const nanos = (t.nanos !== undefined ? Number(t.nanos) : (t.nano !== undefined ? Number(t.nano) : 0));
    if (seconds !== undefined) {
      return new Date(seconds * 1000 + Math.floor(nanos / 1e6));
    }
  }
  return null;
};

// Проверяет, открыта ли указанная биржа прямо сейчас по расписанию торгов
export const isExchangeOpenNow = async (exchange: string = 'MOEX'): Promise<boolean> => {
  try {
    const now = new Date();
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);

    const schedules: any = await instruments.tradingSchedules({
      exchange,
      from,
      to,
    });

    const exchanges = schedules?.exchanges || schedules?.exchangesList || [];
    const first = exchanges[0];
    const days = first?.days || first?.daysList || [];

    // Ищем интервал(ы) сегодняшнего дня и проверяем попадание now
    for (const day of days) {
      // В некоторых обёртках может быть date как строка/Date — но для надёжности сверяем по границам
      if (day?.isTradingDay === false) continue;
      const start = toDate(day?.startTime || day?.start_time);
      const end = toDate(day?.endTime || day?.end_time);
      const eveningStart = toDate(day?.eveningStartTime || day?.evening_start_time);
      const eveningEnd = toDate(day?.eveningEndTime || day?.evening_end_time);

      // Основная сессия
      if (start && end && now >= start && now <= end) return true;
      // Вечерняя сессия (если есть)
      if (eveningStart && eveningEnd && now >= eveningStart && now <= eveningEnd) return true;
    }

    return false;
  } catch (err) {
    // В случае ошибок не блокируем работу бота
    debug('Ошибка при запросе расписания торгов', err);
    return true;
  }
};

export const getLastPrice = async (figi) => {
  debug('Получаем последнюю цену');
  let lastPriceResult;
  try {
    lastPriceResult = await marketData.getLastPrices({
      figi: [figi],
    });
    debug('lastPriceResult', lastPriceResult);
  } catch (err) {
    debug(err);
  }

  const lastPrice = lastPriceResult?.lastPrices?.[0]?.price;
  debug('lastPrice', lastPrice);
  await sleep(SLEEP_BETWEEN_ORDERS);
  return lastPrice;
};

export const getInstruments = async () => {

  debug('Получаем список акций');
  let sharesResult;
  try {
    sharesResult = await instruments.shares({
      // instrumentStatus: InstrumentStatus.INSTRUMENT_STATUS_BASE,
    });
  } catch (err) {
    debug(err);
  }
  const shares = sharesResult?.instruments;
  debug('shares count', shares?.length);
  (global as any).INSTRUMENTS = _.union(shares, (global as any).INSTRUMENTS);
  await sleep(SLEEP_BETWEEN_ORDERS);

  debug('Получаем список фондов');
  let etfsResult;
  try {
    etfsResult = await instruments.etfs({
      // instrumentStatus: InstrumentStatus.INSTRUMENT_STATUS_BASE,
    });
  } catch (err) {
    debug(err);
  }
  const etfs = etfsResult?.instruments;
  debug('etfs count', etfs?.length);
  (global as any).INSTRUMENTS = _.union(etfs, (global as any).INSTRUMENTS);
  await sleep(SLEEP_BETWEEN_ORDERS);

  debug('Получаем список облигаций');
  let bondsResult;
  try {
    bondsResult = await instruments.bonds({
      // instrumentStatus: InstrumentStatus.INSTRUMENT_STATUS_BASE,
    });
  } catch (err) {
    debug(err);
  }
  const bonds = bondsResult?.instruments;
  debug('bonds count', bonds?.length);
  (global as any).INSTRUMENTS = _.union(bonds, (global as any).INSTRUMENTS);
  await sleep(SLEEP_BETWEEN_ORDERS);

  debug('Получаем список валют');
  let currenciesResult;
  try {
    currenciesResult = await instruments.currencies({
      // instrumentStatus: InstrumentStatus.INSTRUMENT_STATUS_BASE,
    });
  } catch (err) {
    debug(err);
  }
  const currencies = currenciesResult?.instruments;
  debug('currencies count', currencies?.length);
  (global as any).INSTRUMENTS = _.union(currencies, (global as any).INSTRUMENTS);
  await sleep(SLEEP_BETWEEN_ORDERS);

  debug('Получаем список фьючерсов');
  let futuresResult;
  try {
    futuresResult = await instruments.futures({
      // instrumentStatus: InstrumentStatus.INSTRUMENT_STATUS_BASE,
    });
  } catch (err) {
    debug(err);
  }
  const futures = futuresResult?.instruments;
  debug('futures count', futures?.length);
  (global as any).INSTRUMENTS = _.union(futures, (global as any).INSTRUMENTS);
  await sleep(SLEEP_BETWEEN_ORDERS);

  debug('=========================');
};

export const getLastPrices = async () => {
  const lastPrices = (await marketData.getLastPrices({
    figi: [],
  }))?.lastPrices;
  debug('lastPrices', JSON.stringify(lastPrices, null, 2));
  const lastPricesFormatted = _.map(lastPrices, (item) => {
    item.price = convertTinkoffNumberToNumber(item.price);
    debug('fffff', convertTinkoffNumberToNumber(item.price));
    return item;
  });
  debug('lastPricesFormatted', JSON.stringify(lastPricesFormatted, null, 2));
  (global as any).LAST_PRICES = lastPricesFormatted;

  writeFile(lastPricesFormatted, 'lastPrices');
};
