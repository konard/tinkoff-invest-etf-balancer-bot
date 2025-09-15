#!/usr/bin/env bun
import { diffCalculator } from '../balancer/diffCalculator';
import { buildDesiredWalletByMode, buildDesiredWalletWithDiff } from '../balancer/desiredBuilder';
import { AccountConfig, DesiredWallet } from '../types.d';

// Demo account configurations
const demoAccounts: AccountConfig[] = [
  {
    id: 'demo-manual',
    name: 'Demo Manual Account',
    t_invest_token: 'demo-token',
    account_id: 'DEMO',
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
  },
  {
    id: 'demo-iteration-diff',
    name: 'Demo Account with Iteration Diff',
    t_invest_token: 'demo-token',
    account_id: 'DEMO',
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
    diff: 'iteration',
    diff_multiplier: 30
  }
];

async function demonstrateDiffFeature() {
  console.log('=== DIFF FEATURE DEMONSTRATION ===\n');

  // 1. Demonstrate account without diff
  console.log('1. Account WITHOUT diff feature:');
  console.log('Configuration:', {
    diff: demoAccounts[0].diff,
    diff_multiplier: demoAccounts[0].diff_multiplier
  });

  const manualResult = await buildDesiredWalletWithDiff(demoAccounts[0]);
  console.log('Result:', manualResult);
  console.log('Total:', Object.values(manualResult).reduce((sum, weight) => sum + weight, 0).toFixed(2), '%\n');

  // 2. Demonstrate account with iteration diff
  console.log('2. Account WITH iteration diff feature:');
  console.log('Configuration:', {
    diff: demoAccounts[1].diff,
    diff_multiplier: demoAccounts[1].diff_multiplier
  });

  // First iteration - no previous data, should return base calculation
  console.log('\nFirst iteration (no previous data):');
  const firstIteration = await buildDesiredWalletWithDiff(demoAccounts[1]);
  console.log('Result:', firstIteration);
  console.log('Total:', Object.values(firstIteration).reduce((sum, weight) => sum + weight, 0).toFixed(2), '%');

  // Simulate a second iteration with slightly different base calculation
  console.log('\nSecond iteration (with previous data):');
  
  // Manually store a "previous" iteration to demonstrate the diff calculation
  const previousIteration: DesiredWallet = {
    'TGLD': 20,  // Was lower
    'TRUR': 30,  // Was higher  
    'TBRU': 25,  // Same
    'TRAY': 25   // Same
  };
  
  await diffCalculator.storeIterationSnapshot(demoAccounts[1].id, previousIteration);
  
  // Now calculate with current desired being different
  const currentDesired: DesiredWallet = {
    'TGLD': 30,  // Increased +50% from 20
    'TRUR': 20,  // Decreased -33% from 30
    'TBRU': 25,  // No change
    'TRAY': 25   // No change
  };
  
  const secondIteration = await diffCalculator.calculateDiff(demoAccounts[1], currentDesired);
  console.log('Previous iteration:', previousIteration);
  console.log('Current desired:', currentDesired);
  console.log('Result with diff applied:', secondIteration);
  console.log('Total:', Object.values(secondIteration).reduce((sum, weight) => sum + weight, 0).toFixed(2), '%');

  // Show the differences
  console.log('\nDifference analysis:');
  for (const ticker of Object.keys(currentDesired)) {
    const prev = previousIteration[ticker] || 0;
    const curr = currentDesired[ticker] || 0;
    const final = secondIteration[ticker] || 0;
    
    if (prev > 0) {
      const diffPct = ((curr - prev) / prev) * 100;
      const adjustment = final - curr;
      console.log(`${ticker}: ${prev}% -> ${curr}% (${diffPct > 0 ? '+' : ''}${diffPct.toFixed(1)}%) -> ${final.toFixed(2)}% (adjustment: ${adjustment > 0 ? '+' : ''}${adjustment.toFixed(2)})`);
    }
  }

  console.log('\n=== DEMONSTRATION COMPLETE ===');
}

// Run the demonstration
demonstrateDiffFeature().catch(console.error);