const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { userBillingRepository } = require('./userBillingRepository');
const { portalReturnUrl, stripe } = require('./stripeClient');

exports.createBillingPortalSession = onCall({ region: 'us-central1', cors: true }, async (request) => {
  if (!stripe) {
    throw new HttpsError(
      'failed-precondition',
      'Stripe billing portal is not configured. Set STRIPE_SECRET_KEY first.',
    );
  }

  const { auth, data = {} } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to manage billing.');
  }

  const billing = await userBillingRepository.getBillingSnapshot(auth.uid);
  const stripeCustomerId = billing?.stripeCustomerId || null;
  if (!stripeCustomerId) {
    throw new HttpsError(
      'failed-precondition',
      'No Stripe customer was found for this account yet.',
    );
  }

  const returnUrl =
    typeof data.returnUrl === 'string' && data.returnUrl.startsWith('http')
      ? data.returnUrl
      : portalReturnUrl;

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });

  return { url: session.url };
});
