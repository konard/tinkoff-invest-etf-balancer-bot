#!/usr/bin/env bun
import 'dotenv/config';
import { normalizeDesire } from '../balancer';

console.log('🧪 TESTING FIXED BALANCER LOGIC\n');
console.log('===============================\n');

// Test with the actual configuration from CONFIG.json
const configuredETFs = {
  TRAY: 8.33,
  TGLD: 8.33,
  TRUR: 8.33,
  TRND: 8.33,
  TBRU: 8.33,
  TDIV: 8.33,
  TITR: 8.33,
  TLCB: 8.33,
  TMON: 8.33,
  TMOS: 8.33,
  TOFZ: 8.33,
  TPAY: 8.33
};

console.log('📋 Original Configuration (from CONFIG.json):');
console.log(`Total ETFs: ${Object.keys(configuredETFs).length}`);
console.log(`Sum of percentages: ${Object.values(configuredETFs).reduce((sum, val) => sum + val, 0)}%`);

console.log('\nETF allocation:');
Object.entries(configuredETFs).forEach(([ticker, percent]) => {
  console.log(`  ${ticker}: ${percent}%`);
});

console.log('\n🔧 Testing normalizeDesire function:');
console.log('===================================');

const normalized = normalizeDesire(configuredETFs);
const normalizedSum = Object.values(normalized).reduce((sum, val) => sum + val, 0);

console.log(`Sum after normalization: ${normalizedSum.toFixed(6)}%`);
console.log('\nNormalized ETF allocation:');
Object.entries(normalized).forEach(([ticker, percent]) => {
  console.log(`  ${ticker}: ${percent.toFixed(4)}%`);
});

// Check if all ETFs are present and sum to 100%
const allETFsPresent = Object.keys(configuredETFs).every(ticker => ticker in normalized);
const sumIs100 = Math.abs(normalizedSum - 100) < 0.0001;

console.log('\n✅ VERIFICATION:');
console.log('================');
console.log(`All 12 ETFs present in result: ${allETFsPresent ? '✅ YES' : '❌ NO'}`);
console.log(`Sum equals 100%: ${sumIs100 ? '✅ YES' : '❌ NO'}`);
console.log(`Expected equal allocation: ${(100 / 12).toFixed(4)}% per ETF`);

if (allETFsPresent && sumIs100) {
  console.log('\n🎉 SUCCESS: Configuration processing is working correctly!');
  console.log('All 12 ETFs should now be processed by the balancer.');
} else {
  console.log('\n❌ ISSUE: Configuration processing has problems.');
  console.log('Missing ETFs or incorrect normalization detected.');
}

console.log('\n📊 Expected behavior:');
console.log('When balancer runs, it should now create positions for all 12 ETFs');
console.log('instead of skipping 9 ETFs and only balancing 3.');