import { balancer, normalizeDesire } from './src/balancer';
import { Wallet, DesiredWallet } from './src/types.d';
import { convertNumberToTinkoffNumber, sumValues } from './src/utils';
import _ from 'lodash';

console.log('=== ДЕТАЛЬНАЯ ДИАГНОСТИКА ЛОГИКИ БАЛАНСИРОВЩИКА ===\n');

// Создаем тестовый портфель с небалансом
const testWallet: Wallet = [
  {
    base: 'TGLD',
    quote: 'RUB', 
    figi: 'BBG004S68505',
    amount: 100,
    lotSize: 1,
    price: convertNumberToTinkoffNumber(120),
    priceNumber: 120,
    lotPrice: convertNumberToTinkoffNumber(120),
    lotPriceNumber: 120,
    totalPrice: convertNumberToTinkoffNumber(12000),
    totalPriceNumber: 12000,
  },
  {
    base: 'TRUR',
    quote: 'RUB',
    figi: 'BBG004S68614', 
    amount: 10,  // Мало TRUR
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
    amount: 2000, // Много рублей
    lotSize: 1,
    price: convertNumberToTinkoffNumber(1),
    priceNumber: 1,
    lotPrice: convertNumberToTinkoffNumber(1), 
    lotPriceNumber: 1,
    totalPrice: convertNumberToTinkoffNumber(2000),
    totalPriceNumber: 2000,
  }
];

// Желаемый портфель - нужны продажи
const desiredWallet: DesiredWallet = {
  'TGLD': 40, // Нужно продать TGLD (сейчас 80%)
  'TRUR': 50, // Нужно купить TRUR (сейчас 6.7%)
  'RUB': 10   // Нужно продать RUB (сейчас 13.3%)
};

// Устанавливаем моковые инструменты
(global as any).INSTRUMENTS = [
  { ticker: 'TGLD', figi: 'BBG004S68505', lot: 1 },
  { ticker: 'TRUR', figi: 'BBG004S68614', lot: 1 }
];

async function debugBalancerLogic() {
  console.log('📊 АНАЛИЗ ТЕКУЩЕГО ПОРТФЕЛЯ:');
  const totalValue = _.sumBy(testWallet, 'totalPriceNumber');
  console.log(`Общая стоимость: ${totalValue}₽`);
  
  testWallet.forEach(pos => {
    const percentage = ((pos.totalPriceNumber || 0) / totalValue * 100).toFixed(1);
    console.log(`${pos.base}: ${pos.amount} × ${pos.priceNumber}₽ = ${pos.totalPriceNumber}₽ (${percentage}%)`);
  });
  
  console.log('\n🎯 НОРМАЛИЗАЦИЯ ЖЕЛАЕМОГО ПОРТФЕЛЯ:');
  console.log('До нормализации:', desiredWallet);
  const normalizedDesire = normalizeDesire(desiredWallet);
  console.log('После нормализации:', normalizedDesire);
  
  console.log('\n💰 РАССЧЕТ ЦЕЛЕВЫХ СУММ:');
  Object.entries(normalizedDesire).forEach(([ticker, percentage]) => {
    const targetAmount = (totalValue * percentage) / 100;
    const currentPos = testWallet.find(p => p.base === ticker);
    const currentAmount = currentPos?.totalPriceNumber || 0;
    const difference = targetAmount - currentAmount;
    
    console.log(`${ticker}:`);
    console.log(`  Целевая сумма: ${targetAmount.toFixed(0)}₽ (${percentage}%)`);
    console.log(`  Текущая сумма: ${currentAmount.toFixed(0)}₽`);
    console.log(`  Разница: ${difference > 0 ? '+' : ''}${difference.toFixed(0)}₽ ${difference > 0 ? '(КУПИТЬ)' : '(ПРОДАТЬ)'}`);
  });

  console.log('\n⚙️ ЗАПУСКАЕМ БАЛАНСИРОВЩИК...');
  
  try {
    const result = await balancer(testWallet, desiredWallet, [], 'manual', true);
    
    console.log('\n✅ РЕЗУЛЬТАТ БАЛАНСИРОВКИ:');
    console.log('Планируемые ордера:', result.ordersPlanned?.length || 0);
    
    if (result.ordersPlanned && result.ordersPlanned.length > 0) {
      console.log('\n📋 ДЕТАЛИЗАЦИЯ ОРДЕРОВ:');
      
      let sellOrders = 0;
      let buyOrders = 0;
      
      result.ordersPlanned.forEach((order, index) => {
        const toBuyLots = order.toBuyLots || 0;
        if (toBuyLots > 0) {
          buyOrders++;
          console.log(`${index + 1}. КУПИТЬ ${toBuyLots} лотов ${order.base}`);
          console.log(`   Цена за лот: ${order.lotPriceNumber}₽`);
          console.log(`   Общая сумма: ${(toBuyLots * (order.lotPriceNumber || 0)).toFixed(0)}₽`);
        } else if (toBuyLots < 0) {
          sellOrders++;
          console.log(`${index + 1}. ПРОДАТЬ ${Math.abs(toBuyLots)} лотов ${order.base}`);
          console.log(`   Цена за лот: ${order.lotPriceNumber}₽`);
          console.log(`   Получим: ${(Math.abs(toBuyLots) * (order.lotPriceNumber || 0)).toFixed(0)}₽`);
        }
      });
      
      console.log(`\n📊 СТАТИСТИКА: ${sellOrders} продаж, ${buyOrders} покупок`);
      
      if (sellOrders === 0) {
        console.log('\n⚠️  ПРОБЛЕМА: НЕТ ПРОДАЖ!');
        console.log('Это означает что логика определения продаж работает неправильно.');
        console.log('По расчетам выше должны быть продажи TGLD и RUB.');
      }
    }
    
  } catch (error) {
    console.error('❌ ОШИБКА:', error);
  }
}

debugBalancerLogic();