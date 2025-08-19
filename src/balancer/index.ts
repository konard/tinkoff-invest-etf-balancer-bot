import 'dotenv/config';
import { createSdk } from 'tinkoff-sdk-grpc-js/src/sdk';
// import { createSdk } from '../provider/invest-nodejs-grpc-sdk/src/sdk';
import 'mocha';
import _ from 'lodash';
import uniqid from 'uniqid';
import { OrderDirection, OrderType } from 'tinkoff-sdk-grpc-js/dist/generated/orders';
// import { OrderDirection, OrderType } from '../provider/invest-nodejs-grpc-sdk/src/generated/orders';
import { SLEEP_BETWEEN_ORDERS, MARGIN_MULTIPLIER, FREE_MARGIN_THRESHOLD, MARGIN_BALANCING_STRATEGY } from '../config';
import { Wallet, DesiredWallet, Position, MarginPosition, MarginConfig } from '../types.d';
import { getLastPrice, generateOrders } from '../provider';
import { normalizeTicker, tickersEqual, MarginCalculator } from '../utils';
import { sumValues, convertNumberToTinkoffNumber, convertTinkoffNumberToNumber } from '../utils';

const debug = require('debug')('bot').extend('balancer');

// const { orders, operations, marketData, users, instruments } = createSdk(process.env.TOKEN || '');

// Инициализация калькулятора маржи
const marginConfig: MarginConfig = {
  multiplier: MARGIN_MULTIPLIER,
  freeThreshold: FREE_MARGIN_THRESHOLD,
  strategy: MARGIN_BALANCING_STRATEGY
};

const marginCalculator = new MarginCalculator(marginConfig);

/**
 * Определяет маржинальные позиции в портфеле
 */
export const identifyMarginPositions = (wallet: Wallet): MarginPosition[] => {
  const marginPositions: MarginPosition[] = [];
  
  for (const position of wallet) {
    if (position.totalPriceNumber && position.totalPriceNumber > 0) {
      // Определяем маржинальную часть позиции
      const baseValue = position.totalPriceNumber / MARGIN_MULTIPLIER;
      const marginValue = position.totalPriceNumber - baseValue;
      
      if (marginValue > 0) {
        const marginPosition: MarginPosition = {
          ...position,
          isMargin: true,
          marginValue,
          leverage: MARGIN_MULTIPLIER,
          marginCall: false
        };
        marginPositions.push(marginPosition);
      }
    }
  }
  
  return marginPositions;
};

/**
 * Применяет стратегию управления маржинальными позициями
 */
export const applyMarginStrategy = (wallet: Wallet, currentTime: Date = new Date()): {
  shouldRemoveMargin: boolean;
  reason: string;
  transferCost: number;
  marginPositions: MarginPosition[];
} => {
  const marginPositions = identifyMarginPositions(wallet);
  
  if (marginPositions.length === 0) {
    return {
      shouldRemoveMargin: false,
      reason: 'Нет маржинальных позиций',
      transferCost: 0,
      marginPositions: []
    };
  }
  
  const strategy = marginCalculator.applyMarginStrategy(marginPositions, MARGIN_BALANCING_STRATEGY, currentTime);
  
  return {
    ...strategy,
    marginPositions
  };
};

/**
 * Рассчитывает оптимальные размеры позиций с учетом множителя
 */
export const calculateOptimalSizes = (wallet: Wallet, desiredWallet: DesiredWallet) => {
  return marginCalculator.calculateOptimalPositionSizes(wallet, desiredWallet);
};


export const normalizeDesire = (desiredWallet: DesiredWallet): DesiredWallet => {
  debug('Нормализуем проценты, чтобы общая сумма была равна 100%, чтобы исключить человеческий фактор');
  debug('desiredWallet', desiredWallet);

  const desiredSum: number = Number(sumValues(desiredWallet));
  debug('desiredSum', desiredSum);

  const normalizedDesire = Object.entries(desiredWallet).reduce((p, [k, v]) => ({ ...p, [k]: (Number(v) / desiredSum * 100) }), {});
  debug('normalizedDesire', normalizedDesire);

  return normalizedDesire;
};

