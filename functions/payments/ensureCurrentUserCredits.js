const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { ensureMonthlyCreditsForUser } = require('./creditLedger');

exports.ensureCurrentUserCredits = onCall({ region: 'us-central1', cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to refresh monthly credits.');
  }

  const billing = await ensureMonthlyCreditsForUser(request.auth.uid);
  return {
    billing,
    refreshedAt: Date.now(),
    source: 'lazy_monthly_credit_grant',
  };
});
