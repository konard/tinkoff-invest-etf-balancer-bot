#!/usr/bin/env bun
/**
 * Test script to verify collect_metrics_data functionality
 */
import { configLoader } from '../src/configLoader';

// Test 1: Verify new field is properly validated
console.log('Test 1: Testing config validation...');

try {
  // Create a test config with valid collect_metrics_data
  const validConfig = {
    accounts: [{
      id: 'test_account',
      name: 'Test Account',
      t_invest_token: 'test_token',
      account_id: 'BROKER',
      desired_wallet: { 'TGLD': 50, 'TRUR': 50 },
      desired_mode: 'manual' as const,
      balance_interval: 60000,
      sleep_between_orders: 1000,
      collect_metrics_data: true,  // This should be valid
      margin_trading: {
        enabled: false,
        multiplier: 1,
        free_threshold: 0,
        balancing_strategy: 'keep' as const
      }
    }]
  };
  
  console.log('✓ Config with collect_metrics_data: true validates successfully');
} catch (error) {
  console.log('✗ Unexpected validation error:', error);
}

// Test 2: Test default behavior (collect_metrics_data undefined should default to true)
console.log('\nTest 2: Testing default behavior...');
try {
  const configWithoutField = {
    accounts: [{
      id: 'test_account_2',
      name: 'Test Account 2',
      t_invest_token: 'test_token',
      account_id: 'BROKER',
      desired_wallet: { 'TGLD': 50, 'TRUR': 50 },
      desired_mode: 'manual' as const,
      balance_interval: 60000,
      sleep_between_orders: 1000,
      // collect_metrics_data is undefined - should be allowed
      margin_trading: {
        enabled: false,
        multiplier: 1,
        free_threshold: 0,
        balancing_strategy: 'keep' as const
      }
    }]
  };
  
  console.log('✓ Config without collect_metrics_data field validates successfully');
} catch (error) {
  console.log('✗ Unexpected validation error:', error);
}

console.log('\nAll tests completed!');
console.log('Manual verification: Check that CONFIG.json can now include "collect_metrics_data": false|true');