const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const FieldValue = require("firebase-admin/firestore").FieldValue;

// Initialize Admin SDK if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

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


/**
 * Updates book details (title, cover image).
 * Propagates changes to:
 * - books/{bookId}
 * - albums/{bookId}
 * - users/{userId}/accessibleBookIds
 * - users/{userId}/accessibleAlbums
 */
exports.updateBook = onCall({ region: "us-central1", cors: true }, async (request) => {
    const { data, auth } = request;

    // Authentication required
    if (!auth) {
        throw new HttpsError(
            "unauthenticated",
            "You must be signed in to update a book."
        );
    }

    const { bookId, title, subtitle, coverImageUrl } = data;

    if (!bookId) {
        throw new HttpsError("invalid-argument", "Book ID is required.");
    }

    // At least one field to update
    if (!title && subtitle === undefined && coverImageUrl === undefined) {
        throw new HttpsError("invalid-argument", "Nothing to update.");
    }

    try {
        // 1. Fetch book to check ownership and get current members
        const bookRef = db.collection("books").doc(bookId);
        const bookSnap = await bookRef.get();

        if (!bookSnap.exists) {
            throw new HttpsError("not-found", "Book not found.");
        }

        const bookData = bookSnap.data();

        // Only owner can update book details
        if (bookData.ownerId !== auth.uid) {
            throw new HttpsError(
                "permission-denied",
                "Only the book owner can update book details."
            );
        }

        // Delete old cover if we're updating to a new one
        if (coverImageUrl !== undefined && coverImageUrl !== bookData.coverImageUrl && bookData.coverImageUrl) {
            logger.log(`🗑️ Deleting old book cover before update`);
            await deleteCoverImage(bookData.coverImageUrl);
        }

        const updates = {
            updatedAt: FieldValue.serverTimestamp(),
        };

        if (title) {
            updates.babyName = title.trim();
            updates.titleLower = title.trim().toLowerCase();
        }

        if (subtitle !== undefined) {
            updates.subtitle = subtitle ? subtitle.trim() : null;
        }

        if (coverImageUrl !== undefined) {
            updates.coverImageUrl = coverImageUrl;
        }

        // 2. Update Book Document
        await bookRef.update(updates);
        logger.log(`✅ Updated book ${bookId}`);

        // 3. Update Album Document
        const albumRef = db.collection("albums").doc(bookId);
        const albumUpdates = {
            updatedAt: FieldValue.serverTimestamp(),
        };
        if (title) albumUpdates.name = title.trim();
        if (coverImageUrl !== undefined) albumUpdates.coverImage = coverImageUrl;

        // Check if album exists before updating (it should, but safety first)
        const albumSnap = await albumRef.get();
        if (albumSnap.exists) {
            await albumRef.update(albumUpdates);
            logger.log(`✅ Updated album ${bookId}`);
        }

        // 4. Update accessible lists for ALL members
        const members = Object.keys(bookData.members || {});

        // Process all members in parallel
        await Promise.all(members.map(async (memberId) => {
            const userRef = db.collection("users").doc(memberId);
            const userSnap = await userRef.get();

            if (!userSnap.exists) return;

            const userData = userSnap.data();
            let needsUpdate = false;
            const userUpdates = {};

            // Update accessibleBookIds
            if (userData.accessibleBookIds && Array.isArray(userData.accessibleBookIds)) {
                const newBooks = userData.accessibleBookIds.map(b => {
                    if (typeof b === 'string') return b; // Skip legacy string IDs
                    if (b.bookId === bookId) {
                        needsUpdate = true;
                        return {
                            ...b,
                            title: title ? title.trim() : b.title,
                            coverImage: coverImageUrl !== undefined ? coverImageUrl : b.coverImage
                        };
                    }
                    return b;
                });
                if (needsUpdate) {
                    userUpdates.accessibleBookIds = newBooks;
                }
            }

            // Update accessibleAlbums
            if (userData.accessibleAlbums && Array.isArray(userData.accessibleAlbums)) {
                let albumsChanged = false;
                const newAlbums = userData.accessibleAlbums.map(a => {
                    if (a.id === bookId) {
                        albumsChanged = true;
                        needsUpdate = true;
                        return {
                            ...a,
                            name: title ? title.trim() : a.name,
                            coverImage: coverImageUrl !== undefined ? coverImageUrl : a.coverImage,
                            updatedAt: new Date() // Update timestamp locally for the list
                        };
                    }
                    return a;
                });
                if (albumsChanged) {
                    userUpdates.accessibleAlbums = newAlbums;
                }
            }

            if (needsUpdate) {
                userUpdates.updatedAt = FieldValue.serverTimestamp();
                await userRef.update(userUpdates);
                logger.log(`✅ Updated user ${memberId} lists`);
            }
        }));

        return { success: true };

    } catch (error) {
        logger.error("Error updating book:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "Failed to update book.", error.message);
    }
});
