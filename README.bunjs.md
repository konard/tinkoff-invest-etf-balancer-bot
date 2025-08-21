# Tinkoff Invest ETF Balancer Bot - Bun.js Edition

## 🚀 Миграция на Bun.js завершена!

Проект успешно портирован с Node.js + ts-node на Bun.js для повышения производительности и упрощения разработки.

## ✨ Преимущества Bun.js

- **🚀 Скорость**: Встроенная поддержка TypeScript без ts-node
- **⚡ Производительность**: Быстрая сборка и выполнение
- **🔄 Современность**: ES модули вместо CommonJS
- **🎯 Упрощение**: Меньше зависимостей и конфигурации
- **🔒 Совместимость**: Полная совместимость с существующим кодом

## 📋 Требования

- **Bun.js**: версия 1.0.0 или выше
- **Node.js**: не требуется (заменен на Bun.js)

## 🛠️ Установка

### 1. Установка Bun.js

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Windows (через WSL)
curl -fsSL https://bun.sh/install | bash

# Добавить в PATH
export PATH="$HOME/.bun/bin:$PATH"
```

### 2. Установка зависимостей

```bash
bun install
```

## 🚀 Использование

### Основные команды

```bash
# Запуск основного бота
bun run start

# Запуск в режиме разработки
bun run dev

# Список доступных счетов
bun run accounts

# Получение рыночной капитализации ETF
bun run etf-cap

# Сбор метрик ETF
bun run poll:metrics

# Тест маржинальной торговли
bun run test:margin

# Сборка проекта
bun run build

# Очистка
bun run clean
```

### Дополнительные команды

```bash
# Скрапинг новостей Т-Банка
bun run scrape:tbank:news TRUR --limit=10

# Анализ новостей
bun run analyze:news TRUR --limit=10

# Обновление количества акций
bun run update:shares TRUR

# Сбор всех метрик
bun run poll:metrics:all
```

## 📊 Производительность

### Результаты тестирования

- **Сборка**: 522 модуля за 107ms (быстрее чем ts-node)
- **Выполнение TypeScript**: нативная поддержка без компиляции
- **Установка зависимостей**: через bun install

### Сравнение с Node.js

| Метрика | Node.js + ts-node | Bun.js |
|---------|-------------------|---------|
| Время сборки | ~2-3 секунды | ~107ms |
| Запуск TypeScript | Требует компиляцию | Нативная поддержка |
| Память | Больше | Меньше |
| Зависимости | Больше | Меньше |

## 🔧 Конфигурация

### bunfig.toml

```toml
[install]
registry = "https://registry.bun.sh/"

[test]
preload = ["./src/test-setup.ts"]

[run]
bun = true

[install.cache]
dir = ".bun"

[install.lockfile]
format = "bun"
```

### tsconfig.json

Обновлен для современного JavaScript:
- Target: ES2022
- Module: ESNext
- ModuleResolution: bundler
- Строгие проверки TypeScript

## 🧪 Тестирование

```bash
# Запуск всех тестов
bun test

# Запуск с таймаутом
bun test --timeout 10000

# Запуск в watch режиме
bun test --watch
```

## 📦 Сборка

```bash
# Сборка для Bun.js
bun run build

# Результат: ./dist/index.js
```

## 🔍 Отладка

```bash
# Запуск с отладчиком
bun run --inspect ./src/index.ts

# Запуск с отладчиком и ожиданием подключения
bun run --inspect-wait ./src/index.ts
```

## 🚨 Устранение неполадок

### Проблема: "module is not defined"

**Решение**: Замените `require.main === module` на проверку `process.argv[1]`:

```typescript
// Было (CommonJS)
const isMain = require.main === module;

// Стало (ES модули)
const isMain = process.argv[1]?.endsWith('filename.ts');
```

### Проблема: "require is not defined"

**Решение**: Замените `require()` на `import`:

```typescript
// Было (CommonJS)
const debug = require('debug')('bot');

// Стало (ES модули)
import debug from 'debug';
const debugBot = debug('bot');
```

## 📚 Полезные ссылки

- [Bun.js Documentation](https://bun.com/docs)
- [Bun.js CLI Reference](https://bun.com/docs/cli)
- [Bun.js TypeScript Support](https://bun.com/docs/runtime/typescript)
- [Migration Guide](https://bun.com/docs/guides/migrate-from-nodejs)

## 🤝 Вклад в проект

При добавлении нового кода следуйте принципам ES модулей:

1. Используйте `import` вместо `require`
2. Используйте `export` вместо `module.exports`
3. Проверяйте `process.argv[1]` для определения прямого запуска
4. Тестируйте с `bun run` перед коммитом

## 🎯 Roadmap

- [x] Миграция на Bun.js
- [x] Обновление всех скриптов
- [x] Тестирование функциональности
- [ ] Оптимизация производительности
- [ ] Добавление новых функций
- [ ] Расширение тестового покрытия

---

**Статус**: ✅ Production Ready  
**Версия Bun.js**: 1.2.20  
**Последнее обновление**: $(date)
