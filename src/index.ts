import 'dotenv/config';
import { provider } from './provider/index';
import { createSdk } from 'tinkoff-sdk-grpc-js';
import { listAccounts } from './utils';
import debug from 'debug';
// import { balancer } from './balancer/index';
// import { DESIRED_WALLET } from './config';

const debugMain = debug('bot').extend('main');

const main = async () => {
  debugMain('main start');
  if (process.argv.includes('--list-accounts')) {
    const { users } = createSdk(process.env.TOKEN || '');
    const accounts = await listAccounts(users);
    console.log('Available accounts:');
    for (const acc of accounts) {
      console.log(`#${acc.index}: id=${acc.id} type=${acc.type} name=${acc.name}`);
    }
    return;
  }
  const runOnce = process.argv.includes('--once');
  await provider({ runOnce });
  // TODO: currently balancer is called from provider, not from main. Need to refactor.
  // debugMain('provider done');
  // await balancer((global as any).POSITIONS, DESIRED_WALLET);
};

main();
