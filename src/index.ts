import 'dotenv/config';
import { provider } from './provider/index';
import { createSdk } from 'tinkoff-sdk-grpc-js';
import { listAccounts } from './utils';
import { configLoader } from './configLoader';
import debug from 'debug';
// import { balancer } from './balancer/index';
// import { DESIRED_WALLET } from './config';

const debugMain = debug('bot').extend('main');

const main = async () => {
  debugMain('main start');
  
  if (process.argv.includes('--list-accounts')) {
    const accounts = configLoader.getAllAccounts();
    console.log('🔍 Configured accounts:');
    accounts.forEach((account, index) => {
      console.log(`#${index}: id=${account.id} name=${account.name} account_id=${account.account_id}`);
    });
    return;
  }
  
  const runOnce = process.argv.includes('--once');
  const accounts = configLoader.getAllAccounts();
  
  if (accounts.length === 0) {
    console.error('❌ No accounts found in configuration');
    return;
  }
  
  console.log(`🔄 Processing ${accounts.length} account(s)...`);
  
  // Process each account
  for (const account of accounts) {
    try {
      console.log(`\n=== Processing Account: ${account.name} (${account.id}) ===`);
      process.env.ACCOUNT_ID = account.id;
      await provider({ runOnce, accountConfig: account });
    } catch (error) {
      console.error(`❌ Error processing account ${account.name}:`, error);
      // Continue with other accounts
    }
  }
  
  console.log('\n✅ All accounts processed');
  // TODO: currently balancer is called from provider, not from main. Need to refactor.
  // debugMain('provider done');
  // await balancer((global as any).POSITIONS, DESIRED_WALLET);
};

main();
