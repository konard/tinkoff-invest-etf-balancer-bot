#!/usr/bin/env node

import { configLoader } from '../configLoader';
import { AccountConfig } from '../types.d';

/**
 * Utility for managing multiple account configurations
 * Allows viewing, validating and managing settings
 */

function printAccountInfo(account: AccountConfig): void {
  console.log(`\n📊 Account: ${account.name} (ID: ${account.id})`);
  
  // Display token information
  const rawToken = configLoader.getRawTokenValue(account.id);
  const resolvedToken = configLoader.getAccountToken(account.id);
  const isFromEnv = configLoader.isTokenFromEnv(account.id);
  
  if (isFromEnv) {
    console.log(`🔑 Token: ${rawToken} → ${resolvedToken || 'NOT FOUND'}`);
    if (!resolvedToken) {
      console.log(`⚠️  Environment variable not set!`);
    }
  } else {
    console.log(`🔑 Token: ${rawToken} (directly specified)`);
  }
  
  console.log(`💼 Account: ${account.account_id}`);
  console.log(`⚙️  Mode: ${account.desired_mode}`);
  console.log(`⏰ Rebalancing interval: ${account.balance_interval / 1000 / 60} min`);
  console.log(`⏳ Delay between orders: ${account.sleep_between_orders} ms`);
  
  console.log(`\n📈 Target weights:`);
  const totalWeight = Object.values(account.desired_wallet).reduce((sum, weight) => sum + weight, 0);
  Object.entries(account.desired_wallet).forEach(([ticker, weight]) => {
    console.log(`  ${ticker}: ${weight}%`);
  });
  console.log(`  Total: ${totalWeight}%`);
  
  if (Math.abs(totalWeight - 100) > 1) {
    console.log(`⚠️  Warning: sum of weights is not equal to 100%`);
  }
  
  console.log(`\n💰 Margin trading:`);
  console.log(`  Enabled: ${account.margin_trading.enabled ? '✅' : '❌'}`);
  if (account.margin_trading.enabled) {
    console.log(`  Multiplier: ${account.margin_trading.multiplier}x`);
    console.log(`  Threshold: ${account.margin_trading.free_threshold} ₽`);
    console.log(`  Strategy: ${account.margin_trading.balancing_strategy}`);
  }
}

