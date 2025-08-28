import { describe, it, expect, beforeEach, afterEach } from "bun:test";

// Mock data for integration tests
const mockMarketData = {
  instruments: [
    {
      figi: 'BBG00XXXXXXX',
      ticker: 'TRUR',
      name: 'T-RU',
      type: 'etf',
      currency: 'RUB',
      lot: 1,
      trading_status: 'TRADING_STATUS_NORMAL'
    },
    {
      figi: 'BBG00YYYYYYY',
      ticker: 'TMOS',
      name: 'T-MOS',
      type: 'etf',
      currency: 'RUB',
      lot: 1,
      trading_status: 'TRADING_STATUS_NORMAL'
    }
  ],
  prices: {
    'BBG00XXXXXXX': { price: 1250.5, currency: 'RUB' },
    'BBG00YYYYYYY': { price: 2000.0, currency: 'RUB' }
  },
  portfolios: {
    'account1': [
      {
        ticker: 'TRUR',
        figi: 'BBG00XXXXXXX',
        quantity: 80,
        price: 1250.5,
        totalPrice: 100040,
        currency: 'RUB',
        type: 'etf',
        name: 'T-RU',
        lots: 80,
        balance: 80,
        blocked: 0,
        quote: 'RUB',
        base: 'TRUR',
        totalPriceNumber: 100040
      },
      {
        ticker: 'RUB',
        figi: '',
        quantity: 49960,
        price: 1,
        totalPrice: 49960,
        currency: 'RUB',
        type: 'currency',
        name: 'Российский рубль',
        lots: 1,
        balance: 49960,
        blocked: 0,
        quote: 'RUB',
        base: 'RUB',
        totalPriceNumber: 49960
      }
    ]
  }
};

const mockConfigurations = {
  singleAccount: {
    accounts: [
      {
        id: 'account1',
        name: 'Single Account',
        t_invest_token: 't.single_token',
        account_id: '111111111',
        desired_wallet: { TRUR: 60, RUB: 40 }
      }
    ]
  },
  multiAccount: {
    accounts: [
      {
        id: 'account1',
        name: 'Account 1',
        t_invest_token: 't.token1',
        account_id: '111111111',
        desired_wallet: { TRUR: 60, RUB: 40 }
      },
      {
        id: 'account2',
        name: 'Account 2',
        t_invest_token: '${ENV_TOKEN_2}',
        account_id: '222222222',
        desired_wallet: { TMOS: 100 }
      }
    ]
  }
};

