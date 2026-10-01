/**
 * Creates the Playwright e2e test user in the Firebase Auth emulator.
 *
 * Run after starting emulators:
 *   node functions/create_emulator_user.mjs
 *
 * The user is always created with the fixed UID below so that the seeded
 * Firestore data (books, user doc) stays consistent.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-project' });

const UID      = 'DBSLzo0d4xSO6BC1aVC7X9bywEbr';
const EMAIL    = 'claude@airabook.dev';
const PASSWORD = 'ClaudeAirabook2024';

try {
  // If user already exists, delete and recreate so password is always correct.
  const existing = await admin.auth().getUser(UID).catch(() => null);
  if (existing) {
    await admin.auth().deleteUser(UID);
    console.log('🗑️  Deleted existing user', UID);
  }
  const user = await admin.auth().createUser({
    uid: UID,
    email: EMAIL,
    password: PASSWORD,
    displayName: 'Claude Dev',
    emailVerified: true,
  });
  console.log('✅ Auth user created:', user.uid, '/', user.email);
} catch (err) {
  console.error('❌ Failed to create auth user:', err.message);
  process.exit(1);
}

process.exit(0);
