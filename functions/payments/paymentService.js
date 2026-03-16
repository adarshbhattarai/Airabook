const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { paymentRepository } = require('./paymentRepository');
const { userBillingRepository } = require('./userBillingRepository');
const { IDGenerator } = require('../utils/idGenerator');
const {
  ACTIVE_PLAN_STATES,
  getCreditPackConfig,
  getPlanConfig,
  normalizePlanState,
  normalizePlanTier,
} = require('./catalog');
const { addPurchasedCredits, buildCreditFields } = require('./creditLedger');

const PaymentStatus = {
  pending: 'pending',
  completed: 'completed',
  failed: 'failed',
  canceled: 'canceled',
  expired: 'expired',
};

const SUBSCRIPTION_PLAN_STATES = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'canceled',
]);

const stateAllowsEntitlements = (planState) => ACTIVE_PLAN_STATES.has(normalizePlanState(planState));

const resolveEntitlements = (planTier, planState) => {
  const tier = normalizePlanTier(planTier);
  const planConfig = getPlanConfig(tier);
  if (tier === 'supporter' || tier === 'free') {
    return { ...planConfig.entitlements };
  }
  if (stateAllowsEntitlements(planState)) {
    return { ...planConfig.entitlements };
  }
  return { ...getPlanConfig('free').entitlements };
};

const toTimestamp = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Timestamp) {
    return value;
  }
  if (typeof value?.toDate === 'function') {
    return Timestamp.fromDate(value.toDate());
  }
  if (typeof value === 'number') {
    return Timestamp.fromMillis(value);
  }
  return null;
};

const planIdForTier = (planTier) => normalizePlanTier(planTier);

const normalizeSubscriptionStatus = (value = 'inactive') => {
  const normalized = normalizePlanState(value);
  return SUBSCRIPTION_PLAN_STATES.has(normalized) ? normalized : 'inactive';
};

const buildSupporterBillingSnapshot = ({
  currentBilling = {},
  paymentId = null,
  timestamp = FieldValue.serverTimestamp(),
  stripeCustomerId = null,
}) => {
  const tier = 'supporter';
  const planState = 'active';
  const planConfig = getPlanConfig(tier);

  return {
    planId: planIdForTier(tier),
    planTier: tier,
    planLabel: planConfig.label,
    planState,
    status: planState,
    entitlements: resolveEntitlements(tier, planState),
    latestPaymentId: paymentId || currentBilling?.latestPaymentId || null,
    lastPaymentAt: timestamp,
    stripeCustomerId: stripeCustomerId || currentBilling?.stripeCustomerId || null,
    stripeSubscriptionId: currentBilling?.stripeSubscriptionId || null,
    stripePriceId: currentBilling?.stripePriceId || null,
    billingInterval: currentBilling?.billingInterval || null,
    currentPeriodEnd: currentBilling?.currentPeriodEnd || null,
    cancelAtPeriodEnd: !!currentBilling?.cancelAtPeriodEnd,
    ...buildCreditFields('supporter', currentBilling, { initialGrant: false }),
  };
};

