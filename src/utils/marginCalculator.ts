import { Position, MarginPosition, MarginConfig, MarginBalancingStrategy } from '../types.d';
import { convertTinkoffNumberToNumber } from './index';

/**
 * Margin trading calculator
 */
export class MarginCalculator {
  private config: MarginConfig;

  constructor(config: MarginConfig) {
    this.config = config;
  }

  /**
   * Calculates available margin for portfolio
   */
  calculateAvailableMargin(portfolio: Position[]): number {
    const totalValue = portfolio.reduce((sum, position) => {
      return sum + (position.totalPriceNumber || 0);
    }, 0);

    // Available margin = total value * (multiplier - 1)
    return totalValue * (this.config.multiplier - 1);
  }

  /**
   * Validates margin positions against maximum margin size limit
   */
  validateMarginLimits(marginPositions: MarginPosition[]): {
    isValid: boolean;
    totalMarginUsed: number;
    maxMarginAllowed: number;
    exceededAmount?: number;
  } {
    const totalMarginUsed = marginPositions.reduce((sum, position) => {
      return sum + (position.marginValue || 0);
    }, 0);

    const maxMarginAllowed = this.config.maxMarginSize || 5000; // Default to 5000 if not configured
    const isValid = totalMarginUsed <= maxMarginAllowed;
    const exceededAmount = isValid ? undefined : totalMarginUsed - maxMarginAllowed;

    return {
      isValid,
      totalMarginUsed,
      maxMarginAllowed,
      exceededAmount
    };
  }

  /**
   * Checks margin trading limits
   */
  checkMarginLimits(portfolio: Position[], marginPositions: MarginPosition[]): {
    isValid: boolean;
    availableMargin: number;
    usedMargin: number;
    remainingMargin: number;
    riskLevel: 'low' | 'medium' | 'high';
  } {
    const availableMargin = this.calculateAvailableMargin(portfolio);
    const usedMargin = marginPositions.reduce((sum, position) => {
      return sum + (position.marginValue || 0);
    }, 0);

    const remainingMargin = availableMargin - usedMargin;
    const marginUsageRatio = usedMargin / availableMargin;

    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (marginUsageRatio > 0.8) {
      riskLevel = 'high';
    } else if (marginUsageRatio > 0.6) {
      riskLevel = 'medium';
    }

    return {
      isValid: remainingMargin >= 0,
      availableMargin,
      usedMargin,
      remainingMargin,
      riskLevel
    };
  }

  /**
   * Calculates cost of transferring margin positions
   */
  calculateTransferCost(marginPositions: MarginPosition[]): {
    totalCost: number;
    freeTransfers: number;
    paidTransfers: number;
    costBreakdown: Array<{ ticker: string; cost: number; isFree: boolean }>;
  } {
    let totalCost = 0;
    let freeTransfers = 0;
    let paidTransfers = 0;
    const costBreakdown: Array<{ ticker: string; cost: number; isFree: boolean }> = [];

    for (const position of marginPositions) {
      const positionValue = position.totalPriceNumber || 0;
      const isFree = positionValue <= this.config.freeThreshold;
      const cost = isFree ? 0 : positionValue * 0.01; // 1% of position value

      if (isFree) {
        freeTransfers++;
      } else {
        paidTransfers++;
        totalCost += cost;
      }

      costBreakdown.push({
        ticker: position.base || 'UNKNOWN',
        cost,
        isFree
      });
    }

    return {
      totalCost,
      freeTransfers,
      paidTransfers,
      costBreakdown
    };
  }

  /**
   * Determines margin balancing strategy based on time
   */
  shouldApplyMarginStrategy(
    currentTime: Date = new Date(),
    balanceInterval: number = 60000 * 60, // 1 hour by default
    marketCloseTime: string = '18:45' // Moscow Exchange market close time
  ): boolean {
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;
    
    // Parse market close time
    const [closeHour, closeMinute] = marketCloseTime.split(':').map(Number);
    const closeTimeMinutes = closeHour * 60 + closeMinute;
    
    // Time until market close in minutes
    const timeToClose = closeTimeMinutes - currentTimeMinutes;
    
    // If market is already closed, consider it the end of the day
    if (timeToClose <= 0) {
      return true;
    }
    
    // Time until next balance in minutes
    const timeToNextBalance = balanceInterval / (1000 * 60);
    
    // Apply strategy if:
    // 1. Less than time until next balance until market close
    // 2. Or if it's the last balance of the day (less than 15 minutes until close)
    return timeToClose < timeToNextBalance || timeToClose < 15;
  }

