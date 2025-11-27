const { onCall, HttpsError } = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const { buildInitialQuotaCounters, loadConfig } = require("./utils/limits");

const db = admin.firestore();
// const db = admin.firestore(); // This line is removed as per the instruction

/**
 * Triggered when a new user is created in Firebase Auth.
 * Creates a corresponding document in the 'users' collection.
 */
exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
    console.log("!!! ------------------------------------------------- !!!");
    console.log("!!! onUserCreate TRIGGERED for user:", user.uid);
    console.log("!!! Email:", user.email);
    console.log("!!! ------------------------------------------------- !!!");

    try {
        // Initialize Firestore inside the function to ensure Admin SDK is ready
        const db = admin.firestore();

        const { uid, email, displayName } = user;
        const emailLower = (email || "").toLowerCase();
        const cfg = loadConfig();

        const defaultEntitlements = {
            canReadBooks: true,
            canWriteBooks: true,
            canInviteTeam: false,
        };

        const defaultBilling = {
            planTier: 'free',
            planLabel: 'Free Explorer',
            planState: 'inactive',
            entitlements: defaultEntitlements,
            latestPaymentId: null,
        };

        // Determine plan tier (god > early > free)
        let planTier = 'free';
        if (cfg.godUsers.has(emailLower) || cfg.godUsers.has(uid)) {
            planTier = 'god';
        } else {
            const earlySnap = await db.collection('users').orderBy('createdAt').limit(50).get();
            if (earlySnap.size < 50) {
                planTier = 'early';
            }
        }

        defaultBilling.planTier = planTier;
        defaultBilling.planLabel =
            planTier === 'god' ? 'God Tier' : planTier === 'early' ? 'Early Supporter' : 'Free Explorer';

        const newUser = {
            displayName: displayName || '',
            displayNameLower: (displayName || '').toLowerCase(),
            email: email || '',
            accessibleBookIds: [],
            accessibleAlbums: [],
            billing: defaultBilling,
            quotaCounters: buildInitialQuotaCounters(),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };

        const userRef = db.collection('users').doc(uid);
        const doc = await userRef.get();

        if (doc.exists) {
            console.log(`⚠️ User document already exists for ${uid}, skipping creation.`);
            return;
        }

        await userRef.set(newUser);
        console.log("!!! ------------------------------------------------- !!!");
        console.log("!!! Firestore document created successfully for:", uid);
        console.log("!!! ------------------------------------------------- !!!");

        try {
            logger.info(`✅ Successfully created Firestore document for user ${uid}`, { structuredData: true });
        } catch (e) {
            console.log("Logger failed but document created.");
        }

    } catch (error) {
        console.error("!!! ------------------------------------------------- !!!");
        console.error("!!! CRITICAL ERROR in onUserCreate:", error);
        console.error("!!! ------------------------------------------------- !!!");
        logger.error(`❌ Error creating user document for ${user.uid}:`, error);
    }
});
