# Trading Bot Balancer
This bot participates in the [Tinkoff Invest Robot Contest](https://github.com/Tinkoff/invest-robot-contest).

Appname: suenot

### Disclaimer
The platform operates in test mode (a test version), and there may be software/algorithmic errors. The models do not guarantee profitability and may trade at a loss. The user assumes full responsibility for the application of this product.

### Requirements
**IMPORTANT**: It only works with Russian ruble stocks and funds. There should be no other instruments in the account for proper operation.

A simple portfolio balancer.
- Retrieves the real portfolio in the account.
- Adjusts it to the desired portfolio.
    Example of a desired portfolio:
    ```js
    export const DESIRED_WALLET: DesiredWallet = {
      TMOS: 25, // 25% Tinkoff iMOEX (TMOS)
      RUB: 25, // 25% Russian Ruble
      TBRU: 25, // 25% Tinkoff Bonds
      TRUR: 25, // 25% Tinkoff Eternal Portfolio (TRUR)
    };
    ```
- Places the necessary orders for buying and selling to balance the portfolio. Currently, these are market orders.
- The cycle repeats.
### Example of Balancing
![Balance](./balance.png)

1000 rubles were balanced as follows:
  - 20% Tinkoff iMOEX (TMOS)
  - 20% Russian Ruble
  - 20% Tinkoff Eternal Portfolio (TRUR)
  - 20% VTB shares
### Settings
To use the bot, you need to [obtain a token](https://www.tinkoff.ru/invest/settings).

ACCOUNT_ID can be:
- exact id returned by the API,
- BROKER (to pick brokerage account),
- ISS (to pick IIA),
- INDEX:N (to pick account by index in the list from `npm run accounts`),
- N (just a number string like `0`, shorthand for INDEX:N).

You need an account with only Russian ruble assets and create an .env file with the following settings:
```bash
TOKEN=
ACCOUNT_ID=
```

Desired portfolio settings in percentages and the interval between rebalancing can be adjusted in ./src/config.js:
```js
export const desiredWallet: DesiredWallet = {
  TMOS: 25, // 25% Tinkoff iMOEX (TMOS)
  RUB: 25, // 25% Russian Ruble
  TRUR: 50, // 50% Tinkoff Eternal Portfolio (TRUR)
};

export const balancerInterval: number = 60000; // Once per minute
```

### Running
```
npm i
npm run start
```

### Additional Information
Originally, a bot with an [associative data structure](https://github.com/suenot/deep-tinkoff-invest) was prepared for the contest, but due to time constraints, I decided to take an easier task.

_________________

# Торговый бот балансировщик (Russian readme)
Этот бот участвует в конкурсе [Tinkoff Invest Robot Contest](https://github.com/Tinkoff/invest-robot-contest).

Appname: suenot

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

### Список счетов
Чтобы посмотреть свои счета и их id (для удобного выбора `ACCOUNT_ID`):
```
npm run accounts
```

### Дополнительно

Изначально к конкурсу готовился [бот с ассоциативной структурой данных](https://github.com/suenot/deep-tinkoff-invest), но из-за нехватки времени решил взять задачу попроще.