  /**
   * Applies margin balancing strategy
   */
  applyMarginStrategy(
    marginPositions: MarginPosition[],
    strategy?: MarginBalancingStrategy,
    currentTime: Date = new Date(),
    balanceInterval: number = 60000 * 60,
    marketCloseTime: string = '18:45'
  ): {
    shouldRemoveMargin: boolean;
    reason: string;
    transferCost: number;
    timeInfo: {
      timeToClose: number;
      timeToNextBalance: number;
      isLastBalance: boolean;
    };
  } {
    // If strategy is not passed, use strategy from config or default
    const effectiveStrategy = strategy || this.config.strategy || 'keep';
    
    if (!this.shouldApplyMarginStrategy(currentTime, balanceInterval, marketCloseTime)) {
      return {
        shouldRemoveMargin: false,
        reason: 'Not time to apply margin strategy',
        transferCost: 0,
        timeInfo: {
          timeToClose: 0,
          timeToNextBalance: 0,
          isLastBalance: false
        }
      };
    }

    const transferInfo = this.calculateTransferCost(marginPositions);
    const totalMarginValue = marginPositions.reduce((sum, pos) => sum + (pos.totalPriceNumber || 0), 0);
    
    // Calculate time information
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;
    const [closeHour, closeMinute] = marketCloseTime.split(':').map(Number);
    const closeTimeMinutes = closeHour * 60 + closeMinute;
    const timeToClose = closeTimeMinutes - currentTimeMinutes;
    const timeToNextBalance = balanceInterval / (1000 * 60);
    const isLastBalance = timeToClose < timeToNextBalance || timeToClose < 15;

    switch (effectiveStrategy) {
      case 'remove':
        return {
          shouldRemoveMargin: true,
          reason: `Strategy: remove margin at market close (time to close: ${timeToClose} min)`,
          transferCost: transferInfo.totalCost,
          timeInfo: { timeToClose, timeToNextBalance, isLastBalance }
        };

      case 'keep':
        return {
          shouldRemoveMargin: false,
          reason: `Strategy: keep margin (time to close: ${timeToClose} min)`,
          transferCost: 0,
          timeInfo: { timeToClose, timeToNextBalance, isLastBalance }
        };

      case 'keep_if_small':
        const maxMarginAllowed = this.config.maxMarginSize || 5000;
        const shouldRemove = totalMarginValue > maxMarginAllowed;
        return {
          shouldRemoveMargin: shouldRemove,
          reason: shouldRemove 
            ? `Strategy: remove margin (sum ${totalMarginValue.toFixed(2)} rub > max ${maxMarginAllowed} rub, time to close: ${timeToClose} min)`
            : `Strategy: keep margin (sum ${totalMarginValue.toFixed(2)} rub <= max ${maxMarginAllowed} rub, time to close: ${timeToClose} min)`,
          transferCost: shouldRemove ? transferInfo.totalCost : 0,
          timeInfo: { timeToClose, timeToNextBalance, isLastBalance }
        };

      default:
        return {
          shouldRemoveMargin: false,
          reason: 'Unknown strategy',
          transferCost: 0,
          timeInfo: { timeToClose, timeToNextBalance, isLastBalance }
        };
    }
  }

  /**
   * Calculates optimal position sizes considering multiplier
   */
  calculateOptimalPositionSizes(
    portfolio: Position[],
    desiredWallet: Record<string, number>
  ): Record<string, { baseSize: number; marginSize: number; totalSize: number }> {
    const totalPortfolioValue = portfolio.reduce((sum, pos) => sum + (pos.totalPriceNumber || 0), 0);
    
    // Calculate target portfolio size with margin multiplier
    const targetPortfolioSize = totalPortfolioValue * this.config.multiplier;
    const availableMargin = this.calculateAvailableMargin(portfolio);

    const result: Record<string, { baseSize: number; marginSize: number; totalSize: number }> = {};

    for (const [ticker, percentage] of Object.entries(desiredWallet)) {
      // Calculate target position size based on multiplied portfolio
      const targetPositionSize = (targetPortfolioSize * percentage) / 100;
      const baseSize = (totalPortfolioValue * percentage) / 100;  // Base from current portfolio
      const marginSize = targetPositionSize - baseSize;  // Additional margin size
      
      result[ticker] = {
        baseSize,
        marginSize: Math.max(0, marginSize),  // Ensure non-negative margin
        totalSize: targetPositionSize
      };
    }

    return result;
  }
}
