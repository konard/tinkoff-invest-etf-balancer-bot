/**
 * Mock implementations for external dependencies
 * File system, network requests, and other external services
 */

import { mockConfigFiles } from '../__fixtures__/configurations';

// Mock function implementation compatible with Bun.js
const mockFn = (implementation: Function) => {
  const fn = (...args: any[]) => implementation(...args);
  fn.mockClear = () => {};
  fn.mockReset = () => {};
  return fn;
};

// File system mock state
let fsState = {
  files: new Map<string, string>(),
  shouldFail: false,
  errorType: 'ENOENT',
  callCounts: {} as Record<string, number>,
};

// Track fs calls
const trackFsCall = (methodName: string, args: any[]) => {
  fsState.callCounts[methodName] = (fsState.callCounts[methodName] || 0) + 1;
};

// File system mocks
export const mockFs = {
  readFileSync: mockFn((filePath: string, encoding?: string) => {
    trackFsCall('readFileSync', [filePath, encoding]);
    
    if (fsState.shouldFail) {
      const error = new Error(`${fsState.errorType}: ${filePath}`);
      (error as any).code = fsState.errorType;
      throw error;
    }
    
    if (fsState.files.has(filePath)) {
      return fsState.files.get(filePath);
    }
    
    // Default test files
    if (filePath.includes('CONFIG.test.json')) {
      return mockConfigFiles.valid;
    }
    if (filePath.includes('CONFIG.json')) {
      return mockConfigFiles.valid_single;
    }
    if (filePath.includes('.env')) {
      return 'T_INVEST_TOKEN=test_token\nACCOUNT_ID=test_account';
    }
    
    const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
    (error as any).code = 'ENOENT';
    throw error;
  }),
  
  writeFileSync: mockFn((filePath: string, data: string) => {
    trackFsCall('writeFileSync', [filePath, data]);
    
    if (fsState.shouldFail) {
      const error = new Error(`${fsState.errorType}: ${filePath}`);
      (error as any).code = fsState.errorType;
      throw error;
    }
    
    fsState.files.set(filePath, data);
  }),
  
  existsSync: mockFn((filePath: string) => {
    trackFsCall('existsSync', [filePath]);
    
    // Default test files exist
    if (filePath.includes('CONFIG') || filePath.includes('.env')) {
      return true;
    }
    
    return fsState.files.has(filePath);
  }),
  
  mkdirSync: mockFn((dirPath: string, options?: any) => {
    trackFsCall('mkdirSync', [dirPath, options]);
    
    if (fsState.shouldFail) {
      const error = new Error(`${fsState.errorType}: ${dirPath}`);
      (error as any).code = fsState.errorType;
      throw error;
    }
  }),
  
  unlinkSync: mockFn((filePath: string) => {
    trackFsCall('unlinkSync', [filePath]);
    
    if (fsState.shouldFail) {
      const error = new Error(`${fsState.errorType}: ${filePath}`);
      (error as any).code = fsState.errorType;
      throw error;
    }
    
    fsState.files.delete(filePath);
  }),
  
  readdirSync: mockFn((dirPath: string) => {
    trackFsCall('readdirSync', [dirPath]);
    
    if (fsState.shouldFail) {
      const error = new Error(`${fsState.errorType}: ${dirPath}`);
      (error as any).code = fsState.errorType;
      throw error;
    }
    
    return ['CONFIG.json', '.env', 'package.json'];
  }),
};

// Network request mocks (for news scraping, etc.)
let networkState = {
  responses: new Map<string, any>(),
  shouldFail: false,
  errorType: 'NETWORK_ERROR',
  callCounts: {} as Record<string, number>,
};

const trackNetworkCall = (methodName: string, args: any[]) => {
  networkState.callCounts[methodName] = (networkState.callCounts[methodName] || 0) + 1;
};

