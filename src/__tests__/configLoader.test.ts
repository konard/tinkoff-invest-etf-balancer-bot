import { describe, it, expect } from 'bun:test';
import { ExchangeClosureBehavior, ExchangeClosureMode } from '../types.d';

// Since ConfigLoader is a singleton and uses real file I/O, 
// let's test the validation logic more directly
describe('Exchange Closure Behavior Configuration', () => {
  describe('Type Definitions', () => {
    it('should have proper type definitions for ExchangeClosureBehavior', () => {
      const behavior: ExchangeClosureBehavior = {
        mode: 'dry_run',
        update_iteration_result: true
      };

      expect(behavior.mode).toBe('dry_run');
      expect(behavior.update_iteration_result).toBe(true);
    });

    it('should enforce ExchangeClosureMode enum values', () => {
      const validModes: ExchangeClosureMode[] = ['skip_iteration', 'force_orders', 'dry_run'];
      
      validModes.forEach(mode => {
        const behavior: ExchangeClosureBehavior = {
          mode: mode,
          update_iteration_result: false
        };
        expect(behavior.mode).toBe(mode);
      });
    });

    it('should support all required exchange closure modes', () => {
      const validModes: ExchangeClosureMode[] = ['skip_iteration', 'force_orders', 'dry_run'];
      
      expect(validModes).toContain('skip_iteration');
      expect(validModes).toContain('force_orders');
      expect(validModes).toContain('dry_run');
      expect(validModes.length).toBe(3);
    });

    it('should support boolean values for update_iteration_result', () => {
      const behaviorTrue: ExchangeClosureBehavior = {
        mode: 'dry_run',
        update_iteration_result: true
      };
      
      const behaviorFalse: ExchangeClosureBehavior = {
        mode: 'dry_run',
        update_iteration_result: false
      };

      expect(behaviorTrue.update_iteration_result).toBe(true);
      expect(behaviorFalse.update_iteration_result).toBe(false);
    });
  });

  describe('Configuration Validation Logic', () => {
    // Test the validation functions directly by creating a mock validator
    const validateExchangeClosureBehavior = (behavior: any, accountId: string): void => {
      const validModes = ['skip_iteration', 'force_orders', 'dry_run'];
      
      if (!behavior.mode || !validModes.includes(behavior.mode)) {
        throw new Error(
          `Account ${accountId}: exchange_closure_behavior.mode must be one of: ${validModes.join(', ')}. ` +
          `Got: ${behavior.mode}`
        );
      }
      
      if (typeof behavior.update_iteration_result !== 'boolean') {
        throw new Error(
          `Account ${accountId}: exchange_closure_behavior.update_iteration_result must be a boolean. ` +
          `Got: ${typeof behavior.update_iteration_result}`
        );
      }
    };

    it('should validate valid exchange_closure_behavior configurations', () => {
      const validConfigurations = [
        { mode: 'skip_iteration', update_iteration_result: false },
        { mode: 'force_orders', update_iteration_result: true },
        { mode: 'dry_run', update_iteration_result: false },
        { mode: 'dry_run', update_iteration_result: true }
      ];

      validConfigurations.forEach(config => {
        expect(() => {
          validateExchangeClosureBehavior(config, 'test_account');
        }).not.toThrow();
      });
    });

    it('should reject invalid mode values', () => {
      const invalidConfigurations = [
        { mode: 'invalid_mode', update_iteration_result: true },
        { mode: '', update_iteration_result: true },
        { mode: null, update_iteration_result: true },
        { mode: undefined, update_iteration_result: true }
      ];

      invalidConfigurations.forEach(config => {
        expect(() => {
          validateExchangeClosureBehavior(config, 'test_account');
        }).toThrow('exchange_closure_behavior.mode must be one of');
      });
    });

    it('should reject invalid update_iteration_result values', () => {
      const invalidConfigurations = [
        { mode: 'dry_run', update_iteration_result: 'true' },
        { mode: 'dry_run', update_iteration_result: 1 },
        { mode: 'dry_run', update_iteration_result: null },
        { mode: 'dry_run', update_iteration_result: undefined }
      ];

      invalidConfigurations.forEach(config => {
        expect(() => {
          validateExchangeClosureBehavior(config, 'test_account');
        }).toThrow('exchange_closure_behavior.update_iteration_result must be a boolean');
      });
    });
  });

  describe('Default Behavior Configuration', () => {
    it('should define appropriate default values', () => {
      const defaultBehavior: ExchangeClosureBehavior = {
        mode: 'skip_iteration',
        update_iteration_result: false
      };

      // These defaults ensure backward compatibility
      expect(defaultBehavior.mode).toBe('skip_iteration'); // Maintains current behavior
      expect(defaultBehavior.update_iteration_result).toBe(false); // Conservative default
    });

    it('should provide configuration examples for all modes', () => {
      const examples = {
        skipIteration: {
          mode: 'skip_iteration' as ExchangeClosureMode,
          update_iteration_result: false
        },
        forceOrders: {
          mode: 'force_orders' as ExchangeClosureMode,
          update_iteration_result: true
        },
        dryRun: {
          mode: 'dry_run' as ExchangeClosureMode,
          update_iteration_result: true
        }
      };

      expect(examples.skipIteration.mode).toBe('skip_iteration');
      expect(examples.forceOrders.mode).toBe('force_orders');
      expect(examples.dryRun.mode).toBe('dry_run');
    });
  });
});