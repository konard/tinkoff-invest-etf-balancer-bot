# Test Configurations

This directory contains configuration files used by automated tests.

## Files

- `CONFIG.test.json` - Main test configuration file used by ConfigLoader tests

## Purpose

These configuration files are separate from the main `CONFIG.json` to ensure:

1. **Test isolation** - Tests don't interfere with user settings
2. **Security** - User's actual configuration and tokens are not exposed during testing
3. **Predictability** - Tests have consistent, known configuration data

## Usage

The ConfigLoader automatically uses `test-configs/CONFIG.test.json` when `NODE_ENV=test`.

## Note

This directory is excluded from git via `.gitignore` to prevent accidental committing of test data.