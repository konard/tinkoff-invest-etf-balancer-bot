import 'dotenv/config';
import { createSdk } from 'tinkoff-sdk-grpc-js';
// import { createSdk } from '../provider/invest-nodejs-grpc-sdk/src/sdk';
import 'mocha';
import _ from 'lodash';
import uniqid from 'uniqid';
import debug from 'debug';
// import { OrderDirection, OrderType } from '../provider/invest-nodejs-grpc-sdk/src/sdk';
import { OrderDirection, OrderType } from 'tinkoff-sdk-grpc-js/dist/generated/orders';
import { configLoader } from '../configLoader';
import { Wallet, Position } from '../types.d';
import { sleep, writeFile, convertNumberToTinkoffNumber, convertTinkoffNumberToNumber } from '../utils';
import { balancer } from '../balancer';
import { buildDesiredWalletByMode } from '../balancer/desiredBuilder';
import { collectOnceForSymbols } from '../tools/pollEtfMetrics';
import { normalizeTicker } from '../utils';

(global as any).INSTRUMENTS = [];
(global as any).POSITIONS = [];
(global as any).LAST_PRICES = [];

const debugProvider = debug('bot').extend('provider');

// Функция для получения конфигурации аккаунта
const getAccountConfig = () => {
  const accountId = process.env.ACCOUNT_ID || '0'; // По умолчанию используем аккаунт '0'
  const account = configLoader.getAccountById(accountId);

  if (!account) {
    throw new Error(`Account with id '${accountId}' not found in CONFIG.json`);
  }

  return account;
};

const { orders, operations, marketData, users, instruments } = createSdk(process.env.TOKEN || '');

// Получаем конфигурацию аккаунта на уровне модуля
const accountConfig = getAccountConfig();

/**
 * Рассчитывает доли каждого инструмента в портфеле
 * @param wallet - массив позиций портфеля
 * @returns объект с тикерами и их долями в процентах
 */
const calculatePortfolioShares = (wallet: Wallet): Record<string, number> => {
  // Исключаем валюты (позиции где base === quote)
  const securities = wallet.filter(p => p.base !== p.quote);
  const totalValue = _.sumBy(securities, 'totalPriceNumber');
  
  if (totalValue <= 0) return {};
  
  const shares: Record<string, number> = {};
  for (const position of securities) {
    if (position.base && position.totalPriceNumber) {
      const ticker = normalizeTicker(position.base) || position.base;
      shares[ticker] = (position.totalPriceNumber / totalValue) * 100;
    }
  }
  return shares;
};

let ACCOUNT_ID: string;

export const provider = async (options?: { runOnce?: boolean }) => {
  ACCOUNT_ID = await getAccountId(process.env.ACCOUNT_ID);
  await getInstruments();
  await getPositionsCycle(options);
};

export const generateOrders = async (wallet: Wallet) => {
  debugProvider('generateOrders');
  for (const position of wallet) {
    await generateOrder(position);
  }
};

