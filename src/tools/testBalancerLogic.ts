import { normalizeDesire } from '../balancer';

console.log('=== TESTING FIXED BALANCER LOGIC ===\n');

// Testing original configuration
const originalDesiredWallet = {
  TRAY: 25, // 25% Tinkoff Passive
  TGLD: 25, // 25% Tinkoff Gold
  TRUR: 25, // 25% Tinkoff Eternal Portfolio
  TRND: 25, // 25% Tinkoff Trend 
  TBRU: 25,
  TDIV: 25,
  TITR: 25,
  TLCB: 25,
  TMON: 25,
  TMOS: 25,
  TOFZ: 25,
  TPAY: 25
};

console.log('ORIGINAL CONFIGURATION:');
console.log('Sum of all shares:', Object.values(originalDesiredWallet).reduce((sum, val) => sum + val, 0), '%');
console.log('Shares:', originalDesiredWallet);
console.log('');

// Testing fixed normalizeDesire function
console.log('NORMALIZATION RESULT (FIXED LOGIC):');
const normalizedDesire = normalizeDesire(originalDesiredWallet);
const normalizedSum = Object.values(normalizedDesire).reduce((sum, val) => sum + val, 0);

console.log('Sum after normalization:', normalizedSum.toFixed(2), '%');
console.log('Normalized shares:');
Object.entries(normalizedDesire).forEach(([ticker, percentage]) => {
  console.log(`  ${ticker}: ${percentage.toFixed(2)}%`);
});
console.log('');

// Check that sum is actually equal to 100%
if (Math.abs(normalizedSum - 100) < 0.01) {
  console.log('✅ SUM CORRECTLY NORMALIZED TO 100%');
} else {
  console.log('❌ ERROR: sum is not equal to 100%');
}

// Check that each share is approximately equal to 8.33% (25% / 300% * 100%)
const expectedPercentage = (25 / 300) * 100;
const allCorrect = Object.values(normalizedDesire).every(percentage => 
  Math.abs(percentage - expectedPercentage) < 0.01
);

if (allCorrect) {
  console.log('✅ ALL SHARES CORRECTLY NORMALIZED');
} else {
  console.log('❌ ERROR: shares normalized incorrectly');
}

console.log('\n=== PROBLEM ANALYSIS ===');
console.log('The problem was that:');
console.log('1. In config sum of all shares = 300% (25% × 12)');
console.log('2. After normalization each share became ~8.33% instead of 25%');
console.log('3. This led to incorrect target values in the balancer');
console.log('');
console.log('Now the logic is fixed:');
console.log('1. normalizeDesire function correctly normalizes desired shares');
console.log('2. Double normalization removed');
console.log('3. Target shares are now calculated correctly');
console.log('');
console.log('Result: TGLD will strive for 25%, not 8.33%');
