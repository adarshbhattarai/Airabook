const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { paymentRepository } = require('./paymentRepository');
const { userBillingRepository } = require('./userBillingRepository');
const { IDGenerator } = require('../utils/idGenerator');

const PLAN_CONFIG = {
  free: {
    label: 'Free Explorer',
    entitlements: {
      canReadBooks: true,
      canWriteBooks: false,
      canInviteTeam: false,
    },
    suggestedAmountCents: 0,
  },
  supporter: {
    label: 'Supporter',
    entitlements: {
      canReadBooks: true,
      canWriteBooks: true,
      canInviteTeam: false,
    },
    suggestedAmountCents: 500,
  },
  pro: {
    label: 'Pro Writer',
    entitlements: {
      canReadBooks: true,
      canWriteBooks: true,
      canInviteTeam: true,
    },
    suggestedAmountCents: 1500,
  },
  enterprise: {
    label: 'Enterprise Studio',
    entitlements: {
      canReadBooks: true,
      canWriteBooks: true,
      canInviteTeam: true,
      prioritySupport: true,
    },
    suggestedAmountCents: 5000,
  },
};

const PaymentStatus = {
  pending: 'pending',
  completed: 'completed',
  failed: 'failed',
  canceled: 'canceled',
  expired: 'expired',
};

const getPlanConfig = (planTier = 'supporter') => {
  return PLAN_CONFIG[planTier] || PLAN_CONFIG.supporter;
};

const paymentService = {
  getPlanConfig,

  createPendingPayment({
    userId,
    amount,
    currency,
    planTier,
    note,
    source = 'donation_page',
  }) {
    const paymentId = IDGenerator.generateId('pay');
    const planConfig = getPlanConfig(planTier);
    const payload = {
      userId,
      planTier,
      planLabel: planConfig.label,
      amount,
      currency,
      note: note || null,
      source,
      provider: 'stripe',
      status: PaymentStatus.pending,
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
    const planTier = metadata.planTier || 'supporter';

    if (!paymentId || !userId) {
      throw new Error('Missing payment metadata on Stripe session.');
    }

    const planConfig = getPlanConfig(planTier);
    const amountSubunits =
      session.amount_total ||
      Number(metadata.amountCents) ||
      planConfig.suggestedAmountCents;

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

    await userBillingRepository.setBillingSnapshot(userId, {
      planTier,
      planLabel: planConfig.label,
      planState: 'active',
      entitlements: planConfig.entitlements,
      latestPaymentId: paymentId,
      lastPaymentAt: timestamp,
    });
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

module.exports = { paymentService, PaymentStatus };


