import { Position, MarginPosition, MarginConfig, MarginBalancingStrategy } from '../types.d';
import { convertTinkoffNumberToNumber } from './index';

/**
 * Калькулятор маржинальной торговли
 */
export class MarginCalculator {
  private config: MarginConfig;

  constructor(config: MarginConfig) {
    this.config = config;
  }

  /**
   * Рассчитывает доступную маржу для портфеля
   */
  calculateAvailableMargin(portfolio: Position[]): number {
    const totalValue = portfolio.reduce((sum, position) => {
      return sum + (position.totalPriceNumber || 0);
    }, 0);

    // Доступная маржа = общая стоимость * (множитель - 1)
    return totalValue * (this.config.multiplier - 1);
  }

  /**
   * Проверяет лимиты маржинальной торговли
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
   * Рассчитывает стоимость переноса маржинальных позиций
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
      const cost = isFree ? 0 : positionValue * 0.01; // 1% от стоимости позиции

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
   * Определяет стратегию балансировки маржи на основе времени
   */
  shouldApplyMarginStrategy(
    currentTime: Date = new Date(),
    balanceInterval: number = 60000 * 60, // 1 час по умолчанию
    marketCloseTime: string = '18:45' // Время закрытия рынка МосБиржи
  ): boolean {
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;
    
    // Парсим время закрытия рынка
    const [closeHour, closeMinute] = marketCloseTime.split(':').map(Number);
    const closeTimeMinutes = closeHour * 60 + closeMinute;
    
    // Время до закрытия рынка в минутах
    const timeToClose = closeTimeMinutes - currentTimeMinutes;
    
    // Если рынок уже закрыт, считаем что это конец дня
    if (timeToClose <= 0) {
      return true;
    }
    
    // Время до следующей балансировки в минутах
    const timeToNextBalance = balanceInterval / (1000 * 60);
    
    // Применяем стратегию если:
    // 1. До закрытия рынка меньше времени до следующей балансировки
    // 2. Или если это последняя балансировка дня (до закрытия < 15 минут)
    return timeToClose < timeToNextBalance || timeToClose < 15;
  }

  /**
   * Применяет стратегию балансировки маржи
   */
  applyMarginStrategy(
    marginPositions: MarginPosition[],
    strategy: MarginBalancingStrategy,
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
    if (!this.shouldApplyMarginStrategy(currentTime, balanceInterval, marketCloseTime)) {
      return {
        shouldRemoveMargin: false,
        reason: 'Не время для применения стратегии маржи',
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
    
    // Вычисляем информацию о времени
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;
    const [closeHour, closeMinute] = marketCloseTime.split(':').map(Number);
    const closeTimeMinutes = closeHour * 60 + closeMinute;
    const timeToClose = closeTimeMinutes - currentTimeMinutes;
    const timeToNextBalance = balanceInterval / (1000 * 60);
    const isLastBalance = timeToClose < timeToNextBalance || timeToClose < 15;

    switch (strategy) {
      case 'remove':
        return {
          shouldRemoveMargin: true,
          reason: `Стратегия: убирать маржу в конце дня (до закрытия: ${timeToClose} мин)`,
          transferCost: transferInfo.totalCost,
          timeInfo: { timeToClose, timeToNextBalance, isLastBalance }
        };

      case 'keep':
        return {
          shouldRemoveMargin: false,
          reason: `Стратегия: оставлять маржу (до закрытия: ${timeToClose} мин)`,
          transferCost: 0,
          timeInfo: { timeToClose, timeToNextBalance, isLastBalance }
        };

      case 'keep_if_small':
        const shouldRemove = totalMarginValue > this.config.freeThreshold;
        return {
          shouldRemoveMargin: shouldRemove,
          reason: shouldRemove 
            ? `Стратегия: убирать маржу (сумма ${totalMarginValue.toFixed(2)} руб > ${this.config.freeThreshold} руб, до закрытия: ${timeToClose} мин)`
            : `Стратегия: оставлять маржу (сумма ${totalMarginValue.toFixed(2)} руб <= ${this.config.freeThreshold} руб, до закрытия: ${timeToClose} мин)`,
          transferCost: shouldRemove ? transferInfo.totalCost : 0,
          timeInfo: { timeToClose, timeToNextBalance, isLastBalance }
        };

      default:
        return {
          shouldRemoveMargin: false,
          reason: 'Неизвестная стратегия',
          transferCost: 0,
          timeInfo: { timeToClose, timeToNextBalance, isLastBalance }
        };
    }
  }

  /**
   * Рассчитывает оптимальный размер позиций с учетом множителя
   */
  calculateOptimalPositionSizes(
    portfolio: Position[],
    desiredWallet: Record<string, number>
  ): Record<string, { baseSize: number; marginSize: number; totalSize: number }> {
    const totalPortfolioValue = portfolio.reduce((sum, pos) => sum + (pos.totalPriceNumber || 0), 0);
    const availableMargin = this.calculateAvailableMargin(portfolio);

    const result: Record<string, { baseSize: number; marginSize: number; totalSize: number }> = {};

    for (const [ticker, percentage] of Object.entries(desiredWallet)) {
      const targetValue = (totalPortfolioValue * percentage) / 100;
      const baseSize = targetValue;
      const marginSize = Math.min(availableMargin * (percentage / 100), targetValue * (this.config.multiplier - 1));
      const totalSize = baseSize + marginSize;

      result[ticker] = {
        baseSize,
        marginSize,
        totalSize
      };
    }

    return result;
  }
}
