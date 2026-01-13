const { ai } = require('./genkitClient');
const { z } = require('genkit');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
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
    await consumeApiCallQuota(db, request.auth.uid, 1);

    try {
      return await generateChapterSuggestionsFlow(request.data || {}, {
        context: { auth: request.auth }
      });
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
