import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { 
  writeFile,
  writeToFile,
  listAccounts,
  sleep
} from "../../utils";

// Import test utilities
import { testSuite } from '../test-utils';
import { mockControls } from '../__mocks__/external-deps';

// Mock fs module
const mockFs = {
  writeFile: (filename: string, data: string, encoding: string, callback: Function) => {
    // Simulate successful write
    setTimeout(() => callback(null), 10);
  },
  writeFileError: (filename: string, data: string, encoding: string, callback: Function) => {
    // Simulate write error
    setTimeout(() => callback(new Error('ENOENT: no such file or directory')), 10);
  },
  appendFileSync: (filename: string, data: string, encoding: string) => {
    // Simulate successful append
    return;
  },
  appendFileSyncError: (filename: string, data: string, encoding: string) => {
    // Simulate append error
    throw new Error('EACCES: permission denied');
  }
};

testSuite('Utils Module Additional Coverage Tests', () => {
  let originalConsoleLog: any;
  let consoleOutput: string[];
  let originalFsWriteFile: any;
  let originalFsAppendFileSync: any;

  beforeEach(() => {
    // Setup console capture
    consoleOutput = [];
    originalConsoleLog = console.log;
    console.log = (...args: any[]) => {
      consoleOutput.push(args.join(' '));
    };

    // Mock fs module
    const fs = require('fs');
    originalFsWriteFile = fs.writeFile;
    originalFsAppendFileSync = fs.appendFileSync;
  });

  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog;
    
    // Restore fs module
    const fs = require('fs');
    if (originalFsWriteFile) fs.writeFile = originalFsWriteFile;
    if (originalFsAppendFileSync) fs.appendFileSync = originalFsAppendFileSync;
  });

  describe('File Writing Functions', () => {
    describe('writeFile', () => {
      it('should write object to file with successful callback', async () => {
        const fs = require('fs');
        fs.writeFile = mockFs.writeFile;
        
        const testObj = { ticker: 'TGLD', percentage: 30 };
        const filename = 'testOutput';
        
        writeFile(testObj, filename);
        
        // Wait for async operation
        await sleep(20);
        
        const output = consoleOutput.join(' ');
        expect(output).toContain(filename);
        expect(output).toContain('TGLD');
        expect(output).toContain('30');
        expect(output).toContain('JSON file has been saved.');
      });
      
      it('should handle file write errors', async () => {
        const fs = require('fs');
        fs.writeFile = mockFs.writeFileError;
        
        const testObj = { error: 'test' };
        const filename = 'errorTest';
        
        writeFile(testObj, filename);
        
        // Wait for async operation
        await sleep(20);
        
        const output = consoleOutput.join(' ');
        expect(output).toContain(filename);
        expect(output).toContain('ENOENT');
      });
      
      it('should format object correctly for export', () => {
        const fs = require('fs');
        let capturedData = '';
        fs.writeFile = (filename: string, data: string, encoding: string, callback: Function) => {
          capturedData = data;
          callback(null);
        };
        
        const testObj = { test: 'data', number: 42 };
        writeFile(testObj, 'test');
        
        expect(capturedData).toContain('export const data =');
        expect(capturedData).toContain('"test": "data"');
        expect(capturedData).toContain('"number": 42');
      });
    });

    describe('writeToFile', () => {
      it('should append object to file successfully', () => {
        const fs = require('fs');
        fs.appendFileSync = mockFs.appendFileSync;
        
        const testObj = { timestamp: Date.now(), value: 100 };
        const filename = 'appendTest';
        
        writeToFile(testObj, filename);
        
        const output = consoleOutput.join(' ');
        expect(output).toContain(filename);
        expect(output).toContain('timestamp');
        expect(output).toContain('100');
      });
      
      it('should handle append file errors', () => {
        const fs = require('fs');
        fs.appendFileSync = mockFs.appendFileSyncError;
        
        const testObj = { error: 'test' };
        const filename = 'errorAppend';
        
        writeToFile(testObj, filename);
        
        const output = consoleOutput.join(' ');
        expect(output).toContain(filename);
        expect(output).toContain('EACCES');
      });
      
      it('should format appended data correctly', () => {
        const fs = require('fs');
        let capturedData = '';
        fs.appendFileSync = (filename: string, data: string, encoding: string) => {
          capturedData = data;
        };
        
        const testObj = { append: true, data: 'test' };
        writeToFile(testObj, 'test');
        
        expect(capturedData).toContain('\n\n');
        expect(capturedData).toContain('"append": true');
        expect(capturedData).toContain('"data": "test"');
      });
    });
  });

  describe('Account Listing Function', () => {
    describe('listAccounts', () => {
      it('should list accounts from direct array response', async () => {
        const mockUsersClient = {
          getAccounts: async () => [
            {
              id: 'account-1',
              name: 'Test Account 1',
              type: 1,
              openedDate: '2023-01-01',
              status: 'active'
            },
            {
              id: 'account-2',
              name: 'Test Account 2',
              type: 2,
              openedDate: '2023-01-02',
              status: 'active'
            }
          ]
        };
        
        const accounts = await listAccounts(mockUsersClient);
        
        expect(accounts).toHaveLength(2);
        expect(accounts[0]).toMatchObject({
          index: 0,
          id: 'account-1',
          name: 'Test Account 1',
          type: 1,
          openedDate: '2023-01-01',
          status: 'active'
        });
        expect(accounts[1]).toMatchObject({
          index: 1,
          id: 'account-2',
          name: 'Test Account 2',
          type: 2
        });
      });
      
      it('should list accounts from nested response object', async () => {
        const mockUsersClient = {
          getAccounts: async () => ({
            accounts: [
              {
                accountId: 'nested-account-1',
                name: 'Nested Account 1',
                type: 1
              }
            ]
          })
        };
        
        const accounts = await listAccounts(mockUsersClient);
        
        expect(accounts).toHaveLength(1);
        expect(accounts[0]).toMatchObject({
          index: 0,
          id: 'nested-account-1',
          name: 'Nested Account 1',
          type: 1
        });
      });
      
      it('should handle accounts with alternative field names', async () => {
        const mockUsersClient = {
          getAccounts: async () => ({
            accounts: [
              {
                account_id: 'underscore-account',
                name: 'Underscore Account',
                type: 2,
                opened_date: '2023-01-03'
              }
            ]
          })
        };
        
        const accounts = await listAccounts(mockUsersClient);
        
        expect(accounts).toHaveLength(1);
        expect(accounts[0]).toMatchObject({
          index: 0,
          id: 'underscore-account',
          name: 'Underscore Account',
          type: 2,
          openedDate: '2023-01-03'
        });
      });
      
      it('should handle API errors gracefully', async () => {
        const mockUsersClient = {
          getAccounts: async () => {
            throw new Error('API Error: Unauthorized');
          }
        };
        
        const accounts = await listAccounts(mockUsersClient);
        
        expect(accounts).toEqual([]);
      });
      
      it('should handle empty response', async () => {
        const mockUsersClient = {
          getAccounts: async () => ({
            accounts: []
          })
        };
        
        const accounts = await listAccounts(mockUsersClient);
        
        expect(accounts).toEqual([]);
      });
      
      it('should handle null response', async () => {
        const mockUsersClient = {
          getAccounts: async () => null
        };
        
        const accounts = await listAccounts(mockUsersClient);
        
        expect(accounts).toEqual([]);
      });
      
      it('should handle undefined response', async () => {
        const mockUsersClient = {
          getAccounts: async () => undefined
        };
        
        const accounts = await listAccounts(mockUsersClient);
        
        expect(accounts).toEqual([]);
      });
      
      it('should handle malformed response structure', async () => {
        const mockUsersClient = {
          getAccounts: async () => ({
            notAccounts: [
              { id: 'should-be-ignored' }
            ]
          })
        };
        
        const accounts = await listAccounts(mockUsersClient);
        
        expect(accounts).toEqual([]);
      });
    });
  });

  describe('Sleep Function', () => {
    it('should delay execution for specified milliseconds', async () => {
      const startTime = performance.now();
      await sleep(50);
      const endTime = performance.now();
      
      const elapsed = endTime - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(40); // More tolerant timing
      expect(elapsed).toBeLessThanOrEqual(100);
    });
    
    it('should handle zero delay', async () => {
      const startTime = performance.now();
      await sleep(0);
      const endTime = performance.now();
      
      const elapsed = endTime - startTime;
      expect(elapsed).toBeLessThanOrEqual(20); // Should be very quick
    });
    
    it('should handle string input', async () => {
      const startTime = performance.now();
      await sleep('10');
      const endTime = performance.now();
      
      const elapsed = endTime - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Complex File Operations', () => {
    it('should handle large objects in writeFile', () => {
      const fs = require('fs');
      let capturedFilename = '';
      let capturedData = '';
      fs.writeFile = (filename: string, data: string, encoding: string, callback: Function) => {
        capturedFilename = filename;
        capturedData = data;
        callback(null);
      };
      
      const largeObj = {
        portfolio: {
          positions: Array.from({ length: 100 }, (_, i) => ({
            ticker: `TICKER${i}`,
            amount: i * 100,
            price: i * 10.5
          }))
        },
        config: {
          accounts: Array.from({ length: 10 }, (_, i) => ({
            id: `account-${i}`,
            name: `Account ${i}`
          }))
        }
      };
      
      writeFile(largeObj, 'large-data');
      
      expect(capturedFilename).toBe('large-dataData.ts');
      expect(capturedData).toContain('export const data =');
      expect(capturedData).toContain('TICKER99');
      expect(capturedData).toContain('account-9');
    });
    
    it('should handle complex nested objects in writeToFile', () => {
      const fs = require('fs');
      let capturedData = '';
      fs.appendFileSync = (filename: string, data: string, encoding: string) => {
        capturedData = data;
      };
      
      const complexObj = {
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        },
        data: {
          market: {
            etfs: ['TRUR', 'TMOS', 'TGLD'],
            prices: {
              TRUR: 100.5,
              TMOS: 200.25,
              TGLD: 150.75
            }
          }
        }
      };
      
      writeToFile(complexObj, 'complex-data');
      
      expect(capturedData).toContain('\n\n');
      expect(capturedData).toContain('metadata');
      expect(capturedData).toContain('TRUR');
      expect(capturedData).toContain('100.5');
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle circular references in objects', () => {
      const fs = require('fs');
      fs.writeFile = mockFs.writeFile;
      
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;
      
      // Should throw error for circular references
      expect(() => writeFile(circularObj, 'circular')).toThrow('JSON.stringify cannot serialize cyclic structures');
    });
    
    it('should handle undefined values in objects', () => {
      const fs = require('fs');
      let capturedData = '';
      fs.writeFile = (filename: string, data: string, encoding: string, callback: Function) => {
        capturedData = data;
        callback(null);
      };
      
      const objWithUndefined = {
        defined: 'value',
        undefined: undefined,
        null: null,
        empty: ''
      };
      
      writeFile(objWithUndefined, 'undefined-test');
      
      expect(capturedData).toContain('"defined": "value"');
      expect(capturedData).toContain('"null": null');
      expect(capturedData).toContain('"empty": ""');
      // undefined values are omitted by JSON.stringify
      expect(capturedData).not.toContain('"undefined"');
    });
  });
});