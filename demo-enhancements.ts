#!/usr/bin/env bun

/**
 * Demo script to showcase the enhanced ETF balancer features
 */

import { buildDesiredWalletByMode } from './src/balancer/desiredBuilder';
import { MarginCalculator } from './src/utils/marginCalculator';
import { BalancingDataError, MarginPosition } from './src/types.d';

console.log('🚀 ETF Balancer Enhancements Demo\n');

// Demo 1: Enhanced Mode Selection with Manual Mode
console.log('📊 Demo 1: Enhanced Mode Selection');
console.log('=====================================');

const demoWallet = {
  'TPAY': 25,
  'TGLD': 25,
  'TRUR': 25,
  'TRND': 25
};

try {
  const result = await buildDesiredWalletByMode('manual', demoWallet);
  console.log('✅ Manual mode result:');
  console.log(`   Mode applied: ${result.modeApplied}`);
  console.log(`   Wallet: ${JSON.stringify(result.wallet, null, 2)}`);
  console.log(`   Metrics count: ${result.metrics.length}`);
} catch (error) {
  console.log(`❌ Error: ${error.message}`);
}

// Demo 2: BalancingDataError Exception Handling
console.log('\n🛡️  Demo 2: Exception-Based Mode Validation');
console.log('==============================================');

try {
  console.log('Attempting marketcap mode with no data...');
  await buildDesiredWalletByMode('marketcap', demoWallet);
  console.log('❌ This should not print - exception expected');
} catch (error) {
  if (error instanceof BalancingDataError) {
    console.log('✅ Correctly caught BalancingDataError:');
    console.log(`   Mode: ${error.mode}`);
    console.log(`   Missing data: ${error.missingData.join(', ')}`);
    console.log(`   Affected tickers: ${error.affectedTickers.join(', ')}`);
    console.log(`   Message: ${error.message}`);
  } else {
    console.log(`❌ Unexpected error type: ${error.constructor.name}`);
  }
}

// Demo 3: Enhanced Margin Trading Configuration
console.log('\n💰 Demo 3: Enhanced Margin Trading Configuration');
console.log('================================================');

const marginConfig = {
  multiplier: 4,
  freeThreshold: 5000,
  maxMarginSize: 15000,
  strategy: 'keep_if_small' as const
};

const marginCalculator = new MarginCalculator(marginConfig);

// Test margin positions
const marginPositions: MarginPosition[] = [
  {
    base: 'TPAY',
    quote: 'RUB',
    totalPriceNumber: 20000,
    isMargin: true,
    marginValue: 12000,
    leverage: 4,
    marginCall: false
  },
  {
    base: 'TGLD',
    quote: 'RUB',
    totalPriceNumber: 8000,
    isMargin: true,
    marginValue: 6000,
    leverage: 4,
    marginCall: false
  }
];

// Validate margin limits
const validation = marginCalculator.validateMarginLimits(marginPositions);
console.log('✅ Margin Validation Results:');
console.log(`   Is valid: ${validation.isValid}`);
console.log(`   Total margin used: ${validation.totalMarginUsed} RUB`);
console.log(`   Max margin allowed: ${validation.maxMarginAllowed} RUB`);
if (validation.exceededAmount) {
  console.log(`   Exceeded by: ${validation.exceededAmount} RUB`);
}

// Test margin strategy
const strategy = marginCalculator.applyMarginStrategy(
  marginPositions,
  'keep_if_small',
  new Date('2023-01-01T18:30:00'),
  3600000,
  '18:45'
);

console.log('\n✅ Margin Strategy Results:');
console.log(`   Should remove margin: ${strategy.shouldRemoveMargin}`);
console.log(`   Reason: ${strategy.reason}`);
console.log(`   Transfer cost: ${strategy.transferCost} RUB`);

// Demo 4: Configuration Enhancement
console.log('\n⚙️  Demo 4: Configuration Enhancement');
console.log('====================================');

const enhancedConfig = {
  enabled: true,
  multiplier: 4,
  free_threshold: 5000,
  max_margin_size: 20000,  // NEW FIELD
  balancing_strategy: 'keep_if_small' as const
};

console.log('✅ Enhanced AccountMarginConfig:');
console.log(JSON.stringify(enhancedConfig, null, 2));

console.log('\n🎉 Demo completed successfully!');
console.log('\nEnhancements implemented:');
console.log('✅ Fixed balancing mode selection with strict validation');
console.log('✅ Added enhanced result information with position metrics');
console.log('✅ Added configurable maximum margin size (max_margin_size)');
console.log('✅ Enhanced error handling with BalancingDataError exceptions');
console.log('✅ Improved logging and debugging capabilities');
console.log('✅ Updated configuration schema and validation');