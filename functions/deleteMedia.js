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
  // Expected: userId/bookId/chapterId/pageId/media/type/filename
  const [userId, bookId] = parts;
  return { userId, bookId };
}

exports.deleteMediaAsset = onCall({ region: "us-central1" }, async (request) => {
  const { storagePath, bookId } = request.data || {};
  const auth = request.auth;

  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in to delete media.");
  }
  if (!storagePath || !bookId) {
    throw new HttpsError("invalid-argument", "storagePath and bookId are required.");
  }

  const { userId: pathUserId, bookId: pathBookId } = parseStoragePath(storagePath);
  if (pathBookId && pathBookId !== bookId) {
    throw new HttpsError("invalid-argument", "Book ID does not match storage path.");
  }

  // Verify access: owner or member
  const bookRef = db.collection("books").doc(bookId);
  const bookSnap = await bookRef.get();
  if (!bookSnap.exists) {
    throw new HttpsError("not-found", "Book not found.");
  }
  const bookData = bookSnap.data();
  const isOwner = bookData.ownerId === auth.uid;
  const isMember = !!(bookData.members && bookData.members[auth.uid]);
  if (!isOwner && !isMember) {
    throw new HttpsError("permission-denied", "You do not have access to this book.");
  }

  // Try to get size before deleting
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);
  let sizeBytes = 0;
  try {
    const [meta] = await file.getMetadata();
    sizeBytes = parseInt(meta.size || "0", 10) || 0;
  } catch (err) {
    // Continue even if metadata missing
    console.warn("⚠️ Could not read metadata before delete:", err?.message);
  }

  // Delete Storage object
  try {
    await file.delete({ ignoreNotFound: true });
  } catch (err) {
    console.error("Storage delete failed:", err);
    throw new HttpsError("internal", "Failed to delete media file.");
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

      const updates = { updatedAt: FieldValue.serverTimestamp() };
      if (imageToRemove) {
        updates.images = FieldValue.arrayRemove(imageToRemove);
      }
      if (videoToRemove) {
        updates.videos = FieldValue.arrayRemove(videoToRemove);
      }
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

      // Update accessibleAlbums for owner + members
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
  } catch (err) {
    console.error("Album cleanup failed:", err);
  }

  // Remove from pages under this book
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

  // Decrement storage usage for uploader (path user or auth user)
  const targetUid = pathUserId || auth.uid;
  if (sizeBytes > 0) {
    try {
      await addStorageUsage(db, targetUid, -sizeBytes);
    } catch (err) {
      console.error("Storage usage decrement failed:", err);
    }
  }

  return { success: true };
});

/**
 * Delete an entire album (by bookId), removing all media, page references,
 * album doc, accessibleAlbums entries, and decrementing storage usage.
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

  const bookRef = db.collection("books").doc(bookId);
  const bookSnap = await bookRef.get();
  const bookData = bookSnap.exists ? bookSnap.data() : null;
  if (bookData) {
    const isOwner = bookData.ownerId === auth.uid;
    const isMember = !!(bookData.members && bookData.members[auth.uid]);
    if (!isOwner && !isMember) {
      throw new HttpsError("permission-denied", "You do not have access to this book.");
    }
  } else {
    // Book missing; proceed with album cleanup as a stale artifact
    console.warn(`Book ${bookId} not found; proceeding to delete album as stale.`);
  }

  const albumRef = db.collection("albums").doc(bookId);
  const albumSnap = await albumRef.get();
  if (!albumSnap.exists) {
    throw new HttpsError("not-found", "Album not found.");
  }
  const album = albumSnap.data() || {};
  const mediaItems = [...(album.images || []), ...(album.videos || [])];
  const storagePaths = mediaItems
    .map((m) => (typeof m === "string" ? null : m.storagePath))
    .filter(Boolean);

  const bucket = admin.storage().bucket();
  const sizeByUser = {};

  const resolveOwnerUid = (pathUserId) => {
    if (pathUserId && pathUserId !== "media") return pathUserId;
    if (bookData?.ownerId) return bookData.ownerId;
    if (album?.accessPermission?.ownerId) return album.accessPermission.ownerId;
    return auth.uid;
  };

  // Delete storage files and collect sizes per uploader (parsed from storage path)
  for (const sp of storagePaths) {
    const pathUserId = sp.split("/")[0];
    const targetUid = resolveOwnerUid(pathUserId);
    try {
      const file = bucket.file(sp);
      const [meta] = await file.getMetadata();
      const sizeBytes = parseInt(meta.size || "0", 10) || 0;
      if (sizeBytes > 0) {
        sizeByUser[targetUid] = (sizeByUser[targetUid] || 0) + sizeBytes;
      }
      await file.delete({ ignoreNotFound: true });
    } catch (err) {
      console.error(`⚠️ Failed to delete file ${sp}:`, err?.message || err);
    }
  }

  // Remove media references from all pages in the book
  try {
    const chaptersSnap = await bookRef.collection("chapters").get();
    for (const chap of chaptersSnap.docs) {
      const pagesSnap = await chap.ref.collection("pages").get();
      for (const pageDoc of pagesSnap.docs) {
        const mediaArr = pageDoc.data()?.media || [];
        const filtered = mediaArr.filter((m) => !storagePaths.includes(m.storagePath));
        if (filtered.length !== mediaArr.length) {
          await pageDoc.ref.update({ media: filtered });
        }
      }
    }
  } catch (err) {
    console.error("⚠️ Failed to clean page media for album delete:", err);
  }

  // Delete album document
  try {
    await albumRef.delete();
  } catch (err) {
    console.error("⚠️ Failed to delete album doc:", err);
  }

  // Update accessibleAlbums for owner + members (fallbacks if book missing)
  const userIds = new Set();
  if (bookData) {
    userIds.add(bookData.ownerId);
    Object.keys(bookData.members || {}).forEach((uid) => userIds.add(uid));
  } else {
    // Fallback: use album accessPermission owner or the caller
    if (album && album.accessPermission?.ownerId) userIds.add(album.accessPermission.ownerId);
    if (auth.uid) userIds.add(auth.uid);
  }
  await Promise.all(
    Array.from(userIds).map(async (uid) => {
      const userRef = db.collection("users").doc(uid);
      const snap = await userRef.get();
      if (!snap.exists) return;
      const data = snap.data() || {};
      const accessibleAlbums = (data.accessibleAlbums || []).filter((a) => a.id !== bookId);
      try {
        await userRef.update({ accessibleAlbums });
      } catch (err) {
        console.error(`⚠️ Failed updating accessibleAlbums for ${uid}:`, err);
      }
    })
  );

  // Decrement storage usage for each uploader
  await Promise.all(
    Object.entries(sizeByUser).map(async ([uid, size]) => {
      try {
        await addStorageUsage(db, uid, -size);
      } catch (err) {
        console.error(`⚠️ Failed to decrement storage for ${uid}:`, err);
      }
    })
  );

  return { success: true, deletedFiles: storagePaths.length };
});
