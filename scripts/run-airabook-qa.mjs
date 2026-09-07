#!/usr/bin/env node

/**
 * Deterministic local QA runner.
 *
 * It only uses the local Firebase emulator profile, recreates the fixed
 * emulator test account, seeds the known book, and runs the critical browser
 * paths serially. It never targets airabook-dev.
 *
 * Usage:
 *   npm run test:local:qa
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:5175 npm run test:local:qa
 *   npm run test:weekly:qa       # starts a clean local profile if needed
 *   node scripts/run-airabook-qa.mjs --all
 */

import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';

const root = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const shouldStart = process.argv.includes('--start');
const runAll = process.argv.includes('--all');
const requestedBaseURL = process.env.PLAYWRIGHT_BASE_URL || '';
const testEmail = process.env.PLAYWRIGHT_EMAIL || 'claude@airabook.dev';
const testPassword = process.env.PLAYWRIGHT_PASSWORD || 'ClaudeAirabook2024';
const requiredPorts = [4000, 9099, 8080, 9199, 5001];
const localProfileProcesses = [];
let baseURL = requestedBaseURL || 'http://127.0.0.1:5173';

const portIsOpen = (port, host = '127.0.0.1') => new Promise((resolve) => {
  const socket = net.createConnection({ port, host });
  const finish = (open) => {
    socket.destroy();
    resolve(open);
  };
  socket.setTimeout(750);
  socket.once('connect', () => finish(true));
  socket.once('timeout', () => finish(false));
  socket.once('error', () => finish(false));
});

const waitFor = async (predicate, timeoutMs, description) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${description}.`);
};

const findFreePort = async (startPort) => {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (!(await portIsOpen(port))) return port;
  }
  throw new Error(`Could not find a free frontend port near ${startPort}.`);
};

const run = (command, args, env = process.env) => {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...env },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 'unknown'}.`);
  }
};

const stopLocalProfile = () => {
  for (const child of localProfileProcesses) {
    if (!child?.pid || child.exitCode !== null) continue;
    try {
      process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') console.warn(`Could not stop local profile: ${error.message}`);
    }
  }
};

const main = async () => {
  run(process.execPath, ['scripts/check-profile.mjs', 'local']);

  const missingPorts = [];
  for (const port of requiredPorts) {
    if (!(await portIsOpen(port))) missingPorts.push(port);
  }

  if (missingPorts.length > 0 && !shouldStart) {
    throw new Error(
      `Local emulator services are not ready on port(s) ${missingPorts.join(', ')}. ` +
      'Run npm run local, or use npm run test:weekly:qa to let this runner start them.'
    );
  }

  if (shouldStart) {
    console.log('\nStarting a dedicated local-emulator frontend for this QA run...');
    if (missingPorts.length > 0) {
      const emulators = spawn(npmCommand, ['run', 'emulators:local'], {
        cwd: root,
        env: { ...process.env },
        detached: process.platform !== 'win32',
        stdio: 'inherit',
      });
      localProfileProcesses.push(emulators);
      emulators.once('error', (error) => {
        console.error(`Could not start emulators: ${error.message}`);
      });
      await waitFor(
        async () => (await Promise.all(requiredPorts.map((port) => portIsOpen(port)))).every(Boolean),
        90_000,
        'Firebase emulators'
      );
    }

    const frontendPort = await findFreePort(5173);
    baseURL = `http://127.0.0.1:${frontendPort}`;
    const web = spawn(npmCommand, ['run', 'local:web', '--', '--host', '127.0.0.1', '--port', String(frontendPort)], {
      cwd: root,
      env: { ...process.env },
      detached: process.platform !== 'win32',
      stdio: 'inherit',
    });
    localProfileProcesses.push(web);
    web.once('error', (error) => {
      console.error(`Could not start local frontend: ${error.message}`);
    });
  }

  const frontendURL = new URL(baseURL);
  await waitFor(
    () => portIsOpen(Number(frontendURL.port || 80), frontendURL.hostname),
    30_000,
    `the frontend at ${baseURL}`
  );

  run(npmCommand, ['run', 'seed:emulator'], {
    ...process.env,
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    GCLOUD_PROJECT: 'demo-project',
  });

  const testFiles = runAll
    ? []
    : [
      'e2e/critical-path.spec.mjs',
      'e2e/auth.spec.mjs',
      'e2e/book-flow.spec.mjs',
      'e2e/manim-video-dialog.spec.mjs',
    ];
  const playwrightArgs = ['playwright', 'test', ...testFiles, '--workers=1', '--reporter=line'];
  run(npxCommand, playwrightArgs, {
    ...process.env,
    CI: '1',
    PLAYWRIGHT_BASE_URL: baseURL,
    PLAYWRIGHT_EMAIL: testEmail,
    PLAYWRIGHT_PASSWORD: testPassword,
    PLAYWRIGHT_USE_EMULATOR: 'true',
    PLAYWRIGHT_BOOK_ID: process.env.PLAYWRIGHT_BOOK_ID || 'book-debug-001',
    PLAYWRIGHT_CHAPTER_ID: process.env.PLAYWRIGHT_CHAPTER_ID || 'chapter-001',
  });

  console.log('\nAirabook local QA passed.');
};

try {
  await main();
} catch (error) {
  console.error(`\nAirabook local QA failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  stopLocalProfile();
}
