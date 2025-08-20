import { identifyMarginPositions, applyMarginStrategy, calculateOptimalSizes } from './index';

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

console.log('=== Тест конфигурации маржинальной торговли ===\n');

// Тест 1: Проверяем, что функции экспортируются корректно
console.log('1. Проверка экспорта функций:');
console.log(`   identifyMarginPositions: ${typeof identifyMarginPositions === 'function' ? '✅' : '❌'}`);
console.log(`   applyMarginStrategy: ${typeof applyMarginStrategy === 'function' ? '✅' : '❌'}`);
console.log(`   calculateOptimalSizes: ${typeof calculateOptimalSizes === 'function' ? '✅' : '❌'}\n`);

// Тест 2: Тестируем функцию identifyMarginPositions
console.log('2. Тест функции identifyMarginPositions:');
try {
  const marginPositions = identifyMarginPositions(testWallet);
  console.log(`   Результат: найдено ${marginPositions.length} маржинальных позиций`);
  if (marginPositions.length > 0) {
    console.log('   Детализация:');
    marginPositions.forEach(pos => {
      console.log(`     ${pos.base}: маржинальная стоимость ${pos.marginValue?.toFixed(2)} руб`);
    });
  }
} catch (error) {
  console.log(`   ❌ Ошибка: ${error}`);
}
console.log();

// Тест 3: Тестируем функцию applyMarginStrategy
console.log('3. Тест функции applyMarginStrategy:');
try {
  const marginStrategy = applyMarginStrategy(testWallet);
  console.log(`   Убирать маржу: ${marginStrategy.shouldRemoveMargin ? 'Да' : 'Нет'}`);
  console.log(`   Причина: ${marginStrategy.reason}`);
  console.log(`   Стоимость переноса: ${marginStrategy.transferCost} руб`);
  console.log(`   Маржинальных позиций: ${marginStrategy.marginPositions.length}`);
} catch (error) {
  console.log(`   ❌ Ошибка: ${error}`);
}
console.log();

// Тест 4: Тестируем функцию calculateOptimalSizes
console.log('4. Тест функции calculateOptimalSizes:');
try {
  const optimalSizes = calculateOptimalSizes(testWallet, testDesiredWallet);
  console.log('   Результат:');
  for (const [ticker, sizes] of Object.entries(optimalSizes)) {
    console.log(`   ${ticker}:`);
    console.log(`     Базовый размер: ${sizes.baseSize.toFixed(2)} руб`);
    console.log(`     Маржинальный размер: ${sizes.marginSize.toFixed(2)} руб`);
    console.log(`     Общий размер: ${sizes.totalSize.toFixed(2)} руб`);
  }
} catch (error) {
  console.log(`   ❌ Ошибка: ${error}`);
}

console.log('\n=== Тест завершен ===');
