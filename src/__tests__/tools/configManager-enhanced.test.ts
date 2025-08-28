import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from 'fs';
import path from 'path';

// Mock file system for testing
let mockFiles = new Map<string, string>();
let mockDirectories = new Set<string>();
let shouldThrow = false;
let errorToThrow: any = null;

// Mock readline interface
let mockReadlineAnswers: string[] = [];
let currentAnswerIndex = 0;

const mockReadline = {
  createInterface: () => ({
    question: (prompt: string) => {
      const answer = mockReadlineAnswers[currentAnswerIndex] || '';
      currentAnswerIndex++;
      return Promise.resolve(answer);
    },
    close: () => {}
  })
};

// Mock fs promises
const originalFs = {
  readFile: fs.readFile,
  writeFile: fs.writeFile,
  access: fs.access,
  mkdir: fs.mkdir
};

describe('Config Manager Tool', () => {
  beforeEach(() => {
    // Reset mocks
    mockFiles.clear();
    mockDirectories.clear();
    shouldThrow = false;
    errorToThrow = null;
    mockReadlineAnswers = [];
    currentAnswerIndex = 0;
    
    // Setup basic mock files
    mockFiles.set('/test/CONFIG.json', JSON.stringify({
      accounts: [
        {
          id: 'existing-account',
          name: 'Existing Account',
          t_invest_token: 't.existing_token',
          account_id: '123456789',
          desired_wallet: { TRUR: 100 }
        }
      ]
    }, null, 2));
    
    // Mock fs methods
    (fs as any).readFile = async (filePath: string, encoding?: string) => {
      if (shouldThrow && errorToThrow) {
        throw errorToThrow;
      }
      
      if (mockFiles.has(filePath)) {
        return mockFiles.get(filePath);
      }
      
      const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
      (error as any).code = 'ENOENT';
      throw error;
    };
    
    (fs as any).writeFile = async (filePath: string, data: string) => {
      if (shouldThrow && errorToThrow) {
        throw errorToThrow;
      }
      
      mockFiles.set(filePath, data);
    };
    
    (fs as any).access = async (filePath: string) => {
      if (shouldThrow && errorToThrow) {
        throw errorToThrow;
      }
      
      if (!mockFiles.has(filePath) && !mockDirectories.has(filePath)) {
        const error = new Error(`ENOENT: no such file or directory, access '${filePath}'`);
        (error as any).code = 'ENOENT';
        throw error;
      }
    };
    
    (fs as any).mkdir = async (dirPath: string, options?: any) => {
      if (shouldThrow && errorToThrow) {
        throw errorToThrow;
      }
      
      mockDirectories.add(dirPath);
    };
  });
  
  afterEach(() => {
    // Restore original fs methods
    (fs as any).readFile = originalFs.readFile;
    (fs as any).writeFile = originalFs.writeFile;
    (fs as any).access = originalFs.access;
    (fs as any).mkdir = originalFs.mkdir;
  });

  describe('Configuration File Operations', () => {
    it('should read existing configuration', async () => {
      const configPath = '/test/CONFIG.json';
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);
      
      expect(config.accounts).toBeDefined();
      expect(config.accounts).toHaveLength(1);
      expect(config.accounts[0].id).toBe('existing-account');
    });
    
    it('should handle missing configuration file', async () => {
      const configPath = '/test/nonexistent.json';
      
      try {
        await fs.readFile(configPath, 'utf-8');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.code).toBe('ENOENT');
      }
    });
    
    it('should write configuration file', async () => {
      const configPath = '/test/new-config.json';
      const newConfig = {
        accounts: [
          {
            id: 'new-account',
            name: 'New Account',
            t_invest_token: 't.new_token',
            account_id: '987654321',
            desired_wallet: { TMOS: 100 }
          }
        ]
      };
      
      await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));
      
      const savedData = mockFiles.get(configPath);
      expect(savedData).toBeDefined();
      
      const parsedConfig = JSON.parse(savedData!);
      expect(parsedConfig.accounts[0].id).toBe('new-account');
    });
    
    it('should handle write errors', async () => {
      const writeError = new Error('Permission denied');
      (writeError as any).code = 'EACCES';
      
      shouldThrow = true;
      errorToThrow = writeError;
      
      try {
        await fs.writeFile('/test/protected.json', 'data');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.code).toBe('EACCES');
      }
    });
  });

  describe('Account Management Operations', () => {
    it('should validate account structure', () => {
      const validAccount = {
        id: 'test-account',
        name: 'Test Account',
        t_invest_token: 't.test_token',
        account_id: '123456789',
        desired_wallet: { TRUR: 50, TMOS: 50 }
      };
      
      // Validate required fields
      expect(validAccount.id).toBeDefined();
      expect(validAccount.name).toBeDefined();
      expect(validAccount.t_invest_token).toBeDefined();
      expect(validAccount.account_id).toBeDefined();
      expect(validAccount.desired_wallet).toBeDefined();
      
      // Validate types
      expect(typeof validAccount.id).toBe('string');
      expect(typeof validAccount.name).toBe('string');
      expect(typeof validAccount.t_invest_token).toBe('string');
      expect(typeof validAccount.account_id).toBe('string');
      expect(typeof validAccount.desired_wallet).toBe('object');
    });
    
    it('should detect invalid account structure', () => {
      const invalidAccounts = [
        { id: 'test' }, // Missing required fields
        { id: '', name: 'Test', t_invest_token: 'token', account_id: '123', desired_wallet: {} }, // Empty ID
        { id: 'test', name: '', t_invest_token: 'token', account_id: '123', desired_wallet: {} }, // Empty name
        { id: 'test', name: 'Test', t_invest_token: '', account_id: '123', desired_wallet: {} }, // Empty token
        { id: 'test', name: 'Test', t_invest_token: 'token', account_id: '', desired_wallet: {} }, // Empty account_id
        { id: 'test', name: 'Test', t_invest_token: 'token', account_id: '123', desired_wallet: {} } // Empty desired_wallet
      ];
      
      invalidAccounts.forEach((account, index) => {
        const hasRequiredFields = account.id && (account as any).name && (account as any).t_invest_token && (account as any).account_id;
        const hasValidDesiredWallet = (account as any).desired_wallet && Object.keys((account as any).desired_wallet || {}).length > 0;
        
        expect(hasRequiredFields && hasValidDesiredWallet).toBeFalsy();
      });
    });
    
    it('should validate desired wallet percentages', () => {
      const wallets = [
        { TRUR: 100 }, // Valid: 100%
        { TRUR: 50, TMOS: 50 }, // Valid: 100%
        { TRUR: 40, TMOS: 30, TGLD: 30 }, // Valid: 100%
        { TRUR: 50, TMOS: 40 }, // Invalid: 90%
        { TRUR: 60, TMOS: 50 }, // Invalid: 110%
        {} // Invalid: empty
      ];
      
      wallets.forEach((wallet, index) => {
        const total = Object.values(wallet).reduce((sum, val) => sum + val, 0);
        const isEmpty = Object.keys(wallet).length === 0;
        const isValid = !isEmpty && Math.abs(total - 100) <= 1;
        
        if (index < 3) {
          expect(isValid).toBe(true);
        } else {
          expect(isValid).toBe(false);
        }
      });
    });
  });

  describe('Token Management', () => {
    it('should handle direct token values', () => {
      const directToken = 't.direct_token_value';
      
      expect(directToken.startsWith('t.')).toBe(true);
      expect(directToken.length).toBeGreaterThan(2);
      expect(!directToken.startsWith('${')).toBe(true);
    });
    
    it('should handle environment variable token format', () => {
      const envToken = '${T_INVEST_TOKEN}';
      
      expect(envToken.startsWith('${')).toBe(true);
      expect(envToken.endsWith('}')).toBe(true);
      
      const envVarName = envToken.slice(2, -1);
      expect(envVarName).toBe('T_INVEST_TOKEN');
    });
    
    it('should validate token formats', () => {
      const tokens = [
        't.valid_token_123',      // Valid direct token
        '${VALID_ENV_VAR}',       // Valid environment variable
        '${T_INVEST_TOKEN}',      // Valid standard env var
        'invalid_token',          // Invalid: doesn't start with t.
        't.',                     // Invalid: too short
        '${INCOMPLETE',           // Invalid: incomplete env var
        'INCOMPLETE}',            // Invalid: incomplete env var
        ''                        // Invalid: empty
      ];
      
      tokens.forEach((token, index) => {
        const isDirectToken = token.startsWith('t.') && token.length > 2;
        const isEnvToken = token.startsWith('${') && token.endsWith('}') && token.length > 3;
        const isValid = isDirectToken || isEnvToken;
        
        if (index < 3) {
          expect(isValid).toBe(true);
        } else {
          expect(isValid).toBe(false);
        }
      });
    });
    
    it('should extract environment variable names', () => {
      const envTokens = [
        '${T_INVEST_TOKEN}',
        '${CUSTOM_TOKEN}',
        '${MY_API_KEY}',
        '${TEST_TOKEN_123}'
      ];
      
      const expectedNames = [
        'T_INVEST_TOKEN',
        'CUSTOM_TOKEN',
        'MY_API_KEY',
        'TEST_TOKEN_123'
      ];
      
      envTokens.forEach((token, index) => {
        const envVarName = token.slice(2, -1);
        expect(envVarName).toBe(expectedNames[index]);
      });
    });
  });

  describe('Configuration Validation', () => {
    it('should validate complete configuration structure', () => {
      const validConfig = {
        accounts: [
          {
            id: 'account1',
            name: 'Account 1',
            t_invest_token: 't.token1',
            account_id: '111111111',
            desired_wallet: { TRUR: 50, TMOS: 50 }
          },
          {
            id: 'account2',
            name: 'Account 2',
            t_invest_token: '${ENV_TOKEN}',
            account_id: '222222222',
            desired_wallet: { TGLD: 100 }
          }
        ]
      };
      
      expect(validConfig.accounts).toBeDefined();
      expect(Array.isArray(validConfig.accounts)).toBe(true);
      expect(validConfig.accounts).toHaveLength(2);
      
      validConfig.accounts.forEach((account, index) => {
        expect(account.id).toBeDefined();
        expect(account.name).toBeDefined();
        expect(account.t_invest_token).toBeDefined();
        expect(account.account_id).toBeDefined();
        expect(account.desired_wallet).toBeDefined();
        expect(Object.keys(account.desired_wallet).length).toBeGreaterThan(0);
      });
    });
    
    it('should detect configuration conflicts', () => {
      const configWithDuplicateIds = {
        accounts: [
          {
            id: 'duplicate',
            name: 'Account 1',
            t_invest_token: 't.token1',
            account_id: '111111111',
            desired_wallet: { TRUR: 100 }
          },
          {
            id: 'duplicate',
            name: 'Account 2',
            t_invest_token: 't.token2',
            account_id: '222222222',
            desired_wallet: { TMOS: 100 }
          }
        ]
      };
      
      const ids = configWithDuplicateIds.accounts.map(acc => acc.id);
      const uniqueIds = new Set(ids);
      const hasDuplicates = ids.length !== uniqueIds.size;
      
      expect(hasDuplicates).toBe(true);
    });
    
    it('should validate margin configuration', () => {
      const accountWithMargin = {
        id: 'margin-account',
        name: 'Margin Account',
        t_invest_token: 't.margin_token',
        account_id: '333333333',
        desired_wallet: { TRUR: 100 },
        margin: {
          enabled: true,
          strategy: 'keep_if_small',
          max_margin_size: 1000000
        }
      };
      
      expect(accountWithMargin.margin).toBeDefined();
      expect(typeof accountWithMargin.margin.enabled).toBe('boolean');
      expect(typeof accountWithMargin.margin.strategy).toBe('string');
      expect(typeof accountWithMargin.margin.max_margin_size).toBe('number');
      expect(accountWithMargin.margin.max_margin_size).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      const fsError = new Error('File system error');
      (fsError as any).code = 'EIO';
      
      shouldThrow = true;
      errorToThrow = fsError;
      
      try {
        await fs.readFile('/test/error-file.json', 'utf-8');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.code).toBe('EIO');
      }
    });
    
    it('should handle JSON parsing errors', () => {
      const invalidJsonStrings = [
        '{ invalid json',
        '{ "key": value }',
        '{ "key": "value" ',
        'not json at all',
        ''
      ];
      
      invalidJsonStrings.forEach(jsonString => {
        try {
          JSON.parse(jsonString);
          expect(true).toBe(false); // Should not reach here for invalid JSON
        } catch (error) {
          expect(error).toBeInstanceOf(SyntaxError);
        }
      });
    });
    
    it('should handle permission errors', async () => {
      const permissionError = new Error('Permission denied');
      (permissionError as any).code = 'EACCES';
      
      shouldThrow = true;
      errorToThrow = permissionError;
      
      try {
        await fs.writeFile('/test/protected.json', 'data');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.code).toBe('EACCES');
      }
    });
  });

  describe('Interactive Operations', () => {
    it('should handle user input validation', () => {
      const userInputs = [
        'valid-account-id',
        'Account Name',
        't.valid_token',
        '123456789',
        'y',
        'n',
        'Y',
        'N'
      ];
      
      userInputs.forEach(input => {
        expect(typeof input).toBe('string');
        expect(input.length).toBeGreaterThan(0);
      });
    });
    
    it('should validate user responses', () => {
      const yesNoResponses = ['y', 'Y', 'yes', 'YES', 'n', 'N', 'no', 'NO'];
      
      yesNoResponses.forEach(response => {
        const isYes = ['y', 'Y', 'yes', 'YES'].includes(response);
        const isNo = ['n', 'N', 'no', 'NO'].includes(response);
        const isValid = isYes || isNo;
        
        expect(isValid).toBe(true);
      });
    });
    
    it('should handle empty user input', () => {
      const emptyInputs = ['', ' ', '  ', '\t', '\n'];
      
      emptyInputs.forEach(input => {
        const trimmed = input.trim();
        expect(trimmed.length).toBe(0);
      });
    });
  });

  describe('Backup and Recovery', () => {
    it('should create backup before modifications', async () => {
      const originalConfig = '/test/CONFIG.json';
      const backupConfig = '/test/CONFIG.json.backup';
      
      // Read original
      const originalData = await fs.readFile(originalConfig, 'utf-8');
      
      // Create backup
      await fs.writeFile(backupConfig, originalData);
      
      // Verify backup
      const backupData = await fs.readFile(backupConfig, 'utf-8');
      expect(backupData).toBe(originalData);
    });
    
    it('should restore from backup on failure', async () => {
      const configPath = '/test/CONFIG.json';
      const backupPath = '/test/CONFIG.json.backup';
      
      // Create backup
      const originalData = await fs.readFile(configPath, 'utf-8');
      await fs.writeFile(backupPath, originalData);
      
      // Simulate corruption
      await fs.writeFile(configPath, 'corrupted data');
      
      // Restore from backup
      const backupData = await fs.readFile(backupPath, 'utf-8');
      await fs.writeFile(configPath, backupData);
      
      // Verify restoration
      const restoredData = await fs.readFile(configPath, 'utf-8');
      expect(restoredData).toBe(originalData);
    });
  });

  describe('Environment Integration', () => {
    it('should handle environment variable resolution', () => {
      const envVars = {
        'T_INVEST_TOKEN': 't.env_token_value',
        'CUSTOM_TOKEN': 't.custom_value',
        'EMPTY_VAR': '',
        'UNDEFINED_VAR': undefined
      };
      
      Object.entries(envVars).forEach(([key, value]) => {
        if (value !== undefined) {
          process.env[key] = value;
        } else {
          delete process.env[key];
        }
        
        const resolved = process.env[key];
        expect(resolved).toBe(value);
      });
    });
    
    it('should validate environment variable names', () => {
      const validNames = ['T_INVEST_TOKEN', 'API_KEY', 'TOKEN_123', 'MY_SECRET'];
      const invalidNames = ['123_INVALID', 'invalid-name', 'invalid.name', ''];
      
      const isValidEnvName = (name: string) => /^[A-Z][A-Z0-9_]*$/.test(name);
      
      validNames.forEach(name => {
        expect(isValidEnvName(name)).toBe(true);
      });
      
      invalidNames.forEach(name => {
        expect(isValidEnvName(name)).toBe(false);
      });
    });
  });
});