import debug from 'debug';
import { ExpenseRecord, IterationExpenseSummary, Position } from '../types.d';
import { convertTinkoffNumberToNumber, normalizeTicker } from './index';

const debugExpense = debug('bot').extend('expense');

export class ExpenseTracker {
  private iterationExpenses: ExpenseRecord[] = [];
  private dailyExpenses: ExpenseRecord[] = [];
  
  /**
   * Records an expense from an executed order
   */
  recordOrderExpense(
    orderId: string,
    position: Position,
    orderResponse: any,
    orderType: 'BUY' | 'SELL',
    lots: number
  ): ExpenseRecord | null {
    if (!position.base || position.base === 'RUB') {
      debugExpense(`Skipping expense recording for currency: ${position.base}`);
      return null;
    }

    const ticker = normalizeTicker(position.base) || position.base;
    
    // Extract commission from order response
    // Note: The exact structure depends on the Tinkoff API response format
    let commission = 0;
    
    // First try to get commission directly from response
    if (orderResponse.commission) {
      commission = convertTinkoffNumberToNumber(orderResponse.commission);
      debugExpense(`Using commission from order response for ${ticker}: ${commission.toFixed(2)} RUB`);
    } else if (orderResponse.totalOrderAmount) {
      // Estimate commission as a percentage of order amount (fallback)
      const orderAmount = convertTinkoffNumberToNumber(orderResponse.totalOrderAmount);
      commission = this.estimateCommission(orderAmount, orderType);
      debugExpense(`Estimated commission for ${ticker}: ${commission.toFixed(2)} RUB`);
    } else {
      // Fallback: estimate based on position lot price and quantity
      const lotPrice = position.lotPriceNumber || 0;
      const orderAmount = lotPrice * lots;
      commission = this.estimateCommission(orderAmount, orderType);
      debugExpense(`Fallback commission estimate for ${ticker}: ${commission.toFixed(2)} RUB`);
    }

    const amountRub = position.lotPriceNumber ? position.lotPriceNumber * lots : 0;
    
    const expenseRecord: ExpenseRecord = {
      orderId,
      ticker,
      orderType,
      lots,
      amountRub,
      commission,
      timestamp: new Date()
    };

    debugExpense(`Recording expense: ${ticker} ${orderType} ${lots} lots, commission: ${commission.toFixed(2)} RUB`);
    
    this.iterationExpenses.push(expenseRecord);
    this.dailyExpenses.push(expenseRecord);
    
    return expenseRecord;
  }

  /**
   * Estimates commission based on order amount and type
   * This is a fallback when commission data is not available in the API response
   */
  private estimateCommission(orderAmount: number, orderType: 'BUY' | 'SELL'): number {
    // Tinkoff Invest commission rates (approximate):
    // - Stock trading: 0.05% of transaction amount, minimum 1 RUB
    // - ETF trading: typically 0.05% of transaction amount, minimum 1 RUB
    const commissionRate = 0.0005; // 0.05%
    const minimumCommission = 1.0; // 1 RUB minimum
    
    const calculatedCommission = orderAmount * commissionRate;
    return Math.max(calculatedCommission, minimumCommission);
  }

  /**
   * Gets iteration expense summary and clears iteration expenses
   */
  getAndClearIterationSummary(): IterationExpenseSummary {
    debugExpense('Generating iteration expense summary');
    
    const totalCommission = this.iterationExpenses.reduce((sum, record) => sum + record.commission, 0);
    const ordersExecuted = this.iterationExpenses.length;
    
    const summary: IterationExpenseSummary = {
      totalCommission,
      ordersExecuted,
      expenseRecords: [...this.iterationExpenses]
    };
    
    debugExpense(`Iteration expenses: ${totalCommission.toFixed(2)} RUB from ${ordersExecuted} orders`);
    
    // Clear iteration expenses for next iteration
    this.iterationExpenses = [];
    
    return summary;
  }

  /**
   * Gets daily expense summary
   */
  getDailyExpenseSummary(): { totalCommission: number; ordersExecuted: number } {
    const totalCommission = this.dailyExpenses.reduce((sum, record) => sum + record.commission, 0);
    const ordersExecuted = this.dailyExpenses.length;
    
    return { totalCommission, ordersExecuted };
  }

  /**
   * Clears daily expenses (should be called at start of new trading day)
   */
  clearDailyExpenses(): void {
    debugExpense('Clearing daily expenses for new trading day');
    this.dailyExpenses = [];
  }

  /**
   * Gets all daily expense records (for debugging/analysis)
   */
  getDailyExpenseRecords(): ExpenseRecord[] {
    return [...this.dailyExpenses];
  }

  /**
   * Formats commission amount for display
   */
  formatCommission(amount: number): string {
    return `${amount.toFixed(2)} RUB`;
  }
}