import 'dotenv/config';
import { createSdk } from 'tinkoff-sdk-grpc-js/src/sdk';
// import { createSdk } from '../provider/invest-nodejs-grpc-sdk/src/sdk';
import 'mocha';
import _ from 'lodash';
import uniqid from 'uniqid';
import { OrderDirection, OrderType } from 'tinkoff-sdk-grpc-js/dist/generated/orders';
// import { OrderDirection, OrderType } from '../provider/invest-nodejs-grpc-sdk/src/generated/orders';
import { SLEEP_BETWEEN_ORDERS } from '../config';
import { Wallet, DesiredWallet, Position } from '../types.d';
import { getLastPrice, generateOrders } from '../provider';
import { normalizeTicker, tickersEqual } from '../utils';
import { sumValues, convertNumberToTinkoffNumber, convertTinkoffNumberToNumber } from '../utils';

const debug = require('debug')('bot').extend('balancer');

// const { orders, operations, marketData, users, instruments } = createSdk(process.env.TOKEN || '');


export const normalizeDesire = (wallet: DesiredWallet): DesiredWallet => {
  debug('Нормализуем проценты, чтобы общая сумма была равна 100%, чтобы исключить человеческий фактор');
  debug('wallet', wallet);

  const walletSum: number = Number(sumValues(wallet));
  debug('walletSum', walletSum);

  const normalizedDesire = Object.entries(wallet).reduce((p, [k, v]) => ({ ...p, [k]: (Number(v) / walletSum * 100) }), {});
  debug('normalizedDesire', normalizedDesire);

  return normalizedDesire;
};

// TODO: remove
export const addNumbersToPosition = (position: Position): Position => {
  debug('addNumbersToPosition start');

  debug('position.price', position.price);
  position.priceNumber = convertTinkoffNumberToNumber(position.price);
  debug('position.priceNumber', position.priceNumber);

  debug('position.lotPrice', position.lotPrice);
  position.lotPriceNumber = convertTinkoffNumberToNumber(position.lotPrice);
  debug('position.lotPriceNumber', position.lotPriceNumber);

  debug('position.totalPrice', position.totalPrice);
  position.totalPriceNumber = convertTinkoffNumberToNumber(position.totalPrice);
  debug('position.totalPriceNumber', position.totalPriceNumber);

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

  const normalizedDesire = normalizeDesire(desiredWallet);

  // Приводим ключи тикеров к алиасам (например, TRAY -> TPAY) и пере-нормализуем
  const desiredAliased = Object.entries(normalizedDesire).reduce((acc: any, [k, v]) => {
    const nk = normalizeTicker(k) || k;
    acc[nk] = (acc[nk] || 0) + Number(v);
    return acc;
  }, {} as Record<string, number>);
  const desiredMap = normalizeDesire(desiredAliased);

  debug('Добавляем в DesireWallet недостающие инструменты в портфеле со значением 0');
  for (const position of wallet) {
    const baseNormalized = normalizeTicker(position.base) || position.base;
    if (desiredMap[baseNormalized] === undefined) {
      debug(`${position.base} не найден в желаемом портфеле, добавляем со значением 0.`);
      desiredMap[baseNormalized] = 0;
    }
  }

  for (const [desiredTickerRaw, desiredPercent] of Object.entries(desiredMap)) {
    const desiredTicker = normalizeTicker(desiredTickerRaw) || desiredTickerRaw;
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

    const lotPriceNumber = convertTinkoffNumberToNumber(position.lotPrice);
    debug('lotPriceNumber', lotPriceNumber);

    debug('position.amount, position.priceNumber');
    debug(position.amount, position.priceNumber);

    const totalPriceNumber = convertTinkoffNumberToNumber(position.price) * position.amount; // position.amount * position.priceNumber; //
    debug('totalPriceNumber', totalPriceNumber);

    const totalPrice = convertNumberToTinkoffNumber(totalPriceNumber);
    position.totalPrice = totalPrice;
    debug('totalPrice', totalPrice);

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

  for (const [desiredTickerRaw, desiredPercent] of Object.entries(desiredMap)) {
    const desiredTicker = normalizeTicker(desiredTickerRaw) || desiredTickerRaw;
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

    debug('Рассчитываем сколько в рублях будет ожидаемая доля (допустим, 50%)');
    debug('walletSumNumber', walletSumNumber);
    debug('desiredPercent', desiredPercent);
    const desiredAmountNumber = walletSumNumber / 100 * desiredPercent;
    debug('desiredAmountNumber', desiredAmountNumber);
    position.desiredAmountNumber = desiredAmountNumber;

    debug('Высчитываем сколько лотов можно купить до желаемого таргета');
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
    const toBuyNumber = canBuyBeforeTargetNumber - position.totalPriceNumber;
    debug('toBuyNumber', toBuyNumber);
    position.toBuyNumber = toBuyNumber;

    debug('Сколько нужно купить лотов (может быть отрицательным, тогда нужно продать)');
    const toBuyLots = canBuyBeforeTargetLots - (position.amount / position.lotSize);
    debug('toBuyLots', toBuyLots);
    position.toBuyLots = toBuyLots;

    // Гарантируем минимум 1 лот для каждой позиции с положительной целевой долей
    const currentLots = position.amount / position.lotSize;
    if (Number(desiredPercent) > 0 && currentLots < 1 && position.toBuyLots < 1) {
      debug('Минимум 1 лот по стратегии: увеличиваем toBuyLots до 1', position.base);
      position.toBuyLots = 1;
      const recalculatedToBuyNumber = position.toBuyLots * position.lotPriceNumber - position.totalPriceNumber;
      position.toBuyNumber = recalculatedToBuyNumber;
    }
  }

  debug('sortedWallet', sortedWallet);

  // Порядок исполнения:
  // 1) Сначала продажи (получаем рубли)
  // 2) Затем покупки, отсортированные по стоимости лота по убыванию (дорогие сначала)
  const sellsFirst = _.filter(sortedWallet, (p: Position) => p.toBuyLots <= -1);
  const sellsSorted = _.orderBy(sellsFirst, ['toBuyNumber'], ['asc']);
  const buysOnly = _.filter(sortedWallet, (p: Position) => p.toBuyLots >= 1);
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
    const currentLots = p.amount / lotSize;
    const plannedLots = Math.sign(p.toBuyLots || 0) * Math.floor(Math.abs(p.toBuyLots || 0));
    const finalLots = currentLots + plannedLots;
    const finalAmount = finalLots * lotSize;
    const priceNum = Number(p.priceNumber) || convertTinkoffNumberToNumber(p.price);
    (p as any).__finalValue = Math.max(0, priceNum * finalAmount);
  }
  const onlySecurities = simulated.filter((p) => !(p.base && p.quote && p.base === p.quote));
  const totalFinal = _.sumBy(onlySecurities, (p: any) => Number(p.__finalValue) || 0);
  const finalPercents: Record<string, number> = {};
  if (totalFinal > 0) {
    for (const p of onlySecurities) {
      const ticker = normalizeTicker(p.base) || p.base;
      const val = Number((p as any).__finalValue) || 0;
      const pct = (val / totalFinal) * 100;
      finalPercents[ticker] = (finalPercents[ticker] || 0) + pct;
    }
  }
  
  return { finalPercents };
};
