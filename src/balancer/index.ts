import 'dotenv/config';
import { createSdk } from 'tinkoff-sdk-grpc-js/src/sdk';
// import { createSdk } from '../provider/invest-nodejs-grpc-sdk/src/sdk';
import 'mocha';
import _ from 'lodash';
import uniqid from 'uniqid';
import { OrderDirection, OrderType } from 'tinkoff-sdk-grpc-js/dist/generated/orders';
// import { OrderDirection, OrderType } from '../provider/invest-nodejs-grpc-sdk/src/generated/orders';
import { configLoader } from '../configLoader';
import { Wallet, DesiredWallet, Position, MarginPosition, MarginConfig } from '../types.d';
import { getLastPrice, generateOrders } from '../provider';
import { normalizeTicker, tickersEqual, MarginCalculator, calculatePositionProfit } from '../utils';
import { sumValues, convertNumberToTinkoffNumber, convertTinkoffNumberToNumber } from '../utils';

const debug = require('debug')('bot').extend('balancer');

// const { orders, operations, marketData, users, instruments } = createSdk(process.env.TOKEN || '');

// Функция для получения конфигурации аккаунта
const getAccountConfig = () => {
  const accountId = process.env.ACCOUNT_ID || '0'; // По умолчанию используем аккаунт '0'
  const account = configLoader.getAccountById(accountId);

  if (!account) {
    throw new Error(`Account with id '${accountId}' not found in CONFIG.json`);
  }

  return account;
};

// Получаем конфигурацию аккаунта
const accountConfig = getAccountConfig();

// Initialize margin calculator
const marginConfig: MarginConfig = {
  multiplier: accountConfig.margin_trading.multiplier,
  freeThreshold: accountConfig.margin_trading.free_threshold,
  ...(accountConfig.margin_trading.enabled && { strategy: accountConfig.margin_trading.balancing_strategy })
};

const marginCalculator = new MarginCalculator(marginConfig);

/**
 * Identifies margin positions in portfolio
 */
export const identifyMarginPositions = (wallet: Wallet): MarginPosition[] => {
  // If margin trading is disabled, return empty array
  if (!accountConfig.margin_trading.enabled) {
    return [];
  }

  const marginPositions: MarginPosition[] = [];

  for (const position of wallet) {
    if (position.totalPriceNumber && position.totalPriceNumber > 0) {
      // Determine margin part of position
      const baseValue = position.totalPriceNumber / accountConfig.margin_trading.multiplier;
      const marginValue = position.totalPriceNumber - baseValue;
      
      if (marginValue > 0) {
        const marginPosition: MarginPosition = {
          ...position,
          isMargin: true,
          marginValue,
          leverage: accountConfig.margin_trading.multiplier,
          marginCall: false
        };
        marginPositions.push(marginPosition);
      }
    }
  }
  
  return marginPositions;
};

/**
 * Applies margin position management strategy
 */
export const applyMarginStrategy = (wallet: Wallet, currentTime: Date = new Date()): {
  shouldRemoveMargin: boolean;
  reason: string;
  transferCost: number;
  marginPositions: MarginPosition[];
} => {
  // If margin trading is disabled, return result without margin
  if (!accountConfig.margin_trading.enabled) {
    return {
      shouldRemoveMargin: false,
      reason: 'Margin trading disabled',
      transferCost: 0,
      marginPositions: []
    };
  }
  
  const marginPositions = identifyMarginPositions(wallet);
  
  if (marginPositions.length === 0) {
    return {
      shouldRemoveMargin: false,
      reason: 'No margin positions',
      transferCost: 0,
      marginPositions: []
    };
  }
  
  const strategy = marginCalculator.applyMarginStrategy(
    marginPositions,
    accountConfig.margin_trading.enabled ? accountConfig.margin_trading.balancing_strategy : 'keep',
    currentTime
  );
  
  return {
    ...strategy,
    marginPositions
  };
};

/**
 * Calculates optimal position sizes considering multiplier
 */
export const calculateOptimalSizes = (wallet: Wallet, desiredWallet: DesiredWallet) => {
  // If margin trading is disabled, return sizes without margin
  if (!accountConfig.margin_trading.enabled) {
    const totalPortfolioValue = wallet.reduce((sum, pos) => sum + (pos.totalPriceNumber || 0), 0);
    const result: Record<string, { baseSize: number; marginSize: number; totalSize: number }> = {};

    for (const [ticker, percentage] of Object.entries(desiredWallet)) {
      const targetValue = (totalPortfolioValue * percentage) / 100;
      result[ticker] = {
        baseSize: targetValue,
        marginSize: 0,
        totalSize: targetValue
      };
    }

    return result;
  }
  
  return marginCalculator.calculateOptimalPositionSizes(wallet, desiredWallet);
};

