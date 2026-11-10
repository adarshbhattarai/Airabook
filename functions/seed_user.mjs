import { createRequire } from 'module';
const require = createRequire(import.meta.url);

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-project' });
const db = admin.firestore();

const UID = 'DBSLzo0d4xSO6BC1aVC7X9bywEbr';
const BOOK_ID = 'book-debug-001';

await db.doc(`users/${UID}`).set({
  uid: UID,
  email: 'claude@airabook.dev',
  displayName: 'Claude Test',
  accessibleBookIds: [{
    bookId: BOOK_ID,
    title: 'Debug Test Book',
    isOwner: true,
    ownerId: UID,
    coverImage: null,
    coverImageUrl: null,
  }],
  accessibleAlbums: [],
  // The local QA account uses Creator quotas so create-book journeys stay
  // independent of a restored emulator's old free-tier usage counters.
  billing: { planTier: 'creator', planLabel: 'Creator QA', creditBalance: 150 },
  quotaCounters: {
    apiCalls: { used: 0, windowStart: admin.firestore.FieldValue.serverTimestamp() },
    storageBytesUsed: 0,
    lastStorageCreditChargeAt: null,
    books: 0,
    pages: 0,
  },
  notificationCounters: { pendingInvites: 0 },
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
}, { merge: true });

console.log('✅ User doc seeded for', UID);
process.exit(0);
