# Test Fixes Design Document

## Overview

This document outlines the issues identified in the test suite for the balancer module and proposes solutions to fix them. The issues include:
1. Syntax error in `balancer.test.ts`
2. ReferenceError for `normalizeDesire` function in `balancer-simple.test.ts`
3. Timeout issues in `desiredBuilder.test.ts`

## Issues Analysis

### 1. Syntax Error in balancer.test.ts

The error indicates an unexpected `}` at line 378, suggesting a mismatched brace or missing code block.

### 2. ReferenceError for normalizeDesire

Multiple tests in `balancer-simple.test.ts` are failing with:
```
ReferenceError: Cannot access 'normalizeDesire' before initialization
```

This indicates that the `normalizeDesire` function is being referenced before it's properly imported or initialized.

### 3. Timeout Issues in desiredBuilder.test.ts

Several tests are timing out after 5000ms:
- "should calculate weights based on market cap"
- "should calculate weights based on AUM"
- "should use market cap when available, fallback to AUM"
- "should throw error when ticker has neither market cap nor AUM"
- "should calculate decorrelation weights correctly"

These timeouts suggest that the tests are making actual API calls or file system operations instead of using mocks properly.

## Proposed Solutions

### Fix 1: Syntax Error in balancer.test.ts

After examining the file, the issue appears to be with unmatched braces in the test structure. The file has nested `describe` blocks that may not be properly closed.

### Fix 2: ReferenceError for normalizeDesire

The issue is in the import statement. The `normalizeDesire` function is exported from `src/balancer/index.ts`, but the test is importing from `../../balancer` which may not be resolving correctly. 

We need to:
1. Correct the import path
2. Ensure the function is properly exported

### Fix 3: Timeout Issues in desiredBuilder.test.ts

The timeout issues are caused by tests making actual API calls instead of using mocks. The tests need to:
1. Properly mock file system operations
2. Mock external API calls for market cap and AUM data
3. Ensure all async operations are properly awaited

## Implementation Plan

### 1. Fix Syntax Error in balancer.test.ts

Review the test structure and ensure all `describe` and `it` blocks are properly closed.

### 2. Fix normalizeDesire ReferenceError

Update the import statement in `balancer-simple.test.ts`:
```typescript
// Change from:
import { normalizeDesire } from "../../balancer";

// To:
import { normalizeDesire } from "../../balancer/index";
```

### 3. Fix Timeout Issues

Enhance the test mocks to prevent actual API calls:
1. Ensure `mockControls.fs` properly mocks file system operations
2. Add mocks for `getEtfMarketCapRUB`, `getShareMarketCapRUB`, and `buildAumMapSmart`
3. Set appropriate timeouts for async tests

## Test Structure Improvements

### Current Structure
```
src/__tests__/balancer/
├── balancer-simple.test.ts
├── balancer.test.ts
└── desiredBuilder.test.ts
```

### Issues with Current Structure
1. Duplicated test logic between `balancer-simple.test.ts` and `balancer.test.ts`
2. Inconsistent mocking strategies
3. Missing proper isolation between tests

### Proposed Improvements
1. Consolidate balancer tests into a single file
2. Implement consistent mocking strategy using the existing `mockControls`
3. Add proper test isolation with beforeEach/afterEach blocks
4. Set appropriate timeouts for async tests

## Risk Assessment

1. **Low Risk**: Syntax fixes and import corrections
2. **Medium Risk**: Test mock improvements may require updating multiple test files
3. **Low Risk**: Test structure improvements will enhance reliability

## Validation Plan

1. Run all balancer tests to verify fixes
2. Ensure no regression in other test suites
3. Verify that all tests complete within appropriate time limits
4. Confirm that test coverage remains consistent

## Rollback Plan

If issues arise after implementing the fixes:
1. Revert changes to test files
2. Restore original test configuration
3. Re-run full test suite to confirm rollback success