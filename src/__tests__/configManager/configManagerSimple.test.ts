import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { configLoader } from "../../configLoader";
import { AccountConfig, ProjectConfig } from "../../types.d";
import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// Test data
const validAccountConfig: AccountConfig = {
  id: "test_account",
  name: "Test Account",
  t_invest_token: "test_token",
  account_id: "test_account_id",
  desired_wallet: {
    TRUR: 50,
    TMOS: 30,
    TGLD: 20
  },
  desired_mode: "manual",
  balance_interval: 60000,
  sleep_between_orders: 1000,
  margin_trading: {
    enabled: false,
    multiplier: 1,
    free_threshold: 10000,
    balancing_strategy: "remove"
  }
};

const validProjectConfig: ProjectConfig = {
  accounts: [validAccountConfig]
};

describe("ConfigManager Update Tests - Real File Operations", () => {
  const testConfigPath = join(process.cwd(), 'TEST_CONFIG.json');

  beforeEach(() => {
    // Reset the config instance
    (configLoader as any).config = null;
    
    // Create a test config file
    writeFileSync(testConfigPath, JSON.stringify(validProjectConfig, null, 2));
    
    // Mock process.cwd to use our test config
    const originalCwd = process.cwd;
    process.cwd = () => {
      const path = originalCwd();
      return path; // Use the real path but we'll create TEST_CONFIG.json
    };
  });

  afterEach(() => {
    // Clean up test files
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
  });

  describe("Wallet validation tests", () => {
    it("should validate that wallet percentages sum to 100%", () => {
      const account: AccountConfig = {
        ...validAccountConfig,
        desired_wallet: {
          TRUR: 40,
          TMOS: 35,
          TGLD: 30 // Sum = 105%, should fail
        }
      };

      expect(() => {
        (configLoader as any).validateAccount(account);
      }).toThrow("Wallet validation failed: sum of weights for account test_account equals 105%, expected 100%");
    });

    it("should pass validation when wallet percentages sum to 100%", () => {
      const account: AccountConfig = {
        ...validAccountConfig,
        desired_wallet: {
          TRUR: 40,
          TMOS: 35,
          TGLD: 25 // Sum = 100%
        }
      };

      expect(() => {
        (configLoader as any).validateAccount(account);
      }).not.toThrow();
    });

    it("should fail validation when wallet has negative percentages", () => {
      const account: AccountConfig = {
        ...validAccountConfig,
        desired_wallet: {
          TRUR: 50,
          TMOS: 60,
          TGLD: -10 // Negative percentage should fail
        }
      };

      expect(() => {
        (configLoader as any).validateAccount(account);
      }).toThrow("Invalid percentage for ticker TGLD: must be between 0 and 100");
    });

    it("should fail validation when wallet has non-numeric values", () => {
      const account: AccountConfig = {
        ...validAccountConfig,
        desired_wallet: {
          TRUR: 50,
          TMOS: 30,
          TGLD: "invalid" as any // Non-numeric value should fail
        }
      };

      expect(() => {
        (configLoader as any).validateAccount(account);
      }).toThrow("Invalid percentage for ticker TGLD: must be a number");
    });

    it("should accept wallet percentages with small tolerance (within 1%)", () => {
      const account: AccountConfig = {
        ...validAccountConfig,
        desired_wallet: {
          TRUR: 33.5,
          TMOS: 33.5,
          TGLD: 33 // Sum = 100%, within tolerance
        }
      };

      expect(() => {
        (configLoader as any).validateAccount(account);
      }).not.toThrow();
    });
  });

  describe("Large number validation tests", () => {
    it("should reject extremely large percentage values", () => {
      const account: AccountConfig = {
        ...validAccountConfig,
        desired_wallet: {
          TRUR: Number.MAX_SAFE_INTEGER + 1, // Too large
          TMOS: 30,
          TGLD: 20
        }
      };

      expect(() => {
        (configLoader as any).validateAccount(account);
      }).toThrow("Invalid percentage for ticker TRUR: value too large");
    });

    it("should reject infinite values", () => {
      const account: AccountConfig = {
        ...validAccountConfig,
        desired_wallet: {
          TRUR: Infinity,
          TMOS: 30,
          TGLD: 20
        }
      };

      expect(() => {
        (configLoader as any).validateAccount(account);
      }).toThrow("Invalid percentage for ticker TRUR: value too large");
    });

    it("should reject NaN values", () => {
      const account: AccountConfig = {
        ...validAccountConfig,
        desired_wallet: {
          TRUR: NaN,
          TMOS: 30,
          TGLD: 20
        }
      };

      expect(() => {
        (configLoader as any).validateAccount(account);
      }).toThrow("Invalid percentage for ticker TRUR: must be a number");
    });

    it("should handle very small decimal values", () => {
      const account: AccountConfig = {
        ...validAccountConfig,
        desired_wallet: {
          TRUR: 50.00000000001,
          TMOS: 30,
          TGLD: 19.99999999999
        }
      };

      expect(() => {
        (configLoader as any).validateAccount(account);
      }).not.toThrow();
    });
  });

  describe("Required field validation", () => {
    it("should fail validation when required fields are missing", () => {
      const incompleteAccount = {
        id: "test_account",
        name: "Test Account"
        // Missing required fields
      } as any;

      expect(() => {
        (configLoader as any).validateAccount(incompleteAccount);
      }).toThrow("Account test_account must contain field t_invest_token");
    });

    it("should fail validation when desired_wallet is empty", () => {
      const account: AccountConfig = {
        ...validAccountConfig,
        desired_wallet: {}
      };

      expect(() => {
        (configLoader as any).validateAccount(account);
      }).toThrow("Account test_account must contain non-empty desired_wallet");
    });

    it("should fail validation when desired_wallet is null", () => {
      const account: AccountConfig = {
        ...validAccountConfig,
        desired_wallet: null as any
      };

      expect(() => {
        (configLoader as any).validateAccount(account);
      }).toThrow("Account test_account must contain non-empty desired_wallet");
    });
  });

  describe("Edge cases", () => {
    it("should handle percentages over 100 for individual tickers", () => {
      const account: AccountConfig = {
        ...validAccountConfig,
        desired_wallet: {
          TRUR: 150, // Over 100%
          TMOS: 30,
          TGLD: 20
        }
      };

      expect(() => {
        (configLoader as any).validateAccount(account);
      }).toThrow("Invalid percentage for ticker TRUR: must be between 0 and 100");
    });

    it("should handle zero percentages", () => {
      const account: AccountConfig = {
        ...validAccountConfig,
        desired_wallet: {
          TRUR: 0,
          TMOS: 50,
          TGLD: 50
        }
      };

      expect(() => {
        (configLoader as any).validateAccount(account);
      }).not.toThrow();
    });

    it("should handle exactly 100% for single asset", () => {
      const account: AccountConfig = {
        ...validAccountConfig,
        desired_wallet: {
          TRUR: 100
        }
      };

      expect(() => {
        (configLoader as any).validateAccount(account);
      }).not.toThrow();
    });
  });
});