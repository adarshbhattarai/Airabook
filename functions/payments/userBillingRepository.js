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
  async setBillingSnapshot(userId, billingSnapshot) {
    await db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .set(
        {
          billing: {
            ...billingSnapshot,
            lastPaymentAt:
              billingSnapshot.lastPaymentAt || FieldValue.serverTimestamp(),
            currentPeriodEnd: toTimestamp(billingSnapshot.currentPeriodEnd),
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
  },
};

module.exports = { userBillingRepository };



