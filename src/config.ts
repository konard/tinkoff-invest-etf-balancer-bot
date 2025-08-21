// DEPRECATED: Этот файл устарел. Используйте configLoader для загрузки конфигурации из CONFIG.json
// Оставлен для обратной совместимости

import { configLoader } from './configLoader';
import { DesiredWallet, DesiredMode, MarginBalancingStrategy } from './types.d';

// Функции для получения конфигурации конкретного аккаунта
export function getDesiredWallet(accountId: string): DesiredWallet {
  const account = configLoader.getAccountById(accountId);
  if (!account) {
    throw new Error(`Аккаунт с id ${accountId} не найден в конфигурации`);
  }
  return account.desired_wallet;
}

export function getDesiredMode(accountId: string): DesiredMode {
  const account = configLoader.getAccountById(accountId);
  if (!account) {
    throw new Error(`Аккаунт с id ${accountId} не найден в конфигурации`);
  }
  return account.desired_mode;
}

export function getBalanceInterval(accountId: string): number {
  const account = configLoader.getAccountById(accountId);
  if (!account) {
    throw new Error(`Аккаунт с id ${accountId} не найден в конфигурации`);
  }
  return account.balance_interval;
}

export function getSleepBetweenOrders(accountId: string): number {
  const account = configLoader.getAccountById(accountId);
  if (!account) {
    throw new Error(`Аккаунт с id ${accountId} не найден в конфигурации`);
  }
  return account.sleep_between_orders;
}

export function isMarginTradingEnabled(accountId: string): boolean {
  const account = configLoader.getAccountById(accountId);
  if (!account) {
    throw new Error(`Аккаунт с id ${accountId} не найден в конфигурации`);
  }
  return account.margin_trading.enabled;
}

export function getMarginMultiplier(accountId: string): number {
  const account = configLoader.getAccountById(accountId);
  if (!account) {
    throw new Error(`Аккаунт с id ${accountId} не найден в конфигурации`);
  }
  return account.margin_trading.multiplier;
}

export function getFreeMarginThreshold(accountId: string): number {
  const account = configLoader.getAccountById(accountId);
  if (!account) {
    throw new Error(`Аккаунт с id ${accountId} не найден в конфигурации`);
  }
  return account.margin_trading.free_threshold;
}

export function getMarginBalancingStrategy(accountId: string): MarginBalancingStrategy {
  const account = configLoader.getAccountById(accountId);
  if (!account) {
    throw new Error(`Аккаунт с id ${accountId} не найден в конфигурации`);
  }
  return account.margin_trading.balancing_strategy;
}



// Устаревшие экспорты для обратной совместимости
// @deprecated Используйте getDesiredWallet('account_id') вместо DESIRED_WALLET
export const DESIRED_WALLET: DesiredWallet = getDesiredWallet('account_1') || {};

// @deprecated Используйте getDesiredMode('account_id') вместо DESIRED_MODE
export const DESIRED_MODE: DesiredMode = 'manual';

// @deprecated Используйте getBalanceInterval('account_id') вместо BALANCE_INTERVAL
export const BALANCE_INTERVAL: number = 3600000;

// @deprecated Используйте getSleepBetweenOrders('account_id') вместо SLEEP_BETWEEN_ORDERS
export const SLEEP_BETWEEN_ORDERS: number = 3000;

// @deprecated Используйте isMarginTradingEnabled('account_id') вместо MARGIN_TRADING_ENABLED
export const MARGIN_TRADING_ENABLED: boolean = false;

// @deprecated Используйте getMarginMultiplier('account_id') вместо MARGIN_MULTIPLIER
export const MARGIN_MULTIPLIER: number = 4;

// @deprecated Используйте getFreeMarginThreshold('account_id') вместо FREE_MARGIN_THRESHOLD
export const FREE_MARGIN_THRESHOLD: number = 5000;

// @deprecated Используйте getMarginBalancingStrategy('account_id') вместо MARGIN_BALANCING_STRATEGY
export const MARGIN_BALANCING_STRATEGY: MarginBalancingStrategy = 'keep_if_small';
