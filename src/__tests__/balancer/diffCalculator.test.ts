import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import path from 'path';
import { diffCalculator } from '../../balancer/diffCalculator';
import { AccountConfig, DesiredWallet } from '../../types.d';

describe('DiffCalculator', () => {
  const testAccountConfig: AccountConfig = {
    id: 'test-account-diff',
    name: 'Test Account',
    t_invest_token: 'test-token',
    account_id: 'BROKER',
    desired_wallet: {
      'TGLD': 25,
      'TRUR': 25,
      'TBRU': 25,
      'TRAY': 25
    },
    desired_mode: 'manual',
    balance_interval: 3600000,
    sleep_between_orders: 3000,
    margin_trading: {
      enabled: false,
      multiplier: 1,
      free_threshold: 0,
      balancing_strategy: 'keep'
    },
    diff: 'off',
    diff_multiplier: 0
  };

  const diffDataDir = path.resolve(process.cwd(), 'diff_data');

  beforeEach(async () => {
    // Clean up any existing test data
    try {
      const files = await fs.readdir(diffDataDir);
      for (const file of files) {
        if (file.startsWith('test-account-diff')) {
          await fs.unlink(path.join(diffDataDir, file));
        }
      }
    } catch {
      // Directory might not exist, that's ok
    }
  });

  afterEach(async () => {
    // Clean up test data
    try {
      const files = await fs.readdir(diffDataDir);
      for (const file of files) {
        if (file.startsWith('test-account-diff')) {
          await fs.unlink(path.join(diffDataDir, file));
        }
      }
    } catch {
      // Directory might not exist, that's ok
    }
  });

  it('should return original desired wallet when diff is off', async () => {
    const currentDesired: DesiredWallet = {
      'TGLD': 30,
      'TRUR': 30,
      'TBRU': 20,
      'TRAY': 20
    };

    const result = await diffCalculator.calculateDiff(testAccountConfig, currentDesired);
    expect(result).toEqual(currentDesired);
  });

  it('should return original desired wallet when diff_multiplier is 0', async () => {
    const configWithDiffZero = {
      ...testAccountConfig,
      diff: 'iteration' as const,
      diff_multiplier: 0
    };

    const currentDesired: DesiredWallet = {
      'TGLD': 30,
      'TRUR': 30,
      'TBRU': 20,
      'TRAY': 20
    };

    const result = await diffCalculator.calculateDiff(configWithDiffZero, currentDesired);
    expect(result).toEqual(currentDesired);
  });

  it('should store and retrieve iteration snapshots', async () => {
    const desiredWallet: DesiredWallet = {
      'TGLD': 25,
      'TRUR': 25,
      'TBRU': 25,
      'TRAY': 25
    };

    await diffCalculator.storeIterationSnapshot(testAccountConfig.id, desiredWallet);

    // Check that file was created
    const today = new Date().toISOString().split('T')[0];
    const filePath = path.join(diffDataDir, `${testAccountConfig.id}_${today}.json`);
    
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    if (exists) {
      const data = await fs.readFile(filePath, 'utf-8');
      const snapshot = JSON.parse(data);
      
      expect(snapshot.date).toBe(today);
      expect(snapshot.snapshots['iteration_1']).toEqual(desiredWallet);
    }
  });

  it('should normalize weights to sum to 100%', async () => {
    // First store a reference snapshot
    const referenceDesired: DesiredWallet = {
      'TGLD': 25,
      'TRUR': 25,
      'TBRU': 25,
      'TRAY': 25
    };

    await diffCalculator.storeIterationSnapshot(testAccountConfig.id, referenceDesired);

    const configWithDiff = {
      ...testAccountConfig,
      diff: 'iteration' as const,
      diff_multiplier: 50
    };

    const currentDesired: DesiredWallet = {
      'TGLD': 30,  // +20% from reference
      'TRUR': 25,  // Same as reference
      'TBRU': 25,  // Same as reference  
      'TRAY': 20   // -20% from reference
    };

    const result = await diffCalculator.calculateDiff(configWithDiff, currentDesired);

    // Check that weights sum to approximately 100%
    const totalWeight = Object.values(result).reduce((sum, weight) => sum + weight, 0);
    expect(Math.abs(totalWeight - 100)).toBeLessThan(0.01);
    
    // Check that all weights are positive
    Object.values(result).forEach(weight => {
      expect(weight).toBeGreaterThanOrEqual(0);
    });
  });
});