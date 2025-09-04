import 'dotenv/config';
import { createSdk } from 'tinkoff-sdk-grpc-js/src/sdk';
// import { createSdk } from '../provider/invest-nodejs-grpc-sdk/src/sdk';
import 'mocha';
import _ from 'lodash';
import uniqid from 'uniqid';
import { OrderDirection, OrderType } from 'tinkoff-sdk-grpc-js/dist/generated/orders';
// import { OrderDirection, OrderType } from '../provider/invest-nodejs-grpc-sdk/src/generated/orders';
import { configLoader } from '../configLoader';
import { Wallet, DesiredWallet, Position, MarginPosition, MarginConfig, EnhancedBalancerResult, PositionMetrics, MarginBalancingStrategy } from '../types.d';
import { getLastPrice, generateOrders, generateOrdersSequential } from '../provider';
import { normalizeTicker, tickersEqual, MarginCalculator } from '../utils';
import { sumValues, convertNumberToTinkoffNumber, convertTinkoffNumberToNumber } from '../utils';
import { 
  identifyProfitablePositions, 
  identifyPositionsForSelling,
  calculateRequiredFunds, 
  calculateSellingAmounts 
} from '../utils/buyRequiresTotalMarginalSell';

const debug = require('debug')('bot').extend('balancer');

// const { orders, operations, marketData, users, instruments } = createSdk(process.env.TOKEN || '');

// Функция для получения конфигурации аккаунта
const getAccountConfig = () => {
  const accountId = process.env.ACCOUNT_ID || '0'; // По умолчанию используем аккаунт '0'
  const account = configLoader.getAccountById(accountId);

  if (!account) {
    // In test environment, provide a default account configuration
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'testing') {
      const config = {
        id: accountId,
        name: "Test Account",
        t_invest_token: "t.test_token",
        account_id: "test_account",
        desired_wallet: { TRUR: 25, TMOS: 25, TGLD: 25, RUB: 25 },
        desired_mode: 'manual',
        balance_interval: 3600,
        sleep_between_orders: 1000,
        margin_trading: {
          enabled: accountId.includes('margin') && !accountId.includes('no-margin'),
          multiplier: accountId.includes('margin') ? 2 : 1,
          free_threshold: 10000,
          max_margin_size: accountId.includes('margin') ? 100000 : 0,
          balancing_strategy: 'keep_if_small' as MarginBalancingStrategy,
        },
        exchange_closure_behavior: {
          mode: 'skip_iteration',
          update_iteration_result: false,
        },
      } as any;
      
      // Add buy_requires_total_marginal_sell configuration for specific test accounts
      if (accountId === 'test-buy-requires-enabled') {
        config.buy_requires_total_marginal_sell = {
          enabled: true,
          instruments: ['TMON', 'TGLD'],
          allow_to_sell_others_positions_to_buy_non_marginal_positions: {
            mode: 'only_positive_positions_sell'
          },
          min_buy_rebalance_percent: 0.5
        };
      }
      
      return config;
    }
    throw new Error(`Account with id '${accountId}' not found in CONFIG.json`);
  }

  return account;
};

/**
 * Identifies margin positions in portfolio
 */
