import { normalizeDesire } from './src/balancer';
import { Wallet, DesiredWallet } from './src/types.d';
import { convertNumberToTinkoffNumber, normalizeTicker, tickersEqual } from './src/utils';
import _ from 'lodash';

console.log('=== ПОШАГОВАЯ ДИАГНОСТИКА РАСЧЕТА toBuyLots ===\n');

// Простой тест случай
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

function manualCalculation() {
  console.log('🔢 РУЧНОЙ РАСЧЕТ:');
  
  // 1. Нормализация желаемого портфеля
  const normalizedDesire = normalizeDesire(desiredWallet);
  console.log('Нормализованный желаемый портфель:', normalizedDesire);
  
  // 2. Общая стоимость портфеля
  const walletSumNumber = _.sumBy(testWallet, 'totalPriceNumber');
  console.log(`Общая стоимость портфеля: ${walletSumNumber}₽`);
  
  // 3. Расчет для каждой позиции
  Object.entries(normalizedDesire).forEach(([ticker, desiredPercent]) => {
    const position = testWallet.find(p => tickersEqual(p.base, ticker));
    if (!position) return;
    
    console.log(`\n--- Расчет для ${ticker} ---`);
    console.log(`Желаемый процент: ${desiredPercent}%`);
    
    // Желаемая сумма в рублях
    const desiredAmountNumber = (walletSumNumber / 100) * desiredPercent;
    console.log(`Желаемая сумма: ${desiredAmountNumber}₽`);
    
    // Сколько лотов можно купить на эту сумму (целое число)
    const canBuyBeforeTargetLots = Math.trunc(desiredAmountNumber / (position.lotPriceNumber || 1));
    console.log(`Целевое количество лотов: ${canBuyBeforeTargetLots}`);
    
    // Стоимость целевого количества лотов
    const canBuyBeforeTargetNumber = canBuyBeforeTargetLots * (position.lotPriceNumber || 1);
    console.log(`Стоимость целевого количества: ${canBuyBeforeTargetNumber}₽`);
    
    // Текущее количество лотов
    const currentLots = (position.amount || 0) / (position.lotSize || 1);
    console.log(`Текущее количество лотов: ${currentLots}`);
    
    // ОСНОВНОЙ РАСЧЕТ: сколько лотов купить/продать
    const toBuyLots = canBuyBeforeTargetLots - currentLots;
    console.log(`toBuyLots: ${canBuyBeforeTargetLots} - ${currentLots} = ${toBuyLots}`);
    
    if (toBuyLots > 0) {
      console.log(`✅ КУПИТЬ ${toBuyLots} лотов`);
    } else if (toBuyLots < 0) {
      console.log(`✅ ПРОДАТЬ ${Math.abs(toBuyLots)} лотов`);
    } else {
      console.log(`✅ НЕ ИЗМЕНЯТЬ (уже сбалансировано)`);
    }
    
    // Проверка разности в рублях
    const toBuyNumber = canBuyBeforeTargetNumber - (position.totalPriceNumber || 0);
    console.log(`Разность в рублях: ${toBuyNumber}₽`);
  });
}

function checkFiltering() {
  console.log('\n🔍 ПРОВЕРКА ФИЛЬТРАЦИИ ОРДЕРОВ:');
  
  // Имитируем результат расчета балансировщика
  const mockWallet = _.cloneDeep(testWallet);
  
  // Вручную установим toBuyLots согласно нашему расчету
  const tgldPos = mockWallet.find(p => p.base === 'TGLD');
  const trurPos = mockWallet.find(p => p.base === 'TRUR');
  
  if (tgldPos) tgldPos.toBuyLots = -20; // Продать 20 лотов
  if (trurPos) trurPos.toBuyLots = 20;  // Купить 20 лотов
  
  console.log('Мок результаты:');
  mockWallet.forEach(pos => {
    if (pos.base !== 'RUB' && pos.toBuyLots !== undefined) {
      const action = pos.toBuyLots > 0 ? 'КУПИТЬ' : 'ПРОДАТЬ';
      console.log(`${pos.base}: toBuyLots=${pos.toBuyLots} → ${action} ${Math.abs(pos.toBuyLots)} лотов`);
    }
  });
  
  // Проверим фильтрацию
  const allSells = _.filter(mockWallet, (p) => (p.toBuyLots || 0) <= -1);
  const allBuys = _.filter(mockWallet, (p) => (p.toBuyLots || 0) >= 1);
  
  console.log(`\nРезультат фильтрации:`);
  console.log(`Продажи (allSells): ${allSells.length} позиций`);
  allSells.forEach(p => console.log(`  - ${p.base}: ${p.toBuyLots} лотов`));
  
  console.log(`Покупки (allBuys): ${allBuys.length} позиций`);
  allBuys.forEach(p => console.log(`  - ${p.base}: ${p.toBuyLots} лотов`));
}

manualCalculation();
checkFiltering();