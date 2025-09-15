module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: [
    '@typescript-eslint',
    'import',
  ],
  extends: [
    'eslint:recommended',
  ],
  rules: {
    // Core rules
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-floating-promises': 'off',
    
    // Style rules matching old TSLint config
    'max-len': 'off',
    'no-plusplus': 'off',
    'prefer-const': 'error',
    'no-var': 'error',
    
    // Import rules
    'import/no-unresolved': 'off',
    'import/extensions': 'off',
    
    // Allow leading/trailing underscores (was in TSLint config)
    'no-underscore-dangle': 'off',
    
    // Console statements are allowed (project uses console.log)
    'no-console': 'off',
    
    // Allow require() calls since some code uses them
    '@typescript-eslint/no-var-requires': 'off',
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '**/*.test.ts',
    '**/*.spec.ts',
    'invest-nodejs-grpc-sdk/',
  ],
};