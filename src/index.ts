import 'dotenv/config';
import { provider } from './provider/index';
import { createSdk } from 'tinkoff-sdk-grpc-js';
import { listAccounts } from './utils';
// import { balancer } from './balancer/index';
// import { DESIRED_WALLET } from './config';
const debug = require('debug')('bot').extend('main');

const main = async () => {
  debug('main start');
  if (process.argv.includes('--list-accounts')) {
    const { users } = createSdk(process.env.TOKEN || '');
    const accounts = await listAccounts(users);
    console.log('Доступные счета:');
    for (const acc of accounts) {
      console.log(`#${acc.index}: id=${acc.id} type=${acc.type} name=${acc.name}`);
    }
    return;
  }
  await provider();
  // TODO: сейчас balancer вызывается из provider, а не из main. Нужно переделать.
  // debug('provider done');
  // await balancer((global as any).POSITIONS, DESIRED_WALLET);
};

main();
