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
  averagePositionPrice?: TinkoffNumber;
  averagePositionPriceNumber?: number;
}

export type Wallet = Position[];

export interface DesiredWallet {
  [key: string]: number;
}

// Margin trading
export interface MarginPosition extends Position {
  isMargin: boolean;
  marginValue?: number; // Cost of margin part
  leverage?: number; // Position leverage
  marginCall?: boolean; // Margin call risk
}

export type MarginBalancingStrategy = 'remove' | 'keep' | 'keep_if_small';

export interface MarginConfig {
  multiplier: number; // Portfolio multiplier (1-4)
  freeThreshold: number; // Free transfer threshold in rubles
  strategy?: MarginBalancingStrategy; // Balancing strategy (optional)
}

// New configuration for multiple accounts
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
  min_profit_percent_for_close_position?: number;
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