const buildDefaultBillingSnapshot = (currentBilling = {}) => {
  const tier = normalizePlanTier(currentBilling?.planTier || 'free');
  if (tier === 'supporter' || currentBilling?.latestPaymentId) {
    return buildSupporterBillingSnapshot({
      currentBilling,
      paymentId: currentBilling?.latestPaymentId || null,
      timestamp: currentBilling?.lastPaymentAt || FieldValue.serverTimestamp(),
      stripeCustomerId: currentBilling?.stripeCustomerId || null,
    });
  }

  if (tier === 'enterprise') {
    const state = normalizePlanState(currentBilling?.planState || currentBilling?.status || 'active');
    const planConfig = getPlanConfig('enterprise');
    return {
      planId: 'enterprise',
      planTier: 'enterprise',
      planLabel: planConfig.label,
      planState: state,
      status: state,
      entitlements: resolveEntitlements('enterprise', state),
      latestPaymentId: currentBilling?.latestPaymentId || null,
      lastPaymentAt: currentBilling?.lastPaymentAt || null,
      stripeCustomerId: currentBilling?.stripeCustomerId || null,
      stripeSubscriptionId: currentBilling?.stripeSubscriptionId || null,
      stripePriceId: currentBilling?.stripePriceId || null,
      billingInterval: currentBilling?.billingInterval || null,
      currentPeriodEnd: currentBilling?.currentPeriodEnd || null,
      cancelAtPeriodEnd: !!currentBilling?.cancelAtPeriodEnd,
      ...buildCreditFields('enterprise', currentBilling, { initialGrant: true }),
    };
  }

  const planConfig = getPlanConfig('free');
  return {
    planId: 'free',
    planTier: 'free',
    planLabel: planConfig.label,
    planState: 'active',
    status: 'active',
    entitlements: resolveEntitlements('free', 'active'),
    latestPaymentId: currentBilling?.latestPaymentId || null,
    lastPaymentAt: currentBilling?.lastPaymentAt || null,
    stripeCustomerId: currentBilling?.stripeCustomerId || null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    billingInterval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    ...buildCreditFields('free', currentBilling, { initialGrant: true }),
  };
};

const extractSubscriptionPriceId = (subscription) => {
  const line = subscription?.items?.data?.[0];
  return line?.price?.id || null;
};

const extractSubscriptionInterval = (subscription) => {
  const line = subscription?.items?.data?.[0];
  return line?.price?.recurring?.interval || null;
};

const buildSubscriptionBillingSnapshot = ({
  currentBilling = {},
  userId,
  planTier = 'creator',
  subscription,
  customerId = null,
  latestPaymentId = null,
}) => {
  if (!userId) {
    throw new Error('Missing userId for subscription billing snapshot.');
  }

  const tier = normalizePlanTier(planTier);
  const planConfig = getPlanConfig(tier);
  const planState = normalizeSubscriptionStatus(subscription?.status || currentBilling?.planState || currentBilling?.status);
  const priceId = extractSubscriptionPriceId(subscription);
  const interval = extractSubscriptionInterval(subscription);
  const currentPeriodEnd = subscription?.current_period_end
    ? Timestamp.fromMillis(subscription.current_period_end * 1000)
    : toTimestamp(currentBilling?.currentPeriodEnd);

  return {
    planId: planIdForTier(tier),
    planTier: tier,
    planLabel: planConfig.label,
    planState,
    status: planState,
    entitlements: resolveEntitlements(tier, planState),
    latestPaymentId: latestPaymentId || currentBilling?.latestPaymentId || null,
    lastPaymentAt: FieldValue.serverTimestamp(),
    stripeCustomerId: customerId || subscription?.customer || currentBilling?.stripeCustomerId || null,
    stripeSubscriptionId: subscription?.id || currentBilling?.stripeSubscriptionId || null,
    stripePriceId: priceId || currentBilling?.stripePriceId || null,
    billingInterval: interval || currentBilling?.billingInterval || null,
    currentPeriodEnd,
    cancelAtPeriodEnd: !!subscription?.cancel_at_period_end,
    ...buildCreditFields(tier, currentBilling, { initialGrant: false }),
  };
};