// TODO: remove
export const addNumbersToPosition = (position: Position): Position => {
  debug('addNumbersToPosition start');

  debug('position.price', position.price);
  if (position.price) {
    position.priceNumber = convertTinkoffNumberToNumber(position.price);
    debug('position.priceNumber', position.priceNumber);
  }

  debug('position.lotPrice', position.lotPrice);
  if (position.lotPrice) {
    position.lotPriceNumber = convertTinkoffNumberToNumber(position.lotPrice);
    debug('position.lotPriceNumber', position.lotPriceNumber);
  }

  debug('position.totalPrice', position.totalPrice);
  if (position.totalPrice) {
    position.totalPriceNumber = convertTinkoffNumberToNumber(position.totalPrice);
    debug('position.totalPriceNumber', position.totalPriceNumber);
  }

  debug('addNumbersToPosition end', position);
  return position;
};

// TODO: remove
export const addNumbersToWallet = (wallet: Wallet): Wallet => {
  for (let position of wallet) {
    position = addNumbersToPosition(position);
  }
  debug('addNumbersToWallet', wallet);
  return wallet;
};

export const balancer = async (positions: Wallet, desiredWallet: DesiredWallet): Promise<{ finalPercents: Record<string, number> }> => {

  const walletInfo = {
    remains: 0,
  };

  const wallet = positions;

  // Применяем стратегию управления маржинальными позициями
  const marginStrategy = applyMarginStrategy(wallet);
  debug('Стратегия маржи:', marginStrategy);

  if (marginStrategy.shouldRemoveMargin) {
    debug(`Применяем стратегию: ${marginStrategy.reason}`);
    debug(`Стоимость переноса: ${marginStrategy.transferCost.toFixed(2)} руб`);
    
    // Здесь можно добавить логику для закрытия маржинальных позиций
    // или их переноса на следующий день
  }

  const normalizedDesire = normalizeDesire(desiredWallet);

  // Приводим ключи тикеров к алиасам (например, TRAY -> TPAY) и пере-нормализуем
  const desiredAliased = Object.entries(normalizedDesire).reduce((acc: any, [k, v]) => {
    const nk = normalizeTicker(k) || k;
    acc[nk] = (acc[nk] || 0) + Number(v);
    return acc;
  }, {} as Record<string, number>);
  const desiredMap = desiredAliased; // Убираем повторную нормализацию

  debug('Добавляем в DesireWallet недостающие инструменты в портфеле со значением 0');
  for (const position of wallet) {
    if (position.base) {
      const baseNormalized = normalizeTicker(position.base) || position.base;
      if (desiredMap[baseNormalized] === undefined) {
        debug(`${position.base} не найден в желаемом портфеле, добавляем со значением 0.`);
        desiredMap[baseNormalized] = 0;
      }
    }
  }

  for (const [desiredTickerRaw, desiredPercent] of Object.entries(desiredMap)) {
    const desiredTicker = normalizeTicker(desiredTickerRaw) || desiredTickerRaw;
    const desiredPercentNumber = Number(desiredPercent);
    debug(' Ищем base (ticker) в wallet');
    const positionIndex = _.findIndex(wallet, (p: any) => tickersEqual(p.base, desiredTicker));
    debug('positionIndex', positionIndex);

    if (positionIndex === -1) {
      debug('В портфеле нету тикера из DesireWallet. Создаем.');

      const findedInstumentByTicker = _.find((global as any).INSTRUMENTS, (i: any) => tickersEqual(i.ticker, desiredTicker));
      debug(findedInstumentByTicker);

      const figi = findedInstumentByTicker?.figi;
      debug(figi);

      const lotSize = findedInstumentByTicker?.lot;
      debug(lotSize);

      if (!findedInstumentByTicker || !figi || !lotSize) {
        debug(`Инструмент для тикера ${desiredTicker} не найден в INSTRUMENTS. Пропускаем добавление.`);
        continue;
      }

      const lastPrice = await getLastPrice(figi); // sleep внутри есть
      if (!lastPrice) {
        debug(`Не удалось получить lastPrice для ${desiredTicker}/${figi}. Пропускаем добавление.`);
        continue;
      }

      const newPosition = {
        pair: `${desiredTicker}/RUB`,
        base: desiredTicker,
        quote: 'RUB',
        figi,
        price: lastPrice,
        priceNumber: convertTinkoffNumberToNumber(lastPrice),
        amount: 0,
        lotSize,
        lotPrice: convertNumberToTinkoffNumber(lotSize * convertTinkoffNumberToNumber(lastPrice)),
      };
      debug('newPosition', newPosition);
      wallet.push(newPosition);
    }
  }

  debug('Рассчитываем totalPrice');
  const walletWithTotalPrice = _.map(wallet, (position: Position): Position => {
    debug('walletWithtotalPrice: map start: position', position);

    if (position.lotPrice) {
      const lotPriceNumber = convertTinkoffNumberToNumber(position.lotPrice);
      debug('lotPriceNumber', lotPriceNumber);
    }

    debug('position.amount, position.priceNumber');
    debug(position.amount, position.priceNumber);

    if (position.amount && position.price) {
      const totalPriceNumber = convertTinkoffNumberToNumber(position.price) * position.amount;
      debug('totalPriceNumber', totalPriceNumber);

      const totalPrice = convertNumberToTinkoffNumber(totalPriceNumber);
      position.totalPrice = totalPrice;
      debug('totalPrice', totalPrice);
    }

    debug('walletWithtotalPrice: map end: position', position);
    return position;
  });

  const walletWithNumbers = addNumbersToWallet(walletWithTotalPrice);
  debug('addNumbersToWallet', addNumbersToWallet);

  const sortedWallet = _.orderBy(walletWithNumbers, ['lotPriceNumber'], ['desc']);
  debug('sortedWallet', sortedWallet);

  debug('Суммируем все позиции в портефле');
  const walletSumNumber = _.sumBy(sortedWallet, 'totalPriceNumber');
  debug(sortedWallet);
  debug('walletSumNumber', walletSumNumber);

  // Рассчитываем оптимальные размеры позиций с учетом множителя
  const optimalSizes = calculateOptimalSizes(sortedWallet, desiredMap);
  debug('Оптимальные размеры позиций:', optimalSizes);

  for (const [desiredTickerRaw, desiredPercent] of Object.entries(desiredMap)) {
    const desiredTicker = normalizeTicker(desiredTickerRaw) || desiredTickerRaw;
    const desiredPercentNumber = Number(desiredPercent);
    debug(' Ищем base (ticker) в wallet');
    const positionIndex = _.findIndex(sortedWallet, (p: any) => tickersEqual(p.base, desiredTicker));
    debug('positionIndex', positionIndex);

    // TODO:
    // const position: Position;
    // if (positionIndex === -1) {
    //   debug('В портфеле нету тикера из DesireWallet. Создаем.');
    //   const newPosition = {
    //     pair: `${desiredTicker}/RUB`,
    //     base: desiredTicker,
    //     quote: 'RUB',
    //     figi: _.find((global as any).INSTRUMENTS, { ticker: desiredTicker })?.figi,
    //     amount: 0,
    //     lotSize: 1,
    //     // price: _.find((global as any).INSTRUMENTS, { ticker: desiredTicker })?.price, // { units: 1, nano: 0 },
    //     // lotPrice: { units: 1, nano: 0 },
    //     // totalPrice: { units: 1, nano: 0 },
    //   };
    //   sortedWallet.push(newPosition);
    //   positionIndex = _.findIndex(sortedWallet, { base: desiredTicker });
    // }

    if (positionIndex === -1) {
      debug(`Тикер ${desiredTicker} отсутствует в wallet после подготовки. Пропускаем расчет по нему.`);
      continue;
    }

    const position: Position = sortedWallet[positionIndex];
    debug('position', position);

    debug('Рассчитываем сколько в рублях будет ожидаемая доля с учетом множителя');
    debug('walletSumNumber', walletSumNumber);
    debug('desiredPercent', desiredPercentNumber);
    
    // Используем оптимальные размеры с учетом множителя
    const optimalSize = optimalSizes[desiredTicker];
    const desiredAmountNumber = optimalSize ? optimalSize.totalSize : (walletSumNumber / 100 * desiredPercentNumber);
    
    debug('desiredAmountNumber (с учетом множителя)', desiredAmountNumber);
    position.desiredAmountNumber = desiredAmountNumber;

    debug('Высчитываем сколько лотов можно купить до желаемого таргета');
    if (position.lotPriceNumber) {
      const canBuyBeforeTargetLots = Math.trunc(desiredAmountNumber / position.lotPriceNumber);
      debug('canBuyBeforeTargetLots', canBuyBeforeTargetLots);
      position.canBuyBeforeTargetLots = canBuyBeforeTargetLots;

      debug('Высчитываем стоимость позиции, которую можно купить до желаемого таргета');
      const canBuyBeforeTargetNumber = canBuyBeforeTargetLots * position.lotPriceNumber;
      debug('canBuyBeforeTargetNumber', canBuyBeforeTargetNumber);
      position.canBuyBeforeTargetNumber = canBuyBeforeTargetNumber;

      debug('Высчитываем разницу между желаемым значением и значением до таргета. Нераспеределенный остаток.');
      const beforeDiffNumber = Math.abs(desiredAmountNumber - canBuyBeforeTargetNumber);
      debug('beforeDiffNumber', beforeDiffNumber);
      position.beforeDiffNumber = beforeDiffNumber;

      debug('Суммируем остатки'); // TODO: нужно определить валюту и записать остаток в этой валюте
      walletInfo.remains += beforeDiffNumber; // Пока только в рублях

      debug('Сколько нужно купить (может быть отрицательным, тогда нужно продать)');
      if (position.totalPriceNumber) {
        const toBuyNumber = canBuyBeforeTargetNumber - position.totalPriceNumber;
        debug('toBuyNumber', toBuyNumber);
        position.toBuyNumber = toBuyNumber;
      }

      debug('Сколько нужно купить лотов (может быть отрицательным, тогда нужно продать)');
      if (position.amount && position.lotSize) {
        const toBuyLots = canBuyBeforeTargetLots - (position.amount / position.lotSize);
        debug('toBuyLots', toBuyLots);
        position.toBuyLots = toBuyLots;

        // Гарантируем минимум 1 лот для каждой позиции с положительной целевой долей
        const currentLots = position.amount / position.lotSize;
        if (desiredPercentNumber > 0 && currentLots < 1 && position.toBuyLots < 1) {
          debug('Минимум 1 лот по стратегии: увеличиваем toBuyLots до 1', position.base);
          position.toBuyLots = 1;
          if (position.lotPriceNumber && position.totalPriceNumber) {
            const recalculatedToBuyNumber = position.toBuyLots * position.lotPriceNumber - position.totalPriceNumber;
            position.toBuyNumber = recalculatedToBuyNumber;
          }
        }
      }
    }
  }

  debug('sortedWallet', sortedWallet);

  // Порядок исполнения:
  // 1) Сначала продажи (получаем рубли)
  // 2) Затем покупки, отсортированные по стоимости лота по убыванию (дорогие сначала)
  const sellsFirst = _.filter(sortedWallet, (p: Position) => (p.toBuyLots || 0) <= -1);
  const sellsSorted = _.orderBy(sellsFirst, ['toBuyNumber'], ['asc']);
  const buysOnly = _.filter(sortedWallet, (p: Position) => (p.toBuyLots || 0) >= 1);
  const buysSortedByLotDesc = _.orderBy(buysOnly, ['lotPriceNumber'], ['desc']);
  const ordersPlanned = [...sellsSorted, ...buysSortedByLotDesc];
  debug('ordersPlanned', ordersPlanned);

  debug('walletInfo', walletInfo);

  debug('Для всех позиций создаем необходимые ордера');
  await generateOrders(ordersPlanned);
  
  // Подсчёт итоговых процентных долей бумаг после выставления ордеров (по плану ордеров)
  // Исключаем валюты (base === quote)
  const simulated = _.cloneDeep(sortedWallet) as Position[];
  for (const p of simulated) {
    if (p.base && p.quote && p.base === p.quote) continue;
    const lotSize = Number(p.lotSize) || 1;
    if (p.amount) {
      const currentLots = p.amount / lotSize;
      const plannedLots = Math.sign(p.toBuyLots || 0) * Math.floor(Math.abs(p.toBuyLots || 0));
      const finalLots = currentLots + plannedLots;
      const finalAmount = finalLots * lotSize;
      const priceNum = Number(p.priceNumber) || (p.price ? convertTinkoffNumberToNumber(p.price) : 0);
      (p as any).__finalValue = Math.max(0, priceNum * finalAmount);
    }
  }
  const onlySecurities = simulated.filter((p) => !(p.base && p.quote && p.base === p.quote));
  const totalFinal = _.sumBy(onlySecurities, (p: any) => Number(p.__finalValue) || 0);
  const finalPercents: Record<string, number> = {};
  if (totalFinal > 0) {
    for (const p of onlySecurities) {
      if (p.base) {
        const ticker = normalizeTicker(p.base) || p.base;
        const val = Number((p as any).__finalValue) || 0;
        const pct = (val / totalFinal) * 100;
        finalPercents[ticker] = (finalPercents[ticker] || 0) + pct;
      }
    }
  }
  
  return { finalPercents };
};
