const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const { buildInitialQuotaCounters, loadConfig } = require("./utils/limits");

// Admin is initialized in index.js

/**
 * Callable function to create a user document in Firestore.
 * This function is idempotent: it checks if the document exists before creating it.
 * Designed to be called from the frontend immediately after authentication.
 */
exports.createUserDoc = onCall(
    { region: "us-central1" },
    async (request) => {
        // 1. Authenticate Request
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "User must be authenticated to create a user profile."
            );
        }

        const { uid, token } = request.auth;
        const { email, name, picture } = token; // Basic info from auth token

        console.log(`👤 createUserDoc called for user: ${uid}`);

        try {
            // Initialize Firestore inside the function to ensure Admin SDK is ready
            const db = admin.firestore();
            const userRef = db.collection("users").doc(uid);

            // 2. Check for existence (Idempotency)
            const userDoc = await userRef.get();
            if (userDoc.exists) {
                console.log(`✅ User document already exists for ${uid}. Returning success.`);
                return { success: true, message: "User profile already exists." };
            }

            console.log(`📝 Creating new user document for ${uid}...`);

            // 3. Prepare User Data (Logic from onUserCreate)
            const emailLower = (email || "").toLowerCase();
            const cfg = loadConfig();

            const defaultEntitlements = {
                canReadBooks: true,
                canWriteBooks: true,
                canInviteTeam: false,
            };

            const userData = {
                uid,
                email: emailLower,
                displayName: name || "",
                photoURL: picture || null,
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

            // 4. Create Document
            await userRef.set(userData);

            console.log(`✅ Firestore document created successfully for: ${uid}`);
            logger.info(`✅ Created user profile for ${uid}`, { structuredData: true });

            return { success: true, message: "User profile created successfully." };

        } catch (error) {
            console.error("❌ Error in createUserDoc:", error);
            logger.error(`❌ Failed to create user doc for ${uid}`, error);
            throw new HttpsError("internal", "Failed to create user profile.");
        }
    }
);