export const generateOrder = async (position: Position) => {
  debugProvider('generateOrder');
  debugProvider('position', position);

  if (position.base === 'RUB') {
    debugProvider('If position is RUB, do nothing');
    return false;
  }

  debugProvider('Position is not currency');

  debugProvider('position.toBuyLots', position.toBuyLots);

  if (!position.toBuyLots || !isFinite(position.toBuyLots)) {
    debugProvider('toBuyLots is NaN/Infinity/undefined. Skipping position.');
    return 0;
  }

  if ((-1 < position.toBuyLots) && (position.toBuyLots < 1)) {
    debugProvider('Order less than 1 lot. Not worth executing.');
    return 0;
  }

  debugProvider('Position is greater than or equal to 1 lot');

  const direction = position.toBuyLots >= 1 ? OrderDirection.ORDER_DIRECTION_BUY : OrderDirection.ORDER_DIRECTION_SELL;
  debugProvider('direction', direction);

  // for (const i of _.range(position.toBuyLots)) {
  //   // Idea to create single-lot orders to ensure they always execute completely, not partially.
  //   // May have complications with:
  //   // - number of allowed API requests, then need to implement queue.
  //   // - minimum order may be more than one lot
  //   debugProvider(`Creating single-lot order #${i} of ${_.range(position.toBuyLots).length}`);
  //   const order = {
  //     accountId: ACCOUNT_ID,
  //     figi: position.figi,
  //     quantity: 1,
  //     // price: { units: 40, nano: 0 },
  //     direction,
  //     orderType: OrderType.ORDER_TYPE_MARKET,
  //     orderId: uniqid(),
  //   };
  //   debugProvider('Sending order', order);

  //   try {
  //     const setOrder = await orders.postOrder(order);
  //     debugProvider('Successfully placed order', setOrder);
  //   } catch (err) {
  //     debugProvider('Error placing order');
  //     debugProvider(err);
  //     console.trace(err);
  //   }
  //   await sleep(1000);
  // }

  // Or we can create regular orders
  debugProvider('position', position);

  debugProvider('Creating market order');
  const quantityLots = Math.floor(Math.abs(position.toBuyLots || 0));

  if (quantityLots < 1) {
    debugProvider('Number of lots after rounding < 1. Skipping order.');
    return 0;
  }

  if (!position.figi) {
    debugProvider('Position missing figi. Skipping order.');
    return 0;
  }

  const order = {
    accountId: ACCOUNT_ID,
    figi: position.figi,
    quantity: quantityLots, // Number of lots must be integer
    // price: { units: 40, nano: 0 },
    direction,
    orderType: OrderType.ORDER_TYPE_MARKET,
    orderId: uniqid(),
  };
  debugProvider('Sending market order', order);

  try {
    const setOrder = await orders.postOrder(order);
    debugProvider('Successfully placed order', setOrder);
  } catch (err) {
    debugProvider('Error placing order');
    debugProvider(err);
    // console.trace(err);
  }
  await sleep(accountConfig.sleep_between_orders);

};

export const getAccountId = async (type: any) => {
  // Поддержка индекса: '3' или 'INDEX:3'
  const indexMatch = typeof type === 'string' && type.startsWith('INDEX:')
    ? Number(type.split(':')[1])
    : (typeof type === 'string' && /^\d+$/.test(type) ? Number(type) : null);

  // If specific string id was passed, return as is
  if (indexMatch === null && type !== 'ISS' && type !== 'BROKER') {
    debugProvider('Passed ACCOUNT_ID (as string id)', type);
    return type;
  }

  debugProvider('Getting accounts list');
  let accountsResponse: any;
  try {
    accountsResponse = await users.getAccounts({});
  } catch (err) {
    debugProvider('Error getting accounts list');
    debugProvider(err);
  }
  debugProvider('accountsResponse', accountsResponse);

  // Support different response formats: { accounts: [...] } or direct array
  const accounts: any[] = Array.isArray(accountsResponse)
    ? accountsResponse
    : (accountsResponse?.accounts || []);

  // Selection by index
  if (indexMatch !== null) {
    const byIndex = accounts[indexMatch];
    const byIndexId = byIndex?.id || byIndex?.accountId || byIndex?.account_id;
    debugProvider('Selected account by index', byIndex);
    if (!byIndexId) {
      throw new Error(`Could not determine ACCOUNT_ID by index ${indexMatch}.`);
    }
    return byIndexId;
  }

  // Selection by type
  if (type === 'ISS' || type === 'BROKER') {
    // 1 — brokerage, 2 — IIS (by API v2 enum)
    const desiredType = type === 'ISS' ? 2 : 1;
    const account = _.find(accounts, { type: desiredType });
    debugProvider('Found account by type', account);
    const accountId = account?.id || account?.accountId || account?.account_id;
    if (!accountId) {
      throw new Error('Could not determine ACCOUNT_ID by type. Check token access to the required account.');
    }
    return accountId;
  }

  // Fallback: return as is
  debugProvider('Passed ACCOUNT_ID (as string id fallback)', type);
  return type;
};