export const identifyMarginPositions = (wallet: Wallet): MarginPosition[] => {
  // Get current account configuration
  const accountConfig = getAccountConfig();
  
  // If margin trading is disabled, return empty array
  if (!accountConfig.margin_trading.enabled) {
    return [];
  }

  const marginPositions: MarginPosition[] = [];

  for (const position of wallet) {
    // Skip positions without margin data or when value is zero/negative
    if (!position.totalPriceNumber || position.totalPriceNumber <= 0) {
      continue;
    }
    
    // Determine margin part of position
    const baseValue = position.totalPriceNumber / accountConfig.margin_trading.multiplier;
    const marginValue = position.totalPriceNumber - baseValue;
    
    // Only create margin position if there's actual margin value
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
  // Get current account configuration
  const accountConfig = getAccountConfig();
  
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
  
  // Initialize margin calculator with current config
  const marginConfig: MarginConfig = {
    multiplier: accountConfig.margin_trading.multiplier,
    freeThreshold: accountConfig.margin_trading.free_threshold,
    maxMarginSize: accountConfig.margin_trading.max_margin_size,
    ...(accountConfig.margin_trading.enabled && { strategy: accountConfig.margin_trading.balancing_strategy as MarginBalancingStrategy })
  };
  
  const marginCalculator = new MarginCalculator(marginConfig);
  
  const strategy = marginCalculator.applyMarginStrategy(
    marginPositions,
    accountConfig.margin_trading.enabled ? (accountConfig.margin_trading.balancing_strategy as MarginBalancingStrategy) : 'keep',
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
  // Get current account configuration
  const accountConfig = getAccountConfig();
  
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
  
  // Initialize margin calculator with current config
  const marginConfig: MarginConfig = {
    multiplier: accountConfig.margin_trading.multiplier,
    freeThreshold: accountConfig.margin_trading.free_threshold,
    maxMarginSize: accountConfig.margin_trading.max_margin_size,
    ...(accountConfig.margin_trading.enabled && { strategy: accountConfig.margin_trading.balancing_strategy as MarginBalancingStrategy })
  };
  
  const marginCalculator = new MarginCalculator(marginConfig);
  
  return marginCalculator.calculateOptimalPositionSizes(wallet, desiredWallet);
};


export const normalizeDesire = (desiredWallet: DesiredWallet): DesiredWallet => {
  debug('Normalizing percentages to make total sum equal 100%, to exclude human factor');
  debug('desiredWallet', desiredWallet);

  const desiredSum: number = Number(sumValues(desiredWallet));
  debug('desiredSum', desiredSum);
  
  // Handle zero sum case
  if (!desiredSum || desiredSum === 0 || !Number.isFinite(desiredSum)) {
    debug('Zero or invalid sum detected, returning original wallet');
    return desiredWallet;
  }

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

export const balancer = async (
  positions: Wallet, 
  desiredWallet: DesiredWallet,
  positionMetrics: PositionMetrics[] = [],
  modeUsed: string = 'manual',
  dryRun: boolean = false
): Promise<EnhancedBalancerResult> => {

  const walletInfo = {
    remains: 0,
  };

  const wallet = positions;

  // Get current account configuration
  const accountConfig = getAccountConfig();
  
  // Check if buy_requires_total_marginal_sell is enabled
  const buyRequiresConfig = 'buy_requires_total_marginal_sell' in accountConfig ? accountConfig.buy_requires_total_marginal_sell : undefined;
  let specialSellingPlan: Record<string, { position: Position; sellAmount: number; sellLots: number }> = {};
  
  if (buyRequiresConfig?.enabled) {
    debug('Buy requires total marginal sell is enabled, checking for special handling');
  }

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
      } else {
        // Handle case where amount is 0 (new position)
        if (desiredPercentNumber > 0) {
          debug('New position with positive target: setting toBuyLots to minimum 1', position.base);
          position.toBuyLots = Math.max(1, canBuyBeforeTargetLots);
          if (position.lotPriceNumber) {
            position.toBuyNumber = position.toBuyLots * position.lotPriceNumber;
          }
        } else {
          position.toBuyLots = 0;
          position.toBuyNumber = 0;
        }
      }
    }
  }

  // Handle buy_requires_total_marginal_sell logic
  if (buyRequiresConfig?.enabled) {
    debug('Processing buy_requires_total_marginal_sell configuration');
    
    // 1. Identify positions that can be sold based on the mode:
    //    - 'only_positive_positions_sell': only profitable positions  
    //    - 'equal_in_percents': all positions proportionally
    //    - 'none': no positions
    const sellablePositions = identifyPositionsForSelling(
      sortedWallet, 
      buyRequiresConfig,
      buyRequiresConfig.allow_to_sell_others_positions_to_buy_non_marginal_positions?.mode || 'none'
    );
    
    // 2. Calculate required funds for non-margin instrument purchases
    const requiredFunds = calculateRequiredFunds(sortedWallet, desiredMap, buyRequiresConfig);
    
    // 3. Calculate selling amounts based on the strategy
    if (buyRequiresConfig.allow_to_sell_others_positions_to_buy_non_marginal_positions) {
      // Find current RUB balance
      const rubPosition = _.find(sortedWallet, (p) => p.base === 'RUB' && p.quote === 'RUB');
      const currentRubBalance = rubPosition ? (rubPosition.totalPriceNumber || 0) : 0;
      
      debug(`🔍 CALCULATE SELLING DEBUG:`);
      debug(`   Current RUB balance: ${currentRubBalance.toFixed(2)} RUB`);
      debug(`   Required funds:`, requiredFunds);
      debug(`   Sellable positions count: ${sellablePositions.length}`);
      debug(`   Mode: ${buyRequiresConfig.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode}`);
      
      specialSellingPlan = calculateSellingAmounts(
        sellablePositions,
        requiredFunds,
        buyRequiresConfig.allow_to_sell_others_positions_to_buy_non_marginal_positions.mode,
        currentRubBalance
      );
      
      debug(`✅ Special selling plan calculated:`, specialSellingPlan);
      
      // Check if selling plan can provide enough funds (informational only)
      const totalFundsFromSelling = Object.values(specialSellingPlan).reduce((sum, plan) => sum + plan.sellAmount, 0);
      const totalFundsNeeded = Object.values(requiredFunds).reduce((sum, amount) => sum + amount, 0);
      const actualFundsNeeded = currentRubBalance < 0 
        ? Math.abs(currentRubBalance) + totalFundsNeeded
        : Math.max(0, totalFundsNeeded - currentRubBalance);
      
      if (totalFundsFromSelling < actualFundsNeeded) {
        const shortfall = actualFundsNeeded - totalFundsFromSelling;
        const shortfallPercent = (shortfall / actualFundsNeeded) * 100;
        
        debug(`⚠️  PARTIAL FUNDS WARNING:`);
        debug(`   Funds needed: ${actualFundsNeeded.toFixed(2)} RUB`);
        debug(`   Funds from selling: ${totalFundsFromSelling.toFixed(2)} RUB`);
        debug(`   Shortfall: ${shortfall.toFixed(2)} RUB (${shortfallPercent.toFixed(1)}%)`);
        
        // Allow execution even with partial funding - better than nothing
        if (shortfallPercent > 50) {
          debug(`🚨 CRITICAL: Shortfall too large (>${shortfallPercent.toFixed(1)}%), cancelling special selling plan`);
          specialSellingPlan = {};
        } else {
          debug(`📈 PROCEEDING: Shortfall acceptable (<50%), executing partial funding strategy`);
        }
      } else {
        debug(`✅ FULL FUNDING: Selling plan covers all required funds`);
      }
      
      // Adjust the toBuyLots and toBuyNumber for positions that need to be sold
      for (const [ticker, sellPlan] of Object.entries(specialSellingPlan)) {
        const positionIndex = _.findIndex(sortedWallet, (p: Position) => 
          tickersEqual(p.base || '', ticker)
        );
        
        if (positionIndex !== -1) {
          const position = sortedWallet[positionIndex];
          // Update the position to reflect the planned selling
          if (position.toBuyLots !== undefined) {
            position.toBuyLots -= sellPlan.sellLots;
          }
          if (position.toBuyNumber !== undefined) {
            position.toBuyNumber -= sellPlan.sellAmount;
          }
          debug(`Adjusted selling plan for ${ticker}: ${sellPlan.sellLots} lots, ${sellPlan.sellAmount.toFixed(2)} RUB`);
        }
      }
    }
  }

  debug('sortedWallet', sortedWallet);
  debug('specialSellingPlan', specialSellingPlan);

  // Execution order:
  // 1) First sales (get rubles) - but only for profitable positions if buy_requires_total_marginal_sell is enabled
  // 2) Then purchases of non-margin instruments first (if buy_requires_total_marginal_sell is enabled)
  // 3) Then remaining sales
  // 4) Then remaining purchases
  
  let sellsFirst: Position[] = [];
  let buysNonMarginFirst: Position[] = [];
  let remainingSells: Position[] = [];
  let remainingBuys: Position[] = [];
  
  if (buyRequiresConfig?.enabled) {
    // Separate non-margin instrument purchases to be executed first
    const nonMarginInstruments = buyRequiresConfig.instruments || [];
    
    buysNonMarginFirst = _.filter(sortedWallet, (p) => {
      return p.toBuyLots && p.toBuyLots >= 1 && 
             nonMarginInstruments.some((instrument: string) => tickersEqual(p.base || '', instrument));
    }) as Position[];
    
    // Sales for funding non-margin purchases - only sell positions identified in specialSellingPlan
    sellsFirst = _.filter(sortedWallet, (p) => {
      return p.toBuyLots && p.toBuyLots <= -1 && 
             Object.keys(specialSellingPlan).some((ticker: string) => tickersEqual(p.base || '', ticker));
    }) as Position[];
    
    // Remaining sales (not part of special selling plan)
    remainingSells = _.filter(sortedWallet, (p) => {
      return p.toBuyLots && p.toBuyLots <= -1 && 
             !Object.keys(specialSellingPlan).some((ticker: string) => tickersEqual(p.base || '', ticker));
    }) as Position[];
    
    // Remaining purchases (excluding non-margin instruments already handled)
    remainingBuys = _.filter(sortedWallet, (p) => {
      return p.toBuyLots && p.toBuyLots >= 1 && 
             !nonMarginInstruments.some((instrument: string) => tickersEqual(p.base || '', instrument));
    }) as Position[];
  } else {
    // Normal execution order when buy_requires_total_marginal_sell is not enabled
    sellsFirst = _.filter(sortedWallet, (p) => (p.toBuyLots || 0) <= -1) as Position[];
    remainingBuys = _.filter(sortedWallet, (p) => (p.toBuyLots || 0) >= 1) as Position[];
  }
  
  const sellsSorted = _.orderBy(sellsFirst, ['toBuyNumber'], ['asc']);
  const buysNonMarginSorted = _.orderBy(buysNonMarginFirst, ['lotPriceNumber'], ['desc']);
  const remainingSellsSorted = _.orderBy(remainingSells, ['toBuyNumber'], ['asc']);
  const remainingBuysSorted = _.orderBy(remainingBuys, ['lotPriceNumber'], ['desc']);
  
  // Execution order according to TZ (Technical Specification):
  // CRITICAL FIX: Sales must execute BEFORE purchases to provide funds!
  // 1) First sales for funding non-margin purchases (sellsFirst) - get RUB for buying
  // 2) Then purchases of non-margin instruments (buysNonMarginFirst) - buy with obtained RUB
  // 3) Then remaining sales (remainingSells)
  // 4) Then remaining purchases (remainingBuys)
  const ordersPlanned = [...sellsSorted, ...buysNonMarginSorted, ...remainingSellsSorted, ...remainingBuysSorted];
  debug('ordersPlanned', ordersPlanned);

  debug('walletInfo', walletInfo);

  if (!dryRun) {
    if (buyRequiresConfig?.enabled && (sellsFirst.length > 0 || buysNonMarginFirst.length > 0)) {
      debug('🔄 Using SEQUENTIAL execution for buy_requires_total_marginal_sell feature');
      debug(`Sequential execution phases: ${sellsFirst.length} sells first, ${buysNonMarginFirst.length} non-margin buys, ${remainingSells.length + remainingBuys.length} remaining`);
      await generateOrdersSequential(sellsFirst, buysNonMarginFirst, [...remainingSellsSorted, ...remainingBuysSorted]);
    } else {
      debug('Creating necessary orders for all positions (normal mode)');
      await generateOrders(ordersPlanned);
    }
  } else {
    debug('Dry-run mode: Skipping order generation. Orders that would be placed:', ordersPlanned.length);
    for (const order of ordersPlanned) {
      if (order.base && order.toBuyLots) {
        const action = order.toBuyLots > 0 ? 'BUY' : 'SELL';
        const lots = Math.abs(order.toBuyLots);
        debug(`Dry-run: ${action} ${lots} lots of ${order.base}`);
      }
    }
  }
  
  // Подсчёт итоговых процентных долей бумаг после выставления ордеров (по плану ордеров)
  // Исключаем валюты (base === quote)
  const simulated = _.cloneDeep(sortedWallet) as Position[];
  for (const p of simulated) {
    if (p.base && p.quote && p.base === p.quote) continue;
    const lotSize = Number(p.lotSize) || 1;
    // Handle both existing positions and newly created positions
    const currentAmount = p.amount || 0;
    const currentLots = currentAmount / lotSize;
    const plannedLots = Math.sign(p.toBuyLots || 0) * Math.floor(Math.abs(p.toBuyLots || 0));
    const finalLots = currentLots + plannedLots;
    const finalAmount = finalLots * lotSize;
    const priceNum = Number(p.priceNumber) || (p.price ? convertTinkoffNumberToNumber(p.price) : 0);
    (p as any).__finalValue = Math.max(0, priceNum * finalAmount);
    debug(`Final calculation for ${p.base}: currentLots=${currentLots}, plannedLots=${plannedLots}, finalLots=${finalLots}, finalValue=${(p as any).__finalValue}`);
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
  
  // Calculate total portfolio value
  const totalPortfolioValue = wallet.reduce((sum, pos) => sum + (pos.totalPriceNumber || 0), 0);
  
  // Get current account configuration for margin info
  const currentMarginPositions = identifyMarginPositions(wallet);
  
  let marginLimits = { totalMarginUsed: 0, isValid: true };
  if (accountConfig.margin_trading.enabled) {
    // Initialize margin calculator with current config
    const marginConfig: MarginConfig = {
      multiplier: accountConfig.margin_trading.multiplier,
      freeThreshold: accountConfig.margin_trading.free_threshold,
      maxMarginSize: accountConfig.margin_trading.max_margin_size,
      ...(accountConfig.margin_trading.enabled && { strategy: accountConfig.margin_trading.balancing_strategy as MarginBalancingStrategy })
    };
    
    const marginCalculator = new MarginCalculator(marginConfig);
    marginLimits = marginCalculator.validateMarginLimits(currentMarginPositions);
  }
  
  // Build enhanced result
  const enhancedResult: EnhancedBalancerResult = {
    finalPercents,
    modeUsed: modeUsed as any,
    positionMetrics,
    totalPortfolioValue,
    marginInfo: accountConfig.margin_trading.enabled ? {
      totalMarginUsed: marginLimits.totalMarginUsed,
      marginPositions: currentMarginPositions,
      withinLimits: marginLimits.isValid
    } : undefined,
    ordersPlanned
  };
  
  return enhancedResult;
};
