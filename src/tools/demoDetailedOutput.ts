#!/usr/bin/env bun

/**
 * Demonstration of detailed balancing output results
 * Shows format: TICKER: before% -> after% (target%)
 */

// Portfolio data simulation before balancing
const initialShares = {
  TMON: 0,
  TPAY: 18.5,
  TOFZ: 7.2,
  TDIV: 12.8,
  TGLD: 16.3,
  TLCB: 0,
  TRND: 14.1,
  TRUR: 13.7,
  TBRU: 0,
  TMOS: 13.4,
  TITR: 0,
};

// Target shares from balancer simulation
const targetPercents = {
  TMON: 0,
  TPAY: 19,
  TOFZ: 8,
  TDIV: 13,
  TGLD: 17,
  TLCB: 0,
  TRND: 15,
  TRUR: 14,
  TBRU: 0,
  TMOS: 14,
  TITR: 0,
};

// Actual shares after balancing simulation
const finalShares = {
  TMON: 0,
  TPAY: 19,
  TOFZ: 8,
  TDIV: 13,
  TGLD: 17,
  TLCB: 0,
  TRND: 15,
  TRUR: 14,
  TBRU: 0,
  TMOS: 14,
  TITR: 0,
};

/**
 * Calculates shares of each instrument in portfolio
 * @param wallet - array of portfolio positions
 * @returns object with tickers and their shares in percentages
 */
const calculatePortfolioShares = (shares: Record<string, number>): Record<string, number> => {
  return shares;
};

/**
 * Demonstration of detailed balancing output result
 */
const demoDetailedOutput = () => {
  console.log('=== DEMONSTRATION OF DETAILED BALANCING OUTPUT ===\n');
  
  // Save current portfolio shares BEFORE balancing
  const beforeShares = calculatePortfolioShares(initialShares);
  
  // Get target shares from balancer
  const finalPercents = targetPercents;
  
  // Get updated shares AFTER balancing
  const afterShares = calculatePortfolioShares(finalShares);
  
        // Detailed balancing output result
      console.log('BALANCING RESULT:');
      console.log('Format: TICKER: diff: before% -> after% (target%)');
      console.log('Where: before% = current share, after% = actual share after balancing, (target%) = target from balancer, diff = change in percentage points\n');
      
      // Sort tickers by decreasing share after balancing (after)
      const sortedTickers = Object.keys(finalPercents).sort((a, b) => {
        const afterA = afterShares[a] || 0;
        const afterB = afterShares[b] || 0;
        return afterB - afterA; // Decreasing: from larger to smaller
      });
      
      for (const ticker of sortedTickers) {
        if (ticker && ticker !== 'RUB') {
          const beforePercent = beforeShares[ticker] || 0;
          const afterPercent = afterShares[ticker] || 0;
          const targetPercent = finalPercents[ticker] || 0;
          
          // Calculate change in percentage points
          const diff = afterPercent - beforePercent;
          const diffSign = diff > 0 ? '+' : '';
          const diffText = diff === 0 ? '0%' : `${diffSign}${diff.toFixed(2)}%`;
          
          console.log(`${ticker}: ${diffText}: ${beforePercent.toFixed(2)}% -> ${afterPercent.toFixed(2)}% (${targetPercent.toFixed(2)}%)`);
        }
      }
      
      // Add ruble balance (can be negative with margin trading)
      console.log(`RUR: 5000.00 RUB`);
  
  console.log('\n=== CHANGE ANALYSIS ===');
  
  // Analyze changes
  for (const ticker of sortedTickers) {
    if (ticker && ticker !== 'RUB') {
      const beforePercent = Math.round(beforeShares[ticker] || 0);
      const afterPercent = Math.round(afterShares[ticker] || 0);
      const targetPercent = Math.round(finalPercents[ticker] || 0);
      
      if (beforePercent !== afterPercent) {
        const change = afterPercent - beforePercent;
        const changeSymbol = change > 0 ? '+' : '';
        console.log(`${ticker}: ${changeSymbol}${change}% (${beforePercent}% → ${afterPercent}%)`);
      } else if (beforePercent !== targetPercent) {
        console.log(`${ticker}: no changes (${beforePercent}% = ${targetPercent}%)`);
      } else {
        console.log(`${ticker}: already balanced (${beforePercent}%)`);
      }
    }
  }
};

// Run demonstration
if (import.meta.main) {
  demoDetailedOutput();
}

export { demoDetailedOutput };
