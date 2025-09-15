#!/usr/bin/env bun
/**
 * Test script to verify that modernized dependencies work correctly
 */

import fetch from 'node-fetch';
import debug from 'debug';

const log = debug('test:modernized-deps');

async function testFetch() {
  console.log('Testing node-fetch (replacement for request-promise)...');
  try {
    const response = await fetch('https://api.github.com/zen');
    if (response.ok) {
      const data = await response.text();
      console.log('✅ node-fetch works correctly');
      console.log('Sample data:', data.substring(0, 100) + (data.length > 100 ? '...' : ''));
      return true;
    } else {
      console.log('❌ node-fetch failed with status:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ node-fetch failed with error:', error.message);
    return false;
  }
}

async function testDebug() {
  console.log('Testing debug module...');
  try {
    const debugInstance = debug('test:module');
    debugInstance('This is a debug message');
    console.log('✅ debug module works correctly');
    return true;
  } catch (error) {
    console.log('❌ debug module failed:', error.message);
    return false;
  }
}

async function testTypeScript() {
  console.log('Testing TypeScript compilation...');
  try {
    // Test some modern TypeScript features
    const testObject: Record<string, number> = {
      test: 1,
      modern: 2,
    };
    
    const optionalChaining = testObject?.test ?? 0;
    const nullishCoalescing = testObject.nonexistent ?? 'default';
    
    console.log('✅ TypeScript modern features work correctly');
    console.log('Optional chaining result:', optionalChaining);
    console.log('Nullish coalescing result:', nullishCoalescing);
    return true;
  } catch (error) {
    console.log('❌ TypeScript features failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🧪 Testing modernized dependencies\n');
  
  const tests = [
    testFetch,
    testDebug,
    testTypeScript,
  ];
  
  let passCount = 0;
  let failCount = 0;
  
  for (const test of tests) {
    const result = await test();
    if (result) {
      passCount++;
    } else {
      failCount++;
    }
    console.log('');
  }
  
  console.log(`\n📊 Test Summary:`);
  console.log(`✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📈 Success Rate: ${Math.round((passCount / tests.length) * 100)}%`);
  
  if (failCount === 0) {
    console.log('\n🎉 All modernized dependencies are working correctly!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please check the modernization.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});