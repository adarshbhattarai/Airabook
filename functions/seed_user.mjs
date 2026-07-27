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
  billing: { planLabel: 'Free Explorer', creditBalance: 150 },
  notificationCounters: { pendingInvites: 0 },
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
}, { merge: true });

console.log('✅ User doc seeded for', UID);
process.exit(0);
