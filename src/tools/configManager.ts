#!/usr/bin/env node

import { configLoader } from '../configLoader';
import { AccountConfig } from '../types.d';

/**
 * Утилита для управления конфигурацией множественных аккаунтов
 * Позволяет просматривать, валидировать и управлять настройками
 */

function printAccountInfo(account: AccountConfig): void {
  console.log(`\n📊 Аккаунт: ${account.name} (ID: ${account.id})`);
  
  // Отображаем информацию о токене
  const rawToken = configLoader.getRawTokenValue(account.id);
  const resolvedToken = configLoader.getAccountToken(account.id);
  const isFromEnv = configLoader.isTokenFromEnv(account.id);
  
  if (isFromEnv) {
    console.log(`🔑 Токен: ${rawToken} → ${resolvedToken || 'НЕ НАЙДЕН'}`);
    if (!resolvedToken) {
      console.log(`⚠️  Переменная окружения не установлена!`);
    }
  } else {
    console.log(`🔑 Токен: ${rawToken} (прямо указан)`);
  }
  
  console.log(`💼 Счет: ${account.account_id}`);
  console.log(`⚙️  Режим: ${account.desired_mode}`);
  console.log(`⏰ Интервал балансировки: ${account.balance_interval / 1000 / 60} мин`);
  console.log(`⏳ Задержка между ордерами: ${account.sleep_between_orders} мс`);
  
  console.log(`\n📈 Целевые веса:`);
  const totalWeight = Object.values(account.desired_wallet).reduce((sum, weight) => sum + weight, 0);
  Object.entries(account.desired_wallet).forEach(([ticker, weight]) => {
    console.log(`  ${ticker}: ${weight}%`);
  });
  console.log(`  Итого: ${totalWeight}%`);
  
  if (Math.abs(totalWeight - 100) > 1) {
    console.log(`⚠️  Внимание: сумма весов не равна 100%`);
  }
  
  console.log(`\n💰 Маржинальная торговля:`);
  console.log(`  Включена: ${account.margin_trading.enabled ? '✅' : '❌'}`);
  if (account.margin_trading.enabled) {
    console.log(`  Множитель: ${account.margin_trading.multiplier}x`);
    console.log(`  Порог: ${account.margin_trading.free_threshold} ₽`);
    console.log(`  Стратегия: ${account.margin_trading.balancing_strategy}`);
  }
}

