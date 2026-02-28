const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const FieldValue = require("firebase-admin/firestore").FieldValue;
const { resolveUserPlanLimits } = require("./utils/limits");

const FREE_TIER_CUSTOM_ALBUM_LIMIT = 10;

exports.createAlbum = onCall(
    { region: "us-central1", cors: true },
    async (request) => {
        const { data, auth } = request;

        logger.log("createAlbum called at:", new Date().toISOString());
        logger.log("Received data:", JSON.stringify(data, null, 2));

        // Check authentication
        if (!auth) {
            throw new HttpsError(
                "unauthenticated",
                "User must be authenticated to create an album."
            );
        }

        const { name, coverImage } = data;
        const userId = auth.uid;

        if (!name || !name.trim()) {
            throw new HttpsError("invalid-argument", "Album name is required.");
        }

        // Ensure Firebase Admin is initialized
        if (!admin.apps.length) {
            admin.initializeApp();
        }

        const db = admin.firestore();
        const nameNormalized = name.trim();

        try {
            const { tier } = await resolveUserPlanLimits(db, userId);

            if (tier === "free") {
                const ownedCustomAlbumsCountSnap = await db
                    .collection("albums")
                    .where("accessPermission.ownerId", "==", userId)
                    .where("type", "==", "custom")
                    .count()
                    .get();

                const ownedCustomAlbumsCount = Number(ownedCustomAlbumsCountSnap.data()?.count || 0);
                if (ownedCustomAlbumsCount >= FREE_TIER_CUSTOM_ALBUM_LIMIT) {
                    throw new HttpsError(
                        "resource-exhausted",
                        `Free tier allows up to ${FREE_TIER_CUSTOM_ALBUM_LIMIT} asset albums. Delete an existing album or upgrade your plan.`
                    );
                }
            }

            // Create album document
            const albumData = {
                name: nameNormalized,
                type: "custom", // 'book' or 'custom'
                bookId: null, // Custom albums are not linked to a specific book initially
                coverImage: coverImage || null,
                images: [],
                videos: [],
                accessPermission: {
                    ownerId: userId,
                    accessType: "private",
                    sharedWith: [],
                },
                mediaCount: 0,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            };

            const albumRef = await db.collection("albums").add(albumData);
            logger.log(`✅ Album created with ID: ${albumRef.id}`);

            // Update user's accessibleAlbums
            const userRef = db.collection("users").doc(userId);

            const newAlbumSummary = {
                id: albumRef.id,
                name: nameNormalized,
                type: "custom",
                coverImage: coverImage || null,
                mediaCount: 0,
                updatedAt: new Date(), // Use client-side date for immediate UI update consistency if needed, but server timestamp is better for DB
            };

            await userRef.update({
                accessibleAlbums: FieldValue.arrayUnion(newAlbumSummary),
                updatedAt: FieldValue.serverTimestamp(),
            });

            logger.log(`👤 User ${userId} updated with new album access`);

            return {
                success: true,
                album: {
                    id: albumRef.id,
                    ...newAlbumSummary
                },
                message: `Album "${nameNormalized}" created successfully!`,
            };

        } catch (error) {
            logger.error("Error creating album:", error);
            if (error instanceof HttpsError || error?.code === "resource-exhausted") {
                throw error;
            }
            throw new HttpsError("internal", "Failed to create album. Please try again.");
        }
    }
);
