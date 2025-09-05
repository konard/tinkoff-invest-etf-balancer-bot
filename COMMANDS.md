# Команды для отладки и запуска

## Основные команды запуска

### Запуск с отладкой
```bash
DEBUG=bot:main,bot:provider,bot:balancer bun run ./src/index.ts
```

### Запуск тестов
```bash
bun test
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

### 3. Функционал buy_requires_total_marginal_sell

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
