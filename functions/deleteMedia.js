const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const FieldValue = require("firebase-admin/firestore").FieldValue;
const { addStorageUsage } = require("./utils/limits");

// Ensure admin initialized
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

function parseStoragePath(path) {
  if (!path) return {};
  const parts = path.split("/");
  // Expected patterns:
  // Book media: userId/bookId/chapterId/pageId/media/type/filename
  // Album-only media: userId/bookId/_album_/_album_/media/type/filename
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
  const { userId: pathUserId } = parseStoragePath(storagePath);

  // Try to get size before deleting
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);
  let sizeBytes = 0;
  try {
    const [meta] = await file.getMetadata();
    sizeBytes = parseInt(meta.size || "0", 10) || 0;
  } catch (err) {
    console.warn("⚠️ Could not read metadata before delete:", err?.message);
  }

  // Delete Storage object
  try {
    await file.delete({ ignoreNotFound: true });
    console.log(`🗑️ Deleted file: ${storagePath}`);
  } catch (err) {
    console.error("Storage delete failed:", err);
    throw new Error("Failed to delete media file.");
  }

  // Remove from album document
  try {
    const albumRef = db.collection("albums").doc(bookId);
    const albumSnap = await albumRef.get();
    if (albumSnap.exists) {
      const album = albumSnap.data() || {};
      const images = album.images || [];
      const videos = album.videos || [];

      const matchFn = (item) => {
        const sp = typeof item === "string" ? null : item.storagePath;
        return sp === storagePath;
      };

      const imageToRemove = images.find(matchFn);
      const videoToRemove = videos.find(matchFn);

      // Only update album if we found a matching item
      if (imageToRemove || videoToRemove) {
        const updates = { updatedAt: FieldValue.serverTimestamp() };
        if (imageToRemove) {
          updates.images = FieldValue.arrayRemove(imageToRemove);
        }
        if (videoToRemove) {
          updates.videos = FieldValue.arrayRemove(videoToRemove);
        }

        // Only decrement count if we actually found and removed something
        const nextCount = Math.max(0, (album.mediaCount || 0) - 1);
        updates.mediaCount = nextCount;
        await albumRef.update(updates);

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
        }

        // Update accessibleAlbums for owner + members (if bookData provided)
        if (bookData) {
          const userIds = new Set([bookData.ownerId, ...Object.keys(bookData.members || {})].filter(Boolean));
          await Promise.all(
            Array.from(userIds).map(async (uid) => {
              const userRef = db.collection("users").doc(uid);
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
        }
      } else {
        console.warn(`⚠️ No matching media item found in album for storagePath: ${storagePath}`);
      }
    }
  } catch (err) {
    console.error("Album cleanup failed:", err);
  }

  // Decrement storage usage for uploader (if not skipped)
  if (!skipStorageUsage && sizeBytes > 0) {
    const targetUid = pathUserId || bookData?.ownerId;
    if (targetUid) {
      try {
        await addStorageUsage(db, targetUid, -sizeBytes);
      } catch (err) {
        console.error("Storage usage decrement failed:", err);
      }
    }
  }

  return { success: true, sizeBytes };
}

// Export the internal helper for use in other modules (e.g., mediaProcessor)
exports.deleteMediaInternal = deleteMediaInternal;


exports.deleteMediaAsset = onCall({ region: "us-central1" }, async (request) => {
  const { storagePath, bookId } = request.data || {};
  const auth = request.auth;

  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in to delete media.");
  }
  if (!storagePath || !bookId) {
    throw new HttpsError("invalid-argument", "storagePath and bookId are required.");
  }

  const { userId: pathUserId, bookId: pathBookId, isAlbumOnly } = parseStoragePath(storagePath);
  if (pathBookId && pathBookId !== bookId) {
    throw new HttpsError("invalid-argument", "Book ID does not match storage path.");
  }

  let bookData = null;
  let bookRef = null;

  // Verify access based on media type
  if (isAlbumOnly) {
    // Album-only media: verify album access
    const albumRef = db.collection("albums").doc(bookId);
    const albumSnap = await albumRef.get();
    if (!albumSnap.exists) {
      throw new HttpsError("not-found", "Album not found.");
    }
    const albumData = albumSnap.data();
    const albumOwnerId = albumData.accessPermission?.ownerId || auth.uid;
    const albumMembers = albumData.accessPermission?.members || {};
    const hasAlbumAccess = (albumOwnerId === auth.uid) || !!albumMembers[auth.uid];
    if (!hasAlbumAccess) {
      throw new HttpsError("permission-denied", "You do not have access to this album.");
    }
    // Create mock bookData for album operations
    bookData = {
      ownerId: albumOwnerId,
      members: albumMembers,
    };
  } else {
    // Book media: verify book access
    bookRef = db.collection("books").doc(bookId);
    const bookSnap = await bookRef.get();
    if (!bookSnap.exists) {
      throw new HttpsError("not-found", "Book not found.");
    }
    bookData = bookSnap.data();
    const isOwner = bookData.ownerId === auth.uid;
    const isMember = !!(bookData.members && bookData.members[auth.uid]);
    if (!isOwner && !isMember) {
      throw new HttpsError("permission-denied", "You do not have access to this book.");
    }
  }

  // Use the internal helper to perform deletion
  await deleteMediaInternal({
    storagePath,
    bookId,
    bookData,
    skipStorageUsage: false,
  });

  // Remove from pages under this book (only for book media, not album-only)
  if (bookRef) {
    try {
      const chaptersSnap = await bookRef.collection("chapters").get();
      for (const chap of chaptersSnap.docs) {
        const pagesSnap = await chap.ref.collection("pages").get();
        for (const pageDoc of pagesSnap.docs) {
          const pageData = pageDoc.data() || {};
          const mediaArr = pageData.media || [];
          const filtered = mediaArr.filter((m) => m.storagePath !== storagePath);
          if (filtered.length !== mediaArr.length) {
            await pageDoc.ref.update({ media: filtered });
          }
        }
      }
    } catch (err) {
      console.error("Page media cleanup failed:", err);
    }
  }

  return { success: true };
});

