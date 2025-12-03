const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const FieldValue = require("firebase-admin/firestore").FieldValue;

/**
 * Helper function to delete a cover image from storage
 */
async function deleteCoverImage(coverImageUrl) {
    if (!coverImageUrl) return;
    try {
        const bucket = admin.storage().bucket();
        // Extract storage path from URL
        const urlMatch = coverImageUrl.match(/\/o\/(.+?)\?/) || coverImageUrl.match(/\.com\/([^?]+)/);
        if (urlMatch) {
            const coverPath = decodeURIComponent(urlMatch[1]);
            const coverFile = bucket.file(coverPath);
            await coverFile.delete({ ignoreNotFound: true });
            logger.log(`🗑️ Deleted old cover image: ${coverPath}`);
        }
    } catch (err) {
        logger.warn(`⚠️ Could not delete old cover image:`, err?.message);
        // Don't fail the update if cover deletion fails
    }
}

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

            // Delete old cover if we're updating to a new one
            if (coverImage !== undefined && coverImage !== albumData.coverImage && albumData.coverImage) {
                logger.log(`🗑️ Deleting old album cover before update`);
                await deleteCoverImage(albumData.coverImage);
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

            // If this album is linked to a book, also update the book document
            if (albumData.type === "book" && albumData.bookId) {
                try {
                    const bookRef = db.collection("books").doc(albumData.bookId);
                    const bookSnap = await bookRef.get();

                    if (bookSnap.exists) {
                        const bookUpdates = {};

                        if (name && name.trim()) {
                            bookUpdates.babyName = name.trim();
                            bookUpdates.titleLower = name.trim().toLowerCase();
                        }

                        if (coverImage !== undefined) {
                            bookUpdates.coverImageUrl = coverImage;
                        }

                        if (Object.keys(bookUpdates).length > 0) {
                            bookUpdates.updatedAt = FieldValue.serverTimestamp();
                            await bookRef.update(bookUpdates);
                            logger.log(`✅ Synced changes to linked book ${albumData.bookId}`);
                        }
                    }
                } catch (bookError) {
                    logger.warn(`⚠️ Failed to update linked book:`, bookError?.message);
                    // Don't fail the whole operation if book update fails
                }
            }

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
