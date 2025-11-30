const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const FieldValue = require("firebase-admin/firestore").FieldValue;

exports.updateAlbum = onCall(
    { region: "us-central1" },
    async (request) => {
        const { data, auth } = request;

        logger.log("updateAlbum called at:", new Date().toISOString());
        logger.log("Received data:", JSON.stringify(data, null, 2));

        // Check authentication
        if (!auth) {
            throw new HttpsError(
                "unauthenticated",
                "User must be authenticated to update an album."
            );
        }

        const { albumId, name, coverImage } = data;
        const userId = auth.uid;

        if (!albumId) {
            throw new HttpsError("invalid-argument", "Album ID is required.");
        }

        const db = admin.firestore();
        const albumRef = db.collection("albums").doc(albumId);

        try {
            // Get current album to verify ownership
            const albumDoc = await albumRef.get();
            if (!albumDoc.exists) {
                throw new HttpsError("not-found", "Album not found.");
            }

            const albumData = albumDoc.data();
            if (albumData.accessPermission.ownerId !== userId) {
                throw new HttpsError("permission-denied", "You do not have permission to update this album.");
            }

            const updates = {
                updatedAt: FieldValue.serverTimestamp(),
            };

            if (name && name.trim()) {
                updates.name = name.trim();
            }

            if (coverImage !== undefined) {
                updates.coverImage = coverImage;
            }

            await albumRef.update(updates);
            logger.log(`✅ Album ${albumId} updated`);

            // Update user's accessibleAlbums
            const userRef = db.collection("users").doc(userId);
            const userDoc = await userRef.get();

            if (userDoc.exists) {
                const userData = userDoc.data();
                const accessibleAlbums = userData.accessibleAlbums || [];

                const updatedAccessibleAlbums = accessibleAlbums.map(album => {
                    if (album.id === albumId) {
                        return {
                            ...album,
                            ...(name && { name: name.trim() }),
                            ...(coverImage !== undefined && { coverImage }),
                            updatedAt: new Date(),
                        };
                    }
                    return album;
                });

                await userRef.update({
                    accessibleAlbums: updatedAccessibleAlbums,
                    updatedAt: FieldValue.serverTimestamp(),
                });
                logger.log(`👤 User ${userId} accessibleAlbums updated`);
            }

            return {
                success: true,
                message: "Album updated successfully",
            };

        } catch (error) {
            logger.error("Error updating album:", error);
            throw new HttpsError("internal", "Failed to update album.");
        }
    }
);
