# buy_requires_total_marginal_sell Test Suite

Комплексный набор тестов для параметров конфигурации `buy_requires_total_marginal_sell`.

## 📁 Структура тестов

### 1. `buyRequiresTotalMarginalSell.test.ts`
**Основные функциональные тесты**

- ✅ **enabled/disabled состояния** - проверка включения/выключения функции
- ✅ **instruments список** - тестирование различных конфигураций инструментов
- ✅ **Режимы продаж**:
  - `only_positive_positions_sell` - продажа только прибыльных позиций
  - `equal_in_percents` - пропорциональная продажа
  - `none` - без продаж
- ✅ **min_buy_rebalance_percent** - тестирование порогов активации
- ✅ **Расчет прибыли позиций** - логика определения прибыльности
- ✅ **Интеграционные тесты** - полный workflow

### 2. `buyRequiresConfigValidation.test.ts`
**Валидация конфигурации**

- ✅ **Структура конфигурации** - проверка корректности полей
- ✅ **enabled поле** - валидация boolean значений
- ✅ **instruments массив** - различные сценарии списка инструментов
- ✅ **Режимы продаж** - валидация допустимых значений
- ✅ **Пороговые значения** - проверка числовых параметров
- ✅ **Комбинации настроек** - реальные конфигурации

### 3. `buyRequiresIntegration.test.ts`
**Интеграция с основной системой**

- ✅ **Интеграция с балансировщиком** - работа в составе системы
- ✅ **Различные режимы продаж** - поведение в полном цикле
- ✅ **Пороговые тесты** - влияние на реальную балансировку
- ✅ **Обработка ошибок** - устойчивость к некорректным данным
- ✅ **Маржинальная торговля** - совместимость с margin trading
- ✅ **Реальные сценарии** - типичные случаи использования

### 4. `buyRequiresEdgeCases.test.ts`
**Граничные случаи и крайние значения**

- ✅ **Пустые данные** - обработка null/undefined значений
- ✅ **Экстремальные числа** - очень большие/маленькие значения
- ✅ **Точность вычислений** - проблемы с floating point
- ✅ **Конфигурационные крайности** - необычные настройки
- ✅ **Стратегии продаж** - граничные случаи алгоритмов
- ✅ **RUB баланс** - экстремальные значения баланса
- ✅ **Производительность** - тесты на больших объемах данных

### 5. `buyRequiresDocumentationExamples.test.ts`
**Документация и примеры использования**

- 📚 **Базовые конфигурации** - типичные настройки
- 🎯 **Примеры режимов продаж** - детальные сценарии
- ⚖️ **Примеры порогов** - различные стратегии активации
- 🏭 **Продакшн сценарии** - реальные конфигурации
- 🧪 **Тестовые настройки** - конфигурации для разработки
- ⚠️ **Типичные ошибки** - как избежать проблем

## 🚀 Запуск тестов

### Все тесты buy_requires_total_marginal_sell
```bash
bun test src/__tests__/buyRequires*.test.ts
```

### Отдельные наборы тестов
```bash
# Основные функциональные тесты
bun test src/__tests__/buyRequiresTotalMarginalSell.test.ts

# Валидация конфигурации
bun test src/__tests__/buyRequiresConfigValidation.test.ts

# Интеграционные тесты
bun test src/__tests__/buyRequiresIntegration.test.ts

# Граничные случаи
bun test src/__tests__/buyRequiresEdgeCases.test.ts

# Примеры документации
bun test src/__tests__/buyRequiresDocumentationExamples.test.ts
```

### Запуск с детальным выводом
```bash
bun test src/__tests__/buyRequires*.test.ts --verbose
```

## 📊 Покрытие тестами

### Параметры конфигурации
- ✅ `enabled` - 100% покрытие (true/false, undefined)
- ✅ `instruments` - 100% покрытие (пустой, один, множество, спецсимволы)
- ✅ `allow_to_sell_others_positions_to_buy_non_marginal_positions.mode` - 100% покрытие всех режимов
- ✅ `min_buy_rebalance_percent` - 100% покрытие (0, малые, большие значения)

### Функциональность
- ✅ **Определение прибыльных позиций** - все сценарии
- ✅ **Расчет необходимых средств** - различные портфели
- ✅ **Алгоритмы продаж** - все режимы и граничные случаи
- ✅ **Пороговая логика** - точные и граничные значения
- ✅ **Интеграция с балансировщиком** - полный цикл

### Граничные случаи
- ✅ **Пустые/null данные** - устойчивость к некорректным входным данным
- ✅ **Экстремальные значения** - очень большие/маленькие числа
- ✅ **Производительность** - тесты на 1000+ позиций
- ✅ **Точность вычислений** - floating point проблемы

## 🎯 Примеры использования

### Базовая конфигурация для TMON
```typescript
const config: BuyRequiresTotalMarginalSellConfig = {
  enabled: true,
  instruments: ['TMON'],
  allow_to_sell_others_positions_to_buy_non_marginal_positions: {
    mode: 'only_positive_positions_sell'
  },
  min_buy_rebalance_percent: 0.5
};
```

### Агрессивная ребалансировка
```typescript
const aggressiveConfig: BuyRequiresTotalMarginalSellConfig = {
  enabled: true,
  instruments: ['TMON', 'TGLD'],
  allow_to_sell_others_positions_to_buy_non_marginal_positions: {
    mode: 'equal_in_percents'
  },
  min_buy_rebalance_percent: 0.1
};
```

### Консервативный подход
```typescript
const conservativeConfig: BuyRequiresTotalMarginalSellConfig = {
  enabled: true,
  instruments: ['TMON'],
  allow_to_sell_others_positions_to_buy_non_marginal_positions: {
    mode: 'none'
  },
  min_buy_rebalance_percent: 5.0
};
```

## 🔧 Отладка тестов

### Включение детального логирования
```bash
DEBUG=bot:balancer bun test src/__tests__/buyRequires*.test.ts
```

### Запуск конкретного теста
```bash
bun test src/__tests__/buyRequiresTotalMarginalSell.test.ts -t "should handle single instrument in list"
```

### Профилирование производительности
```bash
bun test src/__tests__/buyRequiresEdgeCases.test.ts -t "Performance"
```

## 📈 Метрики качества

- **Общее количество тестов**: 100+
- **Покрытие кода**: 100% функций buy_requires_total_marginal_sell
- **Граничные случаи**: 50+ сценариев
- **Интеграционные тесты**: 20+ сценариев
- **Примеры документации**: 15+ реальных конфигураций

## 🛠️ Добавление новых тестов

### Шаблон для нового теста
```typescript
describe('New Feature Tests', () => {
  it('should handle specific scenario', () => {
    // Arrange
    const config: BuyRequiresTotalMarginalSellConfig = {
      enabled: true,
      instruments: ['TEST'],
      allow_to_sell_others_positions_to_buy_non_marginal_positions: {
        mode: 'only_positive_positions_sell'
      },
      min_buy_rebalance_percent: 1.0
    };
    
    // Act
    const result = functionUnderTest(config);
    
    // Assert
    expect(result).toBeDefined();
  });
});
```

### Рекомендации
1. **Используйте описательные имена тестов**
2. **Покрывайте как позитивные, так и негативные сценарии**
3. **Добавляйте комментарии для сложной логики**
4. **Тестируйте граничные случаи**
5. **Включайте примеры в документационные тесты**
