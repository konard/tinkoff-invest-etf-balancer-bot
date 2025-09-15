import debug from 'debug';
import { DailySummary, IterationProfitSummary, IterationExpenseSummary } from '../types.d';

const debugDaily = debug('bot').extend('daily');

export class DailyAggregator {
  private dailyProfit: number = 0;
  private dailyExpenses: number = 0;
  private iterationsCount: number = 0;
  private currentDate: string = '';

  constructor() {
    this.resetToCurrentDate();
  }

  /**
   * Gets Moscow time zone date string in YYYY-MM-DD format
   */
  private getMoscowDateString(): string {
    const now = new Date();
    // Convert to Moscow time (UTC+3)
    const moscowTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    return moscowTime.toISOString().split('T')[0];
  }

  /**
   * Resets daily counters to current Moscow date
   */
  private resetToCurrentDate(): void {
    const moscowDate = this.getMoscowDateString();
    if (this.currentDate !== moscowDate) {
      debugDaily(`New trading day detected: ${moscowDate} (previous: ${this.currentDate})`);
      this.currentDate = moscowDate;
      this.dailyProfit = 0;
      this.dailyExpenses = 0;
      this.iterationsCount = 0;
    }
  }

  /**
   * Adds iteration results to daily totals
   */
  addIterationResults(profitSummary: IterationProfitSummary, expenseSummary: IterationExpenseSummary): void {
    // Check if we need to reset for new day
    this.resetToCurrentDate();

    this.dailyProfit += profitSummary.totalProfit;
    this.dailyExpenses += expenseSummary.totalCommission;
    this.iterationsCount++;

    debugDaily(`Added iteration results to daily totals:`);
    debugDaily(`  Profit: ${profitSummary.totalProfit.toFixed(2)} RUB`);
    debugDaily(`  Expenses: ${expenseSummary.totalCommission.toFixed(2)} RUB`);
    debugDaily(`  Daily totals: profit ${this.dailyProfit.toFixed(2)} RUB, expenses ${this.dailyExpenses.toFixed(2)} RUB`);
  }

  /**
   * Gets current daily summary
   */
  getDailySummary(): DailySummary {
    this.resetToCurrentDate();

    const netDailyProfit = this.dailyProfit - this.dailyExpenses;

    return {
      date: this.currentDate,
      cumulativeProfit: this.dailyProfit,
      cumulativeExpenses: this.dailyExpenses,
      netDailyProfit,
      iterationsCount: this.iterationsCount
    };
  }

  /**
   * Formats daily summary for display
   */
  formatDailySummary(summary: DailySummary): string {
    const profitSign = summary.cumulativeProfit > 0 ? '+' : '';
    const netSign = summary.netDailyProfit > 0 ? '+' : '';
    
    return `📅 Daily Summary (${summary.date}):
  Cumulative Profit: ${profitSign}${summary.cumulativeProfit.toFixed(2)} RUB
  Cumulative Expenses: ${summary.cumulativeExpenses.toFixed(2)} RUB
  Net Daily Profit: ${netSign}${summary.netDailyProfit.toFixed(2)} RUB
  Iterations: ${summary.iterationsCount}`;
  }

  /**
   * Checks if it's time to reset daily counters (called at start of new trading day)
   */
  checkAndResetIfNewDay(): boolean {
    const previousDate = this.currentDate;
    this.resetToCurrentDate();
    return previousDate !== this.currentDate;
  }
}