const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const FieldValue = require("firebase-admin/firestore").FieldValue;
const { addStorageUsage } = require("./utils/limits");
const { deleteMediaInternal, parseStoragePath } = require("./utils/deleteMediaInternal");

// Ensure admin initialized
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

exports.deleteMediaAsset = onCall({ region: "us-central1", cors: true }, async (request) => {
  const { storagePath, bookId } = request.data || {};
  const auth = request.auth;

  console.log(`🔍 [deleteMediaAsset] Called for storagePath: ${storagePath}, bookId: ${bookId}`);

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

  // Verify access based on media type
  if (isAlbumOnly) {
    console.log(`🔍 [deleteMediaAsset] Verifying album access for ${bookId}`);
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
    console.log(`✅ [deleteMediaAsset] Album access verified`);
  } else {
    console.log(`🔍 [deleteMediaAsset] Verifying book access for ${bookId}`);
    // Book media: verify book access
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
    console.log(`✅ [deleteMediaAsset] Book access verified`);
  }

  // ONLY delete from storage - let onMediaDelete trigger handle all cleanup
  console.log(`🔍 [deleteMediaAsset] Deleting file from storage: ${storagePath}`);
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  try {
    await file.delete({ ignoreNotFound: true });
    console.log(`✅ [deleteMediaAsset] File deleted from storage successfully`);
    console.log(`ℹ️  [deleteMediaAsset] onMediaDelete trigger will handle album cleanup, page references, and storage usage`);
  } catch (err) {
    console.error("❌ [deleteMediaAsset] Storage delete failed:", err);
    throw new HttpsError("internal", "Failed to delete media file.");
  }

  return { success: true };
});

/**
 * Delete an entire album (by bookId), removing:
 * - Album cover image (if album exists)
 * - Entire album directory
 * - Album document
 * - User accessibleAlbums entries
 * - Storage usage
 *
 * Important: Albums that are created from a book share the same ID as the book.
 * If a book document exists for this ID, we do NOT allow deleting the album here.
 * Book deletion must be handled separately.
 */
exports.deleteAlbumAssets = onCall({ region: "us-central1", cors: true }, async (request) => {
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

  // If the book exists, do NOT allow album deletion from here.
  // (This album is book-derived and must be removed via book deletion flow.)
  if (bookData) {
    const isOwner = bookData.ownerId === auth.uid;
    if (!isOwner) {
      throw new HttpsError("permission-denied", "You do not have access to this book.");
    }
    throw new HttpsError(
      "failed-precondition",
      "Album cannot be deleted because its book still exists. Please delete the book first, then delete the album."
    );
  }

  // Verify album access (only standalone albums can be deleted here)
  if (albumData) {
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
    throw new HttpsError("not-found", "Album not found.");
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

  // Step 2: Delete album (standalone only - book does not exist)
  if (albumData) {
    console.log(`📸 Deleting album ${bookId}...`);

    // Delete album cover image (cover images are free, don't count towards storage)
    if (albumData.coverImage) {
      await deleteCoverImage(albumData.coverImage);
    }

    // Delete album directory
    const albumDirPrefix = `${ownerId}/${bookId}/_album_/`;
    const albumDirSize = await calculateDirectorySize(albumDirPrefix);
    totalStorageSize += albumDirSize;
    await deleteDirectory(albumDirPrefix);

    // Clean up pages where album media is used (before deleting album document)
    try {
      const images = albumData.images || [];
      const videos = albumData.videos || [];
      const allMedia = [...images, ...videos];

      for (const mediaItem of allMedia) {
        if (mediaItem.usedIn && mediaItem.usedIn.length > 0) {
          console.log(`📋 Cleaning up ${mediaItem.usedIn.length} page(s) for ${mediaItem.storagePath}`);

          for (const usage of mediaItem.usedIn) {
            try {
              const pageRef = db
                .collection("books")
                .doc(usage.bookId)
                .collection("chapters")
                .doc(usage.chapterId)
                .collection("pages")
                .doc(usage.pageId);

              const pageSnap = await pageRef.get();
              if (pageSnap.exists) {
                const pageData = pageSnap.data() || {};
                const mediaArr = pageData.media || [];
                const filtered = mediaArr.filter((m) => m.storagePath !== mediaItem.storagePath);

                if (filtered.length !== mediaArr.length) {
                  await pageRef.update({ media: filtered });
                  console.log(`✅ Removed ${mediaItem.storagePath} from page ${usage.pageId}`);
                }
              }
            } catch (err) {
              console.error(`⚠️ Failed to clean up page ${usage.pageId}:`, err);
            }
          }
        }
      }
    } catch (err) {
      console.error(`⚠️ Failed to clean up pages for album:`, err);
    }

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
