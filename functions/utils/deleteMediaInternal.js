const admin = require("firebase-admin");
const FieldValue = require("firebase-admin/firestore").FieldValue;
const { addStorageUsage } = require("./limits");

function parseStoragePath(path) {
  if (!path) return {};
  const parts = path.split("/");
  const [userId, bookId] = parts;
  const isAlbumOnly = parts.includes("_album_") && parts.join("/").includes("/_album_/_album_/media/");
  return { userId, bookId, isAlbumOnly };
}

/**
 * Internal helper to delete media file and update album
 * @param {Object} params - Parameters
 * @param {string} params.storagePath - Storage path of the file
 * @param {string} params.bookId - Book/Album ID
 * @param {Object} params.bookData - Book data (optional, for updating members)
 * @param {boolean} params.skipStorageUsage - Skip storage usage update (default: false)
 * @returns {Promise<{success: boolean, sizeBytes: number}>}
 */
async function deleteMediaInternal({ storagePath, bookId, bookData = null, skipStorageUsage = false }) {
  console.log(`🔍 [deleteMediaInternal] Starting deletion for: ${storagePath}`);
  console.log(`🔍 [deleteMediaInternal] BookId: ${bookId}, skipStorageUsage: ${skipStorageUsage}`);

  const { userId: pathUserId } = parseStoragePath(storagePath);

  // Try to get size before deleting
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);
  let sizeBytes = 0;
  try {
    const [meta] = await file.getMetadata();
    sizeBytes = parseInt(meta.size || "0", 10) || 0;
    console.log(`🔍 [deleteMediaInternal] File size: ${sizeBytes} bytes`);
  } catch (err) {
    console.warn("⚠️ Could not read metadata before delete:", err?.message);
  }

  // Delete Storage object
  console.log(`🔍 [deleteMediaInternal] About to delete from storage...`);
  try {
    await file.delete({ ignoreNotFound: true });
    console.log(`✅ [deleteMediaInternal] File deleted from storage: ${storagePath}`);
  } catch (err) {
    console.error("❌ [deleteMediaInternal] Storage delete failed:", err);
    throw new Error("Failed to delete media file.");
  }

  // Remove from album document
  console.log(`🔍 [deleteMediaInternal] About to update album ${bookId}...`);
  try {
    const albumRef = admin.firestore().collection("albums").doc(bookId);
    const albumSnap = await albumRef.get();
    if (albumSnap.exists) {
      const album = albumSnap.data() || {};
      const images = album.images || [];
      const videos = album.videos || [];

      console.log(`🔍 [deleteMediaInternal] Current album state - images: ${images.length}, videos: ${videos.length}`);

      const matchFn = (item) => {
        const sp = typeof item === "string" ? null : item.storagePath;
        return sp === storagePath;
      };

      const imageToRemove = images.find(matchFn);
      const videoToRemove = videos.find(matchFn);

      console.log(`🔍 [deleteMediaInternal] Found imageToRemove: ${!!imageToRemove}, videoToRemove: ${!!videoToRemove}`);

      // Only update album if we found a matching item
      if (imageToRemove || videoToRemove) {
        const updates = { updatedAt: FieldValue.serverTimestamp() };
        if (imageToRemove) {
          updates.images = FieldValue.arrayRemove(imageToRemove);
          console.log(`🔍 [deleteMediaInternal] Removing image:`, imageToRemove);
        }
        if (videoToRemove) {
          updates.videos = FieldValue.arrayRemove(videoToRemove);
          console.log(`🔍 [deleteMediaInternal] Removing video:`, videoToRemove);
        }

        // Only decrement count if we actually found and removed something
        const nextCount = Math.max(0, (album.mediaCount || 0) - 1);
        updates.mediaCount = nextCount;

        console.log(`🔍 [deleteMediaInternal] Updating album - new mediaCount: ${nextCount}`);
        await albumRef.update(updates);
        console.log(`✅ [deleteMediaInternal] Album updated successfully`);

        // Refresh album to update accessibleAlbums later
        const afterSnap = await albumRef.get();
        const after = afterSnap.data() || {};
        const remainingImages = after.images || [];
        const remainingVideos = after.videos || [];
        const newCoverImage =
          after.coverImage && after.coverImage.includes(storagePath)
            ? (remainingImages[0]?.url || null)
            : after.coverImage || (remainingImages[0]?.url || null);

        if (newCoverImage && newCoverImage !== after.coverImage) {
          await albumRef.update({ coverImage: newCoverImage });
          console.log(`✅ [deleteMediaInternal] Updated cover image`);
        }

        // Update accessibleAlbums for owner + members (if bookData provided)
        if (bookData) {
          const userIds = new Set([bookData.ownerId, ...Object.keys(bookData.members || {})].filter(Boolean));
          console.log(`🔍 [deleteMediaInternal] Updating accessibleAlbums for ${userIds.size} users`);
          await Promise.all(
            Array.from(userIds).map(async (uid) => {
              const userRef = admin.firestore().collection("users").doc(uid);
              const snap = await userRef.get();
              if (!snap.exists) return;
              const data = snap.data() || {};
              const accessibleAlbums = data.accessibleAlbums || [];
              const idx = accessibleAlbums.findIndex((a) => a.id === bookId);
              if (idx >= 0) {
                accessibleAlbums[idx] = {
                  ...accessibleAlbums[idx],
                  coverImage: newCoverImage || accessibleAlbums[idx].coverImage || null,
                  mediaCount: nextCount,
                  updatedAt: new Date(),
                };
                await userRef.update({ accessibleAlbums });
              }
            })
          );
          console.log(`✅ [deleteMediaInternal] Updated accessibleAlbums for all users`);
        }
      } else {
        console.warn(`⚠️ [deleteMediaInternal] No matching media item found in album for storagePath: ${storagePath}`);
      }
    } else {
      console.warn(`⚠️ [deleteMediaInternal] Album ${bookId} not found`);
    }
  } catch (err) {
    console.error("❌ [deleteMediaInternal] Album cleanup failed:", err);
  }

  // Decrement storage usage for uploader (if not skipped)
  if (!skipStorageUsage && sizeBytes > 0) {
    const targetUid = pathUserId || bookData?.ownerId;
    if (targetUid) {
      console.log(`🔍 [deleteMediaInternal] Decrementing ${sizeBytes} bytes for user ${targetUid}`);
      try {
        await addStorageUsage(admin.firestore(), targetUid, -sizeBytes);
        console.log(`✅ [deleteMediaInternal] Storage usage decremented`);
      } catch (err) {
        console.error("❌ [deleteMediaInternal] Storage usage decrement failed:", err);
      }
    }
  } else {
    console.log(`ℹ️  [deleteMediaInternal] Skipping storage usage update (skipStorageUsage: ${skipStorageUsage}, sizeBytes: ${sizeBytes})`);
  }

  console.log(`✅ [deleteMediaInternal] Deletion complete for: ${storagePath}`);
  return { success: true, sizeBytes };
}

module.exports = { deleteMediaInternal, parseStoragePath };
