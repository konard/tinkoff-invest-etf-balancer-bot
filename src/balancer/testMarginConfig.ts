import { identifyMarginPositions, applyMarginStrategy, calculateOptimalSizes } from './index';

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

console.log('=== Test margin trading configuration ===\n');

// Test 1: Check that functions are exported correctly
console.log('1. Check function exports:');
console.log(`   identifyMarginPositions: ${typeof identifyMarginPositions === 'function' ? '✅' : '❌'}`);
console.log(`   applyMarginStrategy: ${typeof applyMarginStrategy === 'function' ? '✅' : '❌'}`);
console.log(`   calculateOptimalSizes: ${typeof calculateOptimalSizes === 'function' ? '✅' : '❌'}\n`);

// Test 2: Test identifyMarginPositions function
console.log('2. Test identifyMarginPositions function:');
try {
  const marginPositions = identifyMarginPositions(testWallet);
  console.log(`   Result: found ${marginPositions.length} margin positions`);
  if (marginPositions.length > 0) {
    console.log('   Details:');
    marginPositions.forEach(pos => {
      console.log(`     ${pos.base}: margin value ${pos.marginValue?.toFixed(2)} RUB`);
    });
  }
} catch (error) {
  console.log(`   ❌ Error: ${error}`);
}
console.log();

// Test 3: Test applyMarginStrategy function
console.log('3. Test applyMarginStrategy function:');
try {
  const marginStrategy = applyMarginStrategy(testWallet);
  console.log(`   Remove margin: ${marginStrategy.shouldRemoveMargin ? 'Yes' : 'No'}`);
  console.log(`   Reason: ${marginStrategy.reason}`);
  console.log(`   Transfer cost: ${marginStrategy.transferCost} RUB`);
  console.log(`   Margin positions: ${marginStrategy.marginPositions.length}`);
} catch (error) {
  console.log(`   ❌ Error: ${error}`);
}
console.log();

// Test 4: Test calculateOptimalSizes function
console.log('4. Test calculateOptimalSizes function:');
try {
  const optimalSizes = calculateOptimalSizes(testWallet, testDesiredWallet);
  console.log('   Result:');
  for (const [ticker, sizes] of Object.entries(optimalSizes)) {
    console.log(`   ${ticker}:`);
    console.log(`     Base size: ${sizes.baseSize.toFixed(2)} RUB`);
    console.log(`     Margin size: ${sizes.marginSize.toFixed(2)} RUB`);
    console.log(`     Total size: ${sizes.totalSize.toFixed(2)} RUB`);
  }
} catch (error) {
  console.log(`   ❌ Error: ${error}`);
}

console.log('\n=== Test completed ===');
