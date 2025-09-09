# Команды для отладки и запуска

## Основные команды запуска

### Просмотр доступных аккаунтов
```bash
# Показать все доступные аккаунты для токена
bun run ./src/index.ts --list-accounts

# Система автоматически выберет токен в следующем порядке:
# 1. Токен первого аккаунта из CONFIG.json (например, T_INVEST_TOKEN_5)
# 2. Основной токен T_INVEST_TOKEN из .env
# 3. Если токены не найдены - выдаст ошибку
```

### Запуск с отладкой
```bash
DEBUG=bot:main,bot:provider,bot:balancer bun run ./src/index.ts
```

### Запуск тестов
```bash
# Все тесты
bun test

# Тесты buy_requires_total_marginal_sell
bun test src/__tests__/buyRequires*.test.ts

# Конкретный набор тестов
bun test src/__tests__/buyRequiresTotalMarginalSell.test.ts
bun test src/__tests__/buyRequiresConfigValidation.test.ts
bun test src/__tests__/buyRequiresIntegration.test.ts
bun test src/__tests__/buyRequiresEdgeCases.test.ts
bun test src/__tests__/buyRequiresDocumentationExamples.test.ts
```

## Найденные и исправленные проблемы

### 1. Неправильный RUB баланс в BALANCING RESULT (2025-09-05)

**Проблема**: В финальном отчете показывался старый RUB баланс (650.67) вместо актуального (-870.26)

**Причина**: В `src/provider/index.ts` строки 657-663 использовали `coreWallet` вместо `freshCoreWallet`

**Исправление**:
```typescript
// Было:
const rubPosition = coreWallet.find(p => p.base === 'RUB' && p.quote === 'RUB');

// Стало:
const rubPosition = freshCoreWallet.find(p => p.base === 'RUB' && p.quote === 'RUB');
```

### 2. Анализ маржинального множителя x2

**Проблема**: Пользователь думал, что рублевые средства не задействованы при multiplier=2

**Анализ**: Система работает корректно:
- Начальный баланс: 650.67 RUB
- Финальный баланс: -870.26 RUB (использует маржу)
- Все ETF достигли целевых долей ~33%
- Маржинальное плечо x2 полностью использовано

### 3. Исправление расчета размера портфеля с маржинальным множителем (2025-09-05)

**Проблема**: Система не использовала маржинальный множитель x2 для увеличения размера портфеля

**Причина**: В `src/utils/marginCalculator.ts` неправильная логика расчета целевого размера портфеля

**Исправление**: Добавлен расчет `targetPortfolioSize = totalPortfolioValue * multiplier`

### 4. 🚨 КРИТИЧЕСКАЯ ОШИБКА: Неправильные target проценты в выводе (2025-09-05)

**Проблема**: В финальном отчете показывались неправильные target проценты (20.22% вместо 8.33%)

**Причина**: В `src/provider/index.ts` строка 631 использовала `finalPercents` (фактические доли после торговли) вместо целевых долей из конфигурации

**Исправление**:
```typescript
// Было:
const targetPercent = finalPercents[ticker] || 0;

// Стало:
const normalizedDesired = normalizeDesire(desiredForRun);
const targetPercent = normalizedDesired[ticker] || 0;
```

### 5. 🚨 ИСПРАВЛЕНО: Двойной счет продаж - короткие позиции (2025-09-05)

**Проблема**: При добавлении 12 ETF система создала короткие позиции (TOFZ: -30.24%, TMOS: -30.10%)

**Причина**: Двойной счет продаж в функции `buyRequiresTotalMarginalSell`:
1. Основная балансировка: TOFZ `toBuyLots = -35` (продать 35 лотов)
2. Специальный план продаж: `sellLots = 32` (продать еще 32 лота)
3. Результат: `toBuyLots = -35 - 32 = -67` → продажа 67 лотов при наличии 46

**Исправление**: В `src/balancer/index.ts` строки 555-601 добавлена проверка:
- Если позиция уже планируется к продаже (`toBuyLots < 0`), не добавлять дополнительные продажи
- Ограничить продажи максимальным количеством доступных лотов
- Избежать создания коротких позиций

### 6. Функционал buy_requires_total_marginal_sell

**Статус**: Работает корректно согласно ТЗ configuration-update.md
- ✅ TMON (немаржинальный) успешно покупается
- ✅ Система правильно рассчитывает необходимые средства
- ✅ Маржинальное плечо используется эффективно

## Команды для проверки конфигурации

### Проверка суммы весов портфеля
```bash
# Сумма должна быть 100% для корректной работы
node -e "
const config = require('./CONFIG.json');
const wallet = config.accounts[0].desired_wallet;
const sum = Object.values(wallet).reduce((a,b) => a+b, 0);
console.log('Сумма весов:', sum, '%');
"
```

### Проверка маржинальных настроек
```bash
# Проверка текущих настроек маржи
node -e "
const config = require('./CONFIG.json');
const margin = config.accounts[0].margin_trading;
console.log('Маржинальная торговля:', margin);
"
```

## Полезные команды для анализа логов

### Поиск ошибок в логах
```bash
grep -n "Error\|error\|ERROR" *.log
```

### Поиск информации о балансах
```bash
grep -n "RUB balance\|BALANCING RESULT" *.log
```

### Поиск маржинальной информации
```bash
grep -n "Margin Information\|margin" *.log
```