/**
 * Delete an entire album (by bookId), removing:
 * - Book cover image (if book exists)
 * - Album cover image (if album exists)
 * - Entire book/album directory
 * - Book and album documents
 * - User accessibleAlbums entries
 * - Storage usage
 */
exports.deleteAlbumAssets = onCall({ region: "us-central1" }, async (request) => {
  const { bookId } = request.data || {};
  const auth = request.auth;

  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in to delete an album.");
  }
  if (!bookId) {
    throw new HttpsError("invalid-argument", "bookId is required.");
  }

  const bucket = admin.storage().bucket();
  let totalStorageSize = 0;
  const userIds = new Set();

  // Step 1: Fetch book and album documents
  const bookRef = db.collection("books").doc(bookId);
  const albumRef = db.collection("albums").doc(bookId);

  const [bookSnap, albumSnap] = await Promise.all([
    bookRef.get(),
    albumRef.get(),
  ]);

  const bookData = bookSnap.exists ? bookSnap.data() : null;
  const albumData = albumSnap.exists ? albumSnap.data() : null;

  // Verify access
  if (bookData) {
    const isOwner = bookData.ownerId === auth.uid;
    //const isMember = !!(bookData.members && bookData.members[auth.uid]);
    if (!isOwner) {
      throw new HttpsError("permission-denied", "You do not have access to this book.");
    }
    userIds.add(bookData.ownerId);
    Object.keys(bookData.members || {}).forEach((uid) => userIds.add(uid));
  } else if (albumData) {
    // No book, but album exists - check album permissions
    const albumOwnerId = albumData.accessPermission?.ownerId || auth.uid;
    const albumMembers = albumData.accessPermission?.members || {};
    const hasAlbumAccess = (albumOwnerId === auth.uid) || !!albumMembers[auth.uid];
    if (!hasAlbumAccess) {
      throw new HttpsError("permission-denied", "You do not have access to this album.");
    }
    userIds.add(albumOwnerId);
    Object.keys(albumMembers).forEach((uid) => userIds.add(uid));
  } else {
    throw new HttpsError("not-found", "Neither book nor album found.");
  }

  // Determine owner for storage paths
  const ownerId = bookData?.ownerId || albumData?.accessPermission?.ownerId || auth.uid;

  // Helper function to calculate directory size
  async function calculateDirectorySize(prefix) {
    let size = 0;
    try {
      const [files] = await bucket.getFiles({ prefix });
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        size += parseInt(metadata.size || "0", 10);
      }
    } catch (err) {
      console.warn(`⚠️ Could not calculate size for ${prefix}:`, err?.message);
    }
    return size;
  }

  // Helper function to delete directory
  async function deleteDirectory(prefix) {
    try {
      const [files] = await bucket.getFiles({ prefix });
      console.log(`🗑️ Deleting ${files.length} files from ${prefix}`);
      await Promise.all(
        files.map((file) => file.delete({ ignoreNotFound: true }).catch((err) => {
          console.error(`⚠️ Failed to delete ${file.name}:`, err?.message);
        }))
      );
      return files.length;
    } catch (err) {
      console.error(`⚠️ Failed to delete directory ${prefix}:`, err?.message);
      return 0;
    }
  }

  // Helper function to delete cover image
  async function deleteCoverImage(coverImageUrl) {
    if (!coverImageUrl) return 0;
    try {
      // Extract storage path from URL
      // URL format: https://storage.googleapis.com/bucket/path or https://firebasestorage.googleapis.com/...
      const urlMatch = coverImageUrl.match(/\/o\/(.+?)\?/) || coverImageUrl.match(/\.com\/([^?]+)/);
      if (urlMatch) {
        const coverPath = decodeURIComponent(urlMatch[1]);
        const coverFile = bucket.file(coverPath);
        const [metadata] = await coverFile.getMetadata();
        const size = parseInt(metadata.size || "0", 10);
        await coverFile.delete({ ignoreNotFound: true });
        console.log(`🗑️ Deleted cover image: ${coverPath} (${size} bytes)`);
        return size;
      }
    } catch (err) {
      console.warn(`⚠️ Could not delete cover image:`, err?.message);
    }
    return 0;
  }

  // Step 2: Delete book if it exists
  if (bookData) {
    console.log(`📚 Deleting book ${bookId}...`);

    // Delete book cover image (cover images are free, don't count towards storage)
    if (bookData.coverImage) {
      await deleteCoverImage(bookData.coverImage);
    }

    // Calculate and delete entire book directory
    const bookDirPrefix = `${ownerId}/${bookId}/`;
    const bookDirSize = await calculateDirectorySize(bookDirPrefix);
    totalStorageSize += bookDirSize;
    await deleteDirectory(bookDirPrefix);

    // Delete book document and its subcollections
    try {
      const chaptersSnap = await bookRef.collection("chapters").get();
      for (const chapterDoc of chaptersSnap.docs) {
        const pagesSnap = await chapterDoc.ref.collection("pages").get();
        for (const pageDoc of pagesSnap.docs) {
          await pageDoc.ref.delete();
        }
        await chapterDoc.ref.delete();
      }
      await bookRef.delete();
      console.log(`✅ Deleted book document and subcollections`);
    } catch (err) {
      console.error(`⚠️ Failed to delete book document:`, err?.message);
    }
  }

  // Step 3: Delete album if it exists
  if (albumData) {
    console.log(`📸 Deleting album ${bookId}...`);

    // Delete album cover image (cover images are free, don't count towards storage)
    if (albumData.coverImage) {
      await deleteCoverImage(albumData.coverImage);
    }

    // Delete album directory (if not already deleted by book deletion)
    const albumDirPrefix = `${ownerId}/${bookId}/_album_/`;
    const albumDirSize = await calculateDirectorySize(albumDirPrefix);
    totalStorageSize += albumDirSize;
    await deleteDirectory(albumDirPrefix);

    // Delete album document
    try {
      await albumRef.delete();
      console.log(`✅ Deleted album document`);
    } catch (err) {
      console.error(`⚠️ Failed to delete album document:`, err?.message);
    }
  }

  // Step 4: Update accessibleAlbums for all users
  await Promise.all(
    Array.from(userIds).map(async (uid) => {
      try {
        const userRef = db.collection("users").doc(uid);
        const userSnap = await userRef.get();
        if (!userSnap.exists) return;

        const userData = userSnap.data() || {};
        const accessibleAlbums = (userData.accessibleAlbums || []).filter((a) => a.id !== bookId);
        await userRef.update({ accessibleAlbums });
        console.log(`✅ Updated accessibleAlbums for user ${uid}`);
      } catch (err) {
        console.error(`⚠️ Failed updating accessibleAlbums for ${uid}:`, err?.message);
      }
    })
  );

  // Step 5: Decrement storage usage for owner
  if (totalStorageSize > 0) {
    try {
      await addStorageUsage(db, ownerId, -totalStorageSize);
      console.log(`✅ Decremented ${totalStorageSize} bytes from user ${ownerId}`);
    } catch (err) {
      console.error(`⚠️ Failed to decrement storage for ${ownerId}:`, err?.message);
    }
  }

  return {
    success: true,
    deletedStorage: totalStorageSize,
    deletedBook: !!bookData,
    deletedAlbum: !!albumData,
  };
});

