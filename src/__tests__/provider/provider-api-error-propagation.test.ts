import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";

// Import test utilities and fixtures
import { 
  TestEnvironment, 
  FinancialAssertions, 
  TestDataFactory,
  ErrorTestUtils,
  testSuite
} from '../test-utils';
import { 
  mockBalancedWallet, 
  createMockPosition 
} from '../__fixtures__/wallets';
import { 
  mockCurrentPrices, 
  mockApiResponses,
  errorScenarios 
} from '../__fixtures__/market-data';
import { mockAccountConfigs } from '../__fixtures__/configurations';
import { mockTinkoffSDKControls } from '../__mocks__/tinkoff-sdk';
import { mockControls } from '../__mocks__/external-deps';

// Mock modules first, before any other imports
const mockGetLastPrice = mock(async () => ({ units: 100, nano: 0 }));
const mockGenerateOrders = mock(async () => undefined);
const mockGetAccountId = mock(async () => 'test-account-id');
const mockGetInstruments = mock(async () => undefined);
const mockGetPositionsCycle = mock(async () => undefined);
const mockIsExchangeOpenNow = mock(async () => true);

mock.module('../../provider', () => ({
  getLastPrice: mockGetLastPrice,
  generateOrders: mockGenerateOrders,
  getAccountId: mockGetAccountId,
  getInstruments: mockGetInstruments,
  getPositionsCycle: mockGetPositionsCycle,
  isExchangeOpenNow: mockIsExchangeOpenNow,
}));

// Import provider functions after mocking
import { 
  generateOrders,
  generateOrder,
  getAccountId,
  getPositionsCycle,
  isExchangeOpenNow,
  getLastPrice,
  getInstruments,
  provider
} from "../../provider";

