import debug from 'debug';
import { Wallet, Position, ProfitLossRecord, IterationProfitSummary } from '../types.d';
import { convertTinkoffNumberToNumber, normalizeTicker } from './index';

const debugProfit = debug('bot').extend('profit');

export class ProfitCalculator {
  
  /**
   * Calculates profit/loss for a single position
   */
  calculatePositionProfitLoss(position: Position, portfolioPositions: any[]): ProfitLossRecord | null {
    if (!position.base || position.base === 'RUB' || !position.figi) {
      debugProfit(`Skipping profit calculation for currency or position without figi: ${position.base}`);
      return null;
    }

    // Find the corresponding portfolio position to get average price
    const portfolioPosition = portfolioPositions.find(p => p.figi === position.figi);
    if (!portfolioPosition) {
      debugProfit(`Portfolio position not found for ${position.base}/${position.figi}`);
      return null;
    }

    const currentPositionValue = position.totalPriceNumber || 0;
    if (currentPositionValue <= 0) {
      debugProfit(`Skipping position with zero or negative value: ${position.base}`);
      return null;
    }

    // Get average price (prefer FIFO if available, otherwise use regular average)
    let averagePrice = 0;
    if (portfolioPosition.averagePositionPriceFifo) {
      averagePrice = convertTinkoffNumberToNumber(portfolioPosition.averagePositionPriceFifo);
      debugProfit(`Using FIFO average price for ${position.base}: ${averagePrice}`);
    } else if (portfolioPosition.averagePositionPrice) {
      averagePrice = convertTinkoffNumberToNumber(portfolioPosition.averagePositionPrice);
      debugProfit(`Using regular average price for ${position.base}: ${averagePrice}`);
    } else {
      debugProfit(`No average price available for ${position.base}`);
      return null;
    }

    const quantity = position.amount || 0;
    if (quantity <= 0) {
      debugProfit(`Skipping position with zero or negative quantity: ${position.base}`);
      return null;
    }

    const originalCost = averagePrice * quantity;
    const profitAmount = currentPositionValue - originalCost;
    const profitPercentage = originalCost > 0 ? (profitAmount / originalCost) * 100 : 0;

    const ticker = normalizeTicker(position.base) || position.base;
    
    debugProfit(`Calculated profit for ${ticker}: ${profitAmount.toFixed(2)} RUB (${profitPercentage.toFixed(2)}%)`);
    debugProfit(`  Current value: ${currentPositionValue.toFixed(2)}, Original cost: ${originalCost.toFixed(2)}`);

    return {
      ticker,
      currentPositionValue,
      originalCost,
      profitAmount,
      profitPercentage,
      isMarginPosition: false // TODO: Implement margin position detection if needed
    };
  }

  /**
   * Calculates profit/loss summary for the entire iteration
   */
  calculateIterationProfitSummary(wallet: Wallet, portfolioPositions: any[]): IterationProfitSummary {
    debugProfit('Calculating iteration profit summary');
    
    const profitLossRecords: ProfitLossRecord[] = [];
    let totalProfit = 0;
    let totalOriginalCost = 0;
    let profitPositions = 0;
    let lossPositions = 0;

    for (const position of wallet) {
      const record = this.calculatePositionProfitLoss(position, portfolioPositions);
      if (record) {
        profitLossRecords.push(record);
        totalProfit += record.profitAmount;
        totalOriginalCost += record.originalCost;
        
        if (record.profitAmount > 0) {
          profitPositions++;
        } else if (record.profitAmount < 0) {
          lossPositions++;
        }
      }
    }

    const totalProfitPercentage = totalOriginalCost > 0 ? (totalProfit / totalOriginalCost) * 100 : 0;

    const summary: IterationProfitSummary = {
      totalProfit,
      totalProfitPercentage,
      profitPositions,
      lossPositions,
      profitLossRecords
    };

    debugProfit(`Iteration profit summary: ${totalProfit.toFixed(2)} RUB (${totalProfitPercentage.toFixed(2)}%)`);
    debugProfit(`  Profit positions: ${profitPositions}, Loss positions: ${lossPositions}`);

    return summary;
  }

  /**
   * Formats profit/loss amount for display
   */
  formatProfitAmount(amount: number): string {
    const sign = amount >= 0 ? '+' : '';
    return `${sign}${amount.toFixed(2)} RUB`;
  }

  /**
   * Formats profit/loss percentage for display
   */
  formatProfitPercentage(percentage: number): string {
    const sign = percentage >= 0 ? '+' : '';
    return `${sign}${percentage.toFixed(2)}%`;
  }
}