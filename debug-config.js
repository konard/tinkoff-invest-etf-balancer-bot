const { join } = require('path');

// Simulate what happens in ConfigLoader
process.cwd = () => '/test/workspace';
const configPath = 'CONFIG.json';
const fullPath = join(process.cwd(), configPath);

console.log('process.cwd():', process.cwd());
console.log('configPath:', configPath);
console.log('fullPath:', fullPath);
console.log('Expected mock file path:', '/test/workspace/CONFIG.json');
console.log('Paths match:', fullPath === '/test/workspace/CONFIG.json');