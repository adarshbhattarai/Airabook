#!/usr/bin/env node

import process from 'node:process';
import { loadEnv } from 'vite';

const profileName = process.argv[2];
const profiles = {
  local: {
    mode: 'localemulator',
    expected: {
      VITE_USE_EMULATOR: 'true',
      VITE_USE_FUNCTIONS_EMULATOR: 'false',
      VITE_FIREBASE_PROJECT_ID: 'demo-project',
    },
    description: 'isolated Firebase emulators',
  },
  dev: {
    mode: 'development',
    expected: {
      VITE_USE_EMULATOR: 'false',
      VITE_USE_FUNCTIONS_EMULATOR: 'false',
      VITE_FIREBASE_PROJECT_ID: 'airabook-dev',
      VITE_FIREBASE_API_KEY: 'AIzaSyBS1pbUwVA12nqEPsEYqw2Kx6-BwSjYte0',
      VITE_FIREBASE_AUTH_DOMAIN: 'airabook-dev.firebaseapp.com',
      VITE_FIREBASE_STORAGE_BUCKET: 'airabook-dev.firebasestorage.app',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '359520066111',
      VITE_FIREBASE_APP_ID: '1:359520066111:web:ac212cf2369ac5136d768a',
    },
    description: 'persistent airabook-dev Firebase services',
  },
};

const profile = profiles[profileName];
if (!profile) {
  console.error(`Unknown profile "${profileName}". Expected one of: ${Object.keys(profiles).join(', ')}`);
  process.exit(1);
}

const fileEnv = loadEnv(profile.mode, process.cwd(), '');
const errors = Object.entries(profile.expected)
  .filter(([key, expected]) => (process.env[key] ?? fileEnv[key]) !== expected)
  .map(([key, expected]) => {
    const actual = process.env[key] ?? fileEnv[key] ?? '<missing>';
    return `${key} must be ${expected}, but is ${actual}`;
  });

const requiredFirebaseValues = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

for (const key of requiredFirebaseValues) {
  if (!(process.env[key] ?? fileEnv[key])) {
    errors.push(`${key} is required`);
  }
}

if (errors.length > 0) {
  console.error(`\n${profileName.toUpperCase()} profile configuration is unsafe or incomplete:`);
  for (const error of errors) console.error(`  - ${error}`);
  console.error(`\nCheck .env.${profile.mode} and any shell environment overrides.\n`);
  process.exit(1);
}

console.log(`Profile OK: ${profileName} -> ${profile.description}`);
