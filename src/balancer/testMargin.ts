import { MarginCalculator } from '../utils/marginCalculator';
import { MarginConfig, MarginBalancingStrategy } from '../types.d';

// Test configuration
const testConfig: MarginConfig = {
  multiplier: 4,
  freeThreshold: 5000,
  strategy: 'keep_if_small'
};

const marginCalculator = new MarginCalculator(testConfig);

// Test data
const testPortfolio = [
  {
    base: 'TPAY',
    totalPriceNumber: 100000,
    amount: 100,
    lotSize: 1
  },
  {
    base: 'TGLD',
    totalPriceNumber: 80000,
    amount: 80,
    lotSize: 1
  },
  {
    base: 'TRUR',
    totalPriceNumber: 120000,
    amount: 120,
    lotSize: 1
  }
];

const testMarginPositions = [
  {
    base: 'TPAY',
    totalPriceNumber: 50000,
    marginValue: 37500, // With x4 multiplier: 50000 - (50000/4) = 37500
    isMargin: true,
    leverage: 4,
    marginCall: false
  },
  {
    base: 'TGLD',
    totalPriceNumber: 40000,
    marginValue: 30000, // With x4 multiplier: 40000 - (40000/4) = 30000
    isMargin: true,
    leverage: 4,
    marginCall: false
  }
];

const testDesiredWallet = {
  TPAY: 30,
  TGLD: 25,
  TRUR: 45
};

// Tests
console.log('=== Margin Trading Test ===\n');

// 1. Calculate available margin
console.log('1. Available margin:');
const availableMargin = marginCalculator.calculateAvailableMargin(testPortfolio);
console.log(`   Available margin: ${availableMargin.toFixed(2)} RUB\n`);

// 2. Check limits
console.log('2. Check limits:');
const limits = marginCalculator.checkMarginLimits(testPortfolio, testMarginPositions);
console.log(`   Validity: ${limits.isValid}`);
console.log(`   Available margin: ${limits.availableMargin.toFixed(2)} RUB`);
console.log(`   Used margin: ${limits.usedMargin.toFixed(2)} RUB`);
console.log(`   Remaining margin: ${limits.remainingMargin.toFixed(2)} RUB`);
console.log(`   Risk level: ${limits.riskLevel}\n`);

// 3. Transfer cost
console.log('3. Transfer cost:');
const transferCost = marginCalculator.calculateTransferCost(testMarginPositions);
console.log(`   Total cost: ${transferCost.totalCost.toFixed(2)} RUB`);
console.log(`   Free transfers: ${transferCost.freeTransfers}`);
console.log(`   Paid transfers: ${transferCost.paidTransfers}`);
console.log('   Breakdown:');
transferCost.costBreakdown.forEach(item => {
  console.log(`     ${item.ticker}: ${item.cost.toFixed(2)} RUB (${item.isFree ? 'free' : 'paid'})`);
});
console.log();

// 4. Balancing strategy
console.log('4. Balancing strategy:');
const currentTime = new Date();
const shouldApply = marginCalculator.shouldApplyMarginStrategy(currentTime);
console.log(`   Strategy application time: ${shouldApply ? 'Yes' : 'No'}`);

const strategy = marginCalculator.applyMarginStrategy(testMarginPositions, 'keep_if_small', currentTime);
console.log(`   Remove margin: ${strategy.shouldRemoveMargin ? 'Yes' : 'No'}`);
console.log(`   Reason: ${strategy.reason}`);
console.log(`   Transfer cost: ${strategy.transferCost.toFixed(2)} RUB`);
console.log(`   Time information:`);
console.log(`     Time to market close: ${strategy.timeInfo.timeToClose} min`);
console.log(`     Time to next rebalancing: ${strategy.timeInfo.timeToNextBalance.toFixed(1)} min`);
console.log(`     Last rebalancing of the day: ${strategy.timeInfo.isLastBalance ? 'Yes' : 'No'}\n`);

// Test different time scenarios
console.log('4.1. Test time scenarios:');
const testTimes = [
  { time: new Date(2024, 0, 1, 9, 0), desc: 'Morning (9:00)' },
  { time: new Date(2024, 0, 1, 14, 0), desc: 'Day (14:00)' },
  { time: new Date(2024, 0, 1, 18, 30), desc: 'Before close (18:30)' },
  { time: new Date(2024, 0, 1, 19, 0), desc: 'After close (19:00)' }
];

testTimes.forEach(({ time, desc }) => {
  const shouldApply = marginCalculator.shouldApplyMarginStrategy(time);
  const strategy = marginCalculator.applyMarginStrategy(testMarginPositions, 'keep_if_small', time);
  console.log(`   ${desc}: ${shouldApply ? 'Apply' : 'Do not apply'} strategy`);
  if (shouldApply) {
    console.log(`     Remove margin: ${strategy.shouldRemoveMargin ? 'Yes' : 'No'}`);
    console.log(`     Time to close: ${strategy.timeInfo.timeToClose} min`);
  }
});
console.log();

// 5. Optimal position sizes
console.log('5. Optimal position sizes:');
const optimalSizes = marginCalculator.calculateOptimalPositionSizes(testPortfolio, testDesiredWallet);
Object.entries(optimalSizes).forEach(([ticker, sizes]) => {
  console.log(`   ${ticker}:`);
  console.log(`     Base size: ${sizes.baseSize.toFixed(2)} RUB`);
  console.log(`     Margin size: ${sizes.marginSize.toFixed(2)} RUB`);
  console.log(`     Total size: ${sizes.totalSize.toFixed(2)} RUB`);
});
console.log();

// 6. Test different strategies
console.log('6. Test different strategies:');
const strategies: MarginBalancingStrategy[] = ['remove', 'keep', 'keep_if_small'];

strategies.forEach(strategyType => {
  const result = marginCalculator.applyMarginStrategy(testMarginPositions, strategyType, currentTime);
  console.log(`   ${strategyType}: ${result.shouldRemoveMargin ? 'Remove' : 'Keep'} - ${result.reason}`);
});

console.log('\n=== Test completed ===');
