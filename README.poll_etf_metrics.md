# ETF Metrics Poller

Отдельный скрипт, который по расписанию агрегирует ключевые метрики ETF и сохраняет их в простой JSON:
- sharesCount — количество паёв (берётся из `shares_count/<SYMBOL>.json`, обновляется новостями)
- aum — СЧА в рублях (парсится с сайта Т‑Капитал и конвертируется в RUB)

Файл скрипта: `src/tools/pollEtfMetrics.ts`

## Требования
- Node.js 18+
- `.env` с `TOKEN` (для получения курсов USD/RUB, EUR/RUB через `tinkoff-sdk-grpc-js`)
- Актуальные файлы `shares_count/<SYMBOL>.json` (скрипт `src/tools/updateSharesCount.ts`)

## Формат результата
Файлы сохраняются в `etf_metrics/<SYMBOL>.json`:

```json
{
  "symbol": "TRUR",
  "timestamp": "2025-08-08T21:26:52.264Z",
  "sharesCount": 1799100000,
  "aum": 16419859877.94
}
```

## Запуск
- Разовый прогон для TRUR:

```bash
bun run poll:metrics
```

- Несколько тикеров и цикл раз в час:

```bash
npx ts-node --transpile-only src/tools/pollEtfMetrics.ts TRUR,TMOS,FXGD --interval=3600000
```

- Разовый прогон для списка тикеров:

```bash
npx ts-node --transpile-only src/tools/pollEtfMetrics.ts TRUR,TPAY --once
```

## Аргументы
- `<SYMBOL[,SYMBOL2,...]>` — список тикеров через запятую. Если не указать — берётся из `DESIRED_WALLET`.
- `--once` — один прогон без цикла.
- `--interval=MS` — интервал между итерациями в мс (по умолчанию 3600000 = 1 час).

## Зависимости между скриптами
- `src/tools/updateSharesCount.ts` — обновляет `shares_count/<SYMBOL>.json` из новостей («Всего паев …», «Общее количество паев …»)
- `src/tools/pollEtfMetrics.ts` — читает `shares_count` + парсит AUM → пишет `etf_metrics/<SYMBOL>.json`

## Планирование
Пример cron (каждый час):

```
0 * * * * /usr/bin/env -S bash -lc 'cd /path/to/repo && bun run poll:metrics >> logs/poll_metrics.log 2>&1'
```
