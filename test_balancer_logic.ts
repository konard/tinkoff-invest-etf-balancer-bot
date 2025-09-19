import { balancer } from './src/balancer';
import { Wallet, DesiredWallet } from './src/types.d';
import { convertNumberToTinkoffNumber } from './src/utils';

console.log('=== ТЕСТ ИСПРАВЛЕННОЙ ЛОГИКИ БАЛАНСИРОВЩИКА ===\n');

// Создаем тестовый портфель
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

// Желаемый портфель - равные доли
const desiredWallet: DesiredWallet = {
  'TGLD': 30, // Хотим меньше TGLD (сейчас ~67%)
  'TRUR': 60, // Хотим больше TRUR (сейчас ~28%)  
  'RUB': 10   // Хотим меньше рублей
};

async function testBalancerLogic() {
  try {
    // Устанавливаем моковые инструменты
    (global as any).INSTRUMENTS = [
      { ticker: 'TGLD', figi: 'BBG004S68505', lot: 1 },
      { ticker: 'TRUR', figi: 'BBG004S68614', lot: 1 }
    ];

    console.log('📊 ТЕКУЩИЙ ПОРТФЕЛЬ:');
    console.log('TGLD: 100 × 120₽ = 12,000₽ (66.7%)');
    console.log('TRUR: 50 × 100₽ = 5,000₽ (27.8%)'); 
    console.log('RUB: 1,000₽ (5.6%)');
    console.log('ИТОГО: 18,000₽\n');

    console.log('🎯 ЖЕЛАЕМЫЙ ПОРТФЕЛЬ:');
    console.log('TGLD: 30% = 5,400₽ (нужно продать)');
    console.log('TRUR: 60% = 10,800₽ (нужно купить)');
    console.log('RUB: 10% = 1,800₽\n');

    console.log('⚙️ ЗАПУСКАЕМ БАЛАНСИРОВЩИК (dry-run)...\n');

    const result = await balancer(testWallet, desiredWallet, [], 'manual', true);

    console.log('✅ РЕЗУЛЬТАТ:');
    console.log('Final percents:', result.finalPercents);
    console.log('Mode used:', result.modeUsed);
    console.log('Total portfolio value:', result.totalPortfolioValue);
    console.log('Orders planned:', result.ordersPlanned?.length || 0);

    if (result.ordersPlanned && result.ordersPlanned.length > 0) {
      console.log('\n📋 ПЛАНИРУЕМЫЕ ОРДЕРА:');
      result.ordersPlanned.forEach((order, index) => {
        const action = (order.toBuyLots || 0) > 0 ? 'КУПИТЬ' : 'ПРОДАТЬ';
        const lots = Math.abs(order.toBuyLots || 0);
        console.log(`${index + 1}. ${action} ${lots} лотов ${order.base} (${lots * (order.lotPriceNumber || 0)}₽)`);
      });
    }

    console.log('\n🔄 ЛОГИКА ПОСЛЕДОВАТЕЛЬНОСТИ:');
    console.log('- Сначала должны выполняться продажи (получение средств)');
    console.log('- Потом покупки (использование полученных средств)');
    console.log('- Это обеспечивает наличие достаточных средств для покупок');

  } catch (error) {
    console.error('❌ ОШИБКА:', error);
  }
}

testBalancerLogic();