const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const db = admin.firestore();
const USERS_COLLECTION = 'users';

const toTimestamp = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Timestamp) {
    return value;
  }
  if (typeof value === 'number') {
    return Timestamp.fromMillis(value);
  }
  return null;
};

const userBillingRepository = {
  async findUserIdByStripeCustomerId(stripeCustomerId) {
    if (!stripeCustomerId) {
      return null;
    }

    const snapshot = await db
      .collection(USERS_COLLECTION)
      .where('billing.stripeCustomerId', '==', stripeCustomerId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0]?.id || null;
  },

  async findUserIdByStripeSubscriptionId(stripeSubscriptionId) {
    if (!stripeSubscriptionId) {
      return null;
    }

    const snapshot = await db
      .collection(USERS_COLLECTION)
      .where('billing.stripeSubscriptionId', '==', stripeSubscriptionId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0]?.id || null;
  },

  async getBillingSnapshot(userId) {
    if (!userId) {
      return null;
    }

    const snapshot = await db.collection(USERS_COLLECTION).doc(userId).get();
    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data()?.billing || null;
  },

  async getUserSnapshot(userId) {
    if (!userId) {
      return null;
    }

    const snapshot = await db.collection(USERS_COLLECTION).doc(userId).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() || null;
  },

  async setBillingSnapshot(userId, billingSnapshot) {
    const normalizedPlanState = String(
      billingSnapshot?.planState || billingSnapshot?.status || 'inactive',
    ).trim().toLowerCase() || 'inactive';

    await db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .set(
        {
          billing: {
            ...billingSnapshot,
            planId: billingSnapshot?.planId || billingSnapshot?.planTier || 'free',
            planState: normalizedPlanState,
            status: normalizedPlanState,
            lastPaymentAt:
              billingSnapshot.lastPaymentAt || FieldValue.serverTimestamp(),
            currentPeriodEnd: toTimestamp(billingSnapshot.currentPeriodEnd),
            cancelAtPeriodEnd: !!billingSnapshot.cancelAtPeriodEnd,
            includedCreditsMonthly: Number(billingSnapshot.includedCreditsMonthly || 0),
            rolloverCap: Number(billingSnapshot.rolloverCap || 0),
            creditBalance: Number(billingSnapshot.creditBalance || 0),
            rolloverCredits: Number(billingSnapshot.rolloverCredits || 0),
            purchasedCredits: Number(billingSnapshot.purchasedCredits || 0),
            usedCreditsThisCycle: Number(billingSnapshot.usedCreditsThisCycle || 0),
            lastCreditGrantAt:
              toTimestamp(billingSnapshot.lastCreditGrantAt) || billingSnapshot.lastCreditGrantAt || null,
            lastCreditGrantPeriod: billingSnapshot.lastCreditGrantPeriod || null,
            lowCreditState: !!billingSnapshot.lowCreditState,
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
  },
};

module.exports = { userBillingRepository };



