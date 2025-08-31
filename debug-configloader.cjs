const { configLoader } = require('./dist/index.js');
console.log('ConfigLoader type:', typeof configLoader);
console.log('ConfigLoader methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(configLoader)));
console.log('Has loadConfig:', typeof configLoader.loadConfig);
console.log('Has getAccountById:', typeof configLoader.getAccountById);
console.log('Has getAccountToken:', typeof configLoader.getAccountToken);
console.log('Has getAccountAccountId:', typeof configLoader.getAccountAccountId);