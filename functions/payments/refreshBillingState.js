const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { paymentService } = require('./paymentService');
const { ensureMonthlyCreditsForUser } = require('./creditLedger');
const { userBillingRepository } = require('./userBillingRepository');
const {
  creatorMonthlyPriceId,
  legacyCreatorPriceIds,
  premiumMonthlyPriceId,
  proMonthlyPriceId,
  stripe,
} = require('./stripeClient');

const subscriptionRank = (subscription) => {
  const status = String(subscription?.status || '').toLowerCase();
  if (status === 'active') return 5;
  if (status === 'trialing') return 4;
  if (status === 'past_due') return 3;
  if (status === 'unpaid') return 2;
  if (status === 'incomplete') return 1;
  return 0;
};

const pickBestSubscription = (subscriptions = []) => {
  return [...subscriptions].sort((left, right) => {
    const rankDelta = subscriptionRank(right) - subscriptionRank(left);
    if (rankDelta !== 0) return rankDelta;
    return Number(right?.created || 0) - Number(left?.created || 0);
  })[0] || null;
};

const resolvePlanTier = (subscription) => {
  const metadataTier = subscription?.metadata?.planTier || null;
  if (metadataTier) return metadataTier;
  const priceId = subscription?.items?.data?.[0]?.price?.id || null;
  if (priceId && legacyCreatorPriceIds.includes(priceId)) return 'creator';
  if (priceId && creatorMonthlyPriceId && priceId === creatorMonthlyPriceId) return 'creator';
  if (priceId && proMonthlyPriceId && priceId === proMonthlyPriceId) return 'pro';
  if (priceId && premiumMonthlyPriceId && priceId === premiumMonthlyPriceId) return 'premium';
  return 'creator';
};

exports.refreshBillingState = onCall({ region: 'us-central1', cors: true }, async (request) => {
  if (!stripe) {
    throw new HttpsError(
      'failed-precondition',
      'Stripe billing refresh is not configured. Set STRIPE_SECRET_KEY first.',
    );
  }

  const { auth } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to refresh billing.');
  }

  const currentBilling = await userBillingRepository.getBillingSnapshot(auth.uid);
  if (!currentBilling) {
    throw new HttpsError('not-found', 'Billing was not found for this user.');
  }

  let subscription = null;
  if (currentBilling.stripeSubscriptionId) {
    try {
      subscription = await stripe.subscriptions.retrieve(currentBilling.stripeSubscriptionId);
    } catch (error) {
      logger.warn('Failed to retrieve explicit Stripe subscription during refresh', {
        userId: auth.uid,
        stripeSubscriptionId: currentBilling.stripeSubscriptionId,
        message: error?.message || 'unknown',
      });
    }
  }

  if (!subscription && currentBilling.stripeCustomerId) {
    const subscriptions = await stripe.subscriptions.list({
      customer: currentBilling.stripeCustomerId,
      status: 'all',
      limit: 10,
    });
    subscription = pickBestSubscription(subscriptions?.data || []);
  }

  let billing;
  if (subscription) {
    billing = await paymentService.syncSubscriptionFromStripe({
      userId: auth.uid,
      subscription,
      customerId: subscription.customer || currentBilling.stripeCustomerId || null,
      latestPaymentId: currentBilling.latestPaymentId || null,
      planTier: resolvePlanTier(subscription),
    });
  } else {
    billing = await paymentService.downgradeSubscriptionToFallback({ userId: auth.uid });
  }

  billing = await ensureMonthlyCreditsForUser(auth.uid) || billing;

  return {
    billing,
    refreshedAt: Date.now(),
    source: subscription ? 'stripe_subscription' : 'fallback',
  };
});