/**
 * Filters positions for selling based on profit threshold
 * @param positions - Positions to filter
 * @param minProfitPercent - Minimum profit percentage threshold
 * @returns Array of positions that meet the profit threshold or don't have profit data
 */
export const filterPositionsForSelling = (positions: Position[], minProfitPercent?: number): Position[] => {
  if (minProfitPercent === undefined) {
    debug('No profit threshold configured, allowing all positions for selling');
    return positions;
  }

  const filtered = positions.filter(position => {
    // Skip currency positions (RUB/RUB) - they don't have profit/loss concept
    if (position.base === position.quote) {
      return true;
    }

    const profitInfo = calculatePositionProfit(position, minProfitPercent);

    if (!profitInfo) {
      debug(`No profit data for ${position.base}, allowing sale (insufficient data)`);
      return true; // Allow selling if we can't calculate profit
    }

    const meetsThreshold = profitInfo.meetsThreshold;
    debug(`Position ${position.base}: profit ${profitInfo.profitPercent.toFixed(2)}%, threshold ${minProfitPercent}%, meets: ${meetsThreshold}`);

    return meetsThreshold;
  });

  const blockedCount = positions.length - filtered.length;
  if (blockedCount > 0) {
    debug(`Blocked ${blockedCount} positions from selling due to profit threshold`);
  }

  return filtered;
};