function validateConfig(): void {
  try {
    const config = configLoader.loadConfig();
    console.log('✅ Конфигурация загружена успешно');
    
    // Дополнительная валидация
    const accounts = config.accounts;
    const accountIds = new Set();
    const tokens = new Set();
    let envTokensCount = 0;
    let directTokensCount = 0;
    
    for (const account of accounts) {
      if (accountIds.has(account.id)) {
        console.log(`❌ Дублирующийся ID аккаунта: ${account.id}`);
      }
      accountIds.add(account.id);
      
      // Проверяем токены
      const rawToken = account.t_invest_token;
      const isFromEnv = configLoader.isTokenFromEnv(account.id);
      const resolvedToken = configLoader.getAccountToken(account.id);
      
      if (isFromEnv) {
        envTokensCount++;
        if (!resolvedToken) {
          console.log(`⚠️  Переменная окружения не найдена для ${account.id}: ${rawToken}`);
        }
      } else {
        directTokensCount++;
        if (tokens.has(resolvedToken || rawToken)) {
          console.log(`❌ Дублирующийся токен: ${resolvedToken || rawToken}`);
        }
        tokens.add(resolvedToken || rawToken);
      }
    }
    
    console.log(`\n📋 Статистика:`);
    console.log(`  Всего аккаунтов: ${accounts.length}`);
    console.log(`  Уникальных ID: ${accountIds.size}`);
    console.log(`  Токены из переменных окружения: ${envTokensCount}`);
    console.log(`  Прямо указанные токены: ${directTokensCount}`);
    
  } catch (error) {
    console.error(`❌ Ошибка валидации: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    process.exit(1);
  }
}

function listAccounts(): void {
  const accounts = configLoader.getAllAccounts();
  
  if (accounts.length === 0) {
    console.log('❌ Аккаунты не найдены в конфигурации');
    return;
  }
  
  console.log(`\n📋 Найдено аккаунтов: ${accounts.length}`);
  
  accounts.forEach((account, index) => {
    const isFromEnv = configLoader.isTokenFromEnv(account.id);
    const tokenStatus = isFromEnv ? '${ENV}' : 'прямо';
    
    console.log(`\n${index + 1}. ${account.name} (${account.id})`);
    console.log(`   Токен: ${account.t_invest_token} [${tokenStatus}]`);
    console.log(`   Счет: ${account.account_id}`);
    console.log(`   Режим: ${account.desired_mode}`);
  });
}

function showAccountDetails(accountId: string): void {
  const account = configLoader.getAccountById(accountId);
  
  if (!account) {
    console.error(`❌ Аккаунт с ID '${accountId}' не найден`);
    console.log('\nДоступные аккаунты:');
    const accounts = configLoader.getAllAccounts();
    accounts.forEach(acc => console.log(`  - ${acc.id}: ${acc.name}`));
    process.exit(1);
  }
  
  printAccountInfo(account);
}

function showEnvironmentSetup(): void {
  console.log('\n🔧 Настройка переменных окружения:');
  console.log('\nСоздайте файл .env со следующими переменными:');
  
  const accounts = configLoader.getAllAccounts();
  const envTokens = new Set<string>();
  
  accounts.forEach(account => {
    if (configLoader.isTokenFromEnv(account.id)) {
      const envVarName = account.t_invest_token.slice(2, -1);
      envTokens.add(envVarName);
    }
  });
  
  if (envTokens.size > 0) {
    Array.from(envTokens).forEach(token => {
      console.log(`${token}=`);
    });
  } else {
    console.log('(Нет токенов из переменных окружения)');
  }
  
  console.log('\nOPENROUTER_API_KEY=your_api_key_here');
  console.log('OPENROUTER_MODEL=qwen/qwen3-235b-a22b-2507');
  
  console.log('\n💡 Примеры токенов в CONFIG.json:');
  console.log('  "t_invest_token": "${T_INVEST_TOKEN_1}"  # Из переменной окружения');
  console.log('  "t_invest_token": "t.1234567890abcdef"   # Прямо указанный токен');
}

function showTokenInfo(): void {
  console.log('\n🔑 Информация о токенах:');
  console.log('\nВ CONFIG.json можно указывать токены двумя способами:');
  console.log('\n1️⃣ Из переменных окружения:');
  console.log('   "t_invest_token": "${T_INVEST_TOKEN_1}"');
  console.log('   → Будет искать значение в process.env.T_INVEST_TOKEN_1');
  console.log('\n2️⃣ Прямо указанный токен:');
  console.log('   "t_invest_token": "t.1234567890abcdef"');
  console.log('   → Будет использован как есть');
  
  console.log('\n📋 Текущие токены:');
  const accounts = configLoader.getAllAccounts();
  accounts.forEach(account => {
    const isFromEnv = configLoader.isTokenFromEnv(account.id);
    const resolvedToken = configLoader.getAccountToken(account.id);
    const status = isFromEnv 
      ? (resolvedToken ? '✅' : '❌') 
      : '🔒';
    
    console.log(`  ${account.id}: ${account.t_invest_token} ${status}`);
    if (isFromEnv && !resolvedToken) {
      console.log(`    ⚠️  Переменная окружения не найдена`);
    }
  });
}

function printHelp(): void {
  console.log(`
🔧 Менеджер конфигурации Tinkoff Invest ETF Balancer Bot

Использование:
  npm run config [команда] [аргументы]

Команды:
  list                    - Показать список всех аккаунтов
  show <account_id>       - Показать детали конкретного аккаунта
  validate               - Валидировать конфигурацию
  env                    - Показать настройку переменных окружения
  tokens                 - Показать информацию о токенах
  help                   - Показать эту справку

Примеры:
  npm run config list
  npm run config show account_1
  npm run config validate
  npm run config env
  npm run config tokens

Файлы конфигурации:
  CONFIG.json            - Основная конфигурация аккаунтов
  .env                   - Переменные окружения с токенами

Форматы токенов:
  "${VARIABLE_NAME}"     - Из переменной окружения
  "t.1234567890abcdef"   - Прямо указанный токен
  `);
}

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  
  try {
    switch (command) {
      case 'list':
        listAccounts();
        break;
        
      case 'show':
        const accountId = args[1];
        if (!accountId) {
          console.error('❌ Укажите ID аккаунта: npm run config show <account_id>');
          process.exit(1);
        }
        showAccountDetails(accountId);
        break;
        
      case 'validate':
        validateConfig();
        break;
        
      case 'env':
        showEnvironmentSetup();
        break;
        
      case 'tokens':
        showTokenInfo();
        break;
        
      case 'help':
      default:
        printHelp();
        break;
    }
  } catch (error) {
    console.error(`❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    process.exit(1);
  }
}

// Запуск только если файл вызван напрямую
if (require.main === module) {
  main();
}

