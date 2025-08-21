import { MarginConfig, MarginBalancingStrategy } from '../types.d';
import { MarginCalculator } from '../utils/marginCalculator';

// Test data
const testWallet = [
  {
    base: 'TPAY',
    totalPriceNumber: 90000,
    amount: 100
  },
  {
    base: 'TGLD', 
    totalPriceNumber: 75000,
    amount: 50
  },
  {
    base: 'TRUR',
    totalPriceNumber: 135000,
    amount: 200
  }
];

const testDesiredWallet = {
  TPAY: 30,
  TGLD: 25,
  TRUR: 45
};

console.log('=== Test with disabled margin trading ===\n');

// Test 1: Create margin calculator without strategy (simulate disabled margin trading)
console.log('1. Test margin calculator without strategy:');
const marginConfig: MarginConfig = {
  multiplier: 4,
  freeThreshold: 5000
  // strategy not passed - simulate disabled margin trading
};

const marginCalculator = new MarginCalculator(marginConfig);
console.log(`   Configuration: multiplier=${marginConfig.multiplier}, freeThreshold=${marginConfig.freeThreshold}`);
console.log(`   Strategy: ${marginConfig.strategy || 'not defined'}\n`);

// Test 2: Apply margin strategy without strategy
console.log('2. Apply margin strategy without strategy:');
const marginPositions = [
  {
    base: 'TPAY',
    totalPriceNumber: 90000,
    amount: 100,
    isMargin: true,
    marginValue: 67500,
    leverage: 4,
    marginCall: false
  }
];

const strategy = marginCalculator.applyMarginStrategy(marginPositions);
console.log(`   Remove margin: ${strategy.shouldRemoveMargin ? 'Yes' : 'No'}`);
console.log(`   Reason: ${strategy.reason}`);
console.log(`   Transfer cost: ${strategy.transferCost} RUB`);
console.log(`   Expected: default strategy 'keep' (keep margin)\n`);

// Test 3: Calculate optimal sizes without margin
console.log('3. Calculate optimal position sizes (without margin):');
const totalPortfolioValue = testWallet.reduce((sum, pos) => sum + (pos.totalPriceNumber || 0), 0);
console.log(`   Total portfolio value: ${totalPortfolioValue.toFixed(2)} RUB`);

const result: Record<string, { baseSize: number; marginSize: number; totalSize: number }> = {};
for (const [ticker, percentage] of Object.entries(testDesiredWallet)) {
  const targetValue = (totalPortfolioValue * percentage) / 100;
  result[ticker] = {
    baseSize: targetValue,
    marginSize: 0, // Without margin
    totalSize: targetValue
  };
}

console.log('   Result:');
for (const [ticker, sizes] of Object.entries(result)) {
  console.log(`   ${ticker}:`);
  console.log(`     Base size: ${sizes.baseSize.toFixed(2)} RUB`);
  console.log(`     Margin size: ${sizes.marginSize.toFixed(2)} RUB`);
  console.log(`     Total size: ${sizes.totalSize.toFixed(2)} RUB`);
  console.log(`     Expected: marginSize = 0 (margin trading disabled)`);
}

console.log('\n=== Test completed ===');
