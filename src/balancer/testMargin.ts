import { MarginCalculator } from '../utils/marginCalculator';
import { MarginConfig, MarginBalancingStrategy } from '../types.d';

// Тестовая конфигурация
const testConfig: MarginConfig = {
  multiplier: 4,
  freeThreshold: 5000,
  strategy: 'keep_if_small'
};

const marginCalculator = new MarginCalculator(testConfig);

// Тестовые данные
const testPortfolio = [
  {
    base: 'TPAY',
    totalPriceNumber: 100000,
    amount: 100,
    lotSize: 1
  },
  {
    base: 'TGLD',
    totalPriceNumber: 80000,
    amount: 80,
    lotSize: 1
  },
  {
    base: 'TRUR',
    totalPriceNumber: 120000,
    amount: 120,
    lotSize: 1
  }
];

const testMarginPositions = [
  {
    base: 'TPAY',
    totalPriceNumber: 50000,
    marginValue: 37500, // При множителе x4: 50000 - (50000/4) = 37500
    isMargin: true,
    leverage: 4,
    marginCall: false
  },
  {
    base: 'TGLD',
    totalPriceNumber: 40000,
    marginValue: 30000, // При множителе x4: 40000 - (40000/4) = 30000
    isMargin: true,
    leverage: 4,
    marginCall: false
  }
];

const testDesiredWallet = {
  TPAY: 30,
  TGLD: 25,
  TRUR: 45
};

// Тесты
console.log('=== Тест маржинальной торговли ===\n');

// 1. Расчет доступной маржи
console.log('1. Доступная маржа:');
const availableMargin = marginCalculator.calculateAvailableMargin(testPortfolio);
console.log(`   Доступная маржа: ${availableMargin.toFixed(2)} руб\n`);

// 2. Проверка лимитов
console.log('2. Проверка лимитов:');
const limits = marginCalculator.checkMarginLimits(testPortfolio, testMarginPositions);
console.log(`   Валидность: ${limits.isValid}`);
console.log(`   Доступная маржа: ${limits.availableMargin.toFixed(2)} руб`);
console.log(`   Использованная маржа: ${limits.usedMargin.toFixed(2)} руб`);
console.log(`   Оставшаяся маржа: ${limits.remainingMargin.toFixed(2)} руб`);
console.log(`   Уровень риска: ${limits.riskLevel}\n`);

// 3. Стоимость переноса
console.log('3. Стоимость переноса:');
const transferCost = marginCalculator.calculateTransferCost(testMarginPositions);
console.log(`   Общая стоимость: ${transferCost.totalCost.toFixed(2)} руб`);
console.log(`   Бесплатные переносы: ${transferCost.freeTransfers}`);
console.log(`   Платные переносы: ${transferCost.paidTransfers}`);
console.log('   Детализация:');
transferCost.costBreakdown.forEach(item => {
  console.log(`     ${item.ticker}: ${item.cost.toFixed(2)} руб (${item.isFree ? 'бесплатно' : 'платно'})`);
});
console.log();

// 4. Стратегия балансировки
console.log('4. Стратегия балансировки:');
const currentTime = new Date();
const shouldApply = marginCalculator.shouldApplyMarginStrategy(currentTime);
console.log(`   Время применения стратегии: ${shouldApply ? 'Да' : 'Нет'}`);

const strategy = marginCalculator.applyMarginStrategy(testMarginPositions, 'keep_if_small', currentTime);
console.log(`   Убирать маржу: ${strategy.shouldRemoveMargin ? 'Да' : 'Нет'}`);
console.log(`   Причина: ${strategy.reason}`);
console.log(`   Стоимость переноса: ${strategy.transferCost.toFixed(2)} руб`);
console.log(`   Информация о времени:`);
console.log(`     До закрытия рынка: ${strategy.timeInfo.timeToClose} мин`);
console.log(`     До следующей балансировки: ${strategy.timeInfo.timeToNextBalance.toFixed(1)} мин`);
console.log(`     Последняя балансировка дня: ${strategy.timeInfo.isLastBalance ? 'Да' : 'Нет'}\n`);

// Тест разных временных сценариев
console.log('4.1. Тест временных сценариев:');
const testTimes = [
  { time: new Date(2024, 0, 1, 9, 0), desc: 'Утро (9:00)' },
  { time: new Date(2024, 0, 1, 14, 0), desc: 'День (14:00)' },
  { time: new Date(2024, 0, 1, 18, 30), desc: 'Перед закрытием (18:30)' },
  { time: new Date(2024, 0, 1, 19, 0), desc: 'После закрытия (19:00)' }
];

testTimes.forEach(({ time, desc }) => {
  const shouldApply = marginCalculator.shouldApplyMarginStrategy(time);
  const strategy = marginCalculator.applyMarginStrategy(testMarginPositions, 'keep_if_small', time);
  console.log(`   ${desc}: ${shouldApply ? 'Применяем' : 'Не применяем'} стратегию`);
  if (shouldApply) {
    console.log(`     Убирать маржу: ${strategy.shouldRemoveMargin ? 'Да' : 'Нет'}`);
    console.log(`     До закрытия: ${strategy.timeInfo.timeToClose} мин`);
  }
});
console.log();

// 5. Оптимальные размеры позиций
console.log('5. Оптимальные размеры позиций:');
const optimalSizes = marginCalculator.calculateOptimalPositionSizes(testPortfolio, testDesiredWallet);
Object.entries(optimalSizes).forEach(([ticker, sizes]) => {
  console.log(`   ${ticker}:`);
  console.log(`     Базовый размер: ${sizes.baseSize.toFixed(2)} руб`);
  console.log(`     Маржинальный размер: ${sizes.marginSize.toFixed(2)} руб`);
  console.log(`     Общий размер: ${sizes.totalSize.toFixed(2)} руб`);
});
console.log();

// 6. Тест разных стратегий
console.log('6. Тест разных стратегий:');
const strategies: MarginBalancingStrategy[] = ['remove', 'keep', 'keep_if_small'];

strategies.forEach(strategyType => {
  const result = marginCalculator.applyMarginStrategy(testMarginPositions, strategyType, currentTime);
  console.log(`   ${strategyType}: ${result.shouldRemoveMargin ? 'Убирать' : 'Оставлять'} - ${result.reason}`);
});

console.log('\n=== Тест завершен ===');
