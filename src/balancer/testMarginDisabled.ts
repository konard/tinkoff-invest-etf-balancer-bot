import { MarginConfig, MarginBalancingStrategy } from '../types.d';
import { MarginCalculator } from '../utils/marginCalculator';

// Тестовые данные
const testWallet = [
  {
    base: 'TPAY',
    totalPriceNumber: 90000,
    amount: 100
  },
  {
    base: 'TGLD', 
    totalPriceNumber: 75000,
    amount: 50
  },
  {
    base: 'TRUR',
    totalPriceNumber: 135000,
    amount: 200
  }
];

const testDesiredWallet = {
  TPAY: 30,
  TGLD: 25,
  TRUR: 45
};

console.log('=== Тест с выключенной маржинальной торговлей ===\n');

// Тест 1: Создаем калькулятор маржи без стратегии (имитируем выключенную маржинальную торговлю)
console.log('1. Тест калькулятора маржи без стратегии:');
const marginConfig: MarginConfig = {
  multiplier: 4,
  freeThreshold: 5000
  // strategy не передаем - имитируем выключенную маржинальную торговлю
};

const marginCalculator = new MarginCalculator(marginConfig);
console.log(`   Конфигурация: multiplier=${marginConfig.multiplier}, freeThreshold=${marginConfig.freeThreshold}`);
console.log(`   Стратегия: ${marginConfig.strategy || 'не определена'}\n`);

// Тест 2: Применение стратегии маржи без стратегии
console.log('2. Применение стратегии маржи без стратегии:');
const marginPositions = [
  {
    base: 'TPAY',
    totalPriceNumber: 90000,
    amount: 100,
    isMargin: true,
    marginValue: 67500,
    leverage: 4,
    marginCall: false
  }
];

const strategy = marginCalculator.applyMarginStrategy(marginPositions);
console.log(`   Убирать маржу: ${strategy.shouldRemoveMargin ? 'Да' : 'Нет'}`);
console.log(`   Причина: ${strategy.reason}`);
console.log(`   Стоимость переноса: ${strategy.transferCost} руб`);
console.log(`   Ожидается: стратегия по умолчанию 'keep' (оставлять маржу)\n`);

// Тест 3: Расчет оптимальных размеров без маржи
console.log('3. Расчет оптимальных размеров позиций (без маржи):');
const totalPortfolioValue = testWallet.reduce((sum, pos) => sum + (pos.totalPriceNumber || 0), 0);
console.log(`   Общая стоимость портфеля: ${totalPortfolioValue.toFixed(2)} руб`);

const result: Record<string, { baseSize: number; marginSize: number; totalSize: number }> = {};
for (const [ticker, percentage] of Object.entries(testDesiredWallet)) {
  const targetValue = (totalPortfolioValue * percentage) / 100;
  result[ticker] = {
    baseSize: targetValue,
    marginSize: 0, // Без маржи
    totalSize: targetValue
  };
}

console.log('   Результат:');
for (const [ticker, sizes] of Object.entries(result)) {
  console.log(`   ${ticker}:`);
  console.log(`     Базовый размер: ${sizes.baseSize.toFixed(2)} руб`);
  console.log(`     Маржинальный размер: ${sizes.marginSize.toFixed(2)} руб`);
  console.log(`     Общий размер: ${sizes.totalSize.toFixed(2)} руб`);
  console.log(`     Ожидается: marginSize = 0 (маржинальная торговля выключена)`);
}

console.log('\n=== Тест завершен ===');
