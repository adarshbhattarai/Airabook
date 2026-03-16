const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const db = admin.firestore();

const asNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const asDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value === 'number') return new Date(value);
  return null;
};

const currentMonthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

exports.getUsageSummary = onCall({ region: 'us-central1', cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to view usage.');
  }

  const userId = request.auth.uid;
  const userSnapshot = await db.collection('users').doc(userId).get();
  if (!userSnapshot.exists) {
    throw new HttpsError('not-found', 'User profile not found.');
  }

  const userData = userSnapshot.data() || {};
  const billing = userData.billing || {};
  const cycleStart = asDate(billing.lastCreditGrantAt) || currentMonthStart();

  const usageSnapshot = await db
    .collection('usageEvents')
    .where('userId', '==', userId)
    .get();

  const summary = {
    cycleStart: cycleStart.toISOString(),
    creditsCharged: 0,
    creditsDeducted: 0,
    inputTokens: 0,
    outputTokens: 0,
    imageOutputTokens: 0,
    imagesGenerated: 0,
    voiceSeconds: 0,
    ttsCharacters: 0,
    storageGbDays: 0,
    actions: 0,
    byFeature: {},
  };

  usageSnapshot.forEach((doc) => {
    const data = doc.data() || {};
    const createdAt = asDate(data.createdAt);
    if (!createdAt || createdAt < cycleStart) {
      return;
    }

    const feature = String(data.feature || 'unknown');
    const rawUnits = data.rawUnits || {};

    summary.actions += 1;
    summary.creditsCharged += asNumber(data.creditsCharged, 0);
    summary.creditsDeducted += asNumber(data.creditsDeducted, 0);
    summary.inputTokens += asNumber(rawUnits.inputTokens, 0);
    summary.outputTokens += asNumber(rawUnits.outputTokens, 0);
    summary.imageOutputTokens += asNumber(rawUnits.outputImageTokens, 0);
    summary.voiceSeconds += asNumber(rawUnits.seconds, 0);
    summary.ttsCharacters += asNumber(rawUnits.characters, 0);
    summary.storageGbDays += asNumber(rawUnits.gbDays, 0);

    if (feature === 'image_generation') {
      summary.imagesGenerated += 1;
    }

    summary.byFeature[feature] = {
      count: asNumber(summary.byFeature[feature]?.count, 0) + 1,
      creditsCharged: asNumber(summary.byFeature[feature]?.creditsCharged, 0) + asNumber(data.creditsCharged, 0),
    };
  });

  return {
    summary,
    billing: {
      creditBalance: asNumber(billing.creditBalance, 0),
      includedCreditsMonthly: asNumber(billing.includedCreditsMonthly, 0),
      usedCreditsThisCycle: asNumber(billing.usedCreditsThisCycle, 0),
      planTier: String(billing.planTier || 'free'),
      planState: String(billing.planState || billing.status || 'inactive'),
    },
  };
});