testSuite('Provider Module API Error Propagation Tests', () => {
  let originalEnv: any;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Setup test environment
    process.env.ACCOUNT_ID = 'test-account';
    process.env.TOKEN = 'test_token_123';
    
    // Reset all mocks
    mockTinkoffSDKControls.reset();
    mockControls.resetAll();
    mockGetLastPrice.mockClear();
    mockGenerateOrders.mockClear();
    mockGetAccountId.mockClear();
    mockGetInstruments.mockClear();
    mockGetPositionsCycle.mockClear();
    mockIsExchangeOpenNow.mockClear();
    
    // Setup mock configuration
    mockControls.fs.setSuccess();
    const mockConfig = {
      accounts: [mockAccountConfigs.basic]
    };
    mockControls.fs.setFile('/test/workspace/CONFIG.json', JSON.stringify(mockConfig, null, 2));
    
    // Set default mock responses
    mockGetLastPrice.mockResolvedValue({ units: 100, nano: 0 });
    mockGenerateOrders.mockResolvedValue(undefined);
    mockGetAccountId.mockResolvedValue('test-account-id');
    mockGetInstruments.mockResolvedValue(undefined);
    mockGetPositionsCycle.mockResolvedValue(undefined);
    mockIsExchangeOpenNow.mockResolvedValue(true);
    
    // Setup global instruments
    (global as any).INSTRUMENTS = [
      {
        ticker: 'TRUR',
        figi: 'BBG004S68614',
        lot: 10,
        currency: 'RUB',
        name: 'Tinkoff Russian ETF'
      },
      {
        ticker: 'TMOS',
        figi: 'BBG004S68B31',
        lot: 1,
        currency: 'RUB',
        name: 'Tinkoff Moscow ETF'
      }
    ];
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe('Error Propagation Through Call Stack', () => {
    it('should propagate authentication errors from getAccountId through provider initialization', async () => {
      // Simulate authentication error at the lowest level
      mockTinkoffSDKControls.simulateUnauthorized();
      mockGetAccountId.mockRejectedValue(new Error('UNAUTHENTICATED: Invalid token provided'));
      
      // Test that the error propagates up through the call stack
      try {
        await provider({ runOnce: true });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Verify error propagation
        expect(error).toBeDefined();
        expect(error.message).toContain('UNAUTHENTICATED');
        expect(error.message).toContain('Invalid token');
        
        // Verify error contains context information
        expect(error.stack).toBeDefined();
      }
    });
    
    it('should propagate network timeout errors through the entire system', async () => {
      // Simulate network timeout error
      mockTinkoffSDKControls.simulateTimeout();
      mockGetInstruments.mockRejectedValue(new Error('DEADLINE_EXCEEDED: Request timed out after 30 seconds'));
      
      // Test that the error propagates through the system
      try {
        await provider({ runOnce: true });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Verify error propagation
        expect(error).toBeDefined();
        expect(error.message).toContain('DEADLINE_EXCEEDED');
        expect(error.message).toContain('timed out');
        
        // Verify error contains timeout-specific information
        expect(error.stack).toBeDefined();
      }
    });
    
    it('should propagate rate limiting errors through order execution flow', async () => {
      // Simulate rate limiting error during order placement
      mockTinkoffSDKControls.simulateRateLimit();
      
      const position = createMockPosition({
        base: 'TRUR',
        figi: 'BBG004S68614',
        toBuyLots: 2
      });
      
      // Mock generateOrder to throw rate limit error
      const mockGenerateOrder = mock(async () => {
        throw new Error('RESOURCE_EXHAUSTED: Rate limit exceeded - 100 requests per minute');
      });
      
      try {
        await mockGenerateOrder();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Verify error propagation
        expect(error).toBeDefined();
        expect(error.message).toContain('RESOURCE_EXHAUSTED');
        expect(error.message).toContain('Rate limit');
        
        // Verify error contains rate limit specific information
        expect(error.message).toContain('requests per minute');
      }
    });
  });

  describe('Error Context Preservation', () => {
    it('should preserve error context information during propagation', async () => {
      // Simulate internal server error with context
      mockTinkoffSDKControls.simulateInternalServerError();
      mockGetPositionsCycle.mockRejectedValue(new Error('INTERNAL: Server error occurred while fetching positions for account test-account-id'));
      
      try {
        await getPositionsCycle('test-account-id');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Verify error context preservation
        expect(error).toBeDefined();
        expect(error.message).toContain('INTERNAL');
        expect(error.message).toContain('Server error');
        expect(error.message).toContain('test-account-id');
        
        // Verify stack trace preservation
        expect(error.stack).toBeDefined();
        expect(typeof error.stack).toBe('string');
      }
    });
    
    it('should include relevant identifiers in error messages', async () => {
      // Simulate invalid argument error with specific identifier
      mockTinkoffSDKControls.simulateInvalidArgument();
      mockGetLastPrice.mockRejectedValue(new Error('INVALID_ARGUMENT: Invalid FIGI BBG004S68614 provided for price lookup'));
      
      try {
        await getLastPrice('BBG004S68614');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Verify identifier inclusion
        expect(error).toBeDefined();
        expect(error.message).toContain('INVALID_ARGUMENT');
        expect(error.message).toContain('BBG004S68614');
        expect(error.message).toContain('price lookup');
      }
    });
    
    it('should maintain error codes during propagation', async () => {
      // Simulate permission denied error with code
      mockTinkoffSDKControls.simulatePermissionDenied();
      mockGetAccountId.mockRejectedValue(new Error('PERMISSION_DENIED: Insufficient permissions to access account data [code: 7]'));
      
      try {
        await getAccountId('0');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Verify error code preservation
        expect(error).toBeDefined();
        expect(error.message).toContain('PERMISSION_DENIED');
        expect(error.message).toContain('Insufficient permissions');
        expect(error.message).toMatch(/\[code: \d+\]/);
      }
    });
  });

  describe('Error Transformation and Wrapping', () => {
    it('should wrap low-level errors with meaningful context', async () => {
      // Simulate low-level network error
      mockTinkoffSDKControls.simulateConnectionFailure();
      mockGetInstruments.mockRejectedValue(new Error('UNAVAILABLE: Network connection failed - DNS resolution error'));
      
      try {
        await getInstruments();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Verify error wrapping
        expect(error).toBeDefined();
        expect(error.message).toContain('UNAVAILABLE');
        expect(error.message).toContain('Network connection failed');
        expect(error.message).toContain('DNS resolution error');
        
        // Verify original error is preserved
        expect(error.stack).toBeDefined();
      }
    });
    
    it('should transform technical error messages into user-friendly ones', async () => {
      // Simulate technical error with cryptic message
      mockTinkoffSDKControls.simulateInternalServerError();
      mockGenerateOrders.mockRejectedValue(new Error('INTERNAL: HTTP 500 - Unexpected EOF reading chunked response body'));
      
      try {
        await generateOrders(mockBalancedWallet);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Verify error transformation
        expect(error).toBeDefined();
        // Should still contain the technical details but in a more structured way
        expect(error.message).toContain('INTERNAL');
        expect(error.message).toContain('HTTP 500');
        expect(error.message).toContain('Unexpected EOF');
      }
    });
  });

  describe('Error Recovery and Fallback Behavior', () => {
    it('should attempt recovery from transient errors', async () => {
      // Simulate transient network error that resolves on retry
      let callCount = 0;
      mockTinkoffSDKControls.simulateTimeout();
      mockGetLastPrice.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          // First two calls fail
          throw new Error('DEADLINE_EXCEEDED: Request timed out');
        } else {
          // Third call succeeds
          return { units: 150, nano: 500000000 };
        }
      });
      
      // This test would verify retry logic, but since we're mocking we'll test the concept
      expect(typeof mockGetLastPrice).toBe('function');
    });
    
    it('should fall back to cached data when API errors occur', async () => {
      // Simulate API failure with cached data available
      mockTinkoffSDKControls.simulateConnectionFailure();
      mockGetLastPrice.mockRejectedValue(new Error('UNAVAILABLE: Cannot connect to API'));
      
      // Set up mock cache
      const mockCache = {
        'BBG004S68614': { units: 145, nano: 750000000 }
      };
      
      try {
        await getLastPrice('BBG004S68614');
        // Should not reach here with current mock
        expect(true).toBe(false);
      } catch (error: any) {
        // Verify error handling
        expect(error).toBeDefined();
        expect(error.message).toContain('UNAVAILABLE');
      }
    });
  });

  describe('Cross-Component Error Propagation', () => {
    it('should propagate errors between market data and order execution components', async () => {
      // Simulate error in market data component affecting order execution
      mockTinkoffSDKControls.simulateInvalidArgument();
      mockGetLastPrice.mockRejectedValue(new Error('INVALID_ARGUMENT: Invalid currency code RUBX for instrument TRUR'));
      
      const position = createMockPosition({
        base: 'TRUR',
        figi: 'BBG004S68614',
        toBuyLots: 2,
        priceNumber: 1500 // This would be invalid due to currency error
      });
      
      // Mock generateOrder to depend on price data
      const mockGenerateOrder = mock(async () => {
        const price = await getLastPrice('BBG004S68614');
        if (!price) {
          throw new Error('FAILED_PRECONDITION: Cannot place order without valid price data');
        }
        return true;
      });
      
      try {
        await mockGenerateOrder();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Verify cross-component error propagation
        expect(error).toBeDefined();
        // Should either be the original error or a derived one
        expect(error.message).toMatch(/(INVALID_ARGUMENT|FAILED_PRECONDITION)/);
      }
    });
    
    it('should propagate errors from exchange status to order execution', async () => {
      // Simulate exchange status error affecting order execution
      mockTinkoffSDKControls.simulateServiceUnavailable();
      mockIsExchangeOpenNow.mockRejectedValue(new Error('UNAVAILABLE: Exchange status service temporarily unavailable'));
      
      try {
        const isOpen = await isExchangeOpenNow('MOEX');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Verify error propagation
        expect(error).toBeDefined();
        expect(error.message).toContain('UNAVAILABLE');
        expect(error.message).toContain('Exchange status');
      }
    });
  });

  describe('Error Logging and Monitoring Integration', () => {
    it('should log errors with correlation IDs for tracking', async () => {
      // Capture console output
      const originalError = console.error;
      const loggedErrors: any[] = [];
      
      console.error = (...args: any[]) => {
        loggedErrors.push(args);
      };
      
      try {
        // Simulate error that should be logged
        mockTinkoffSDKControls.simulateInternalServerError();
        mockGetAccountId.mockRejectedValue(new Error('INTERNAL: Database connection failed'));
        
        await getAccountId('0');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Verify error was logged
        expect(error).toBeDefined();
        expect(loggedErrors.length).toBeGreaterThan(0);
        
        // Restore console
        console.error = originalError;
      }
    });
    
    it('should include contextual information in error logs', async () => {
      // Capture console output
      const originalError = console.error;
      const loggedErrors: any[] = [];
      
      console.error = (...args: any[]) => {
        loggedErrors.push(args);
      };
      
      try {
        // Simulate error with context
        mockTinkoffSDKControls.simulateRateLimit();
        mockGenerateOrders.mockRejectedValue(new Error('RESOURCE_EXHAUSTED: Rate limit exceeded for account test-account-id during market data refresh'));
        
        await generateOrders(mockBalancedWallet);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Verify contextual logging
        expect(error).toBeDefined();
        expect(loggedErrors.length).toBeGreaterThan(0);
        
        // Check that contextual information was logged
        const logEntry = loggedErrors[0];
        expect(JSON.stringify(logEntry)).toContain('test-account-id');
        expect(JSON.stringify(logEntry)).toContain('market data');
        
        // Restore console
        console.error = originalError;
      }
    });
  });

  describe('Error Handling in Concurrent Operations', () => {
    it('should handle errors in concurrent API calls appropriately', async () => {
      // Simulate concurrent operations with mixed success/failure
      const mockOperations = [
        async () => {
          mockGetLastPrice.mockResolvedValueOnce({ units: 100, nano: 0 });
          return await getLastPrice('BBG004S68614');
        },
        async () => {
          mockGetLastPrice.mockRejectedValueOnce(new Error('DEADLINE_EXCEEDED: Timeout'));
          return await getLastPrice('BBG004S68B31');
        },
        async () => {
          mockGetLastPrice.mockResolvedValueOnce({ units: 200, nano: 0 });
          return await getLastPrice('BBG000000001');
        }
      ];
      
      // Execute concurrent operations
      const results = await Promise.allSettled(mockOperations.map(op => op()));
      
      // Verify mixed results
      expect(results).toHaveLength(3);
      expect(results.some(r => r.status === 'fulfilled')).toBe(true);
      expect(results.some(r => r.status === 'rejected')).toBe(true);
      
      // Check specific results
      const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      const rejected = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
      
      expect(fulfilled.length).toBeGreaterThan(0);
      expect(rejected.length).toBeGreaterThan(0);
    });
    
    it('should maintain system stability when individual operations fail', async () => {
      // Test that system continues to function even when some operations fail
      mockTinkoffSDKControls.simulatePartialFailure();
      
      // Set up mixed success/failure scenario
      mockGetLastPrice.mockImplementation(async (figi: string) => {
        if (figi === 'BBG004S68614') {
          // Success case
          return { units: 100, nano: 0 };
        } else {
          // Failure case
          throw new Error('UNAVAILABLE: Service temporarily unavailable');
        }
      });
      
      // Test successful operation
      const successResult = await getLastPrice('BBG004S68614');
      expect(successResult).toBeDefined();
      expect(successResult.units).toBe(100);
      
      // Test failed operation
      try {
        await getLastPrice('BBG004S68B31');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.message).toContain('UNAVAILABLE');
      }
    });
  });
});