export const getPositionsCycle = async (options?: { runOnce?: boolean }) => {
  return await new Promise<void>((resolve) => {
    let count = 1;

    const tick = async () => {
      // Before starting iteration, check if exchange is open (MOEX)
      try {
        const isOpen = await isExchangeOpenNow('MOEX');
        if (!isOpen) {
          debugProvider('Exchange closed (MOEX). Skipping balancing and waiting for next iteration.');
          if (options?.runOnce) {
            debugProvider('runOnce=true and exchange closed: finishing without balancing');
            resolve();
            return;
          }
          return; // just wait for next tick by interval
        }
      } catch (e) {
        debugProvider('Could not check trading schedule. Continuing by default.', e);
      }

      let portfolio: any;
      let portfolioPositions: any;
      try {
        debugProvider('Getting portfolio');
        portfolio = await operations.getPortfolio({
          accountId: ACCOUNT_ID,
        });
        debugProvider('portfolio', portfolio);

        portfolioPositions = portfolio.positions;
        debugProvider('portfolioPositions', portfolioPositions);
      } catch (err) {
        console.warn('Error getting portfolio');
        debugProvider(err);
        console.trace(err);
      }

      let positions: any;
      try {
        debugProvider('Getting positions');
        positions = await operations.getPositions({
          accountId: ACCOUNT_ID,
        });
        debugProvider('positions', positions);
      } catch (err) {
        console.warn('Error getting positions');
        debugProvider(err);
        console.trace(err);
      }

      const coreWallet: Wallet = [];

      debugProvider('Adding currencies to Wallet');
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
        debugProvider('corePosition', corePosition);
        coreWallet.push(corePosition);
      }

      (global as any).POSITIONS = portfolioPositions;

      debugProvider('Adding positions to Wallet');
      for (const position of portfolioPositions) {
        debugProvider('position', position);

        const instrument = _.find((global as any).INSTRUMENTS,  { figi: position.figi });
        debugProvider('instrument', instrument);

        if (!instrument) {
          debugProvider('instrument not found by figi, skip position', position.figi);
          continue;
        }

        const priceWhenAddToWallet = await getLastPrice(instrument.figi);
        debugProvider('priceWhenAddToWallet', priceWhenAddToWallet);

        const amount = convertTinkoffNumberToNumber(position.quantity);
        const priceNumber = convertTinkoffNumberToNumber(position.currentPrice);
        const totalPriceNumber = amount * priceNumber;

        // Extract average position price for profit calculation
        const averagePositionPriceNumber = position.averagePositionPrice
          ? convertTinkoffNumberToNumber(position.averagePositionPrice)
          : undefined;

        const corePosition = {
          pair: `${instrument.ticker}/${instrument.currency.toUpperCase()}`,
          base: instrument.ticker,
          quote: instrument.currency.toUpperCase(),
          figi: position.figi,
          amount: amount,
          lotSize: instrument.lot,
          price: priceWhenAddToWallet || { units: 0, nano: 0 },
          priceNumber: priceNumber,
          lotPrice: convertNumberToTinkoffNumber(instrument.lot * convertTinkoffNumberToNumber(priceWhenAddToWallet || { units: 0, nano: 0 })),
          totalPrice: convertNumberToTinkoffNumber(totalPriceNumber),
          totalPriceNumber: totalPriceNumber,
          // Fields for profit calculation
          averagePositionPrice: position.averagePositionPrice,
          averagePositionPriceNumber: averagePositionPriceNumber,
          currentPrice: position.currentPrice,
          currentPriceNumber: priceNumber,
        };
        debugProvider('corePosition', corePosition);
        coreWallet.push(corePosition);
      }

      debugProvider(coreWallet);

      // Before calculating desired weights, we can collect fresh metrics for needed tickers
      try {
        const tickers = Object.keys(accountConfig.desired_wallet);
        await collectOnceForSymbols(tickers);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('[provider] collectOnceForSymbols failed (will proceed with live APIs/fallbacks):', e);
      }

      const desiredForRun = await buildDesiredWalletByMode(accountConfig.desired_mode, accountConfig.desired_wallet);

      // Save current portfolio shares BEFORE balancing
      // Important: called after buildDesiredWalletByMode, but before balancer
      const beforeShares = calculatePortfolioShares(coreWallet);

      const { finalPercents } = await balancer(coreWallet, desiredForRun);

      // Get updated shares AFTER balancing
      const afterShares = calculatePortfolioShares(coreWallet);

      // Detailed balancing result output
      console.log('BALANCING RESULT:');
      console.log('Format: TICKER: diff: before% -> after% (target%)');
      console.log('Where: before% = current share, after% = actual share after balancing, (target%) = target from balancer, diff = change in percentage points\n');

      // Sort tickers by descending share after balancing (after)
      const sortedTickers = Object.keys(finalPercents).sort((a, b) => {
        const afterA = afterShares[a] || 0;
        const afterB = afterShares[b] || 0;
        return afterB - afterA; // Descending: from larger to smaller
      });

      for (const ticker of sortedTickers) {
        if (ticker && ticker !== 'RUB') {
          const beforePercent = beforeShares[ticker] || 0;
          const afterPercent = afterShares[ticker] || 0;
          const targetPercent = finalPercents[ticker] || 0;

          // Calculate change in percentage points
          const diff = afterPercent - beforePercent;
          const diffSign = diff > 0 ? '+' : '';
          const diffText = diff === 0 ? '0%' : `${diffSign}${diff.toFixed(2)}%`;

          console.log(`${ticker}: ${diffText}: ${beforePercent.toFixed(2)}% -> ${afterPercent.toFixed(2)}% (${targetPercent.toFixed(2)}%)`);
        }
      }

      // Add RUB balance (can be negative with margin trading)
      const rubPosition = coreWallet.find(p => p.base === 'RUB' && p.quote === 'RUB');
      if (rubPosition) {
        const rubBalance = rubPosition.totalPriceNumber || 0;
        const rubSign = rubBalance >= 0 ? '' : '-';
        const rubAbs = Math.abs(rubBalance);
        console.log(`RUR: ${rubSign}${rubAbs.toFixed(2)} RUB`);
      }
      debugProvider(`ITERATION #${count} FINISHED. TIME: ${new Date()}`);
      count++;

      if (options?.runOnce) {
        debugProvider('runOnce=true: finishing after first tick');
        resolve();
        return;
      }
    };

    // Немедленный первый запуск для отладки, затем по интервалу
    tick();
    if (!options?.runOnce) {
      setInterval(tick, accountConfig.balance_interval);
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
    const from = new Date(now); // Use current time as 'from' parameter
    const to = new Date(now);
    to.setDate(to.getDate() + 1); // Get schedule until tomorrow

    debugProvider(`Checking trading schedule for ${exchange}. Current time: ${now.toISOString()}`);
    debugProvider(`Request params: from=${from.toISOString()}, to=${to.toISOString()}`);

    const schedules: any = await instruments.tradingSchedules({
      exchange,
      from,
      to,
    });

    debugProvider('Trading schedules response:', JSON.stringify(schedules, null, 2));

    const exchanges = schedules?.exchanges || schedules?.exchangesList || [];
    const first = exchanges[0];
    const days = first?.days || first?.daysList || [];

    debugProvider(`Found ${days.length} trading days in schedule`);

    // Ищем интервал(ы) сегодняшнего дня и проверяем попадание now
    for (const day of days) {
      debugProvider('Processing day:', JSON.stringify(day, null, 2));

      // В некоторых обёртках может быть date как строка/Date — но для надёжности сверяем по границам
      if (day?.isTradingDay === false) {
        debugProvider('Day is not a trading day, skipping');
        continue;
      }

      const start = toDate(day?.startTime || day?.start_time);
      const end = toDate(day?.endTime || day?.end_time);
      const eveningStart = toDate(day?.eveningStartTime || day?.evening_start_time);
      const eveningEnd = toDate(day?.eveningEndTime || day?.evening_end_time);

      debugProvider(`Session times: start=${start?.toISOString()}, end=${end?.toISOString()}`);
      debugProvider(`Evening session: start=${eveningStart?.toISOString()}, end=${eveningEnd?.toISOString()}`);

      // Основная сессия
      if (start && end && now >= start && now <= end) {
        debugProvider('Current time is within main trading session');
        return true;
      }
      // Вечерняя сессия (если есть)
      if (eveningStart && eveningEnd && now >= eveningStart && now <= eveningEnd) {
        debugProvider('Current time is within evening trading session');
        return true;
      }
    }

    debugProvider('Current time is outside all trading sessions');
    return false;
  } catch (err) {
    // In case of errors, don't block bot operation
    debugProvider('Error requesting trading schedule', err);
    return true;
  }
};

export const getLastPrice = async (figi: any) => {
  debugProvider('Getting last price');
  let lastPriceResult;
  try {
    lastPriceResult = await marketData.getLastPrices({
      figi: [figi],
    });
    debugProvider('lastPriceResult', lastPriceResult);
  } catch (err) {
    debugProvider(err);
  }

  const lastPrice = lastPriceResult?.lastPrices?.[0]?.price;
  debugProvider('lastPrice', lastPrice);
  await sleep(accountConfig.sleep_between_orders);
  return lastPrice;
};

export const getInstruments = async () => {

  debugProvider('Getting shares list');
  let sharesResult;
  try {
    sharesResult = await instruments.shares({
      // instrumentStatus: InstrumentStatus.INSTRUMENT_STATUS_BASE,
    });
  } catch (err) {
    debugProvider(err);
  }
  const shares = sharesResult?.instruments;
  debugProvider('shares count', shares?.length);
  (global as any).INSTRUMENTS = _.union(shares, (global as any).INSTRUMENTS);
  await sleep(accountConfig.sleep_between_orders);

  debugProvider('Getting ETFs list');
  let etfsResult;
  try {
    etfsResult = await instruments.etfs({
      // instrumentStatus: InstrumentStatus.INSTRUMENT_STATUS_BASE,
    });
  } catch (err) {
    debugProvider(err);
  }
  const etfs = etfsResult?.instruments;
  debugProvider('etfs count', etfs?.length);
  (global as any).INSTRUMENTS = _.union(etfs, (global as any).INSTRUMENTS);
  await sleep(accountConfig.sleep_between_orders);

  debugProvider('Getting bonds list');
  let bondsResult;
  try {
    bondsResult = await instruments.bonds({
      // instrumentStatus: InstrumentStatus.INSTRUMENT_STATUS_BASE,
    });
  } catch (err) {
    debugProvider(err);
  }
  const bonds = bondsResult?.instruments;
  debugProvider('bonds count', bonds?.length);
  (global as any).INSTRUMENTS = _.union(bonds, (global as any).INSTRUMENTS);
  await sleep(accountConfig.sleep_between_orders);

  debugProvider('Getting currencies list');
  let currenciesResult;
  try {
    currenciesResult = await instruments.currencies({
      // instrumentStatus: InstrumentStatus.INSTRUMENT_STATUS_BASE,
    });
  } catch (err) {
    debugProvider(err);
  }
  const currencies = currenciesResult?.instruments;
  debugProvider('currencies count', currencies?.length);
  (global as any).INSTRUMENTS = _.union(currencies, (global as any).INSTRUMENTS);
  await sleep(accountConfig.sleep_between_orders);

  debugProvider('Getting futures list');
  let futuresResult;
  try {
    futuresResult = await instruments.futures({
      // instrumentStatus: InstrumentStatus.INSTRUMENT_STATUS_BASE,
    });
  } catch (err) {
    debugProvider(err);
  }
  const futures = futuresResult?.instruments;
  debugProvider('futures count', futures?.length);
  (global as any).INSTRUMENTS = _.union(futures, (global as any).INSTRUMENTS);
  await sleep(accountConfig.sleep_between_orders);

  debugProvider('=========================');
};

export const getLastPrices = async () => {
  const lastPrices = (await marketData.getLastPrices({
    figi: [],
  }))?.lastPrices;
  debugProvider('lastPrices', JSON.stringify(lastPrices, null, 2));
  const lastPricesFormatted = _.map(lastPrices, (item) => {
    if (item.price) {
      const priceNumber = convertTinkoffNumberToNumber(item.price);
      (item as any).price = priceNumber;
      debugProvider('fffff', priceNumber);
    }
    return item;
  });
  debugProvider('lastPricesFormatted', JSON.stringify(lastPricesFormatted, null, 2));
  (global as any).LAST_PRICES = lastPricesFormatted;

  writeFile(lastPricesFormatted, 'lastPrices');
};
