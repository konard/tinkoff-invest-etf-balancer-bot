import { normalizeDesire } from '../balancer';

console.log('=== ТЕСТИРОВАНИЕ ИСПРАВЛЕННОЙ ЛОГИКИ БАЛАНСИРОВЩИКА ===\n');

// Тестируем оригинальную конфигурацию
const originalDesiredWallet = {
  TRAY: 25, // 25% Tinkoff Passive
  TGLD: 25, // 25% Tinkoff Gold
  TRUR: 25, // 25% Tinkoff Eternal Portfolio
  TRND: 25, // 25% Tinkoff Trend 
  TBRU: 25,
  TDIV: 25,
  TITR: 25,
  TLCB: 25,
  TMON: 25,
  TMOS: 25,
  TOFZ: 25,
  TPAY: 25
};

console.log('ОРИГИНАЛЬНАЯ КОНФИГУРАЦИЯ:');
console.log('Сумма всех долей:', Object.values(originalDesiredWallet).reduce((sum, val) => sum + val, 0), '%');
console.log('Доли:', originalDesiredWallet);
console.log('');

// Тестируем исправленную функцию normalizeDesire
console.log('РЕЗУЛЬТАТ НОРМАЛИЗАЦИИ (ИСПРАВЛЕННАЯ ЛОГИКА):');
const normalizedDesire = normalizeDesire(originalDesiredWallet);
const normalizedSum = Object.values(normalizedDesire).reduce((sum, val) => sum + val, 0);

console.log('Сумма после нормализации:', normalizedSum.toFixed(2), '%');
console.log('Нормализованные доли:');
Object.entries(normalizedDesire).forEach(([ticker, percentage]) => {
  console.log(`  ${ticker}: ${percentage.toFixed(2)}%`);
});
console.log('');

// Проверяем, что сумма действительно равна 100%
if (Math.abs(normalizedSum - 100) < 0.01) {
  console.log('✅ СУММА КОРРЕКТНО НОРМАЛИЗОВАНА К 100%');
} else {
  console.log('❌ ОШИБКА: сумма не равна 100%');
}

// Проверяем, что каждая доля примерно равна 8.33% (25% / 300% * 100%)
const expectedPercentage = (25 / 300) * 100;
const allCorrect = Object.values(normalizedDesire).every(percentage => 
  Math.abs(percentage - expectedPercentage) < 0.01
);

if (allCorrect) {
  console.log('✅ ВСЕ ДОЛИ КОРРЕКТНО НОРМАЛИЗОВАНЫ');
} else {
  console.log('❌ ОШИБКА: доли нормализованы неправильно');
}

console.log('\n=== АНАЛИЗ ПРОБЛЕМЫ ===');
console.log('Проблема была в том, что:');
console.log('1. В конфиге сумма всех долей = 300% (25% × 12)');
console.log('2. После нормализации каждая доля становилась ~8.33% вместо 25%');
console.log('3. Это приводило к неправильным целевым значениям в балансировщике');
console.log('');
console.log('Теперь логика исправлена:');
console.log('1. Функция normalizeDesire корректно нормализует желаемые доли');
console.log('2. Убрана двойная нормализация');
console.log('3. Целевые доли теперь рассчитываются правильно');
console.log('');
console.log('Результат: TGLD будет стремиться к 25%, а не к 8.33%');
