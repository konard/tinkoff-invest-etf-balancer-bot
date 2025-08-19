#!/usr/bin/env bun

/**
 * Демонстрация детального вывода результатов балансировки
 * Показывает формат: TICKER: before% -> after% (target%)
 */

// Имитация данных портфеля до балансировки
const initialShares = {
  TMON: 0,
  TPAY: 18.5,
  TOFZ: 7.2,
  TDIV: 12.8,
  TGLD: 16.3,
  TLCB: 0,
  TRND: 14.1,
  TRUR: 13.7,
  TBRU: 0,
  TMOS: 13.4,
  TITR: 0,
};

// Имитация целевых долей от балансировщика
const targetPercents = {
  TMON: 0,
  TPAY: 19,
  TOFZ: 8,
  TDIV: 13,
  TGLD: 17,
  TLCB: 0,
  TRND: 15,
  TRUR: 14,
  TBRU: 0,
  TMOS: 14,
  TITR: 0,
};

// Имитация фактических долей после балансировки
const finalShares = {
  TMON: 0,
  TPAY: 19,
  TOFZ: 8,
  TDIV: 13,
  TGLD: 17,
  TLCB: 0,
  TRND: 15,
  TRUR: 14,
  TBRU: 0,
  TMOS: 14,
  TITR: 0,
};

/**
 * Рассчитывает доли каждого инструмента в портфеле
 * @param wallet - массив позиций портфеля
 * @returns объект с тикерами и их долями в процентах
 */
const calculatePortfolioShares = (shares: Record<string, number>): Record<string, number> => {
  return shares;
};

/**
 * Демонстрация детального вывода результата балансировки
 */
const demoDetailedOutput = () => {
  console.log('=== ДЕМОНСТРАЦИЯ ДЕТАЛЬНОГО ВЫВОДА БАЛАНСИРОВКИ ===\n');
  
  // Сохраняем текущие доли портфеля ДО балансировки
  const beforeShares = calculatePortfolioShares(initialShares);
  
  // Получаем целевые доли от балансировщика
  const finalPercents = targetPercents;
  
  // Получаем обновленные доли ПОСЛЕ балансировки
  const afterShares = calculatePortfolioShares(finalShares);
  
        // Детальный вывод результата балансировки
      console.log('BALANCING RESULT:');
      console.log('Format: TICKER: diff: before% -> after% (target%)');
      console.log('Where: before% = current share, after% = actual share after balancing, (target%) = target from balancer, diff = change in percentage points\n');
      
      // Сортируем тикеры по убыванию доли после балансировки (after)
      const sortedTickers = Object.keys(finalPercents).sort((a, b) => {
        const afterA = afterShares[a] || 0;
        const afterB = afterShares[b] || 0;
        return afterB - afterA; // Убывание: от большего к меньшему
      });
      
      for (const ticker of sortedTickers) {
        if (ticker && ticker !== 'RUB') {
          const beforePercent = beforeShares[ticker] || 0;
          const afterPercent = afterShares[ticker] || 0;
          const targetPercent = finalPercents[ticker] || 0;
          
          // Вычисляем изменение в процентных пунктах
          const diff = afterPercent - beforePercent;
          const diffSign = diff > 0 ? '+' : '';
          const diffText = diff === 0 ? '0%' : `${diffSign}${diff.toFixed(2)}%`;
          
          console.log(`${ticker}: ${diffText}: ${beforePercent.toFixed(2)}% -> ${afterPercent.toFixed(2)}% (${targetPercent.toFixed(2)}%)`);
        }
      }
      
      // Добавляем баланс рублей (может быть отрицательным при маржинальной торговле)
      console.log(`RUR: 5000.00 RUB`);
  
  console.log('\n=== АНАЛИЗ ИЗМЕНЕНИЙ ===');
  
  // Анализируем изменения
  for (const ticker of sortedTickers) {
    if (ticker && ticker !== 'RUB') {
      const beforePercent = Math.round(beforeShares[ticker] || 0);
      const afterPercent = Math.round(afterShares[ticker] || 0);
      const targetPercent = Math.round(finalPercents[ticker] || 0);
      
      if (beforePercent !== afterPercent) {
        const change = afterPercent - beforePercent;
        const changeSymbol = change > 0 ? '+' : '';
        console.log(`${ticker}: ${changeSymbol}${change}% (${beforePercent}% → ${afterPercent}%)`);
      } else if (beforePercent !== targetPercent) {
        console.log(`${ticker}: без изменений (${beforePercent}% = ${targetPercent}%)`);
      } else {
        console.log(`${ticker}: уже сбалансирован (${beforePercent}%)`);
      }
    }
  }
};

// Запускаем демонстрацию
if (import.meta.main) {
  demoDetailedOutput();
}

export { demoDetailedOutput };
