const assert = require('node:assert/strict');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'demo-project' });
}

const {
  buildDefaultBillingSnapshot,
  buildSubscriptionBillingSnapshot,
  normalizePlanState,
} = require('../payments/paymentService');

function testActiveSubscriptionSnapshot() {
  const snapshot = buildSubscriptionBillingSnapshot({
    currentBilling: {
      latestPaymentId: 'pay_1',
    },
    userId: 'user-1',
    planTier: 'creator',
    subscription: {
      id: 'sub_123',
      status: 'active',
      customer: 'cus_123',
      current_period_end: Math.floor(Date.now() / 1000) + 3600,
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: {
              id: 'price_123',
              recurring: { interval: 'month' },
            },
          },
        ],
      },
    },
  });

  assert.equal(snapshot.planTier, 'creator');
  assert.equal(snapshot.planState, 'active');
  assert.equal(snapshot.status, 'active');
  assert.equal(snapshot.stripeSubscriptionId, 'sub_123');
  assert.equal(snapshot.stripeCustomerId, 'cus_123');
  assert.equal(snapshot.stripePriceId, 'price_123');
  assert.equal(snapshot.billingInterval, 'month');
  assert.equal(snapshot.includedCreditsMonthly, 2500);
  assert.equal(snapshot.rolloverCap, 625);
  assert.equal(snapshot.entitlements.canUseVoiceAssistant, true);
  assert.equal(snapshot.entitlements.canUseSpeechTranslation, true);
}

function testPastDueSubscriptionDropsProEntitlements() {
  const snapshot = buildSubscriptionBillingSnapshot({
    currentBilling: {},
    userId: 'user-1',
    planTier: 'pro',
    subscription: {
      id: 'sub_123',
      status: 'past_due',
      customer: 'cus_123',
      items: { data: [] },
    },
  });

  assert.equal(snapshot.planState, 'past_due');
  assert.equal(snapshot.entitlements.canInviteTeam, false);
  assert.equal(snapshot.entitlements.canUseVoiceAssistant, undefined);
}

function testSupporterFallbackPreservesSupportState() {
  const snapshot = buildDefaultBillingSnapshot({
    planTier: 'supporter',
    latestPaymentId: 'pay_1',
    stripeCustomerId: 'cus_123',
  });

  assert.equal(snapshot.planTier, 'supporter');
  assert.equal(snapshot.planState, 'active');
  assert.equal(snapshot.status, 'active');
  assert.equal(snapshot.latestPaymentId, 'pay_1');
  assert.equal(snapshot.stripeCustomerId, 'cus_123');
  assert.equal(snapshot.creditBalance, 0);
}

function testFreeDefaultsIncludeStarterCredits() {
  const snapshot = buildDefaultBillingSnapshot({});
  assert.equal(snapshot.planTier, 'free');
  assert.equal(snapshot.creditBalance, 150);
  assert.equal(snapshot.includedCreditsMonthly, 150);
  assert.equal(snapshot.rolloverCap, 0);
}

function testNormalizePlanStateUsesFallback() {
  assert.equal(normalizePlanState('ACTIVE'), 'active');
  assert.equal(normalizePlanState(''), 'inactive');
}

function main() {
  testActiveSubscriptionSnapshot();
  testPastDueSubscriptionDropsProEntitlements();
  testSupporterFallbackPreservesSupportState();
  testFreeDefaultsIncludeStarterCredits();
  testNormalizePlanStateUsesFallback();
  console.log('Billing payment service tests passed.');
}

main();