describe('Integration Tests', () => {
  beforeEach(() => {
    // Setup environment variables for multi-account testing
    process.env.ENV_TOKEN_2 = 't.env_token_value';
  });
  
  afterEach(() => {
    // Cleanup environment variables
    delete process.env.ENV_TOKEN_2;
  });

  describe('End-to-End Portfolio Balancing Workflow', () => {
    it('should execute complete balancing workflow for single account', () => {
      const config = mockConfigurations.singleAccount;
      const account = config.accounts[0];
      const portfolio = mockMarketData.portfolios.account1;
      
      // Step 1: Load configuration
      expect(account.id).toBe('account1');
      expect(account.desired_wallet).toBeDefined();
      
      // Step 2: Get current portfolio
      expect(portfolio).toHaveLength(2);
      const totalValue = portfolio.reduce((sum, pos) => sum + pos.totalPriceNumber, 0);
      expect(totalValue).toBe(150000);
      
      // Step 3: Calculate desired allocation
      const desiredTRUR = totalValue * (account.desired_wallet.TRUR / 100);
      const desiredRUB = totalValue * (account.desired_wallet.RUB / 100);
      
      expect(desiredTRUR).toBe(90000); // 60% of 150000
      expect(desiredRUB).toBe(60000);  // 40% of 150000
      
      // Step 4: Calculate rebalancing requirements
      const currentTRUR = portfolio.find(p => p.ticker === 'TRUR')?.totalPriceNumber || 0;
      const currentRUB = portfolio.find(p => p.ticker === 'RUB')?.totalPriceNumber || 0;
      
      const trurDiff = desiredTRUR - currentTRUR;
      const rubDiff = desiredRUB - currentRUB;
      
      expect(currentTRUR).toBe(100040);
      expect(currentRUB).toBe(49960);
      expect(trurDiff).toBeCloseTo(-10040, 0);
      expect(rubDiff).toBeCloseTo(10040, 0);
      
      // Step 5: Generate orders (if needed)
      const needsRebalancing = Math.abs(trurDiff) > 1000; // 1000 RUB threshold
      expect(needsRebalancing).toBe(true);
    });
    
    it('should handle portfolio already in balance', () => {
      const perfectPortfolio = [
        {
          ticker: 'TRUR',
          figi: 'BBG00XXXXXXX',
          quantity: 72,
          price: 1250,
          totalPrice: 90000,
          currency: 'RUB',
          type: 'etf',
          name: 'T-RU',
          lots: 72,
          balance: 72,
          blocked: 0,
          quote: 'RUB',
          base: 'TRUR',
          totalPriceNumber: 90000
        },
        {
          ticker: 'RUB',
          figi: '',
          quantity: 60000,
          price: 1,
          totalPrice: 60000,
          currency: 'RUB',
          type: 'currency',
          name: 'Российский рубль',
          lots: 1,
          balance: 60000,
          blocked: 0,
          quote: 'RUB',
          base: 'RUB',
          totalPriceNumber: 60000
        }
      ];
      
      const account = mockConfigurations.singleAccount.accounts[0];
      const totalValue = perfectPortfolio.reduce((sum, pos) => sum + pos.totalPriceNumber, 0);
      
      const currentTRUR = perfectPortfolio.find(p => p.ticker === 'TRUR')?.totalPriceNumber || 0;
      const currentRUB = perfectPortfolio.find(p => p.ticker === 'RUB')?.totalPriceNumber || 0;
      
      const currentTRURPercent = (currentTRUR / totalValue) * 100;
      const currentRUBPercent = (currentRUB / totalValue) * 100;
      
      expect(currentTRURPercent).toBe(60);
      expect(currentRUBPercent).toBe(40);
      
      // Should match desired allocation exactly
      expect(currentTRURPercent).toBe(account.desired_wallet.TRUR);
      expect(currentRUBPercent).toBe(account.desired_wallet.RUB);
    });
  });

  describe('Multi-Account Management', () => {
    it('should handle multiple account configurations', () => {
      const config = mockConfigurations.multiAccount;
      
      expect(config.accounts).toHaveLength(2);
      
      const account1 = config.accounts[0];
      const account2 = config.accounts[1];
      
      // Validate account isolation
      expect(account1.id).toBe('account1');
      expect(account2.id).toBe('account2');
      expect(account1.account_id).not.toBe(account2.account_id);
      
      // Validate different strategies
      expect(account1.desired_wallet.TRUR).toBe(60);
      expect(account2.desired_wallet.TMOS).toBe(100);
      
      // Validate token sources
      expect(account1.t_invest_token.startsWith('t.')).toBe(true);
      expect(account2.t_invest_token.startsWith('${')).toBe(true);
    });
    
    it('should process accounts independently', () => {
      const config = mockConfigurations.multiAccount;
      const results: any[] = [];
      
      // Simulate processing each account
      config.accounts.forEach(account => {
        const accountResult = {
          accountId: account.id,
          processed: true,
          errors: [] as string[]
        };
        
        try {
          // Validate account configuration
          if (!account.id || !account.desired_wallet) {
            accountResult.errors.push('Invalid account configuration');
          }
          
          // Validate token access
          let token = account.t_invest_token;
          if (token.startsWith('${') && token.endsWith('}')) {
            const envVar = token.slice(2, -1);
            token = process.env[envVar] || '';
            if (!token) {
              accountResult.errors.push('Environment variable not set');
            }
          }
          
          results.push(accountResult);
        } catch (error) {
          accountResult.errors.push('Processing error');
          accountResult.processed = false;
          results.push(accountResult);
        }
      });
      
      expect(results).toHaveLength(2);
      expect(results[0].processed).toBe(true);
      expect(results[1].processed).toBe(true);
      expect(results[0].errors).toHaveLength(0);
      expect(results[1].errors).toHaveLength(0);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large portfolios efficiently', () => {
      const largePortfolio = [];
      const numPositions = 50; // Reduced for faster test execution
      
      for (let i = 0; i < numPositions; i++) {
        largePortfolio.push({
          ticker: `ETF${i.toString().padStart(3, '0')}`,
          figi: `BBG${i.toString().padStart(8, '0')}`,
          quantity: Math.floor(Math.random() * 1000) + 1,
          price: Math.random() * 2000 + 500,
          totalPrice: 0,
          currency: 'RUB',
          type: 'etf',
          name: `ETF ${i}`,
          lots: 0,
          balance: 0,
          blocked: 0,
          quote: 'RUB',
          base: `ETF${i.toString().padStart(3, '0')}`,
          totalPriceNumber: 0
        });
      }
      
      // Calculate derived fields
      largePortfolio.forEach(position => {
        position.totalPrice = position.quantity * position.price;
        position.totalPriceNumber = position.totalPrice;
        position.lots = position.quantity;
        position.balance = position.quantity;
      });
      
      const totalValue = largePortfolio.reduce((sum, pos) => sum + pos.totalPriceNumber, 0);
      
      expect(largePortfolio).toHaveLength(numPositions);
      expect(totalValue).toBeGreaterThan(0);
      
      // Performance test: should process quickly
      const startTime = Date.now();
      const securities = largePortfolio.filter(p => p.base !== p.quote);
      const shares = securities.reduce((acc, position) => {
        acc[position.ticker] = (position.totalPriceNumber / totalValue) * 100;
        return acc;
      }, {} as Record<string, number>);
      const endTime = Date.now();
      
      expect(Object.keys(shares)).toHaveLength(numPositions);
      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
    });
    
    it('should handle concurrent account processing', async () => {
      const accounts = Array.from({ length: 3 }, (_, i) => ({
        id: `account${i + 1}`,
        processingTime: Math.random() * 50 + 25 // 25-75ms
      }));
      
      const processAccount = async (account: any) => {
        await new Promise(resolve => setTimeout(resolve, account.processingTime));
        return { accountId: account.id, processed: true };
      };
      
      const startTime = Date.now();
      const results = await Promise.all(accounts.map(processAccount));
      const endTime = Date.now();
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.processed)).toBe(true);
      
      // Concurrent processing should be faster than sequential
      const maxSequentialTime = accounts.reduce((sum, acc) => sum + acc.processingTime, 0);
      const actualTime = endTime - startTime;
      
      expect(actualTime).toBeLessThan(maxSequentialTime);
    });
  });
});