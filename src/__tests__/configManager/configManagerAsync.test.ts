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

describe("ConfigManager Async Update Tests", () => {
  const testConfigPath = join(process.cwd(), 'CONFIG.json');
  const backupConfigPath = join(process.cwd(), 'CONFIG_BACKUP.json');

  beforeEach(() => {
    // Reset the config instance
    (configLoader as any).config = null;
    
    // Backup original config if it exists
    if (existsSync(testConfigPath)) {
      writeFileSync(backupConfigPath, require('fs').readFileSync(testConfigPath, 'utf8'));
    }
    
    // Create a test config file
    writeFileSync(testConfigPath, JSON.stringify(validProjectConfig, null, 2));
  });

  afterEach(() => {
    // Restore original config if backup exists
    if (existsSync(backupConfigPath)) {
      writeFileSync(testConfigPath, require('fs').readFileSync(backupConfigPath, 'utf8'));
      unlinkSync(backupConfigPath);
    } else if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
  });

  describe("Async wallet validation during updates", () => {
    it("should pass validation when wallet percentages sum to 100%", async () => {
      const updates: Partial<AccountConfig> = {
        desired_wallet: {
          TRUR: 40,
          TMOS: 35,
          TGLD: 25
        }
      };

      await expect(async () => {
        await configLoader.updateAccountConfig("test_account", updates);
      }).not.toThrow();
    });

    it("should fail validation when wallet percentages don't sum to 100%", async () => {
      const updates: Partial<AccountConfig> = {
        desired_wallet: {
          TRUR: 40,
          TMOS: 35,
          TGLD: 30 // Sum = 105%, should fail
        }
      };

      await expect(configLoader.updateAccountConfig("test_account", updates))
        .rejects.toThrow("Wallet validation failed: sum of weights for account test_account equals 105%, expected 100%");
    });

    it("should fail validation when wallet has negative percentages", async () => {
      const updates: Partial<AccountConfig> = {
        desired_wallet: {
          TRUR: 50,
          TMOS: 60,
          TGLD: -10 // Negative percentage should fail
        }
      };

      await expect(configLoader.updateAccountConfig("test_account", updates))
        .rejects.toThrow("Invalid percentage for ticker TGLD: must be between 0 and 100");
    });

    it("should fail validation when wallet has non-numeric values", async () => {
      const updates: Partial<AccountConfig> = {
        desired_wallet: {
          TRUR: 50,
          TMOS: 30,
          TGLD: "invalid" as any // Non-numeric value should fail
        }
      };

      await expect(configLoader.updateAccountConfig("test_account", updates))
        .rejects.toThrow("Invalid percentage for ticker TGLD: must be a number");
    });

    it("should accept wallet percentages with small tolerance (within 1%)", async () => {
      const updates: Partial<AccountConfig> = {
        desired_wallet: {
          TRUR: 33.5,
          TMOS: 33.5,
          TGLD: 33 // Sum = 100%, within tolerance
        }
      };

      await expect(async () => {
        await configLoader.updateAccountConfig("test_account", updates);
      }).not.toThrow();
    });
  });

  describe("Async large number validation", () => {
    it("should reject extremely large percentage values", async () => {
      const updates: Partial<AccountConfig> = {
        desired_wallet: {
          TRUR: Number.MAX_SAFE_INTEGER + 1, // Too large
          TMOS: 30,
          TGLD: 20
        }
      };

      await expect(configLoader.updateAccountConfig("test_account", updates))
        .rejects.toThrow("Invalid percentage for ticker TRUR: value too large");
    });

    it("should handle maximum safe integer values for other fields", async () => {
      const updates: Partial<AccountConfig> = {
        desired_wallet: {
          TRUR: 50,
          TMOS: 30,
          TGLD: 20
        },
        balance_interval: Number.MAX_SAFE_INTEGER
      };

      await expect(async () => {
        await configLoader.updateAccountConfig("test_account", updates);
      }).not.toThrow();
    });

    it("should reject infinite values", async () => {
      const updates: Partial<AccountConfig> = {
        desired_wallet: {
          TRUR: Infinity,
          TMOS: 30,
          TGLD: 20
        }
      };

      await expect(configLoader.updateAccountConfig("test_account", updates))
        .rejects.toThrow("Invalid percentage for ticker TRUR: value too large");
    });

    it("should reject NaN values", async () => {
      const updates: Partial<AccountConfig> = {
        desired_wallet: {
          TRUR: NaN,
          TMOS: 30,
          TGLD: 20
        }
      };

      await expect(configLoader.updateAccountConfig("test_account", updates))
        .rejects.toThrow("Invalid percentage for ticker TRUR: must be a number");
    });

    it("should handle very small decimal values", async () => {
      const updates: Partial<AccountConfig> = {
        desired_wallet: {
          TRUR: 50.00000000001,
          TMOS: 30,
          TGLD: 19.99999999999
        }
      };

      await expect(async () => {
        await configLoader.updateAccountConfig("test_account", updates);
      }).not.toThrow();
    });
  });

  describe("Additional async edge cases", () => {
    it("should handle updates to non-existent account", async () => {
      const updates: Partial<AccountConfig> = {
        desired_wallet: {
          TRUR: 50,
          TMOS: 30,
          TGLD: 20
        }
      };

      await expect(configLoader.updateAccountConfig("non_existent", updates))
        .rejects.toThrow("Account with ID 'non_existent' not found");
    });

    it("should preserve other account configs during updates", async () => {
      // Add a second account to the config
      const configWithTwoAccounts: ProjectConfig = {
        accounts: [
          validAccountConfig,
          {
            ...validAccountConfig,
            id: "second_account",
            name: "Second Account"
          }
        ]
      };

      writeFileSync(testConfigPath, JSON.stringify(configWithTwoAccounts, null, 2));
      
      // Reset config to force reload
      (configLoader as any).config = null;

      const updates: Partial<AccountConfig> = {
        desired_wallet: {
          TRUR: 60,
          TMOS: 40
        }
      };

      await configLoader.updateAccountConfig("test_account", updates);

      // Verify both accounts still exist
      const accounts = configLoader.getAllAccounts();
      expect(accounts).toHaveLength(2);
      expect(accounts[0].desired_wallet.TRUR).toBe(60);
      expect(accounts[1].id).toBe("second_account");
    });

    it("should handle empty desired_wallet updates", async () => {
      const updates: Partial<AccountConfig> = {
        desired_wallet: {}
      };

      await expect(configLoader.updateAccountConfig("test_account", updates))
        .rejects.toThrow("Account test_account must contain non-empty desired_wallet");
    });

    it("should properly handle updateConfig with entire config", async () => {
      const newConfig: ProjectConfig = {
        accounts: [
          {
            ...validAccountConfig,
            desired_wallet: {
              TRUR: 60,
              TMOS: 40
            }
          }
        ]
      };

      await expect(async () => {
        await configLoader.updateConfig(newConfig);
      }).not.toThrow();
      
      // Verify the update was applied
      const accounts = configLoader.getAllAccounts();
      expect(accounts[0].desired_wallet.TRUR).toBe(60);
      expect(accounts[0].desired_wallet.TMOS).toBe(40);
    });

    it("should handle config validation failure in updateConfig", async () => {
      const invalidConfig: ProjectConfig = {
        accounts: [
          {
            ...validAccountConfig,
            desired_wallet: {
              TRUR: 50,
              TMOS: 30,
              TGLD: 30 // Sum = 110%, should fail
            }
          }
        ]
      };

      await expect(configLoader.updateConfig(invalidConfig))
        .rejects.toThrow("Wallet validation failed");
    });
  });
});