import { Wallet, Position, BuyRequiresTotalMarginalSellConfig } from '../types.d';
import { convertTinkoffNumberToNumber } from '../utils';
import _ from 'lodash';
import { normalizeTicker, tickersEqual } from '../utils';

const debug = require('debug')('bot').extend('buyRequiresTotalMarginalSell');

/**
 * Calculates profit for a position
 * @param position - The position to calculate profit for
 * @returns Profit amount and percentage, or null if cannot calculate
 */
export const calculatePositionProfit = (position: Position): { profitAmount: number; profitPercent: number } | null => {
  // Need both current value and original cost to calculate profit
  if (!position.totalPriceNumber || position.totalPriceNumber <= 0) {
    return null;
  }

  // For positions with amount = 0 (no current holdings), there's no profit to calculate
  if (!position.amount || position.amount <= 0) {
    return null;
  }

  // Calculate original purchase cost using averagePositionPriceFifo if available
  // This represents the actual purchase cost of the position
  let originalPurchaseCost = 0;
  
  // Use averagePositionPriceFifo as it represents the actual purchase cost
  // If not available, fall back to averagePositionPrice
  // If neither is available, we cannot calculate profit accurately
  if (position.averagePositionPriceFifoNumber) {
    originalPurchaseCost = position.averagePositionPriceFifoNumber * (position.amount || 0);
  } else if (position.averagePositionPriceNumber) {
    originalPurchaseCost = position.averagePositionPriceNumber * (position.amount || 0);
  } else {
    // If we don't have purchase price data, we cannot determine profit
    return null;
  }
  
  const profitAmount = position.totalPriceNumber - originalPurchaseCost;
  const profitPercent = (profitAmount / originalPurchaseCost) * 100;
  
  // Only return profitable positions (positive profit)
  if (profitAmount <= 0) {
    return null;
  }
  
  return {
    profitAmount,
    profitPercent
  };
};

/**
 * Identifies profitable positions that can be sold to fund non-margin instrument purchases
 * @param wallet - Current portfolio positions
 * @param config - Buy requires total marginal sell configuration
 * @returns Array of profitable positions sorted by profit amount
 */
export const identifyProfitablePositions = (wallet: Wallet, config: BuyRequiresTotalMarginalSellConfig): Position[] => {
  debug('Identifying profitable positions to fund non-margin instrument purchases');
  
  if (!config.enabled) {
    debug('Buy requires total marginal sell is disabled');
    return [];
  }
  
  const profitablePositions: { position: Position; profitAmount: number }[] = [];
  
  for (const position of wallet) {
    // Skip currency positions
    if (position.base === position.quote) {
      continue;
    }
    
    // Skip positions that are in the non-margin instruments list
    const isNonMarginInstrument = config.instruments.some(instrument => 
      tickersEqual(instrument, position.base || '')
    );
    
    if (isNonMarginInstrument) {
      debug(`Skipping ${position.base} as it's in the non-margin instruments list`);
      continue;
    }
    
    // Calculate profit for this position
    const profitInfo = calculatePositionProfit(position);
    
    if (profitInfo && profitInfo.profitAmount > 0) {
      debug(`Found profitable position: ${position.base} with profit ${profitInfo.profitAmount.toFixed(2)} RUB (${profitInfo.profitPercent.toFixed(2)}%)`);
      profitablePositions.push({
        position,
        profitAmount: profitInfo.profitAmount
      });
    }
  }
  
  // Sort by profit amount (descending)
  const sortedPositions = _.orderBy(profitablePositions, ['profitAmount'], ['desc']);
  
  debug(`Found ${sortedPositions.length} profitable positions`);
  return sortedPositions.map(item => item.position);
};

/**
 * Calculates required funds for purchasing non-margin instruments
 * @param wallet - Current portfolio positions
 * @param desiredWallet - Target portfolio allocation
 * @param config - Buy requires total marginal sell configuration
 * @returns Map of instruments and required funds
 */
