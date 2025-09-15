import { describe, it, expect, beforeEach } from "bun:test";
import { ExpenseTracker } from "../../utils/expenseTracker";
import { Position } from "../../types.d";

describe("ExpenseTracker", () => {
  let expenseTracker: ExpenseTracker;

  beforeEach(() => {
    expenseTracker = new ExpenseTracker();
  });

  describe("recordOrderExpense", () => {
    it("should record expense with commission from order response", () => {
      const position: Position = {
        base: "TRUR",
        quote: "RUB",
        figi: "test-figi",
        lotPriceNumber: 100,
      };

      const orderResponse = {
        totalOrderAmount: { units: 1000, nano: 0 },
        commission: { units: 5, nano: 0 },
      };

      const result = expenseTracker.recordOrderExpense(
        "test-order-1",
        position,
        orderResponse,
        "BUY",
        10
      );

      expect(result).toBeDefined();
      expect(result!.orderId).toBe("test-order-1");
      expect(result!.ticker).toBe("TRUR");
      expect(result!.orderType).toBe("BUY");
      expect(result!.lots).toBe(10);
      expect(result!.amountRub).toBe(1000); // 100 * 10
      expect(result!.commission).toBe(5);
      expect(result!.timestamp).toBeInstanceOf(Date);
    });

    it("should estimate commission when not provided in response", () => {
      const position: Position = {
        base: "TMOS",
        quote: "RUB",
        figi: "test-figi-2",
        lotPriceNumber: 200,
      };

      const orderResponse = {
        totalOrderAmount: { units: 2000, nano: 0 },
        // No commission field
      };

      const result = expenseTracker.recordOrderExpense(
        "test-order-2",
        position,
        orderResponse,
        "SELL",
        5
      );

      expect(result).toBeDefined();
      expect(result!.commission).toBe(1); // Estimated minimum 1 RUB (0.05% of 2000 = 1)
    });

    it("should use fallback estimation when no order amount available", () => {
      const position: Position = {
        base: "TEST",
        quote: "RUB",
        figi: "test-figi-3",
        lotPriceNumber: 150,
      };

      const orderResponse = {
        // No totalOrderAmount
      };

      const result = expenseTracker.recordOrderExpense(
        "test-order-3",
        position,
        orderResponse,
        "BUY",
        8
      );

      expect(result).toBeDefined();
      expect(result!.amountRub).toBe(1200); // 150 * 8
      expect(result!.commission).toBe(1); // Minimum 1 RUB (0.05% of 1200 = 0.6, rounded up to 1)
    });

    it("should return null for currency positions", () => {
      const position: Position = {
        base: "RUB",
        quote: "RUB",
      };

      const result = expenseTracker.recordOrderExpense(
        "test-order-4",
        position,
        {},
        "BUY",
        1
      );

      expect(result).toBeNull();
    });
  });

  describe("getAndClearIterationSummary", () => {
    it("should return summary and clear iteration expenses", () => {
      const position1: Position = {
        base: "TRUR",
        lotPriceNumber: 100,
      };
      const position2: Position = {
        base: "TMOS",
        lotPriceNumber: 200,
      };

      // Record two expenses
      expenseTracker.recordOrderExpense("order-1", position1, { commission: { units: 5, nano: 0 } }, "BUY", 10);
      expenseTracker.recordOrderExpense("order-2", position2, { commission: { units: 3, nano: 0 } }, "SELL", 5);

      const summary = expenseTracker.getAndClearIterationSummary();

      expect(summary.totalCommission).toBe(8); // 5 + 3
      expect(summary.ordersExecuted).toBe(2);
      expect(summary.expenseRecords).toHaveLength(2);

      // Should be cleared after getting summary
      const emptySummary = expenseTracker.getAndClearIterationSummary();
      expect(emptySummary.totalCommission).toBe(0);
      expect(emptySummary.ordersExecuted).toBe(0);
      expect(emptySummary.expenseRecords).toHaveLength(0);
    });

    it("should handle empty iteration expenses", () => {
      const summary = expenseTracker.getAndClearIterationSummary();

      expect(summary.totalCommission).toBe(0);
      expect(summary.ordersExecuted).toBe(0);
      expect(summary.expenseRecords).toHaveLength(0);
    });
  });

  describe("getDailyExpenseSummary", () => {
    it("should return daily totals without clearing", () => {
      const position: Position = {
        base: "TRUR",
        lotPriceNumber: 100,
      };

      expenseTracker.recordOrderExpense("order-1", position, { commission: { units: 5, nano: 0 } }, "BUY", 10);

      const dailySummary = expenseTracker.getDailyExpenseSummary();
      expect(dailySummary.totalCommission).toBe(5);
      expect(dailySummary.ordersExecuted).toBe(1);

      // Should still be there after getting daily summary
      const dailySummary2 = expenseTracker.getDailyExpenseSummary();
      expect(dailySummary2.totalCommission).toBe(5);
      expect(dailySummary2.ordersExecuted).toBe(1);
    });
  });

  describe("clearDailyExpenses", () => {
    it("should clear only daily expenses, not iteration expenses", () => {
      const position: Position = {
        base: "TRUR",
        lotPriceNumber: 100,
      };

      expenseTracker.recordOrderExpense("order-1", position, { commission: { units: 5, nano: 0 } }, "BUY", 10);

      expenseTracker.clearDailyExpenses();

      // Daily should be cleared
      const dailySummary = expenseTracker.getDailyExpenseSummary();
      expect(dailySummary.totalCommission).toBe(0);
      expect(dailySummary.ordersExecuted).toBe(0);

      // But iteration should still have the record
      const iterationSummary = expenseTracker.getAndClearIterationSummary();
      expect(iterationSummary.totalCommission).toBe(5);
      expect(iterationSummary.ordersExecuted).toBe(1);
    });
  });

  describe("formatCommission", () => {
    it("should format commission amounts", () => {
      expect(expenseTracker.formatCommission(12.34)).toBe("12.34 RUB");
      expect(expenseTracker.formatCommission(0)).toBe("0.00 RUB");
      expect(expenseTracker.formatCommission(1000.1)).toBe("1000.10 RUB");
    });
  });
});