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
  averagePositionPriceFifoNumber?: number;
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
  maxMarginSize?: number; // Maximum margin size in RUB
  strategy?: MarginBalancingStrategy; // Balancing strategy (optional)
}

// New configuration for buy requires total marginal sell feature
export type SellStrategyMode = 'only_positive_positions_sell' | 'equal_in_percents' | 'none';

export interface SellStrategyConfig {
  mode: SellStrategyMode;
}

export interface BuyRequiresTotalMarginalSellConfig {
  enabled: boolean;
  instruments: string[];
  allow_to_sell_others_positions_to_buy_non_marginal_positions: SellStrategyConfig;
  min_buy_rebalance_percent: number;
}

// New configuration for multiple accounts
export type DesiredMode = 'manual' | 'default' | 'marketcap_aum' | 'marketcap' | 'aum' | 'decorrelation';

export interface AccountMarginConfig {
  enabled: boolean;
  multiplier: number;
  free_threshold: number;
  max_margin_size: number; // Maximum margin size in RUB
  balancing_strategy: MarginBalancingStrategy;
}

// Exchange closure behavior configuration
export type ExchangeClosureMode = 'skip_iteration' | 'force_orders' | 'dry_run';

export interface ExchangeClosureBehavior {
  /**
   * Behavior when exchange is closed:
   * - skip_iteration: Skip balancing completely (current behavior)
   * - force_orders: Perform balancing and attempt to place orders
   * - dry_run: Perform balancing calculations without placing orders
   */
  mode: ExchangeClosureMode;
  
  /**
   * Whether to update iteration results when exchange is closed
   * Affects logging and metrics collection
   */
  update_iteration_result: boolean;
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
  exchange_closure_behavior: ExchangeClosureBehavior;
  buy_requires_total_marginal_sell?: BuyRequiresTotalMarginalSellConfig;
  /**
   * Minimum profit percentage required for selling a position
   * - Positive values: minimum profit percentage (e.g., 5 = 5% minimum profit)
   * - Negative values: maximum allowed loss percentage (e.g., -2 = maximum 2% loss)
   * - Undefined/null: feature disabled, use existing selling logic
   * Default: undefined (feature disabled)
   */
  min_profit_percent_for_close_position?: number;
}

export interface ProjectConfig {
  /**
   * AUM/capitalization cache configuration
   */
  aum_cache?: {
    enabled: boolean;
    ttl_hours: number;
  };
  accounts: AccountConfig[];
}

// Enhanced result data models
export interface PositionMetrics {
  ticker: string;
  aum?: {
    value: number; // AUM value in RUB
    percentage: number; // Percentage of total AUM
  };
  marketCap?: {
    value: number; // Market cap value in RUB  
    percentage: number; // Percentage of total market cap
  };
  decorrelation?: {
    value: number; // Decorrelation percentage
    interpretation: 'undervalued' | 'overvalued' | 'neutral';
  };
}

export interface EnhancedBalancerResult {
  finalPercents: Record<string, number>;
  modeUsed: DesiredMode;
  positionMetrics: PositionMetrics[];
  totalPortfolioValue: number;
  marginInfo?: {
    totalMarginUsed: number;
    marginPositions: MarginPosition[];
    withinLimits: boolean;
  };
  ordersPlanned?: Position[];
}

// Balancing data error for strict mode validation
export class BalancingDataError extends Error {
  constructor(
    public mode: DesiredMode,
    public missingData: string[],
    public affectedTickers: string[]
  ) {
    super(`Balancing halted: ${mode} mode requires ${missingData.join(', ')} data for tickers: ${affectedTickers.join(', ')}`);
    this.name = 'BalancingDataError';
  }
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
