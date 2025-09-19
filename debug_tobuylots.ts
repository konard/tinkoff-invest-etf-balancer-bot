import { balancer, normalizeDesire } from './src/balancer';
import { Wallet, DesiredWallet } from './src/types.d';
import { convertNumberToTinkoffNumber } from './src/utils';
import _ from 'lodash';

console.log('=== ДИАГНОСТИКА РАСЧЕТА toBuyLots ===\n');

// Создаем простой тестовый случай
const testWallet: Wallet = [
  {
    base: 'TGLD',
    quote: 'RUB', 
    figi: 'BBG004S68505',
    amount: 50,  // 50 лотов TGLD
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
    amount: 10,  // 10 лотов TRUR
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
    amount: 1000, // 1000 рублей
    lotSize: 1,
    price: convertNumberToTinkoffNumber(1),
    priceNumber: 1,
    lotPrice: convertNumberToTinkoffNumber(1), 
    lotPriceNumber: 1,
    totalPrice: convertNumberToTinkoffNumber(1000),
    totalPriceNumber: 1000,
  }
];

// Желаемый портфель: 50% TGLD, 50% TRUR
const desiredWallet: DesiredWallet = {
  'TGLD': 50,  // Должно остаться 50% = 3500₽ = 35 лотов (продать 15 лотов)
  'TRUR': 50,  // Должно стать 50% = 3500₽ = 35 лотов (купить 25 лотов)
};

// Устанавливаем моковые инструменты
(global as any).INSTRUMENTS = [
  { ticker: 'TGLD', figi: 'BBG004S68505', lot: 1 },
  { ticker: 'TRUR', figi: 'BBG004S68614', lot: 1 }
];

async function analyzeToBuyLots() {
  const totalValue = _.sumBy(testWallet.filter(p => p.base !== p.quote), 'totalPriceNumber');
  console.log(`📊 Общая стоимость ценных бумаг: ${totalValue}₽`);
  console.log(`💰 Наличные рубли: ${testWallet.find(p => p.base === 'RUB')?.totalPriceNumber}₽\n`);
  
  console.log('🎯 ОЖИДАНИЯ:');
  console.log('TGLD: 50% = 3000₽ = 30 лотов (сейчас 50, продать 20)');  
  console.log('TRUR: 50% = 3000₽ = 30 лотов (сейчас 10, купить 20)\n');
  
  try {
    const result = await balancer(testWallet, desiredWallet, [], 'manual', true);
    
    console.log('📋 РЕЗУЛЬТАТЫ РАСЧЕТА toBuyLots:');
    
    // Находим позиции в результате и показываем их toBuyLots
    if (result.ordersPlanned) {
      result.ordersPlanned.forEach(order => {
        const action = (order.toBuyLots || 0) > 0 ? 'КУПИТЬ' : 'ПРОДАТЬ';
        const lots = Math.abs(order.toBuyLots || 0);
        console.log(`${order.base}: toBuyLots=${order.toBuyLots} → ${action} ${lots} лотов`);
        console.log(`  Текущее количество: ${order.amount || 0} лотов`);
        console.log(`  Цена за лот: ${order.lotPriceNumber}₽`);
        console.log(`  Сумма операции: ${lots * (order.lotPriceNumber || 0)}₽`);
      });
    }
    
    // Проверим финальные проценты
    console.log('\n🔍 ФИНАЛЬНЫЕ ПРОЦЕНТЫ:');
    Object.entries(result.finalPercents).forEach(([ticker, percent]) => {
      console.log(`${ticker}: ${percent.toFixed(1)}%`);
    });
    
    // Анализ проблемы
    const hasSellingOrders = result.ordersPlanned?.some(order => (order.toBuyLots || 0) < 0);
    if (!hasSellingOrders) {
      console.log('\n⚠️  ПРОБЛЕМА ПОДТВЕРЖДЕНА: Нет ордеров на продажу!');
      console.log('По логике должна быть продажа 20 лотов TGLD для получения 2000₽');
      console.log('И покупка 20 лотов TRUR на полученные 2000₽');
    } else {
      console.log('\n✅ Найдены ордера на продажу - логика работает правильно');
    }
    
  } catch (error) {
    console.error('❌ ОШИБКА:', error);
  }
}

analyzeToBuyLots();