export const mockAxios = {
  get: mockFn(async (url: string, config?: any) => {
    trackNetworkCall('get', [url, config]);
    
    if (networkState.shouldFail) {
      throw new Error(`${networkState.errorType}: Failed to fetch ${url}`);
    }
    
    if (networkState.responses.has(url)) {
      return { data: networkState.responses.get(url) };
    }
    
    // Default responses for common endpoints
    if (url.includes('tbank.ru')) {
      return {
        data: `
          <html>
            <body>
              <div class="news-item">
                <h2>Test News Item</h2>
                <p>This is a test news article about TRUR.</p>
              </div>
            </body>
          </html>
        `,
      };
    }
    
    return { data: {} };
  }),
  
  post: mockFn(async (url: string, data?: any, config?: any) => {
    trackNetworkCall('post', [url, data, config]);
    
    if (networkState.shouldFail) {
      throw new Error(`${networkState.errorType}: Failed to post to ${url}`);
    }
    
    return { data: { success: true } };
  }),
  
  put: mockFn(async (url: string, data?: any, config?: any) => {
    trackNetworkCall('put', [url, data, config]);
    
    if (networkState.shouldFail) {
      throw new Error(`${networkState.errorType}: Failed to put to ${url}`);
    }
    
    return { data: { success: true } };
  }),
  
  delete: mockFn(async (url: string, config?: any) => {
    trackNetworkCall('delete', [url, config]);
    
    if (networkState.shouldFail) {
      throw new Error(`${networkState.errorType}: Failed to delete ${url}`);
    }
    
    return { data: { success: true } };
  }),
};

// Puppeteer mocks for web scraping
let puppeteerState = {
  shouldFail: false,
  pageContent: '',
  callCounts: {} as Record<string, number>,
};

const trackPuppeteerCall = (methodName: string, args: any[]) => {
  puppeteerState.callCounts[methodName] = (puppeteerState.callCounts[methodName] || 0) + 1;
};

export const mockPuppeteer = {
  launch: mockFn(async (options?: any) => {
    trackPuppeteerCall('launch', [options]);
    
    if (puppeteerState.shouldFail) {
      throw new Error('Failed to launch browser');
    }
    
    return {
      newPage: mockFn(async () => {
        trackPuppeteerCall('newPage', []);
        
        return {
          goto: mockFn(async (url: string) => {
            trackPuppeteerCall('goto', [url]);
            
            if (puppeteerState.shouldFail) {
              throw new Error(`Failed to navigate to ${url}`);
            }
          }),
          
          content: mockFn(async () => {
            trackPuppeteerCall('content', []);
            
            return puppeteerState.pageContent || `
              <html>
                <body>
                  <div class="news-content">
                    <h1>Test News Article</h1>
                    <p>ETF TRUR показал рост на 2%</p>
                    <p>Количество паев: 500000000</p>
                  </div>
                </body>
              </html>
            `;
          }),
          
          $eval: mockFn(async (selector: string, fn: Function) => {
            trackPuppeteerCall('$eval', [selector, fn]);
            
            // Mock evaluation results
            if (selector.includes('news')) {
              return 'Mock news content';
            }
            if (selector.includes('shares')) {
              return '500000000';
            }
            
            return '';
          }),
          
          $$eval: mockFn(async (selector: string, fn: Function) => {
            trackPuppeteerCall('$$eval', [selector, fn]);
            
            return ['Mock result 1', 'Mock result 2'];
          }),
          
          close: mockFn(async () => {
            trackPuppeteerCall('close', []);
          }),
        };
      }),
      
      close: mockFn(async () => {
        trackPuppeteerCall('browserClose', []);
      }),
    };
  }),
};

// Process and environment mocks
export const mockProcess = {
  env: {
    NODE_ENV: 'test',
    DEBUG: 'bot:*',
    T_INVEST_TOKEN: 'test_token',
    ACCOUNT_ID: 'test_account',
  },
  
  exit: mockFn((code?: number) => {
    // Don't actually exit in tests
  }),
  
  cwd: mockFn(() => '/test/workspace'),
  
  argv: ['node', 'script.js', '--test'],
};

