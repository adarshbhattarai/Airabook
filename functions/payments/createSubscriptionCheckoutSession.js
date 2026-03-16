const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { userBillingRepository } = require('./userBillingRepository');
const { getPlanConfig, normalizePlanTier } = require('./catalog');
const {
  appBaseUrl,
  creatorMonthlyPriceId,
  premiumMonthlyPriceId,
  proMonthlyPriceId,
  stripe,
} = require('./stripeClient');

const PRICE_ID_BY_TIER = {
  creator: creatorMonthlyPriceId,
  pro: proMonthlyPriceId,
  premium: premiumMonthlyPriceId,
};

exports.createSubscriptionCheckoutSession = onCall({ region: 'us-central1', cors: true }, async (request) => {
  const requestedTier = normalizePlanTier(request.data?.tier || 'creator');
  const priceId = PRICE_ID_BY_TIER[requestedTier] || null;

  if (!stripe || !priceId) {
    throw new HttpsError(
      'failed-precondition',
      'Stripe subscription billing is not configured for this tier. Configure the matching Stripe monthly price id first.',
    );
  }

  const { auth, data = {} } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to subscribe.');
  }

  const successUrl =
    typeof data.successUrl === 'string' && data.successUrl.startsWith('http')
      ? data.successUrl
      : `${appBaseUrl}/billing/success`;
  const cancelUrl =
    typeof data.cancelUrl === 'string' && data.cancelUrl.startsWith('http')
      ? data.cancelUrl
      : `${appBaseUrl}/billing`;

  const currentBilling = await userBillingRepository.getBillingSnapshot(auth.uid);
  let stripeCustomerId = currentBilling?.stripeCustomerId || null;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: auth.token.email || undefined,
      metadata: {
        userId: auth.uid,
      },
    });
    stripeCustomerId = customer.id;
  }

  if (currentBilling) {
    await userBillingRepository.setBillingSnapshot(auth.uid, {
      ...currentBilling,
      stripeCustomerId,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    client_reference_id: auth.uid,
    success_url: `${successUrl}?flow=subscription&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${cancelUrl}?flow=subscription&status=cancelled`,
    allow_promotion_codes: true,
    metadata: {
      flow: 'subscription',
      userId: auth.uid,
      planTier: requestedTier,
    },
    subscription_data: {
      metadata: {
        flow: 'subscription',
        userId: auth.uid,
        planTier: requestedTier,
      },
    },
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
  });

  logger.info('Stripe subscription checkout session created', {
    sessionId: session.id,
    planLabel: getPlanConfig(requestedTier).label,
    planTier: requestedTier,
    userId: auth.uid,
  });

  return {
    sessionId: session.id,
    checkoutUrl: session.url,
  };
});
