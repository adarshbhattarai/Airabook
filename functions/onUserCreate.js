const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const { buildInitialQuotaCounters, loadConfig } = require("./utils/limits");

// Admin is initialized in index.js - no need to initialize here

/**
 * Triggered when a new user is created in Firebase Auth.
 * Creates a corresponding document in the 'users' collection.
 */
exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
    console.log("!!! ------------------------------------------------- !!!");
    console.log("!!! DEBUG: onUserCreate (V1) ENTRY POINT HIT");
    console.log("!!! DEBUG: user object:", JSON.stringify(user));

    // Check if dependencies loaded
    console.log("!!! DEBUG: limits imported?", typeof loadConfig, typeof buildInitialQuotaCounters);

    console.log("!!! onUserCreate TRIGGERED for user:", user.uid);
    console.log("!!! Email:", user.email);
    console.log("!!! ------------------------------------------------- !!!");

    try {
        console.log("!!! DEBUG: Starting try block");
        // Initialize Firestore inside the function to ensure Admin SDK is ready
        const db = admin.firestore();
        console.log("!!! DEBUG: Firestore initialized");

        const { uid, email, displayName } = user;
        const emailLower = (email || "").toLowerCase();

        console.log("!!! DEBUG: Loading config...");
        const cfg = loadConfig();
        console.log("!!! DEBUG: Config loaded");

        const defaultEntitlements = {
            canReadBooks: true,
            canWriteBooks: true,
            canInviteTeam: false,
        };

        const userData = {
            uid,
            email: emailLower,
            displayName: displayName || "",
            createdAt: FieldValue.serverTimestamp(),
            billing: {
                planId: "free",
                planLabel: "Free Plan",
                planTier: "free",
                status: "active",
                currentPeriodEnd: null, // Perpetual for free
                stripeCustomerId: null,
                entitlements: defaultEntitlements
            },
            quotaCounters: buildInitialQuotaCounters(),
        };

        console.log("!!! DEBUG: userData prepared:", JSON.stringify(userData));

        await db.collection("users").doc(uid).set(userData);

        console.log("!!! ------------------------------------------------- !!!");
        console.log(`!!! Firestore document created successfully for: ${uid}`);
        console.log("!!! ------------------------------------------------- !!!");

        logger.info(`✅ Successfully created Firestore document for user ${uid}`, { structuredData: true });
    } catch (error) {
        console.error("!!! ERROR in onUserCreate:", error);
        logger.error(`❌ Error creating user document for ${user.uid}: `, error);
    }
});
