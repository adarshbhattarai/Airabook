const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const FieldValue = require("firebase-admin/firestore").FieldValue;

// Ensure admin initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

/**
 * Track media usage when an asset is attached to a page
 */
exports.trackMediaUsage = onCall({ region: "us-central1" }, async (request) => {
    const { albumId, storagePath, bookId, chapterId, pageId } = request.data || {};
    const auth = request.auth;

    if (!auth?.uid) {
        throw new HttpsError("unauthenticated", "Sign in to track media usage.");
    }
    if (!albumId || !storagePath || !bookId || !chapterId || !pageId) {
        throw new HttpsError("invalid-argument", "albumId, storagePath, bookId, chapterId, and pageId are required.");
    }

    try {
        const albumRef = db.collection("albums").doc(albumId);
        const albumSnap = await albumRef.get();

        if (!albumSnap.exists) {
            throw new HttpsError("not-found", "Album not found.");
        }

        const albumData = albumSnap.data();
        const images = albumData.images || [];
        const videos = albumData.videos || [];

        // Find the media item by storagePath
        let mediaItem = null;
        let mediaType = null;
        let mediaIndex = -1;

        mediaIndex = images.findIndex(img => img.storagePath === storagePath);
        if (mediaIndex >= 0) {
            mediaItem = images[mediaIndex];
            mediaType = "images";
        } else {
            mediaIndex = videos.findIndex(vid => vid.storagePath === storagePath);
            if (mediaIndex >= 0) {
                mediaItem = videos[mediaIndex];
                mediaType = "videos";
            }
        }

        if (!mediaItem) {
            throw new HttpsError("not-found", "Media item not found in album.");
        }

        // Initialize usedIn array if it doesn't exist
        if (!mediaItem.usedIn) {
            mediaItem.usedIn = [];
        }

        // Check if this usage already exists
        const usageExists = mediaItem.usedIn.some(
            usage => usage.bookId === bookId && usage.chapterId === chapterId && usage.pageId === pageId
        );

        if (!usageExists) {
            mediaItem.usedIn.push({ bookId, chapterId, pageId });

            // Update the album document
            const mediaArray = mediaType === "images" ? images : videos;
            mediaArray[mediaIndex] = mediaItem;

            await albumRef.update({
                [mediaType]: mediaArray,
                updatedAt: FieldValue.serverTimestamp()
            });

            console.log(`✅ Tracked usage: ${storagePath} in ${bookId}/${chapterId}/${pageId}`);
        }

        return { success: true };
    } catch (error) {
        console.error("Error tracking media usage:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", `Failed to track media usage: ${error.message}`);
    }
});

/**
 * Untrack media usage when an asset is removed from a page
 */
exports.untrackMediaUsage = onCall({ region: "us-central1" }, async (request) => {
    const { albumId, storagePath, bookId, chapterId, pageId } = request.data || {};
    const auth = request.auth;

    if (!auth?.uid) {
        throw new HttpsError("unauthenticated", "Sign in to untrack media usage.");
    }
    if (!albumId || !storagePath || !bookId || !chapterId || !pageId) {
        throw new HttpsError("invalid-argument", "albumId, storagePath, bookId, chapterId, and pageId are required.");
    }

    try {
        const albumRef = db.collection("albums").doc(albumId);
        const albumSnap = await albumRef.get();

        if (!albumSnap.exists) {
            // Album might have been deleted, that's okay
            console.warn(`⚠️ Album ${albumId} not found when untracking usage`);
            return { success: true };
        }

        const albumData = albumSnap.data();
        const images = albumData.images || [];
        const videos = albumData.videos || [];

        // Find the media item by storagePath
        let mediaItem = null;
        let mediaType = null;
        let mediaIndex = -1;

        mediaIndex = images.findIndex(img => img.storagePath === storagePath);
        if (mediaIndex >= 0) {
            mediaItem = images[mediaIndex];
            mediaType = "images";
        } else {
            mediaIndex = videos.findIndex(vid => vid.storagePath === storagePath);
            if (mediaIndex >= 0) {
                mediaItem = videos[mediaIndex];
                mediaType = "videos";
            }
        }

        if (!mediaItem) {
            // Media might have been deleted, that's okay
            console.warn(`⚠️ Media item ${storagePath} not found in album ${albumId}`);
            return { success: true };
        }

        // Remove the usage reference
        if (mediaItem.usedIn) {
            mediaItem.usedIn = mediaItem.usedIn.filter(
                usage => !(usage.bookId === bookId && usage.chapterId === chapterId && usage.pageId === pageId)
            );

            // Update the album document
            const mediaArray = mediaType === "images" ? images : videos;
            mediaArray[mediaIndex] = mediaItem;

            await albumRef.update({
                [mediaType]: mediaArray,
                updatedAt: FieldValue.serverTimestamp()
            });

            console.log(`✅ Untracked usage: ${storagePath} from ${bookId}/${chapterId}/${pageId}`);
        }

        return { success: true };
    } catch (error) {
        console.error("Error untracking media usage:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", `Failed to untrack media usage: ${error.message}`);
    }
});