const paymentService = {
  getPlanConfig,
  normalizePlanTier,
  normalizePlanState,
  normalizeSubscriptionStatus,
  buildDefaultBillingSnapshot,
  buildSubscriptionBillingSnapshot,

  createPendingPayment({
    userId,
    amount,
    currency,
    planTier,
    note,
    source = 'billing_page_support',
    metadata = {},
  }) {
    const paymentId = IDGenerator.generateId('pay');
    const normalizedPlanTier = normalizePlanTier(planTier || 'supporter');
    const planConfig = getPlanConfig(normalizedPlanTier);
    const payload = {
      userId,
      planTier: normalizedPlanTier,
      planLabel: planConfig.label,
      amount,
      currency,
      note: note || null,
      source,
      provider: 'stripe',
      status: PaymentStatus.pending,
      metadata,
    };
    return paymentRepository
      .createPayment(paymentId, payload)
      .then(() => ({ paymentId, planConfig }));
  },

  attachStripeSession(paymentId, session) {
    return paymentRepository.updatePayment(paymentId, {
      sessionId: session.id,
      stripeCheckoutUrl: session.url || null,
      status: PaymentStatus.pending,
    });
  },

  async markPaymentCompleted(session) {
    const metadata = session.metadata || {};
    const paymentId = metadata.paymentId;
    const userId = metadata.userId;
    const flow = String(metadata.flow || 'support_payment').trim().toLowerCase();
    const planTier = normalizePlanTier(metadata.planTier || 'supporter');

    if (!paymentId || !userId) {
      throw new Error('Missing payment metadata on Stripe session.');
    }

    const planConfig = getPlanConfig(planTier);
    const amountSubunits =
      session.amount_total ||
      Number(metadata.amountCents) ||
      planConfig.priceMonthlyCents ||
      0;

    const timestamp = session.created
      ? Timestamp.fromMillis(session.created * 1000)
      : FieldValue.serverTimestamp();

    await paymentRepository.updatePayment(paymentId, {
      status: PaymentStatus.completed,
      stripeSessionId: session.id,
      stripeCustomerId: session.customer || null,
      stripePaymentIntentId: session.payment_intent || null,
      amount: amountSubunits,
      currency: session.currency || 'usd',
      completedAt: timestamp,
    });

    if (flow === 'credit_pack') {
      const pack = getCreditPackConfig(metadata.creditPackId);
      if (!pack) {
        throw new Error(`Unknown credit pack ${metadata.creditPackId || 'missing'}.`);
      }
      await addPurchasedCredits(userId, pack.credits);
      return;
    }

    const currentBilling = await userBillingRepository.getBillingSnapshot(userId);
    const snapshot = buildSupporterBillingSnapshot({
      currentBilling,
      paymentId,
      timestamp,
      stripeCustomerId: session.customer || null,
    });

    await userBillingRepository.setBillingSnapshot(userId, snapshot);
  },

  async syncSubscriptionFromStripe({
    userId,
    subscription,
    customerId = null,
    latestPaymentId = null,
    planTier = 'creator',
  }) {
    if (!userId || !subscription) {
      throw new Error('syncSubscriptionFromStripe requires userId and subscription.');
    }
    const currentBilling = await userBillingRepository.getBillingSnapshot(userId);
    const snapshot = buildSubscriptionBillingSnapshot({
      currentBilling,
      userId,
      planTier,
      subscription,
      customerId,
      latestPaymentId,
    });
    await userBillingRepository.setBillingSnapshot(userId, snapshot);
    return snapshot;
  },

  async downgradeSubscriptionToFallback({ userId }) {
    if (!userId) {
      throw new Error('downgradeSubscriptionToFallback requires userId.');
    }
    const currentBilling = await userBillingRepository.getBillingSnapshot(userId);
    const fallback = buildDefaultBillingSnapshot(currentBilling);
    await userBillingRepository.setBillingSnapshot(userId, fallback);
    return fallback;
  },

  async markPaymentFailed(session, status) {
    const metadata = session.metadata || {};
    const paymentId = metadata.paymentId;
    if (!paymentId) {
      return;
    }

    await paymentRepository.updatePayment(paymentId, {
      status,
      stripeSessionId: session.id,
    });
  },
};

module.exports = {
  ACTIVE_PLAN_STATES,
  PaymentStatus,
  buildDefaultBillingSnapshot,
  buildSubscriptionBillingSnapshot,
  getPlanConfig,
  normalizePlanState,
  normalizePlanTier,
  normalizeSubscriptionStatus,
  paymentService,
  resolveEntitlements,
};
