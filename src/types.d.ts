export interface TinkoffNumber {
  currency?: string;
  units: number;
  nano: number;
}

export interface Position {
  pair?: string;
  base?: string;
  quote?: string;
  figi?: string;
  amount?: number;
  lotSize?: number;
  price?: TinkoffNumber;
  priceNumber?: number;
  lotPrice?: TinkoffNumber;
  lotPriceNumber?: number;
  minPriceIncrement?: TinkoffNumber;
  // minPriceIncrementNumber?: number;
  totalPrice?: TinkoffNumber;
  totalPriceNumber?: number;
  desiredAmountNumber?: number;
  canBuyBeforeTargetLots?: number;
  canBuyBeforeTargetNumber?: number;
  beforeDiffNumber?: number;
  toBuyLots?: number;
  toBuyNumber?: number;
}

export type Wallet = Position[];

export interface DesiredWallet {
  [key: string]: number;
}

// Маржинальная торговля
export interface MarginPosition extends Position {
  isMargin: boolean;
  marginValue?: number; // Стоимость маржинальной части
  leverage?: number; // Плечо по позиции
  marginCall?: boolean; // Риск маржин-колла
}

export type MarginBalancingStrategy = 'remove' | 'keep' | 'keep_if_small';

export interface MarginConfig {
  multiplier: number; // Множитель портфеля (1-4)
  freeThreshold: number; // Порог бесплатного переноса в рублях
  strategy?: MarginBalancingStrategy; // Стратегия балансировки (опционально)
}

// Новая конфигурация для множественных аккаунтов
export type DesiredMode = 'manual' | 'marketcap_aum' | 'marketcap' | 'aum' | 'decorrelation';

export interface AccountMarginConfig {
  enabled: boolean;
  multiplier: number;
  free_threshold: number;
  balancing_strategy: MarginBalancingStrategy;
}

export interface AccountConfig {
  id: string;
  name: string;
  t_invest_token: string;
  account_id: string;
  desired_wallet: DesiredWallet;
  desired_mode: DesiredMode;
  balance_interval: number;
  sleep_between_orders: number;
  margin_trading: AccountMarginConfig;
}

export interface ProjectConfig {
  accounts: AccountConfig[];
}

export interface Ohlcv {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: Date;
  isComplete: boolean;
}