export const normalizeDesire = (desiredWallet: DesiredWallet): DesiredWallet => {
  debug('Normalizing percentages to make total sum equal 100%, to exclude human factor');
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

  // Applies margin position management strategy
  const marginStrategy = applyMarginStrategy(wallet);
  debug('Margin strategy:', marginStrategy);

  if (marginStrategy.shouldRemoveMargin) {
    debug(`Applying strategy: ${marginStrategy.reason}`);
    debug(`Transfer cost: ${marginStrategy.transferCost.toFixed(2)} RUB`);

    // Here you can add logic for closing margin positions
    // or transferring them to the next day
  }

  const normalizedDesire = normalizeDesire(desiredWallet);

  // Bring ticker keys to aliases (e.g., TRAY -> TPAY) and re-normalize
  const desiredAliased = Object.entries(normalizedDesire).reduce((acc: any, [k, v]) => {
    const nk = normalizeTicker(k) || k;
    acc[nk] = (acc[nk] || 0) + Number(v);
    return acc;
  }, {} as Record<string, number>);
  const desiredMap = desiredAliased; // Remove repeated normalization

  debug('Adding missing instruments from portfolio to DesireWallet with value 0');
  for (const position of wallet) {
    if (position.base) {
      const baseNormalized = normalizeTicker(position.base) || position.base;
      if (desiredMap[baseNormalized] === undefined) {
        debug(`${position.base} not found in desired portfolio, adding with value 0.`);
        desiredMap[baseNormalized] = 0;
      }
    }
  }

  for (const [desiredTickerRaw, desiredPercent] of Object.entries(desiredMap)) {
    const desiredTicker = normalizeTicker(desiredTickerRaw) || desiredTickerRaw;
    const desiredPercentNumber = Number(desiredPercent);
    debug(' Looking for base (ticker) in wallet');
    const positionIndex = _.findIndex(wallet, (p: any) => tickersEqual(p.base, desiredTicker));
    debug('positionIndex', positionIndex);

    if (positionIndex === -1) {
      debug('Ticker from DesireWallet not found in portfolio. Creating.');

      const findedInstumentByTicker = _.find((global as any).INSTRUMENTS, (i: any) => tickersEqual(i.ticker, desiredTicker));
      debug(findedInstumentByTicker);

      const figi = findedInstumentByTicker?.figi;
      debug(figi);

      const lotSize = findedInstumentByTicker?.lot;
      debug(lotSize);

      if (!findedInstumentByTicker || !figi || !lotSize) {
        debug(`Instrument for ticker ${desiredTicker} not found in INSTRUMENTS. Skipping addition.`);
        continue;
      }

      const lastPrice = await getLastPrice(figi); // sleep is inside
      if (!lastPrice) {
        debug(`Could not get lastPrice for ${desiredTicker}/${figi}. Skipping addition.`);
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

  debug('Calculating totalPrice');
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

  debug('Summing up all positions in portfolio');
  const walletSumNumber = _.sumBy(sortedWallet, 'totalPriceNumber');
  debug(sortedWallet);
  debug('walletSumNumber', walletSumNumber);

  // Calculate optimal position sizes considering multiplier
  const optimalSizes = calculateOptimalSizes(sortedWallet, desiredMap);
  debug('Optimal position sizes:', optimalSizes);

  for (const [desiredTickerRaw, desiredPercent] of Object.entries(desiredMap)) {
    const desiredTicker = normalizeTicker(desiredTickerRaw) || desiredTickerRaw;
    const desiredPercentNumber = Number(desiredPercent);
    debug(' Looking for base (ticker) in wallet');
    const positionIndex = _.findIndex(sortedWallet, (p: any) => tickersEqual(p.base, desiredTicker));
    debug('positionIndex', positionIndex);

    // TODO:
    // const position: Position;
    // if (positionIndex === -1) {
    //   debug('Ticker from DesireWallet not found in portfolio. Creating.');
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
      debug(`Ticker ${desiredTicker} is missing from wallet after preparation. Skipping calculation for it.`);
      continue;
    }

    const position: Position = sortedWallet[positionIndex];
    debug('position', position);

    debug('Calculating how many rubles the desired share will be with multiplier');
    debug('walletSumNumber', walletSumNumber);
    debug('desiredPercent', desiredPercentNumber);
    
    // Use optimal sizes considering multiplier
    const optimalSize = optimalSizes[desiredTicker];
    const desiredAmountNumber = optimalSize ? optimalSize.totalSize : (walletSumNumber / 100 * desiredPercentNumber);
    
    debug('desiredAmountNumber (considering multiplier)', desiredAmountNumber);
    position.desiredAmountNumber = desiredAmountNumber;

    debug('Calculating how many lots can be bought before desired target');
    if (position.lotPriceNumber) {
      const canBuyBeforeTargetLots = Math.trunc(desiredAmountNumber / position.lotPriceNumber);
      debug('canBuyBeforeTargetLots', canBuyBeforeTargetLots);
      position.canBuyBeforeTargetLots = canBuyBeforeTargetLots;

      debug('Calculating cost of position that can be bought before desired target');
      const canBuyBeforeTargetNumber = canBuyBeforeTargetLots * position.lotPriceNumber;
      debug('canBuyBeforeTargetNumber', canBuyBeforeTargetNumber);
      position.canBuyBeforeTargetNumber = canBuyBeforeTargetNumber;

      debug('Calculating difference between desired value and value before target. Unallocated remainder.');
      const beforeDiffNumber = Math.abs(desiredAmountNumber - canBuyBeforeTargetNumber);
      debug('beforeDiffNumber', beforeDiffNumber);
      position.beforeDiffNumber = beforeDiffNumber;

      debug('Summing up remainders'); // TODO: need to determine currency and write remainder in that currency
      walletInfo.remains += beforeDiffNumber; // Only in rubles for now

      debug('How much to buy (can be negative, then need to sell)');
      if (position.totalPriceNumber) {
        const toBuyNumber = canBuyBeforeTargetNumber - position.totalPriceNumber;
        debug('toBuyNumber', toBuyNumber);
        position.toBuyNumber = toBuyNumber;
      }

      debug('How many lots to buy (can be negative, then need to sell)');
      if (position.amount && position.lotSize) {
        const toBuyLots = canBuyBeforeTargetLots - (position.amount / position.lotSize);
        debug('toBuyLots', toBuyLots);
        position.toBuyLots = toBuyLots;

        // Guarantee minimum 1 lot for each position with positive target share
        const currentLots = position.amount / position.lotSize;
        if (desiredPercentNumber > 0 && currentLots < 1 && position.toBuyLots < 1) {
          debug('Minimum 1 lot by strategy: increasing toBuyLots to 1', position.base);
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

  // Execution order:
  // 1) First sales (get rubles) - filtered by profit threshold
  // 2) Then purchases, sorted by lot cost in descending order (expensive first)
  const sellsFirst = _.filter(sortedWallet, (p: Position) => (p.toBuyLots || 0) <= -1);

  // Apply profit threshold filtering to selling positions
  const sellsFiltered = filterPositionsForSelling(sellsFirst, accountConfig.min_profit_percent_for_close_position);
  const sellsSorted = _.orderBy(sellsFiltered, ['toBuyNumber'], ['asc']);

  // Purchases are not affected by profit threshold
  const buysOnly = _.filter(sortedWallet, (p: Position) => (p.toBuyLots || 0) >= 1);
  const buysSortedByLotDesc = _.orderBy(buysOnly, ['lotPriceNumber'], ['desc']);
  const ordersPlanned = [...sellsSorted, ...buysSortedByLotDesc];
  debug('ordersPlanned', ordersPlanned);

  debug('walletInfo', walletInfo);

  debug('Creating necessary orders for all positions');
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