export const calculateRequiredFunds = (
  wallet: Wallet, 
  desiredWallet: Record<string, number>,
  config: BuyRequiresTotalMarginalSellConfig
): Record<string, number> => {
  debug('Calculating required funds for non-margin instrument purchases');
  
  const requiredFunds: Record<string, number> = {};
  
  if (!config.enabled) {
    debug('Buy requires total marginal sell is disabled');
    return requiredFunds;
  }
  
  // For each non-margin instrument in the configuration
  for (const instrument of config.instruments) {
    // Check if this instrument is in the desired wallet
    if (!(instrument in desiredWallet)) {
      debug(`Instrument ${instrument} not found in desired wallet, skipping`);
      continue;
    }
    
    // Find the position for this instrument
    const positionIndex = _.findIndex(wallet, (p: Position) => 
      tickersEqual(p.base || '', instrument)
    );
    
    if (positionIndex === -1) {
      debug(`Position for ${instrument} not found in wallet`);
      continue;
    }
    
    const position = wallet[positionIndex];
    
    // Check if we need to buy this instrument
    if (position.toBuyNumber && position.toBuyNumber > 0) {
      // Only proceed if the purchase amount exceeds the minimum threshold
      // The threshold is calculated as a percentage of the total portfolio value
      const totalPortfolioValue = wallet.reduce((sum, pos) => sum + (pos.totalPriceNumber || 0), 0);
      const thresholdAmount = totalPortfolioValue * (config.min_buy_rebalance_percent / 100);
      
      debug(`Threshold for ${instrument}: ${thresholdAmount.toFixed(2)} RUB (portfolio value: ${totalPortfolioValue.toFixed(2)} RUB, min_percent: ${config.min_buy_rebalance_percent}%)`);
      
      if (Math.abs(position.toBuyNumber) >= thresholdAmount) {
        requiredFunds[instrument] = Math.abs(position.toBuyNumber);
        debug(`Need to buy ${instrument}: ${requiredFunds[instrument].toFixed(2)} RUB (threshold: ${thresholdAmount.toFixed(2)} RUB)`);
      } else {
        debug(`Purchase of ${instrument} below threshold: ${Math.abs(position.toBuyNumber).toFixed(2)} RUB (threshold: ${thresholdAmount.toFixed(2)} RUB)`);
      }
    }
  }
  
  return requiredFunds;
};

/**
 * Calculates selling amounts for profitable positions to fund purchases
 * @param profitablePositions - Positions that can be sold
 * @param requiredFunds - Funds needed for purchases
 * @param mode - Selling strategy mode
 * @returns Map of positions and amounts to sell
 */
export const calculateSellingAmounts = (
  profitablePositions: Position[],
  requiredFunds: Record<string, number>,
  mode: string
): Record<string, { position: Position; sellAmount: number; sellLots: number }> => {
  debug(`Calculating selling amounts using mode: ${mode}`);
  
  const sellingPlan: Record<string, { position: Position; sellAmount: number; sellLots: number }> = {};
  
  // Calculate total funds needed
  const totalFundsNeeded = Object.values(requiredFunds).reduce((sum, amount) => sum + amount, 0);
  debug(`Total funds needed: ${totalFundsNeeded.toFixed(2)} RUB`);
  
  if (totalFundsNeeded <= 0) {
    debug('No funds needed, returning empty selling plan');
    return sellingPlan;
  }
  
  let fundsToRaise = totalFundsNeeded;
  
  switch (mode) {
    case 'only_positive_positions_sell':
      // Sell profitable positions until we have enough funds
      for (const position of profitablePositions) {
        if (fundsToRaise <= 0) break;
        
        // Calculate maximum amount we can sell from this position
        const maxSellAmount = Math.min(
          position.totalPriceNumber || 0,
          fundsToRaise
        );
        
        if (maxSellAmount > 0 && position.lotPriceNumber && position.lotPriceNumber > 0) {
          const sellLots = Math.floor(maxSellAmount / position.lotPriceNumber);
          const actualSellAmount = sellLots * position.lotPriceNumber;
          
          if (sellLots > 0) {
            sellingPlan[position.base || 'unknown'] = {
              position,
              sellAmount: actualSellAmount,
              sellLots
            };
            
            fundsToRaise -= actualSellAmount;
            debug(`Planning to sell ${sellLots} lots of ${position.base} for ${actualSellAmount.toFixed(2)} RUB`);
          }
        }
      }
      break;
      
    case 'equal_in_percents':
      // Sell proportionally from all profitable positions
      // Calculate total value of all profitable positions
      const totalProfitableValue = profitablePositions.reduce(
        (sum, pos) => sum + (pos.totalPriceNumber || 0),
        0
      );
      
      if (totalProfitableValue > 0) {
        for (const position of profitablePositions) {
          if (fundsToRaise <= 0) break;
          
          // Calculate proportional share of this position
          const positionShare = (position.totalPriceNumber || 0) / totalProfitableValue;
          const targetSellAmount = Math.min(
            positionShare * totalFundsNeeded,
            position.totalPriceNumber || 0,
            fundsToRaise
          );
          
          if (targetSellAmount > 0 && position.lotPriceNumber && position.lotPriceNumber > 0) {
            const sellLots = Math.floor(targetSellAmount / position.lotPriceNumber);
            const actualSellAmount = sellLots * position.lotPriceNumber;
            
            if (sellLots > 0) {
              sellingPlan[position.base || 'unknown'] = {
                position,
                sellAmount: actualSellAmount,
                sellLots
              };
              
              fundsToRaise -= actualSellAmount;
              debug(`Planning to sell ${sellLots} lots of ${position.base} for ${actualSellAmount.toFixed(2)} RUB (proportional)`);
            }
          }
        }
      }
      break;
      
    case 'none':
      // Do not sell any positions
      debug('Selling mode is "none", not selling any positions');
      break;
      
    default:
      debug(`Unknown selling mode: ${mode}`);
  }
  
  debug(`Funds still needed after selling: ${fundsToRaise.toFixed(2)} RUB`);
  
  return sellingPlan;
};