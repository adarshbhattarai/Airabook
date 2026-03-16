const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { consumeCredits, ensureMonthlyCreditsForUser } = require('./creditLedger');

const db = admin.firestore();

exports.processCreditMaintenance = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every day 02:00',
    timeZone: 'UTC',
  },
  async () => {
    const snapshot = await db.collection('users').get();
    let processedUsers = 0;
    let storageCharges = 0;

    for (const document of snapshot.docs) {
      const userId = document.id;
      const userData = document.data() || {};

      await ensureMonthlyCreditsForUser(userId, db);

      const storageBytesUsed = Number(userData?.quotaCounters?.storageBytesUsed || 0);
      const lastChargeAt = userData?.quotaCounters?.lastStorageCreditChargeAt;
      const lastChargeDate = typeof lastChargeAt?.toDate === 'function' ? lastChargeAt.toDate() : null;
      const msSinceLastCharge = lastChargeDate ? Date.now() - lastChargeDate.getTime() : Number.POSITIVE_INFINITY;

      if (storageBytesUsed > 0 && msSinceLastCharge >= 24 * 60 * 60 * 1000) {
        const gbDays = storageBytesUsed / (1024 * 1024 * 1024);
        await consumeCredits(db, userId, {
          feature: 'storage_retention',
          source: 'storage_daily_charge',
          provider: 'cloud_storage',
          rawUnits: {
            bytes: storageBytesUsed,
            gbDays,
          },
          minimumCredits: 1,
        }, {
          enforce: false,
        });

        await db.collection('users').doc(userId).set({
          quotaCounters: {
            lastStorageCreditChargeAt: FieldValue.serverTimestamp(),
          },
        }, { merge: true });
        storageCharges += 1;
      }

      processedUsers += 1;
    }

    logger.info('Daily credit maintenance completed', {
      processedUsers,
      storageCharges,
    });
  },
);
