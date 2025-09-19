import 'dotenv/config';
import _ from 'lodash';
import { getInstruments, getLastPrice } from '../provider';
import { configLoader } from '../configLoader';
import { normalizeTicker, tickersEqual } from '../utils';

const debug = require('debug')('bot').extend('debugBalancer');

// Function to get account configuration
const getAccountConfig = () => {
  // Берем первый аккаунт из конфига
  const accounts = configLoader.getAllAccounts();
  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts found in CONFIG.json');
  }

  const account = accounts[0];
  return account;
};

interface DebugResult {
  ticker: string;
  normalizedTicker: string;
  foundInInstruments: boolean;
  instrumentData?: any;
  figi?: string;
  lotSize?: number;
  priceAvailable: boolean;
  lastPrice?: any;
  status: 'SUCCESS' | 'FAILED_INSTRUMENT' | 'FAILED_PRICE' | 'SKIPPED';
  reason?: string;
}

export const debugDesiredWalletProcessing = async (): Promise<{
  configuredETFs: Record<string, number>;
  results: DebugResult[];
  instrumentsCount: number;
  summary: {
    total: number;
    successful: number;
    failedInstrument: number;
    failedPrice: number;
    successfulTickers: string[];
    failedTickers: string[];
  };
}> => {
  console.log('\n🔍 DEBUG: Portfolio Balancing Analysis');
  console.log('=====================================\n');

  // Get account configuration
  const accountConfig = getAccountConfig();
  const configuredETFs = accountConfig.desired_wallet;
  
  console.log('📋 Configured ETFs from CONFIG.json:');
  for (const [ticker, percent] of Object.entries(configuredETFs)) {
    console.log(`  ${ticker}: ${percent}%`);
  }
  console.log(`  Total: ${Object.keys(configuredETFs).length} ETFs\n`);

  // Load instruments
  console.log('📡 Loading instruments from Tinkoff API...');
  await getInstruments();
  const instrumentsCount = ((global as any).INSTRUMENTS || []).length;
  console.log(`✅ Loaded ${instrumentsCount} instruments\n`);

  // Process each ETF
  const results: DebugResult[] = [];
  
  console.log('🔍 Analyzing each ETF:');
  console.log('======================');

  for (const [tickerRaw, percent] of Object.entries(configuredETFs)) {
    const normalizedTicker = normalizeTicker(tickerRaw) || tickerRaw;
    
    console.log(`\n📊 Processing ${tickerRaw} (${percent}%):`);
    console.log(`  Normalized: ${normalizedTicker}`);

    const result: DebugResult = {
      ticker: tickerRaw,
      normalizedTicker,
      foundInInstruments: false,
      priceAvailable: false,
      status: 'FAILED_INSTRUMENT'
    };

    // Step 1: Check if instrument exists in INSTRUMENTS
    const foundInstrument = _.find((global as any).INSTRUMENTS, (i: any) => tickersEqual(i.ticker, normalizedTicker));
    
    if (!foundInstrument) {
      console.log(`  ❌ Not found in INSTRUMENTS array`);
      console.log(`  🔍 Searching for similar tickers...`);
      
      // Search for similar tickers
      const similarTickers = ((global as any).INSTRUMENTS || [])
        .filter((i: any) => i.ticker && i.ticker.includes(normalizedTicker.substring(0, 3)))
        .map((i: any) => i.ticker)
        .slice(0, 5);
      
      if (similarTickers.length > 0) {
        console.log(`  📝 Similar tickers found: ${similarTickers.join(', ')}`);
      } else {
        console.log(`  📝 No similar tickers found`);
      }
      
      result.status = 'FAILED_INSTRUMENT';
      result.reason = 'Instrument not found in INSTRUMENTS array';
      results.push(result);
      continue;
    }

    console.log(`  ✅ Found in INSTRUMENTS`);
    result.foundInInstruments = true;
    result.instrumentData = foundInstrument;
    result.figi = foundInstrument.figi;
    result.lotSize = foundInstrument.lot;

    console.log(`  📋 FIGI: ${foundInstrument.figi}`);
    console.log(`  📋 Lot Size: ${foundInstrument.lot}`);
    console.log(`  📋 Currency: ${foundInstrument.currency}`);
    console.log(`  📋 Name: ${foundInstrument.name}`);

    // Step 2: Check if we can get last price
    console.log(`  💰 Fetching last price...`);
    
    try {
      const lastPrice = await getLastPrice(foundInstrument.figi);
      
      if (!lastPrice) {
        console.log(`  ❌ Failed to get last price`);
        result.status = 'FAILED_PRICE';
        result.reason = 'getLastPrice returned null/undefined';
        results.push(result);
        continue;
      }

      console.log(`  ✅ Last price available`);
      result.priceAvailable = true;
      result.lastPrice = lastPrice;
      result.status = 'SUCCESS';
      
      // Display price info
      if (lastPrice.units !== undefined || lastPrice.nano !== undefined) {
        const priceValue = (lastPrice.units || 0) + (lastPrice.nano || 0) / 1000000000;
        console.log(`  💰 Price: ${priceValue} RUB`);
      }
      
    } catch (error) {
      console.log(`  ❌ Error fetching last price: ${error}`);
      result.status = 'FAILED_PRICE';
      result.reason = `getLastPrice threw error: ${error}`;
    }

    results.push(result);
  }

  // Generate summary
  const summary = {
    total: results.length,
    successful: results.filter(r => r.status === 'SUCCESS').length,
    failedInstrument: results.filter(r => r.status === 'FAILED_INSTRUMENT').length,
    failedPrice: results.filter(r => r.status === 'FAILED_PRICE').length,
    successfulTickers: results.filter(r => r.status === 'SUCCESS').map(r => r.ticker),
    failedTickers: results.filter(r => r.status !== 'SUCCESS').map(r => r.ticker)
  };

  console.log('\n\n📊 SUMMARY:');
  console.log('===========');
  console.log(`Total ETFs configured: ${summary.total}`);
  console.log(`✅ Successful: ${summary.successful} (${summary.successfulTickers.join(', ')})`);
  console.log(`❌ Failed - Instrument not found: ${summary.failedInstrument}`);
  console.log(`❌ Failed - Price fetch failed: ${summary.failedPrice}`);
  
  if (summary.failedTickers.length > 0) {
    console.log(`❌ Failed ETFs: ${summary.failedTickers.join(', ')}`);
  }

  console.log('\n🎯 EXPECTED BEHAVIOR:');
  console.log('All 12 ETFs should show as "✅ Successful" for proper balancing');
  
  if (summary.successful === summary.total) {
    console.log('\n🎉 SUCCESS: All ETFs can be processed by the balancer!');
  } else {
    console.log('\n⚠️  ISSUE IDENTIFIED: Some ETFs will be skipped during balancing');
    console.log('This explains why only 3 ETFs are being balanced instead of all 12.');
  }

  return {
    configuredETFs,
    results,
    instrumentsCount,
    summary
  };
};

