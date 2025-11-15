#!/usr/bin/env node

/**
 * Firebase Environment Switcher Script (Node.js version)
 * Usage: node scripts/firebase-env.js [dev|qa|prod]
 */

const { execSync } = require('child_process');

const env = process.argv[2] || 'dev';

const environments = {
  dev: {
    alias: 'dev',
    description: 'Development environment',
    warning: false
  },
  qa: {
    alias: 'qa',
    description: 'QA environment',
    warning: false
  },
  prod: {
    alias: 'prod',
    description: 'Production environment',
    warning: true
  }
};

const config = environments[env];

if (!config) {
  console.error(`❌ Invalid environment: ${env}`);
  console.error('Usage: node scripts/firebase-env.js [dev|qa|prod]');
  process.exit(1);
}

console.log(`🔥 Switching to ${config.description.toUpperCase()} environment...`);

try {
  execSync(`firebase use ${config.alias}`, { stdio: 'inherit' });
  console.log(`✅ Now using ${config.description.toUpperCase()} Firebase project`);
  
  if (config.warning) {
    console.log('⚠️  WARNING: You are now using PRODUCTION!');
  }
  
  console.log('\nCurrent Firebase project:');
  execSync('firebase projects:list', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Error switching Firebase project:', error.message);
  process.exit(1);
}

