import { describe, it, expect } from 'bun:test';
import { Position } from '../types.d';

// Импортируем функцию из provider (если она экспортируется)
// Если нет, то тестируем логику здесь

/**
 * Рассчитывает доли каждого инструмента в портфеле
 * @param wallet - массив позиций портфеля
 * @returns объект с тикерами и их долями в процентах
 */
const calculatePortfolioShares = (wallet: Position[]): Record<string, number> => {
  // Исключаем валюты (позиции где base === quote)
  const securities = wallet.filter(p => p.base !== p.quote);
  const totalValue = securities.reduce((sum, p) => sum + (p.totalPriceNumber || 0), 0);
  
  if (totalValue <= 0) return {};
  
  const shares: Record<string, number> = {};
  for (const position of securities) {
    if (position.base && position.totalPriceNumber) {
      const ticker = position.base; // Упрощенная версия без normalizeTicker
      shares[ticker] = (position.totalPriceNumber / totalValue) * 100;
    }
  }
  return shares;
};

describe('calculatePortfolioShares', () => {
  it('должна корректно рассчитывать доли портфеля', () => {
    const mockWallet: Position[] = [
      {
        pair: 'TGLD/RUB',
        base: 'TGLD',
        quote: 'RUB',
        figi: 'test-figi-1',
        amount: 100,
        lotSize: 1,
        price: { units: 100, nano: 0 },
        priceNumber: 100,
        lotPrice: { units: 100, nano: 0 },
        totalPrice: { units: 10000, nano: 0 },
        totalPriceNumber: 10000,
      },
      {
        pair: 'TRUR/RUB',
        base: 'TRUR',
        quote: 'RUB',
        figi: 'test-figi-2',
        amount: 200,
        lotSize: 1,
        price: { units: 50, nano: 0 },
        priceNumber: 50,
        lotPrice: { units: 50, nano: 0 },
        totalPrice: { units: 10000, nano: 0 },
        totalPriceNumber: 10000,
      },
      {
        pair: 'RUB/RUB',
        base: 'RUB',
        quote: 'RUB',
        figi: 'test-figi-3',
        amount: 5000,
        lotSize: 1,
        price: { units: 1, nano: 0 },
        priceNumber: 1,
        lotPrice: { units: 1, nano: 0 },
        totalPrice: { units: 5000, nano: 0 },
        totalPriceNumber: 5000,
      }
    ];

    const result = calculatePortfolioShares(mockWallet);
    
    // Общая стоимость ценных бумаг: 10000 + 10000 = 20000
    // TGLD: 10000 / 20000 * 100 = 50%
    // TRUR: 10000 / 20000 * 100 = 50%
    // RUB должен быть исключен
    
    expect(result).toEqual({
      TGLD: 50,
      TRUR: 50
    });
    
    expect(result.RUB).toBeUndefined();
  });

  it('должна возвращать пустой объект для пустого портфеля', () => {
    const result = calculatePortfolioShares([]);
    expect(result).toEqual({});
  });

  it('должна возвращать пустой объект для портфеля только с валютами', () => {
    const mockWallet: Position[] = [
      {
        pair: 'RUB/RUB',
        base: 'RUB',
        quote: 'RUB',
        figi: 'test-figi-1',
        amount: 1000,
        lotSize: 1,
        price: { units: 1, nano: 0 },
        priceNumber: 1,
        lotPrice: { units: 1, nano: 0 },
        totalPrice: { units: 1000, nano: 0 },
        totalPriceNumber: 1000,
      }
    ];

    const result = calculatePortfolioShares(mockWallet);
    expect(result).toEqual({});
  });

  it('должна корректно обрабатывать позиции без totalPriceNumber', () => {
    const mockWallet: Position[] = [
      {
        pair: 'TGLD/RUB',
        base: 'TGLD',
        quote: 'RUB',
        figi: 'test-figi-1',
        amount: 100,
        lotSize: 1,
        price: { units: 100, nano: 0 },
        priceNumber: 100,
        lotPrice: { units: 100, nano: 0 },
        totalPrice: { units: 10000, nano: 0 },
        totalPriceNumber: 10000,
      },
      {
        pair: 'TRUR/RUB',
        base: 'TRUR',
        quote: 'RUB',
        figi: 'test-figi-2',
        amount: 200,
        lotSize: 1,
        price: { units: 50, nano: 0 },
        priceNumber: 50,
        lotPrice: { units: 50, nano: 0 },
        totalPrice: { units: 10000, nano: 0 },
        totalPriceNumber: undefined, // Отсутствует totalPriceNumber
      }
    ];

    const result = calculatePortfolioShares(mockWallet);
    
    // Только TGLD должен быть включен, так как у TRUR нет totalPriceNumber
    expect(result).toEqual({
      TGLD: 100
    });
  });
});
