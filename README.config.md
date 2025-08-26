# Конфигурация множественных аккаунтов

## Обзор

Система конфигурации была полностью переработана для поддержки множественных аккаунтов Tinkoff Invest. Теперь вместо жестко заданных настроек в `src/config.ts` используется гибкий JSON-файл `CONFIG.json`.

## Структура файлов

### CONFIG.json
Основной файл конфигурации, содержащий настройки для всех аккаунтов.

### .env
Файл с переменными окружения, содержащий токены для каждого аккаунта.

### src/configLoader.ts
Модуль для загрузки и валидации конфигурации.

### src/config.ts
Устаревший файл, оставлен для обратной совместимости.

## Структура CONFIG.json

```json
{
  "accounts": [
    {
      "id": "account_1",
      "name": "Основной брокерский счет",
      "t_invest_token": "T_INVEST_TOKEN_1",
      "account_id": "BROKER",
      "desired_wallet": {
        "TRAY": 25,
        "TGLD": 25,
        "TRUR": 25,
        "TRND": 25
      },
      "desired_mode": "manual",
      "balance_interval": 3600000,
      "sleep_between_orders": 3000,
      "margin_trading": {
        "enabled": false,
        "multiplier": 4,
        "free_threshold": 5000,
        "balancing_strategy": "keep_if_small"
      }
    }
  ],

}
```

## Параметры аккаунта

### Основные параметры
- `id` - уникальный идентификатор аккаунта
- `name` - человекочитаемое название аккаунта
- `t_invest_token` - имя переменной окружения с токеном
- `account_id` - тип счета (BROKER, ISS, или конкретный ID)

### Настройки балансировки
- `desired_wallet` - целевые веса инструментов в процентах
- `desired_mode` - режим формирования весов
- `balance_interval` - интервал балансировки в миллисекундах
- `sleep_between_orders` - задержка между ордерами в миллисекундах

### Маржинальная торговля
- `enabled` - включена ли маржинальная торговля
- `multiplier` - множитель портфеля (1-4)
- `free_threshold` - порог бесплатного переноса в рублях
- `balancing_strategy` - стратегия балансировки

## Режимы формирования весов

- `manual` - использовать заданные веса
- `default` - синоним для `manual` (использовать заданные веса)
- `marketcap_aum` - по капитализации с fallback на AUM
- `marketcap` - только по капитализации
- `aum` - только по AUM
- `decorrelation` - по корреляции

## Настройка переменных окружения

Создайте файл `.env` со следующими переменными:

```bash
# Токены для разных аккаунтов
T_INVEST_TOKEN_1=your_first_token_here
T_INVEST_TOKEN_2=your_second_token_here

# OpenAI API
OPENROUTER_API_KEY=your_api_key_here
OPENROUTER_MODEL=qwen/qwen3-235b-a22b-2507
```

## Управление конфигурацией

### Просмотр списка аккаунтов
```bash
npm run config list
```

### Детали конкретного аккаунта
```bash
bun run config show account_1
```

### Валидация конфигурации
```bash
bun run config validate
```

### Настройка переменных окружения
```bash
bun run config env
```

### Справка
```bash
bun run config help
```

## Миграция с старой системы

### 1. Создайте CONFIG.json
Скопируйте настройки из старого `src/config.ts` в новый формат.

### 2. Обновите .env
Замените `TOKEN=` на `T_INVEST_TOKEN_1=` и добавьте дополнительные токены.

### 3. Обновите код
Замените импорты констант на вызовы функций:

```typescript
// Старый способ
import { DESIRED_WALLET, BALANCE_INTERVAL } from './config';

// Новый способ
import { getDesiredWallet, getBalanceInterval } from './config';

const wallet = getDesiredWallet('account_1');
const interval = getBalanceInterval('account_1');
```

## Примеры использования

### Балансировка конкретного аккаунта
```typescript
import { configLoader } from './configLoader';

const account = configLoader.getAccountById('account_1');
if (account) {
  console.log(`Балансируем аккаунт: ${account.name}`);
  console.log(`Токен: ${account.t_invest_token}`);
  console.log(`Целевые веса:`, account.desired_wallet);
}
```

### Получение токена по ID аккаунта
```typescript
import { configLoader } from './configLoader';

const token = configLoader.getAccountToken('account_1');
const accountId = configLoader.getAccountAccountId('account_1');
```

### Валидация конфигурации
```typescript
import { configLoader } from './configLoader';

try {
  const config = configLoader.loadConfig();
  console.log(`Загружено ${config.accounts.length} аккаунтов`);
} catch (error) {
  console.error('Ошибка конфигурации:', error.message);
}
```

## Преимущества новой системы

1. **Множественные аккаунты** - поддержка неограниченного количества счетов
2. **Гибкость** - разные настройки для разных аккаунтов
3. **Валидация** - автоматическая проверка корректности конфигурации
4. **Управление** - удобные CLI-команды для работы с конфигурацией
5. **Безопасность** - токены хранятся в переменных окружения
6. **Обратная совместимость** - старый код продолжает работать

## Troubleshooting

### Ошибка "Аккаунт не найден"
Проверьте, что ID аккаунта в коде совпадает с ID в `CONFIG.json`.

### Ошибка "Токен не найден"
Убедитесь, что переменная окружения с токеном создана в `.env`.

### Ошибка валидации
Запустите `bun run config validate` для диагностики проблем.

### Сумма весов не равна 100%
Проверьте, что сумма всех весов в `desired_wallet` равна 100%.
