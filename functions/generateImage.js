const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { generateImageForPage } = require('./services/imageGenerationService');
const { consumeApiCallQuota } = require('./utils/limits');

const LOCATION = 'us-central1';

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const stripHtml = (value = '') =>
  String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getPagePlainText = async (bookId, chapterId, pageId) => {
  const pageRef = db.collection('books').doc(bookId).collection('chapters').doc(chapterId).collection('pages').doc(pageId);
  const snap = await pageRef.get();
  if (!snap.exists) return '';
  const data = snap.data() || {};
  if (typeof data.plainText === 'string' && data.plainText.trim()) {
    return data.plainText.trim();
  }
  if (typeof data.note === 'string' && data.note.trim()) {
    return stripHtml(data.note);
  }
  return '';
};

const assertBookAccess = async (uid, bookId) => {
  const bookRef = db.collection('books').doc(bookId);
  const bookDoc = await bookRef.get();
  if (!bookDoc.exists) {
    throw new HttpsError('not-found', 'Book not found.');
  }
  const data = bookDoc.data() || {};
  const isOwner = data.ownerId === uid;
  const isMember = data.members && data.members[uid];
  if (!isOwner && !isMember) {
    throw new HttpsError('permission-denied', 'You do not have access to this book.');
  }
};

exports.generateImage = onCall({ region: LOCATION, cors: true }, async (request) => {
  const { data, auth } = request;
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'Please sign in to generate images.');
  }

  const { prompt, useContext, bookId, chapterId, pageId, pageContext } = data || {};

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw new HttpsError('invalid-argument', '`prompt` is required.');
  }
  if (!bookId || !chapterId || !pageId) {
    throw new HttpsError('invalid-argument', 'bookId, chapterId, and pageId are required.');
  }

  await assertBookAccess(auth.uid, bookId);
  await consumeApiCallQuota(db, auth.uid, 1);

  let contextText = '';
  if (useContext) {
    if (typeof pageContext === 'string' && pageContext.trim()) {
      contextText = pageContext.trim();
    } else {
      contextText = await getPagePlainText(bookId, chapterId, pageId);
    }
  }

  try {
    const result = await generateImageForPage({
      userPrompt: prompt.trim(),
      pageContext: contextText,
      userId: auth.uid,
      bookId,
      chapterId,
      pageId,
    });

    return {
      ...result,
      usedContext: Boolean(contextText),
    };
  } catch (error) {
    console.error('generateImage error:', error);
    throw new HttpsError('internal', 'Failed to generate image. Please try again.');
  }
});