// Console mocks for testing logging
export const mockConsole = {
  log: mockFn(() => {}),
  error: mockFn(() => {}),
  warn: mockFn(() => {}),
  info: mockFn(() => {}),
  debug: mockFn(() => {}),
};

// Date mocks for consistent testing
export const mockDate = {
  now: mockFn(() => 1641024000000), // Fixed timestamp: 2022-01-01T12:00:00Z
  
  create: (isoString: string) => new Date(isoString),
  
  setSystemTime: (timestamp: number) => {
    mockDate.now.mockReturnValue(timestamp);
  },
};

// Timer mocks
export const mockTimers = {
  setTimeout: mockFn((callback: Function, delay: number) => {
    // Execute immediately in tests
    callback();
    return 1;
  }),
  
  setInterval: mockFn((callback: Function, delay: number) => {
    // Don't execute in tests by default
    return 1;
  }),
  
  clearTimeout: mockFn(() => {}),
  clearInterval: mockFn(() => {}),
};

// Mock control functions
export const mockControls = {
  fs: {
    reset: () => {
      fsState = {
        files: new Map(),
        shouldFail: false,
        errorType: 'ENOENT',
        callCounts: {},
      };
      
      Object.values(mockFs).forEach(method => {
        if (method && typeof method.mockClear === 'function') {
          method.mockClear();
        }
      });
    },
    
    setFile: (path: string, content: string) => {
      fsState.files.set(path, content);
    },
    
    setFailure: (errorType: string = 'ENOENT') => {
      fsState.shouldFail = true;
      fsState.errorType = errorType;
    },
    
    setError: (errorType: string = 'ENOENT') => {
      fsState.shouldFail = true;
      fsState.errorType = errorType;
    },
    
    setSuccess: () => {
      fsState.shouldFail = false;
    },
    
    getCallCount: (method: string) => fsState.callCounts[method] || 0,
  },
  
  network: {
    reset: () => {
      networkState = {
        responses: new Map(),
        shouldFail: false,
        errorType: 'NETWORK_ERROR',
        callCounts: {},
      };
      
      Object.values(mockAxios).forEach(method => {
        if (method && typeof method.mockClear === 'function') {
          method.mockClear();
        }
      });
    },
    
    setResponse: (url: string, response: any) => {
      networkState.responses.set(url, response);
    },
    
    setFailure: (errorType: string = 'NETWORK_ERROR') => {
      networkState.shouldFail = true;
      networkState.errorType = errorType;
    },
    
    setSuccess: () => {
      networkState.shouldFail = false;
    },
    
    getCallCount: (method: string) => networkState.callCounts[method] || 0,
  },
  
  puppeteer: {
    reset: () => {
      puppeteerState = {
        shouldFail: false,
        pageContent: '',
        callCounts: {},
      };
      
      Object.values(mockPuppeteer).forEach(method => {
        if (method && typeof method.mockClear === 'function') {
          method.mockClear();
        }
      });
    },
    
    setPageContent: (content: string) => {
      puppeteerState.pageContent = content;
    },
    
    setFailure: () => {
      puppeteerState.shouldFail = true;
    },
    
    setSuccess: () => {
      puppeteerState.shouldFail = false;
    },
    
    getCallCount: (method: string) => puppeteerState.callCounts[method] || 0,
  },
  
  resetAll: () => {
    mockControls.fs.reset();
    mockControls.network.reset();
    mockControls.puppeteer.reset();
    
    Object.values(mockConsole).forEach(method => {
      if (method && typeof method.mockClear === 'function') {
        method.mockClear();
      }
    });
    
    Object.values(mockTimers).forEach(method => {
      if (method && typeof method.mockClear === 'function') {
        method.mockClear();
      }
    });
  },
};