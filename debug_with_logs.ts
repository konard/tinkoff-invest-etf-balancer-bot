// Включаем debug режим для балансировщика
process.env.DEBUG = 'bot:balancer';

import { balancer } from './src/balancer';
import { Wallet, DesiredWallet } from './src/types.d';
import { convertNumberToTinkoffNumber } from './src/utils';

console.log('=== ТЕСТ БАЛАНСИРОВЩИКА С DEBUG ЛОГАМИ ===\n');

// Простой тестовый случай
const testWallet: Wallet = [
  {
    base: 'TGLD',
    quote: 'RUB', 
    figi: 'BBG004S68505',
    amount: 50,
    lotSize: 1,
    price: convertNumberToTinkoffNumber(100),
    priceNumber: 100,
    lotPrice: convertNumberToTinkoffNumber(100),
    lotPriceNumber: 100,
    totalPrice: convertNumberToTinkoffNumber(5000),
    totalPriceNumber: 5000,
  },
  {
    base: 'TRUR',
    quote: 'RUB',
    figi: 'BBG004S68614', 
    amount: 10,
    lotSize: 1,
    price: convertNumberToTinkoffNumber(100),
    priceNumber: 100,
    lotPrice: convertNumberToTinkoffNumber(100),
    lotPriceNumber: 100,
    totalPrice: convertNumberToTinkoffNumber(1000),
    totalPriceNumber: 1000,
  },
  {
    base: 'RUB',
    quote: 'RUB',
    figi: undefined,
    amount: 1000,
    lotSize: 1,
    price: convertNumberToTinkoffNumber(1),
    priceNumber: 1,
    lotPrice: convertNumberToTinkoffNumber(1), 
    lotPriceNumber: 1,
    totalPrice: convertNumberToTinkoffNumber(1000),
    totalPriceNumber: 1000,
  }
];

const desiredWallet: DesiredWallet = {
  'TGLD': 50,
  'TRUR': 50,
};

(global as any).INSTRUMENTS = [
  { ticker: 'TGLD', figi: 'BBG004S68505', lot: 1 },
  { ticker: 'TRUR', figi: 'BBG004S68614', lot: 1 }
];

async function testWithDebug() {
  console.log('🔍 Запускаем балансировщик с включенным debug режимом...\n');
  
  try {
    const result = await balancer(testWallet, desiredWallet, [], 'manual', true);
    
    console.log('\n📋 ИТОГОВЫЕ ОРДЕРА:');
    if (result.ordersPlanned && result.ordersPlanned.length > 0) {
      result.ordersPlanned.forEach((order, index) => {
        const action = (order.toBuyLots || 0) > 0 ? 'КУПИТЬ' : 'ПРОДАТЬ';
        const lots = Math.abs(order.toBuyLots || 0);
        console.log(`${index + 1}. ${action} ${lots} лотов ${order.base}`);
      });
    } else {
      console.log('Нет запланированных ордеров');
    }
    
  } catch (error) {
    console.error('❌ ОШИБКА:', error);
  }
}

testWithDebug();