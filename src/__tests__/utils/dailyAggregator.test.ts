import { describe, it, expect, beforeEach } from "bun:test";
import { DailyAggregator } from "../../utils/dailyAggregator";
import { IterationProfitSummary, IterationExpenseSummary } from "../../types.d";

describe("DailyAggregator", () => {
  let dailyAggregator: DailyAggregator;

  beforeEach(() => {
    dailyAggregator = new DailyAggregator();
  });

  describe("addIterationResults", () => {
    it("should accumulate profit and expenses correctly", () => {
      const profitSummary1: IterationProfitSummary = {
        totalProfit: 1000,
        totalProfitPercentage: 5,
        profitPositions: 2,
        lossPositions: 1,
        profitLossRecords: [],
      };

      const expenseSummary1: IterationExpenseSummary = {
        totalCommission: 50,
        ordersExecuted: 3,
        expenseRecords: [],
      };

      const profitSummary2: IterationProfitSummary = {
        totalProfit: -500,
        totalProfitPercentage: -2.5,
        profitPositions: 1,
        lossPositions: 2,
        profitLossRecords: [],
      };

      const expenseSummary2: IterationExpenseSummary = {
        totalCommission: 25,
        ordersExecuted: 2,
        expenseRecords: [],
      };

      dailyAggregator.addIterationResults(profitSummary1, expenseSummary1);
      dailyAggregator.addIterationResults(profitSummary2, expenseSummary2);

      const summary = dailyAggregator.getDailySummary();

      expect(summary.cumulativeProfit).toBe(500); // 1000 + (-500)
      expect(summary.cumulativeExpenses).toBe(75); // 50 + 25
      expect(summary.netDailyProfit).toBe(425); // 500 - 75
      expect(summary.iterationsCount).toBe(2);
      expect(summary.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD format
    });

    it("should handle zero values", () => {
      const profitSummary: IterationProfitSummary = {
        totalProfit: 0,
        totalProfitPercentage: 0,
        profitPositions: 0,
        lossPositions: 0,
        profitLossRecords: [],
      };

      const expenseSummary: IterationExpenseSummary = {
        totalCommission: 0,
        ordersExecuted: 0,
        expenseRecords: [],
      };

      dailyAggregator.addIterationResults(profitSummary, expenseSummary);

      const summary = dailyAggregator.getDailySummary();

      expect(summary.cumulativeProfit).toBe(0);
      expect(summary.cumulativeExpenses).toBe(0);
      expect(summary.netDailyProfit).toBe(0);
      expect(summary.iterationsCount).toBe(1);
    });
  });

  describe("getDailySummary", () => {
    it("should return correct summary structure", () => {
      const summary = dailyAggregator.getDailySummary();

      expect(summary).toHaveProperty("date");
      expect(summary).toHaveProperty("cumulativeProfit");
      expect(summary).toHaveProperty("cumulativeExpenses");
      expect(summary).toHaveProperty("netDailyProfit");
      expect(summary).toHaveProperty("iterationsCount");
      
      expect(typeof summary.date).toBe("string");
      expect(typeof summary.cumulativeProfit).toBe("number");
      expect(typeof summary.cumulativeExpenses).toBe("number");
      expect(typeof summary.netDailyProfit).toBe("number");
      expect(typeof summary.iterationsCount).toBe("number");
    });

    it("should return zero values for new aggregator", () => {
      const summary = dailyAggregator.getDailySummary();

      expect(summary.cumulativeProfit).toBe(0);
      expect(summary.cumulativeExpenses).toBe(0);
      expect(summary.netDailyProfit).toBe(0);
      expect(summary.iterationsCount).toBe(0);
    });
  });

  describe("formatDailySummary", () => {
    it("should format positive values with plus sign", () => {
      const summary = {
        date: "2024-01-15",
        cumulativeProfit: 1500,
        cumulativeExpenses: 75,
        netDailyProfit: 1425,
        iterationsCount: 3,
      };

      const formatted = dailyAggregator.formatDailySummary(summary);

      expect(formatted).toContain("📅 Daily Summary (2024-01-15):");
      expect(formatted).toContain("Cumulative Profit: +1500.00 RUB");
      expect(formatted).toContain("Cumulative Expenses: 75.00 RUB");
      expect(formatted).toContain("Net Daily Profit: +1425.00 RUB");
      expect(formatted).toContain("Iterations: 3");
    });

    it("should format negative values correctly", () => {
      const summary = {
        date: "2024-01-16",
        cumulativeProfit: -800,
        cumulativeExpenses: 50,
        netDailyProfit: -850,
        iterationsCount: 2,
      };

      const formatted = dailyAggregator.formatDailySummary(summary);

      expect(formatted).toContain("📅 Daily Summary (2024-01-16):");
      expect(formatted).toContain("Cumulative Profit: -800.00 RUB");
      expect(formatted).toContain("Cumulative Expenses: 50.00 RUB");
      expect(formatted).toContain("Net Daily Profit: -850.00 RUB");
      expect(formatted).toContain("Iterations: 2");
    });

    it("should format zero values without plus sign for profit", () => {
      const summary = {
        date: "2024-01-17",
        cumulativeProfit: 0,
        cumulativeExpenses: 25,
        netDailyProfit: -25,
        iterationsCount: 1,
      };

      const formatted = dailyAggregator.formatDailySummary(summary);

      expect(formatted).toContain("Cumulative Profit: 0.00 RUB");
      expect(formatted).toContain("Net Daily Profit: -25.00 RUB");
    });
  });

  describe("checkAndResetIfNewDay", () => {
    it("should return false for same day check", () => {
      // Add some data
      const profitSummary: IterationProfitSummary = {
        totalProfit: 100,
        totalProfitPercentage: 1,
        profitPositions: 1,
        lossPositions: 0,
        profitLossRecords: [],
      };

      const expenseSummary: IterationExpenseSummary = {
        totalCommission: 5,
        ordersExecuted: 1,
        expenseRecords: [],
      };

      dailyAggregator.addIterationResults(profitSummary, expenseSummary);

      // Check immediately - should be same day
      const isNewDay = dailyAggregator.checkAndResetIfNewDay();
      expect(isNewDay).toBe(false);

      // Data should still be there
      const summary = dailyAggregator.getDailySummary();
      expect(summary.cumulativeProfit).toBe(100);
      expect(summary.iterationsCount).toBe(1);
    });
  });
});