// Additional debugging for INSTRUMENTS content
export const debugInstrumentsContent = async (): Promise<void> => {
  console.log('\n🔍 INSTRUMENTS Array Analysis:');
  console.log('==============================');

  const instruments = (global as any).INSTRUMENTS || [];
  console.log(`Total instruments loaded: ${instruments.length}`);

  // Group by type
  const byType: Record<string, number> = {};
  const etfs: any[] = [];
  
  for (const instrument of instruments) {
    const type = instrument.instrumentType || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
    
    // Collect ETFs for detailed analysis
    if (instrument.instrumentType === 'etf' || 
        (instrument.ticker && instrument.ticker.startsWith('T') && instrument.ticker.length === 4)) {
      etfs.push(instrument);
    }
  }

  console.log('\nBy type:');
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }

  console.log(`\nETF-like instruments found: ${etfs.length}`);
  if (etfs.length > 0) {
    console.log('ETF tickers:');
    etfs.forEach(etf => {
      console.log(`  ${etf.ticker} - ${etf.name || 'No name'} (${etf.figi})`);
    });
  }

  // Check for our specific ETFs
  const targetETFs = ['TRAY', 'TGLD', 'TRUR', 'TRND', 'TBRU', 'TDIV', 'TITR', 'TLCB', 'TMON', 'TMOS', 'TOFZ', 'TPAY'];
  
  console.log('\nTarget ETF analysis:');
  for (const ticker of targetETFs) {
    const normalizedTicker = normalizeTicker(ticker) || ticker;
    const found = _.find(instruments, (i: any) => tickersEqual(i.ticker, normalizedTicker));
    
    if (found) {
      console.log(`  ✅ ${ticker} (${normalizedTicker}): Found - ${found.name}`);
    } else {
      console.log(`  ❌ ${ticker} (${normalizedTicker}): NOT FOUND`);
    }
  }
};

// Main debug function
export const runBalancerDebug = async (): Promise<void> => {
  try {
    console.log('🚀 Starting Balancer Debug Analysis...\n');
    
    // Load instruments first
    await getInstruments();
    
    // Run detailed analysis
    await debugInstrumentsContent();
    const analysis = await debugDesiredWalletProcessing();
    
    console.log('\n🔧 RECOMMENDATIONS:');
    console.log('===================');
    
    if (analysis.summary.failedInstrument > 0) {
      console.log('1. ❌ Some ETFs are not found in INSTRUMENTS array');
      console.log('   - Check if getInstruments() loads all required ETF types');
      console.log('   - Verify ETF tickers are spelled correctly in CONFIG.json');
      console.log('   - Check if Tinkoff API token has access to these instruments');
    }
    
    if (analysis.summary.failedPrice > 0) {
      console.log('2. ❌ Some ETFs have price fetching issues');
      console.log('   - Check if these ETFs are actively traded');
      console.log('   - Verify market is open for price data');
      console.log('   - Check API rate limits and error handling');
    }
    
    if (analysis.summary.successful === analysis.summary.total) {
      console.log('✅ All ETFs are properly accessible - the issue may be elsewhere in the balancer logic');
    }
    
  } catch (error) {
    console.error('❌ Debug analysis failed:', error);
  }
};

// If run directly
if (require.main === module) {
  runBalancerDebug();
}