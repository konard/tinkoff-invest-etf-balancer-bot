# Торговый бот балансировщик
Этот бот участвует в конкурсе [Tinkoff Invest Robot Contest](https://github.com/Tinkoff/invest-robot-contest).

Имя приложения: suenot

### Отказ от ответственности
Платформа работает в тестовом режиме (тестовая версия), возможны программные/алгоритмические ошибки, модели не гарантируют доходность и могу торговать в убыток. Пользователь полностью принимает ответственность за применение данного продукта на себя.

### Требования
**ВАЖНО**: Работает только с рублевыми акциями и фондами. Других инструментов для корректной работы находиться на счету не должно.

Простой балансировщик портфелей.
- Получает реальный портфель на счете.
- Приводит его к желаемому портфелю.
    Пример желаемого портфеля:
    ```js
    export const DESIRED_WALLET: DesiredWallet = {
      TMOS: 25, // 25% Тинькофф iMOEX (TMOS)
      RUB: 25, // 25% Рублей
      TBRU: 25, // 25% Тинькофф Bonds
      TRUR: 25, // 25% Тинькофф Вечный портфель (TRUR)
    };
    ```
- Выставляет необходимые для балансировки ордера на покупку и продажу. Пока это рыночные ордера.
- Цикл повторяется
### Пример балансировки
![Balance](./balance.png)

1000 рублей были сбалансированы на:
  - 20% Тинькофф iMOEX (TMOS)
  - 20% Рублей
  - 20% Тинькофф Вечный 
  - 20% Акции ВТБ
### Настройки
Для работы бота вам необходимо [получить токен](https://www.tinkoff.ru/invest/settings).

ACCOUNT_ID может быть:
- точным id из API,
- BROKER — выбрать брокерский счет,
- ISS — выбрать ИИС,
- INDEX:N — выбрать счет по индексу из списка (`npm run accounts`),
- N — просто число строкой, например `0` (короткая форма INDEX:N).

Требуется счет только с рублевыми активами и создать .env файл с настройками
```bash
TOKEN=
ACCOUNT_ID=
```

## Балансировка по decorrelation

Алгоритм формирования целевых весов в режиме `decorrelation`.

```mermaid
flowchart TD
  A["Старт: режим decorrelation"] --> B["Список тикеров из DESIRED_WALLET"]
  B --> C["Для каждого тикера получить marketCap и AUM в RUB<br/>из etf_metrics или через live-фолбэки"]
  C --> D["Вычислить decorrelationPct_t = (marketCap_t - AUM_t) / AUM_t * 100"]
  D --> E["Найти maxDPct = max_t decorrelationPct_t"]
  E --> F["Метрика: metric_t = maxDPct - decorrelationPct_t"]
  F --> G{"Σ metric_t > 0?"}
  G -- "Да" --> H["Вес: weight_t = metric_t / Σ metric * 100"]
  G -- "Нет" --> I["Фолбэк: базовый DESIRED_WALLET"]
  H --> J["Вернуть желаемые веса"]
  I --> J
```

Пример нормализации:

```text
Вход: dPct = { coin1: 100, coin2: 0, coin3: -100 }
maxDPct = 100
metric = { coin1: 0, coin2: 100, coin3: 200 }
Σmetric = 300 → веса ≈ { coin1: 0%, coin2: 33%, coin3: 66% }
```

Желаемые настройки портфеля в процентах и перерыв между балансировками настраиваются в `./src/config.js`:
```js
export const desiredWallet: DesiredWallet = {
  TMOS: 25, // 25% Тинькофф iMOEX (TMOS)
  RUB: 25, // 25% Рублей
  TRUR: 50, // 50% Тинькофф Вечный портфель (TRUR)
};

export const balancerInterval: number = 60000; // Раз в минуту
```
### Запуск
```
npm i
npm run start
```

Одноразовый запуск без цикла (например, для ручной ребалансировки один раз):
```
npm run dev -- --once
```

### Список счетов
Чтобы посмотреть свои счета и их id (для удобного выбора `ACCOUNT_ID`):
```
npm run accounts
```

### Дополнительно

Изначально к конкурсу готовился [бот с ассоциативной структурой данных](https://github.com/suenot/deep-tinkoff-invest), но из-за нехватки времени решил взять задачу попроще.

## Схема работы (Mermaid)
```mermaid
flowchart TD
  A[Старт npm run start/dev] --> B[Загрузка .env TOKEN и ACCOUNT_ID]
  B --> C[Создание SDK createSdk TINKOFF]
  C --> D[provider]
  D --> E[getAccountId ACCOUNT_ID]
  E -->|выбор счёта| F[ACCOUNT_ID определён]
  F --> G[getInstruments]
  G -->|заполнить INSTRUMENTS| H[getPositionsCycle]

  subgraph Cycle[Каждые BALANCE_INTERVAL мс]
    H --> I[operations.getPortfolio accountId]
    I --> J[operations.getPositions accountId]
    J --> K[Построить coreWallet]
    K -->|Добавить валюту из positions.money RUB| L
    K -->|Добавить позиции портфеля с последними ценами| L[coreWallet готов]
    L --> M[balancer coreWallet и DESIRED_WALLET]

    subgraph Balancer[Балансировщик]
      M --> N[Нормализовать целевые веса до 100%]
      N --> O[Проверить наличие желаемых тикеров]
      O --> P[getLastPrice figi для отсутствующих]
      P --> Q[Рассчитать итоги и desiredAmountNumber]
      Q --> R[Рассчитать toBuyLots по позициям]
      R --> S[Отсортировать ордера сначала продажи]
      S --> T[generateOrders]
    end

    T --> U{position.base != RUB и lots >= 1}
    U -- Да --> V[orders.postOrder MARKET]
    V --> W[sleep SLEEP_BETWEEN_ORDERS]
    U -- Нет --> X[Пропуск]
    W --> Y[Следующая позиция]
    X --> Y
    Y --> Z[Следующая итерация]
  end
```

### Парсер новостей Т‑Банк ETF (TRUR)

- Скрипт забирает новости со страницы `https://www.tbank.ru/invest/etfs/TRUR/news/`, нажимает «Показать ещё» до упора (или до заданного лимита), открывает каждую новость и сохраняет материал в `news/<SYMBOL>/<id>.md`.

Запуск по умолчанию (TRUR):

```
npm run scrape:tbank:news
```

Произвольный запуск:

```
npx ts-node --transpile-only ./src/tools/scrapeTbankNews.ts <SYMBOL> [--limit=N] [--first-limit=N] [--once] [--interval=MS]
```

Где:
- `--limit=N` — общий лимит новостей для текущего запуска. Скрипт подгружает ленту до ориентировочного количества ссылок `N` и сохранит не более `N` новых материалов.
- `--first-limit=N` — лимит только для первого запуска (когда папка `news/<SYMBOL>/` пуста). На последующих запусках игнорируется, используйте `--limit`.
- `--once` — одноразовый запуск (без цикличности).
- `--interval=MS` — периодичность цикличного запуска в миллисекундах (по умолчанию 300000 = 5 минут), игнорируется при `--once`.
- Позиционный числовой аргумент (`<N>`) трактуется как `--limit=N`.

Примеры:

```
# 10 новостей TRUR
npx ts-node --transpile-only ./src/tools/scrapeTbankNews.ts TRUR --limit=10 --once

# Первый запуск: забрать только ~300 новостей
npx ts-node --transpile-only ./src/tools/scrapeTbankNews.ts TRUR --first-limit=300 --once

# Циклично каждые 10 минут
npx ts-node --transpile-only ./src/tools/scrapeTbankNews.ts TRUR --limit=50 --interval=600000
```


# Источники данных
- СЧА (AUM) - https://t-capital-funds.ru/statistics/
- Количество паев, капитализация - https://www.tbank.ru/invest/etfs/TDIV@/news/
- Полное название фонда + тикер - https://investfunds.ru/funds/7067/