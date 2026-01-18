const { ai } = require('./genkitClient');
const { z } = require('genkit');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { generateEmbeddings } = require('./utils/embeddingsClient');
const { consumeApiCallQuota } = require('./utils/limits');
const { defineQueryBookFlow } = require('./flows/queryBookFlow');
const { defineGenerateChapterSuggestionsFlow } = require('./flows/generateChapterSuggestions');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const queryBookFlowRaw = defineQueryBookFlow({ ai, z, db, generateEmbeddings });
const generateChapterSuggestionsFlow = defineGenerateChapterSuggestionsFlow({ ai, z, db, HttpsError });

const normalizeSuggestions = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item).trim())
    .filter(Boolean)
    .slice(0, 8);
};

// Export as Callable Cloud Functions
const queryBookFlow = onCall(
  { region: 'us-central1', cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    await consumeApiCallQuota(db, request.auth.uid, 1);

    try {
      // Invoke the flow with auth context
      return await queryBookFlowRaw(request.data, {
        context: { auth: request.auth }
      });
    } catch (e) {
      console.error('Flow error:', e);
      throw new HttpsError('internal', e.message);
    }
  }
);

const generateChapterSuggestions = onCall(
  { region: 'us-central1', cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { bookId, chapterId, userId, refresh } = request.data || {};
    if (!bookId || !chapterId) {
      throw new HttpsError('invalid-argument', 'Book ID and chapter ID are required.');
    }

    if (userId && userId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'User mismatch.');
    }

    const bookRef = db.collection('books').doc(bookId);
    const bookDoc = await bookRef.get();

    if (!bookDoc.exists) {
      throw new HttpsError('not-found', 'Book not found.');
    }

    const bookData = bookDoc.data() || {};
    const isOwner = bookData.ownerId === request.auth.uid;
    const isMember = bookData.members && bookData.members[request.auth.uid];

    if (!isOwner && !isMember) {
      throw new HttpsError('permission-denied', 'You do not have access to this book.');
    }

    const chapterRef = bookRef.collection('chapters').doc(chapterId);
    const chapterDoc = await chapterRef.get();

    if (!chapterDoc.exists) {
      throw new HttpsError('not-found', 'Chapter not found.');
    }

    const chapterData = chapterDoc.data() || {};
    const cachedSuggestions = normalizeSuggestions(chapterData.chapterSuggestions);

    if (!refresh && cachedSuggestions.length > 0) {
      return { suggestions: cachedSuggestions, cached: true };
    }

    await consumeApiCallQuota(db, request.auth.uid, 1);

    try {
      const flowInput = {
        bookId,
        chapterId,
        userId: userId || request.auth.uid,
        refresh: Boolean(refresh),
      };
      const result = await generateChapterSuggestionsFlow(flowInput, {
        context: {
          auth: request.auth,
          bookData,
          chapterData,
        }
      });
      const nextSuggestions = normalizeSuggestions(result?.suggestions);
      if (nextSuggestions.length > 0) {
        await chapterRef.set(
          {
            chapterSuggestions: nextSuggestions,
            chapterSuggestionsUpdatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      return { suggestions: nextSuggestions };
    } catch (e) {
      console.error('Flow error:', e);
      if (e instanceof HttpsError) {
        throw e;
      }
      throw new HttpsError('internal', e.message);
    }
  }
);

module.exports = {
  queryBookFlow,
  generateChapterSuggestions,
};
