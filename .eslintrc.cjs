module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'airbnb-typescript/base',
  ],
  plugins: [
    '@typescript-eslint',
  ],
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  rules: {
    // Disable increment/decrement restrictions (equivalent to no-increment-decrement: false)
    'no-plusplus': 'off',

    // Enable unused variable detection (equivalent to no-unused-variable: [true])
    '@typescript-eslint/no-unused-vars': 'error',

    // Disable function name restrictions (equivalent to function-name: false)
    'func-names': 'off',

    // Remove max line length limits (equivalent to max-line-length: false)
    'max-len': 'off',

    // Allow flexible import naming (equivalent to import-name: false)
    'import/no-named-as-default': 'off',
    'import/prefer-default-export': 'off',

    // Disable object shorthand properties first (equivalent to object-shorthand-properties-first: false)
    'object-shorthand': 'off',

    // Configure variable naming rules (equivalent to variable-name with flexible options)
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: 'variable',
        format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
        leadingUnderscore: 'allow',
        trailingUnderscore: 'allow',
      },
      {
        selector: 'function',
        format: ['camelCase', 'PascalCase'],
        leadingUnderscore: 'allow',
      },
      {
        selector: 'parameter',
        format: ['camelCase', 'PascalCase'],
        leadingUnderscore: 'allow',
      },
    ],

    // Allow console statements (common in CLI tools)
    'no-console': 'off',

    // Allow any type for flexibility
    '@typescript-eslint/no-explicit-any': 'off',

    // Allow continue statements
    'no-continue': 'off',

    // Allow while(true) loops
    'no-constant-condition': 'off',

    // Allow reassigning parameters
    'no-param-reassign': 'off',

    // Allow nested ternary
    'no-nested-ternary': 'off',
  },
  parserOptions: {
    project: './tsconfig.json',
    sourceType: 'module',
    ecmaVersion: 2021,
  },
  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
    },
  },
  ignorePatterns: [
    'invest-nodejs-grpc-sdk/*.ts',
    'dist/',
    'node_modules/',
  ],
};