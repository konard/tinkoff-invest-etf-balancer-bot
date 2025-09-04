import { Wallet, Position, BuyRequiresTotalMarginalSellConfig } from '../types.d';
import { convertTinkoffNumberToNumber } from '../utils';
import _ from 'lodash';
import { normalizeTicker, tickersEqual } from '../utils';

const debug = require('debug')('bot:balancer');

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
 * Identifies positions that can be sold based on the selling strategy mode
 * @param wallet - Current portfolio positions
 * @param config - Buy requires total marginal sell configuration
 * @param mode - Selling strategy mode
 * @returns Array of positions that can be sold
 */
export const identifyPositionsForSelling = (
  wallet: Wallet, 
  config: BuyRequiresTotalMarginalSellConfig, 
  mode: string
): Position[] => {
  debug(`Identifying positions for selling using mode: ${mode}`);
  
  if (!config.enabled) {
    debug('Buy requires total marginal sell is disabled');
    return [];
  }
  
  const sellablePositions: Position[] = [];
  
  for (const position of wallet) {
    // Skip currency positions
    if (position.base === position.quote) {
      continue;
    }
    
    // Skip positions with no holdings
    if (!position.amount || position.amount <= 0) {
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
    
    switch (mode) {
      case 'only_positive_positions_sell':
        // Only profitable positions
        const profitInfo = calculatePositionProfit(position);
        if (profitInfo && profitInfo.profitAmount > 0) {
          debug(`Found profitable position for selling: ${position.base} with profit ${profitInfo.profitAmount.toFixed(2)} RUB`);
          sellablePositions.push(position);
        }
        break;
        
      case 'equal_in_percents':
        // All positions (proportionally)
        debug(`Found position for proportional selling: ${position.base} with value ${position.totalPriceNumber?.toFixed(2) || 0} RUB`);
        sellablePositions.push(position);
        break;
        
      case 'none':
        // Do not sell any positions
        debug('Mode is "none", not selecting any positions for selling');
        break;
        
      default:
        debug(`Unknown selling mode: ${mode}`);
    }
  }
  
  debug(`Found ${sellablePositions.length} positions available for selling in mode: ${mode}`);
  return sellablePositions;
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
 * @param currentRubBalance - Current RUB balance (can be negative)
 * @returns Map of positions and amounts to sell
 */
export const calculateSellingAmounts = (
  profitablePositions: Position[],
  requiredFunds: Record<string, number>,
  mode: string,
  currentRubBalance: number = 0
): Record<string, { position: Position; sellAmount: number; sellLots: number }> => {
  debug(`Calculating selling amounts using mode: ${mode}`);
  
  const sellingPlan: Record<string, { position: Position; sellAmount: number; sellLots: number }> = {};
  
  // Calculate total funds needed for purchases
  const fundsNeededForPurchases = Object.values(requiredFunds).reduce((sum, amount) => sum + amount, 0);
  
  // If RUB balance is negative, we need to cover the deficit plus the purchase amount
  // If RUB balance is positive and sufficient, we might not need to sell anything
  const totalFundsNeeded = currentRubBalance < 0 
    ? Math.abs(currentRubBalance) + fundsNeededForPurchases  // Cover deficit + purchase
    : Math.max(0, fundsNeededForPurchases - currentRubBalance);  // Only what's missing
    
  debug(`🔍 CALCULATE SELLING AMOUNTS INTERNAL:`);
  debug(`   Current RUB balance: ${currentRubBalance.toFixed(2)} RUB`);
  debug(`   Funds needed for purchases: ${fundsNeededForPurchases.toFixed(2)} RUB`);
  debug(`   Total funds needed to sell: ${totalFundsNeeded.toFixed(2)} RUB`);
  debug(`   Profitable positions available: ${profitablePositions.length}`);
  profitablePositions.forEach((pos, i) => {
    debug(`     ${i+1}. ${pos.base}: ${pos.totalPriceNumber?.toFixed(2) || 0} RUB (${pos.amount} lots × ${pos.lotPriceNumber?.toFixed(2) || 0})`);
  });
  
  if (totalFundsNeeded <= 0) {
    debug('No funds needed, returning empty selling plan');
    return sellingPlan;
  }
  
  // Check if we have enough profitable positions to cover the required funds
  const totalAvailableFunds = profitablePositions.reduce((sum, pos) => sum + (pos.totalPriceNumber || 0), 0);
  debug(`   Total funds available from profitable positions: ${totalAvailableFunds.toFixed(2)} RUB`);
  
  if (totalAvailableFunds < totalFundsNeeded) {
    debug(`⚠️  INSUFFICIENT FUNDS WARNING:`);
    debug(`   Need: ${totalFundsNeeded.toFixed(2)} RUB`);
    debug(`   Available: ${totalAvailableFunds.toFixed(2)} RUB`);
    debug(`   Shortfall: ${(totalFundsNeeded - totalAvailableFunds).toFixed(2)} RUB`);
    debug(`   Will sell all available profitable positions but may not cover full amount needed`);
    debug(`💡 POSSIBLE SOLUTIONS:`);
    debug(`   1. Wait for more positions to become profitable`);
    debug(`   2. Add funds to account to cover the shortfall`);
    debug(`   3. Reduce the min_buy_rebalance_percent threshold`);
    debug(`   4. Temporarily disable buy_requires_total_marginal_sell feature`);
  }
  
  let fundsToRaise = totalFundsNeeded;
  
  switch (mode) {
    case 'only_positive_positions_sell':
      // Sell profitable positions until we have enough funds
      for (const position of profitablePositions) {
        if (fundsToRaise <= 0) break;
        
        // Calculate minimum lots needed to cover the required funds
        const maxPositionValue = position.totalPriceNumber || 0;
        
        if (maxPositionValue > 0 && position.lotPriceNumber && position.lotPriceNumber > 0) {
          // We need to sell enough lots to cover fundsToRaise, so use Math.ceil
          const minLotsNeeded = Math.ceil(fundsToRaise / position.lotPriceNumber);
          const maxLotsAvailable = Math.floor(maxPositionValue / position.lotPriceNumber);
          const sellLots = Math.min(minLotsNeeded, maxLotsAvailable);
          const actualSellAmount = sellLots * position.lotPriceNumber;
          
          if (sellLots > 0) {
            sellingPlan[position.base || 'unknown'] = {
              position,
              sellAmount: actualSellAmount,
              sellLots
            };
            
            fundsToRaise -= actualSellAmount;
            debug(`✅ Planning to sell ${sellLots} lots of ${position.base} for ${actualSellAmount.toFixed(2)} RUB (remaining needed: ${fundsToRaise.toFixed(2)} RUB)`);
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