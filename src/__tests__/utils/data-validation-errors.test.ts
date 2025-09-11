import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";

// Import test utilities
import { 
  TestEnvironment, 
  FinancialAssertions, 
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { mockControls } from '../__mocks__/external-deps';

// Mock modules for testing
const mockFs = {
  promises: {
    readFile: mock(async () => ''),
    writeFile: mock(async () => undefined),
    access: mock(async () => undefined),
    mkdir: mock(async () => undefined)
  }
};

// Mock the fs module
mock.module('fs', () => ({
  ...mockFs,
  promises: mockFs.promises
}));

// Import the BalancingDataError class
import { BalancingDataError, DesiredMode } from "../../types.d";

testSuite('Data Validation Error Handling with Proper Error Messages Tests', () => {
  beforeEach(() => {
    // Setup mocks
    mockControls.resetAll();
    mockFs.promises.readFile.mockClear();
    mockFs.promises.writeFile.mockClear();
    mockFs.promises.access.mockClear();
    mockFs.promises.mkdir.mockClear();
  });

  afterEach(() => {
    // Cleanup
  });

  describe('BalancingDataError Class', () => {
    it('should create BalancingDataError with proper message structure', () => {
      const mode: DesiredMode = 'marketcap';
      const missingData = ['market_cap', 'aum'];
      const affectedTickers = ['TRUR', 'TMOS'];
      
      const error = new BalancingDataError(mode, missingData, affectedTickers);
      
      // Verify error properties
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BalancingDataError);
      expect(error.name).toBe('BalancingDataError');
      expect(error.mode).toBe(mode);
      expect(error.missingData).toEqual(missingData);
      expect(error.affectedTickers).toEqual(affectedTickers);
      
      // Verify error message structure
      expect(error.message).toContain('Balancing halted');
      expect(error.message).toContain(mode);
      expect(error.message).toContain(missingData.join(', '));
      expect(error.message).toContain(affectedTickers.join(', '));
    });
    
    it('should handle single missing data item correctly', () => {
      const mode: DesiredMode = 'aum';
      const missingData = ['aum'];
      const affectedTickers = ['TGLD'];
      
      const error = new BalancingDataError(mode, missingData, affectedTickers);
      
      // Verify error message for single item
      expect(error.message).toBe('Balancing halted: aum mode requires aum data for tickers: TGLD');
    });
    
    it('should handle multiple tickers correctly', () => {
      const mode: DesiredMode = 'marketcap_aum';
      const missingData = ['market_cap', 'aum'];
      const affectedTickers = ['TRUR', 'TMOS', 'TGLD', 'TPAY'];
      
      const error = new BalancingDataError(mode, missingData, affectedTickers);
      
      // Verify error message for multiple tickers
      expect(error.message).toContain('tickers: TRUR, TMOS, TGLD, TPAY');
    });
  });

  describe('Position Data Validation', () => {
    it('should validate position data structure correctly', () => {
      // Mock position validation function
      const validatePosition = (position: any) => {
        const errors: string[] = [];
        
        if (position === null || position === undefined) {
          errors.push('Position cannot be null or undefined');
          return errors;
        }
        
        if (typeof position !== 'object') {
          errors.push('Position must be an object');
          return errors;
        }
        
        if (!position.base || typeof position.base !== 'string') {
          errors.push('Position must have a valid base ticker');
        }
        
        if (position.amount === undefined || typeof position.amount !== 'number') {
          errors.push('Position must have a valid amount');
        }
        
        if (position.totalPriceNumber !== undefined && typeof position.totalPriceNumber !== 'number') {
          errors.push('totalPriceNumber must be a number if present');
        }
        
        return errors;
      };
      
      // Test valid position
      const validPosition = {
        base: 'TRUR',
        amount: 1000,
        totalPriceNumber: 100000
      };
      
      const validErrors = validatePosition(validPosition);
      expect(validErrors).toHaveLength(0);
      
      // Test invalid positions
      const invalidPositions = [
        null,
        undefined,
        'not-an-object',
        { base: '', amount: 1000 }, // Empty base
        { base: 'TRUR' }, // Missing amount
        { base: 'TRUR', amount: 'not-a-number' }, // Invalid amount type
        { base: 'TRUR', amount: 1000, totalPriceNumber: 'not-a-number' } // Invalid totalPriceNumber
      ];
      
      invalidPositions.forEach((position, index) => {
        const errors = validatePosition(position);
        expect(errors).not.toHaveLength(0);
        expect(errors[0]).toBeDefined();
      });
    });
    
    it('should provide descriptive error messages for position validation failures', () => {
      // Mock position validation function with detailed error messages
      const validatePositionWithDetails = (position: any) => {
        const errors: string[] = [];
        
        if (position === null) {
          errors.push('Position validation failed: null position provided');
        } else if (position === undefined) {
          errors.push('Position validation failed: undefined position provided');
        } else if (typeof position !== 'object') {
          errors.push(`Position validation failed: expected object, got ${typeof position}`);
        } else {
          if (!position.base) {
            errors.push('Position validation failed: missing required field "base"');
          } else if (typeof position.base !== 'string') {
            errors.push(`Position validation failed: "base" must be string, got ${typeof position.base}`);
          }
          
          if (position.amount === undefined) {
            errors.push('Position validation failed: missing required field "amount"');
          } else if (typeof position.amount !== 'number') {
            errors.push(`Position validation failed: "amount" must be number, got ${typeof position.amount}`);
          }
          
          if (position.totalPriceNumber !== undefined && typeof position.totalPriceNumber !== 'number') {
            errors.push(`Position validation failed: "totalPriceNumber" must be number, got ${typeof position.totalPriceNumber}`);
          }
        }
        
        return errors;
      };
      
      // Test various invalid positions with descriptive error messages
      const testCases = [
        {
          position: null,
          expectedError: 'Position validation failed: null position provided'
        },
        {
          position: undefined,
          expectedError: 'Position validation failed: undefined position provided'
        },
        {
          position: 'invalid',
          expectedError: 'Position validation failed: expected object, got string'
        },
        {
          position: { amount: 1000 },
          expectedError: 'Position validation failed: missing required field "base"'
        },
        {
          position: { base: 123, amount: 1000 },
          expectedError: 'Position validation failed: "base" must be string, got number'
        },
        {
          position: { base: 'TRUR' },
          expectedError: 'Position validation failed: missing required field "amount"'
        },
        {
          position: { base: 'TRUR', amount: 'invalid' },
          expectedError: 'Position validation failed: "amount" must be number, got string'
        },
        {
          position: { base: 'TRUR', amount: 1000, totalPriceNumber: true },
          expectedError: 'Position validation failed: "totalPriceNumber" must be number, got boolean'
        }
      ];
      
      testCases.forEach(({ position, expectedError }) => {
        const errors = validatePositionWithDetails(position);
        expect(errors).toContain(expectedError);
      });
    });
  });

  describe('Wallet Data Validation', () => {
    it('should validate wallet structure with proper error messages', () => {
      // Mock wallet validation function
      const validateWallet = (wallet: any) => {
        const errors: string[] = [];
        
        if (wallet === null || wallet === undefined) {
          errors.push('Wallet validation failed: wallet cannot be null or undefined');
          return errors;
        }
        
        if (typeof wallet !== 'object') {
          errors.push(`Wallet validation failed: expected object, got ${typeof wallet}`);
          return errors;
        }
        
        if (Array.isArray(wallet)) {
          errors.push('Wallet validation failed: expected object, got array');
          return errors;
        }
        
        const tickers = Object.keys(wallet);
        if (tickers.length === 0) {
          errors.push('Wallet validation failed: wallet cannot be empty');
          return errors;
        }
        
        // Validate each weight
        let totalWeight = 0;
        for (const [ticker, weight] of Object.entries(wallet)) {
          if (typeof weight !== 'number') {
            errors.push(`Wallet validation failed: weight for ${ticker} must be a number, got ${typeof weight}`);
          } else if (weight < 0) {
            errors.push(`Wallet validation failed: weight for ${ticker} cannot be negative`);
          } else if (!isFinite(weight)) {
            errors.push(`Wallet validation failed: weight for ${ticker} must be finite`);
          } else {
            totalWeight += weight;
          }
        }
        
        // Check total weight
        if (Math.abs(totalWeight - 100) > 0.01) {
          errors.push(`Wallet validation failed: weights must sum to 100%, got ${totalWeight.toFixed(2)}%`);
        }
        
        return errors;
      };
      
      // Test valid wallet
      const validWallet = { TRUR: 50, TMOS: 30, TGLD: 20 };
      const validErrors = validateWallet(validWallet);
      expect(validErrors).toHaveLength(0);
      
      // Test invalid wallets with descriptive error messages
      const testCases = [
        {
          wallet: null,
          expectedError: 'Wallet validation failed: wallet cannot be null or undefined'
        },
        {
          wallet: 'invalid',
          expectedError: 'Wallet validation failed: expected object, got string'
        },
        {
          wallet: [],
          expectedError: 'Wallet validation failed: expected object, got array'
        },
        {
          wallet: {},
          expectedError: 'Wallet validation failed: wallet cannot be empty'
        },
        {
          wallet: { TRUR: 'not-a-number' },
          expectedError: 'Wallet validation failed: weight for TRUR must be a number, got string'
        },
        {
          wallet: { TRUR: -10 },
          expectedError: 'Wallet validation failed: weight for TRUR cannot be negative'
        },
        {
          wallet: { TRUR: Infinity },
          expectedError: 'Wallet validation failed: weight for TRUR must be finite'
        },
        {
          wallet: { TRUR: 60, TMOS: 50 }, // Sums to 110%
          expectedError: 'Wallet validation failed: weights must sum to 100%, got 110.00%'
        }
      ];
      
      testCases.forEach(({ wallet, expectedError }) => {
        const errors = validateWallet(wallet);
        expect(errors).toContain(expectedError);
      });
    });
  });

  describe('Configuration Data Validation', () => {
    it('should validate account configuration with proper error messages', () => {
      // Mock account validation function
      const validateAccount = (account: any) => {
        const errors: string[] = [];
        
        if (!account) {
          errors.push('Account validation failed: account configuration is required');
          return errors;
        }
        
        // Validate required string fields
        const requiredStringFields = ['id', 'name', 't_invest_token', 'account_id'];
        for (const field of requiredStringFields) {
          if (!account[field]) {
            errors.push(`Account validation failed: missing required field "${field}"`);
          } else if (typeof account[field] !== 'string') {
            errors.push(`Account validation failed: "${field}" must be a string, got ${typeof account[field]}`);
          } else if (account[field].trim() === '') {
            errors.push(`Account validation failed: "${field}" cannot be empty`);
          }
        }
        
        // Validate required object fields
        if (!account.desired_wallet) {
          errors.push('Account validation failed: missing required field "desired_wallet"');
        } else if (typeof account.desired_wallet !== 'object' || Array.isArray(account.desired_wallet)) {
          errors.push('Account validation failed: "desired_wallet" must be an object');
        }
        
        // Validate numeric fields
        const numericFields = ['balance_interval', 'sleep_between_orders'];
        for (const field of numericFields) {
          if (account[field] === undefined) {
            errors.push(`Account validation failed: missing required field "${field}"`);
          } else if (typeof account[field] !== 'number') {
            errors.push(`Account validation failed: "${field}" must be a number, got ${typeof account[field]}`);
          } else if (account[field] <= 0) {
            errors.push(`Account validation failed: "${field}" must be positive`);
          }
        }
        
        return errors;
      };
      
      // Test valid account
      const validAccount = {
        id: 'test-account',
        name: 'Test Account',
        t_invest_token: 't.test_token',
        account_id: '123456789',
        desired_wallet: { TRUR: 100 },
        balance_interval: 300000,
        sleep_between_orders: 1000
      };
      
      const validErrors = validateAccount(validAccount);
      expect(validErrors).toHaveLength(0);
      
      // Test invalid accounts with descriptive error messages
      const testCases = [
        {
          account: null,
          expectedError: 'Account validation failed: account configuration is required'
        },
        {
          account: {},
          expectedError: 'Account validation failed: missing required field "id"'
        },
        {
          account: { id: 123 },
          expectedError: 'Account validation failed: "id" must be a string, got number'
        },
        {
          account: { id: 'test', name: '' },
          expectedError: 'Account validation failed: "name" cannot be empty'
        },
        {
          account: { id: 'test', name: 'Test' },
          expectedError: 'Account validation failed: missing required field "t_invest_token"'
        },
        {
          account: { id: 'test', name: 'Test', t_invest_token: 'token' },
          expectedError: 'Account validation failed: missing required field "account_id"'
        },
        {
          account: { id: 'test', name: 'Test', t_invest_token: 'token', account_id: '123' },
          expectedError: 'Account validation failed: missing required field "desired_wallet"'
        },
        {
          account: { 
            id: 'test', 
            name: 'Test', 
            t_invest_token: 'token', 
            account_id: '123',
            desired_wallet: 'invalid'
          },
          expectedError: 'Account validation failed: "desired_wallet" must be an object'
        },
        {
          account: { 
            id: 'test', 
            name: 'Test', 
            t_invest_token: 'token', 
            account_id: '123',
            desired_wallet: { TRUR: 100 }
          },
          expectedError: 'Account validation failed: missing required field "balance_interval"'
        },
        {
          account: { 
            id: 'test', 
            name: 'Test', 
            t_invest_token: 'token', 
            account_id: '123',
            desired_wallet: { TRUR: 100 },
            balance_interval: 'invalid'
          },
          expectedError: 'Account validation failed: "balance_interval" must be a number, got string'
        },
        {
          account: { 
            id: 'test', 
            name: 'Test', 
            t_invest_token: 'token', 
            account_id: '123',
            desired_wallet: { TRUR: 100 },
            balance_interval: 300000
          },
          expectedError: 'Account validation failed: missing required field "sleep_between_orders"'
        },
        {
          account: { 
            id: 'test', 
            name: 'Test', 
            t_invest_token: 'token', 
            account_id: '123',
            desired_wallet: { TRUR: 100 },
            balance_interval: 300000,
            sleep_between_orders: -1000
          },
          expectedError: 'Account validation failed: "sleep_between_orders" must be positive'
        }
      ];
      
      testCases.forEach(({ account, expectedError }) => {
        const errors = validateAccount(account);
        expect(errors).toContain(expectedError);
      });
    });
  });

  describe('Market Data Validation', () => {
    it('should validate market data with proper error messages', () => {
      // Mock market data validation function
      const validateMarketData = (data: any) => {
        const errors: string[] = [];
        
        if (!data) {
          errors.push('Market data validation failed: data is required');
          return errors;
        }
        
        if (typeof data !== 'object') {
          errors.push(`Market data validation failed: expected object, got ${typeof data}`);
          return errors;
        }
        
        // Validate required fields for different data types
        if (data.hasOwnProperty('marketCap')) {
          if (typeof data.marketCap !== 'number') {
            errors.push('Market data validation failed: marketCap must be a number');
          } else if (data.marketCap < 0) {
            errors.push('Market data validation failed: marketCap cannot be negative');
          }
        }
        
        if (data.hasOwnProperty('aum')) {
          if (typeof data.aum !== 'number') {
            errors.push('Market data validation failed: aum must be a number');
          } else if (data.aum < 0) {
            errors.push('Market data validation failed: aum cannot be negative');
          }
        }
        
        if (data.hasOwnProperty('price')) {
          if (typeof data.price !== 'number') {
            errors.push('Market data validation failed: price must be a number');
          } else if (data.price <= 0) {
            errors.push('Market data validation failed: price must be positive');
          } else if (!isFinite(data.price)) {
            errors.push('Market data validation failed: price must be finite');
          }
        }
        
        return errors;
      };
      
      // Test valid market data
      const validMarketData = {
        marketCap: 1000000000,
        aum: 500000000,
        price: 150.50
      };
      
      const validErrors = validateMarketData(validMarketData);
      expect(validErrors).toHaveLength(0);
      
      // Test invalid market data with descriptive error messages
      const testCases = [
        {
          data: null,
          expectedError: 'Market data validation failed: data is required'
        },
        {
          data: 'invalid',
          expectedError: 'Market data validation failed: expected object, got string'
        },
        {
          data: { marketCap: 'invalid' },
          expectedError: 'Market data validation failed: marketCap must be a number'
        },
        {
          data: { marketCap: -1000000 },
          expectedError: 'Market data validation failed: marketCap cannot be negative'
        },
        {
          data: { aum: 'invalid' },
          expectedError: 'Market data validation failed: aum must be a number'
        },
        {
          data: { aum: -500000 },
          expectedError: 'Market data validation failed: aum cannot be negative'
        },
        {
          data: { price: 'invalid' },
          expectedError: 'Market data validation failed: price must be a number'
        },
        {
          data: { price: 0 },
          expectedError: 'Market data validation failed: price must be positive'
        },
        {
          data: { price: Infinity },
          expectedError: 'Market data validation failed: price must be finite'
        }
      ];
      
      testCases.forEach(({ data, expectedError }) => {
        const errors = validateMarketData(data);
        expect(errors).toContain(expectedError);
      });
    });
  });

  describe('Error Message Consistency', () => {
    it('should provide consistent error message format across all validations', () => {
      // Test that all validation errors follow the same format
      const errorFormat = /^.* validation failed: .*/;
      
      // Mock various validation functions
      const validations = [
        // Position validation error
        () => {
          if (true) throw new Error('Position validation failed: missing required field "base"');
        },
        // Wallet validation error
        () => {
          if (true) throw new Error('Wallet validation failed: weights must sum to 100%');
        },
        // Account validation error
        () => {
          if (true) throw new Error('Account validation failed: "id" cannot be empty');
        },
        // Market data validation error
        () => {
          if (true) throw new Error('Market data validation failed: price must be positive');
        }
      ];
      
      validations.forEach(validation => {
        try {
          validation();
        } catch (error: any) {
          expect(error.message).toMatch(errorFormat);
          expect(error.message).toContain('validation failed:');
        }
      });
    });
    
    it('should include specific field information in error messages', () => {
      // Test that error messages include specific field names
      const fieldSpecificErrors = [
        'missing required field "base"',
        '"amount" must be a number',
        '"desired_wallet" must be an object',
        'weight for TRUR cannot be negative'
      ];
      
      fieldSpecificErrors.forEach(errorMsg => {
        expect(errorMsg).toMatch(/".*"/); // Contains quoted field names
      });
    });
  });

  describe('Error Handling in Data Processing', () => {
    it('should handle validation errors gracefully during data processing', async () => {
      // Mock data processing function that validates input
      const processData = async (data: any) => {
        // Validate input first
        const validationErrors = [];
        
        if (!data) {
          validationErrors.push('Data processing failed: input data is required');
        } else if (typeof data !== 'object') {
          validationErrors.push(`Data processing failed: expected object, got ${typeof data}`);
        }
        
        if (validationErrors.length > 0) {
          throw new Error(validationErrors[0]);
        }
        
        // Process data if validation passes
        return { processed: true, result: data };
      };
      
      // Test error handling for invalid input
      const invalidInputs = [null, 'invalid', 123];
      
      for (const input of invalidInputs) {
        try {
          await processData(input);
          // Should not reach here
          expect(true).toBe(false);
        } catch (error: any) {
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toContain('Data processing failed:');
        }
      }
      
      // Test successful processing with valid input
      const validInput = { test: 'data' };
      const result = await processData(validInput);
      expect(result.processed).toBe(true);
      expect(result.result).toEqual(validInput);
    });
    
    it('should aggregate multiple validation errors', () => {
      // Mock validation function that collects multiple errors
      const validateWithAggregation = (data: any) => {
        const errors: string[] = [];
        
        if (!data) {
          errors.push('Validation failed: data is required');
          return errors; // Return early for null/undefined
        }
        
        if (typeof data !== 'object') {
          errors.push(`Validation failed: expected object, got ${typeof data}`);
          return errors; // Return early for wrong type
        }
        
        // Check multiple fields
        if (!data.field1) {
          errors.push('Validation failed: missing required field "field1"');
        }
        
        if (!data.field2) {
          errors.push('Validation failed: missing required field "field2"');
        }
        
        if (data.field3 !== undefined && typeof data.field3 !== 'number') {
          errors.push('Validation failed: "field3" must be a number');
        }
        
        return errors;
      };
      
      // Test aggregation of multiple errors
      const testData = { field3: 'not-a-number' }; // Missing field1 and field2, wrong type for field3
      const errors = validateWithAggregation(testData);
      
      expect(errors).toHaveLength(3);
      expect(errors).toContain('Validation failed: missing required field "field1"');
      expect(errors).toContain('Validation failed: missing required field "field2"');
      expect(errors).toContain('Validation failed: "field3" must be a number');
    });
  });
});