function validateConfig(): void {
  try {
    const config = configLoader.loadConfig();
    console.log('✅ Configuration loaded successfully');
    
    // Additional validation
    const accounts = config.accounts;
    const accountIds = new Set();
    const tokens = new Set();
    let envTokensCount = 0;
    let directTokensCount = 0;
    
    for (const account of accounts) {
      if (accountIds.has(account.id)) {
        console.log(`❌ Duplicate account ID: ${account.id}`);
      }
      accountIds.add(account.id);
      
      // Check tokens
      const rawToken = account.t_invest_token;
      const isFromEnv = configLoader.isTokenFromEnv(account.id);
      const resolvedToken = configLoader.getAccountToken(account.id);
      
      if (isFromEnv) {
        envTokensCount++;
        if (!resolvedToken) {
          console.log(`⚠️  Environment variable not found for ${account.id}: ${rawToken}`);
        }
      } else {
        directTokensCount++;
        if (tokens.has(resolvedToken || rawToken)) {
          console.log(`❌ Duplicate token: ${resolvedToken || rawToken}`);
        }
        tokens.add(resolvedToken || rawToken);
      }
    }
    
    console.log(`\n📋 Statistics:`);
    console.log(`  Total accounts: ${accounts.length}`);
    console.log(`  Unique IDs: ${accountIds.size}`);
    console.log(`  Tokens from environment variables: ${envTokensCount}`);
    console.log(`  Directly specified tokens: ${directTokensCount}`);
    
  } catch (error) {
    console.error(`❌ Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

function listAccounts(): void {
  const accounts = configLoader.getAllAccounts();
  
  if (accounts.length === 0) {
    console.log('❌ No accounts found in configuration');
    return;
  }
  
  console.log(`\n📋 Found accounts: ${accounts.length}`);
  
  accounts.forEach((account, index) => {
    const isFromEnv = configLoader.isTokenFromEnv(account.id);
    const tokenStatus = isFromEnv ? '${ENV}' : 'direct';
    
    console.log(`\n${index + 1}. ${account.name} (${account.id})`);
    console.log(`   Token: ${account.t_invest_token} [${tokenStatus}]`);
    console.log(`   Account: ${account.account_id}`);
    console.log(`   Mode: ${account.desired_mode}`);
  });
}

function showAccountDetails(accountId: string): void {
  const account = configLoader.getAccountById(accountId);
  
  if (!account) {
    console.error(`❌ Account with ID '${accountId}' not found`);
    console.log('\nAvailable accounts:');
    const accounts = configLoader.getAllAccounts();
    accounts.forEach(acc => console.log(`  - ${acc.id}: ${acc.name}`));
    process.exit(1);
  }
  
  printAccountInfo(account);
}

function showEnvironmentSetup(): void {
  console.log('\n🔧 Environment variables setup:');
  console.log('\nCreate .env file with the following variables:');
  
  const accounts = configLoader.getAllAccounts();
  const envTokens = new Set<string>();
  
  accounts.forEach(account => {
    if (configLoader.isTokenFromEnv(account.id)) {
      const envVarName = account.t_invest_token.slice(2, -1);
      envTokens.add(envVarName);
    }
  });
  
  if (envTokens.size > 0) {
    Array.from(envTokens).forEach(token => {
      console.log(`${token}=`);
    });
  } else {
    console.log('(No tokens from environment variables)');
  }
  
  console.log('\nOPENROUTER_API_KEY=your_api_key_here');
  console.log('OPENROUTER_MODEL=qwen/qwen3-235b-a22b-2507');
  
  console.log('\n💡 Token examples in CONFIG.json:');
  console.log('  "t_invest_token": "${T_INVEST_TOKEN_1}"  # From environment variable');
  console.log('  "t_invest_token": "t.1234567890abcdef"   # Directly specified token');
}

function showTokenInfo(): void {
  console.log('\n🔑 Token information:');
  console.log('\nIn CONFIG.json you can specify tokens in two ways:');
  console.log('\n1️⃣ From environment variables:');
  console.log('   "t_invest_token": "${T_INVEST_TOKEN_1}"');
  console.log('   → Will look for value in process.env.T_INVEST_TOKEN_1');
  console.log('\n2️⃣ Directly specified token:');
  console.log('   "t_invest_token": "t.1234567890abcdef"');
  console.log('   → Will be used as is');
  
  console.log('\n📋 Current tokens:');
  const accounts = configLoader.getAllAccounts();
  accounts.forEach(account => {
    const isFromEnv = configLoader.isTokenFromEnv(account.id);
    const resolvedToken = configLoader.getAccountToken(account.id);
    const status = isFromEnv 
      ? (resolvedToken ? '✅' : '❌') 
      : '🔒';
    
    console.log(`  ${account.id}: ${account.t_invest_token} ${status}`);
    if (isFromEnv && !resolvedToken) {
      console.log(`    ⚠️  Environment variable not found`);
    }
  });
}

function printHelp(): void {
  console.log(`
🔧 Tinkoff Invest ETF Balancer Bot Configuration Manager

Usage:
  npm run config [command] [arguments]

Commands:
  list                    - Show list of all accounts
  show <account_id>       - Show details of specific account
  validate               - Validate configuration
  env                    - Show environment variables setup
  tokens                 - Show token information
  help                   - Show this help

Examples:
  npm run config list
  npm run config show account_1
  npm run config validate
  npm run config env
  npm run config tokens

Configuration files:
  CONFIG.json            - Main account configuration
  .env                   - Environment variables with tokens

Token formats:
  "${VARIABLE_NAME}"     - From environment variable
  "t.1234567890abcdef"   - Directly specified token
  `);
}

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  
  try {
    switch (command) {
      case 'list':
        listAccounts();
        break;
        
      case 'show':
        const accountId = args[1];
        if (!accountId) {
          console.error('❌ Specify account ID: npm run config show <account_id>');
          process.exit(1);
        }
        showAccountDetails(accountId);
        break;
        
      case 'validate':
        validateConfig();
        break;
        
      case 'env':
        showEnvironmentSetup();
        break;
        
      case 'tokens':
        showTokenInfo();
        break;
        
      case 'help':
      default:
        printHelp();
        break;
    }
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

// Run only if file is called directly
if (require.main === module) {
  main();
}

