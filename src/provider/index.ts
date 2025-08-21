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
    debugProvider('Если позиция это рубль, то ничего не делаем');
    return false;
  }

  debugProvider('Позиция не валюта');

  debugProvider('position.toBuyLots', position.toBuyLots);

  if (!position.toBuyLots || !isFinite(position.toBuyLots)) {
    debugProvider('toBuyLots is NaN/Infinity/undefined. Пропускаем позицию.');
    return 0;
  }

  if ((-1 < position.toBuyLots) && (position.toBuyLots < 1)) {
    debugProvider('Выставление ордера меньше 1 лота. Не имеет смысла выполнять.');
    return 0;
  }

  debugProvider('Позиция больше или равно 1 лоту');

  const direction = position.toBuyLots >= 1 ? OrderDirection.ORDER_DIRECTION_BUY : OrderDirection.ORDER_DIRECTION_SELL;
  debugProvider('direction', direction);

  // for (const i of _.range(position.toBuyLots)) {
  //   // Идея создавать однолотовые ордера, для того, чтобы они всегда исполнялись полностью, а не частично.
  //   // Могут быть сложности с:
  //   // - кол-вом разрешенных запросов к api, тогда придется реализовывать очередь.
  //   // - минимальный ордер может быть больше одного лота
  //   debugProvider(`Создаем однолотовый ордер #${i} of ${_.range(position.toBuyLots).length}`);
  //   const order = {
  //     accountId: ACCOUNT_ID,
  //     figi: position.figi,
  //     quantity: 1,
  //     // price: { units: 40, nano: 0 },
  //     direction,
  //     orderType: OrderType.ORDER_TYPE_MARKET,
  //     orderId: uniqid(),
  //   };
  //   debugProvider('Отправляем ордер', order);

  //   try {
  //     const setOrder = await orders.postOrder(order);
  //     debugProvider('Успешно поставили ордер', setOrder);
  //   } catch (err) {
  //     debugProvider('Ошибка при выставлении ордера');
  //     debugProvider(err);
  //     console.trace(err);
  //   }
  //   await sleep(1000);
  // }

  // Или можно создавать обычные ордера
  debugProvider('position', position);

  debugProvider('Создаем рыночный ордер');
  const quantityLots = Math.floor(Math.abs(position.toBuyLots || 0));

  if (quantityLots < 1) {
    debugProvider('Количество лотов после округления < 1. Пропускаем ордер.');
    return 0;
  }

  if (!position.figi) {
    debugProvider('У позиции отсутствует figi. Пропускаем ордер.');
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
  debugProvider('Отправляем рыночный ордер', order);

  try {
    const setOrder = await orders.postOrder(order);
    debugProvider('Успешно поставили ордер', setOrder);
  } catch (err) {
    debugProvider('Ошибка при выставлении ордера');
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

  // Если пришла конкретная строка id, возвращаем как есть
  if (indexMatch === null && type !== 'ISS' && type !== 'BROKER') {
    debugProvider('Передан ACCOUNT_ID (как строка id)', type);
    return type;
  }

  debugProvider('Получаем список аккаунтов');
  let accountsResponse: any;
  try {
    accountsResponse = await users.getAccounts({});
  } catch (err) {
    debugProvider('Ошибка получения списка аккаунтов');
    debugProvider(err);
  }
  debugProvider('accountsResponse', accountsResponse);

  // Поддержка разных форматов ответа: { accounts: [...] } или сразу массив
  const accounts: any[] = Array.isArray(accountsResponse)
    ? accountsResponse
    : (accountsResponse?.accounts || []);

  // Выбор по индексу
  if (indexMatch !== null) {
    const byIndex = accounts[indexMatch];
    const byIndexId = byIndex?.id || byIndex?.accountId || byIndex?.account_id;
    debugProvider('Выбран аккаунт по индексу', byIndex);
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
    debugProvider('Найден аккаунт по типу', account);
    const accountId = account?.id || account?.accountId || account?.account_id;
    if (!accountId) {
      throw new Error('Не удалось определить ACCOUNT_ID по типу. Проверьте доступ токена к нужному счету.');
    }
    return accountId;
  }

  // Фоллбек: вернуть как есть
  debugProvider('Передан ACCOUNT_ID (как строка id фоллбек)', type);
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
          debugProvider('Биржа закрыта (MOEX). Пропускаем балансировку и ждём следующей итерации.');
          if (options?.runOnce) {
            debugProvider('runOnce=true и биржа закрыта: завершаем без выполнения балансировки');
            resolve();
            return;
          }
          return; // просто ждём следующий tick по интервалу
        }
      } catch (e) {
        debugProvider('Не удалось проверить расписание торгов. Продолжаем по умолчанию.', e);
      }

      let portfolio: any;
      let portfolioPositions: any;
      try {
        debugProvider('Получение портфолио');
        portfolio = await operations.getPortfolio({
          accountId: ACCOUNT_ID,
        });
        debugProvider('portfolio', portfolio);

        portfolioPositions = portfolio.positions;
        debugProvider('portfolioPositions', portfolioPositions);
      } catch (err) {
        console.warn('Ошибка при получении портфолио');
        debugProvider(err);
        console.trace(err);
      }

      let positions: any;
      try {
        debugProvider('Получение позиций');
        positions = await operations.getPositions({
          accountId: ACCOUNT_ID,
        });
        debugProvider('positions', positions);
      } catch (err) {
        console.warn('Ошибка при получении позиций');
        debugProvider(err);
        console.trace(err);
      }

      const coreWallet: Wallet = [];

      debugProvider('Добавляем валюты в Wallet');
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

      debugProvider('Добавляем позиции в Wallet');
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
        };
        debugProvider('corePosition', corePosition);
        coreWallet.push(corePosition);
      }

      debugProvider(coreWallet);

      // Перед расчетом желаемых весов можно собрать свежие метрики для нужных тикеров
      try {
        const tickers = Object.keys(accountConfig.desired_wallet);
        await collectOnceForSymbols(tickers);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('[provider] collectOnceForSymbols failed (will proceed with live APIs/fallbacks):', e);
      }

      const desiredForRun = await buildDesiredWalletByMode(accountConfig.desired_mode, accountConfig.desired_wallet);
      
      // Сохраняем текущие доли портфеля ДО балансировки
      // Важно: вызываем после buildDesiredWalletByMode, но до balancer
      const beforeShares = calculatePortfolioShares(coreWallet);
      
      const { finalPercents } = await balancer(coreWallet, desiredForRun);
      
      // Получаем обновленные доли ПОСЛЕ балансировки
      const afterShares = calculatePortfolioShares(coreWallet);
      
      // Детальный вывод результата балансировки
      console.log('BALANCING RESULT:');
      console.log('Format: TICKER: diff: before% -> after% (target%)');
      console.log('Where: before% = current share, after% = actual share after balancing, (target%) = target from balancer, diff = change in percentage points\n');
      
      // Сортируем тикеры по убыванию доли после балансировки (after)
      const sortedTickers = Object.keys(finalPercents).sort((a, b) => {
        const afterA = afterShares[a] || 0;
        const afterB = afterShares[b] || 0;
        return afterB - afterA; // Убывание: от большего к меньшему
      });
      
      for (const ticker of sortedTickers) {
        if (ticker && ticker !== 'RUB') {
          const beforePercent = beforeShares[ticker] || 0;
          const afterPercent = afterShares[ticker] || 0;
          const targetPercent = finalPercents[ticker] || 0;
          
          // Вычисляем изменение в процентных пунктах
          const diff = afterPercent - beforePercent;
          const diffSign = diff > 0 ? '+' : '';
          const diffText = diff === 0 ? '0%' : `${diffSign}${diff.toFixed(2)}%`;
          
          console.log(`${ticker}: ${diffText}: ${beforePercent.toFixed(2)}% -> ${afterPercent.toFixed(2)}% (${targetPercent.toFixed(2)}%)`);
        }
      }
      
      // Добавляем баланс рублей (может быть отрицательным при маржинальной торговле)
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
        debugProvider('runOnce=true: завершаем после первого тика');
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
    debugProvider('Ошибка при запросе расписания торгов', err);
    return true;
  }
};

export const getLastPrice = async (figi: any) => {
  debugProvider('Получаем последнюю цену');
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

  debugProvider('Получаем список акций');
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

  debugProvider('Получаем список фондов');
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

  debugProvider('Получаем список облигаций');
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

  debugProvider('Получаем список валют');
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

  debugProvider('Получаем список фьючерсов');
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
