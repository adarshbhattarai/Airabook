import { createRequire } from 'module';
const require = createRequire(import.meta.url);

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-project' });
const db = admin.firestore();

const BOOK_ID = 'book-debug-001';
const CHAPTER_ID = 'chapter-001';
const PAGE_ID = 'page-001';
// Match the UID used in seed_user.mjs and create-emulator-user scripts
const USER_ID = 'DBSLzo0d4xSO6BC1aVC7X9bywEbr';

await db.doc(`books/${BOOK_ID}`).set({
  title: 'Debug Test Book',
  userId: USER_ID,
  ownerId: USER_ID,
  isPublic: false,
  layoutMode: 'standard',
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

await db.doc(`books/${BOOK_ID}/chapters/${CHAPTER_ID}`).set({
  title: 'Chapter 1',
  order: 'a',
  bookId: BOOK_ID,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});

await db.doc(`books/${BOOK_ID}/chapters/${CHAPTER_ID}/pages/${PAGE_ID}`).set({
  note: '<p>The Pythagorean theorem states that in a right triangle, the square of the hypotenuse equals the sum of the squares of the other two sides: a² + b² = c². For example, a right triangle with legs of length 3 and 4 has a hypotenuse of 5, because 9 + 16 = 25. This fundamental relationship can be visualized by drawing squares on each side of the triangle and comparing their areas.</p>',
  shortNote: 'Pythagorean theorem: a² + b² = c²',
  order: 'a',
  chapterId: CHAPTER_ID,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});

console.log('✅ Seeded:', { BOOK_ID, CHAPTER_ID, PAGE_ID });
process.exit(0);
