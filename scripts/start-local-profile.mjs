#!/usr/bin/env node

import { spawn } from 'node:child_process';
import process from 'node:process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const detached = process.platform !== 'win32';
const children = [];
let stopping = false;

const start = (script) => {
  const child = spawn(npmCommand, ['run', script], {
    stdio: 'inherit',
    detached,
  });
  children.push(child);
  return child;
};

const stopChild = (child, signal) => {
  if (!child.pid || child.exitCode !== null) return;
  try {
    process.kill(detached ? -child.pid : child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
};

const stop = (signal = 'SIGTERM', exitCode = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) stopChild(child, signal);
  setTimeout(() => process.exit(exitCode), 250);
};

console.log('Starting LOCAL profile: Firebase emulators + Vite');
console.log('Emulator state is restored from and saved to ./emulator-data.');

const emulators = start('emulators:local');
const web = start('local:web');

for (const child of [emulators, web]) {
  child.on('error', (error) => {
    console.error(error.message);
    stop('SIGTERM', 1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) stop(signal || 'SIGTERM', code || 0);
  });
}

process.on('SIGINT', () => stop('SIGINT', 0));
process.on('SIGTERM', () => stop('SIGTERM', 0));
