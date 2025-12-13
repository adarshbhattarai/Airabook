const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

exports.recalculateStorageUsage = onCall({ region: "us-central1" }, async (request) => {
    const { auth, data } = request;

    // 1. Authentication & Admin Check
    if (!auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    // Check for admin claim
    const isAdmin = auth.token.admin === true;
    // OR check if email is in a hardcoded list (optional fallback if claims aren't set up yet)
    // const GOD_USERS = ["your-email@example.com"];
    // const isGod = GOD_USERS.includes(auth.token.email);

    if (!isAdmin) {
        throw new HttpsError("permission-denied", "Only administrators can recalculate storage usage.");
    }

    // 2. Validate Target User
    const targetUserId = data.targetUserId;
    if (!targetUserId) {
        throw new HttpsError("invalid-argument", "The 'targetUserId' argument is required.");
    }

    const userId = targetUserId;
    logger.info(`⚖️ Admin ${auth.uid} recalculating storage for target user: ${userId} `);

    try {
        const bucket = admin.storage().bucket();
        // 3. List files with the User's prefix
        const [files] = await bucket.getFiles({ prefix: `${userId}/` });

        // 4. Calculate total size
        let totalBytes = 0;
        for (const file of files) {
            const size = parseInt(file.metadata.size, 10);
            if (!isNaN(size)) {
                totalBytes += size;
            }
        }

        const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
        logger.info(`✅ Recalculation complete for ${userId}. Files: ${files.length}, Total: ${totalBytes} bytes (${totalMB} MB)`);

        // 5. Update Firestore Quota Counter
        await admin.firestore().collection("users").doc(userId).update({
            "quotaCounters.storageBytesUsed": totalBytes
        });

        return {
            success: true,
            targetUserId,
            totalBytes,
            totalMB,
            fileCount: files.length,
            message: `Storage usage updated for user ${userId}: ${totalMB} MB across ${files.length} files.`
        };

    } catch (error) {
        logger.error("❌ Error recalculating storage:", error);
        throw new HttpsError("internal", "Failed to recalculate storage usage.", error.message);
    }
});
