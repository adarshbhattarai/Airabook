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
    if (!isOwner) {
      throw new HttpsError("permission-denied", "Only the book owner can delete book media files.");
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
  let coverSizeCounted = 0;
  let albumDirSizeCounted = 0;
  let deletedCoverPath = null;
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
    if (!coverImageUrl) return { size: 0, coverPath: null };
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
        return { size, coverPath };
      }
    } catch (err) {
      console.warn(`⚠️ Could not delete cover image:`, err?.message);
    }
    return { size: 0, coverPath: null };
  }

  // Step 2: Delete album (standalone only - book does not exist)
  if (albumData) {
    console.log(`📸 Deleting album ${bookId}...`);

    // Delete album cover image (cover images are free, don't count towards storage)
    if (albumData.coverImage) {
      const { size: coverSize, coverPath } = await deleteCoverImage(albumData.coverImage);
      deletedCoverPath = coverPath || null;

      // IMPORTANT:
      // - Covers uploaded via the "Create album" flow live under `${uid}/covers/...` and are intentionally "free".
      // - But album coverImage can also point at a real media file under the album directory (e.g. /_album_/_album_/media/...),
      //   which *is* counted during upload. If we delete it here, we must also decrement quota counters for it,
      //   otherwise storageBytesUsed will drift high.
      const isFreeCover = !!coverPath && coverPath.includes('/covers/');
      if (!isFreeCover && coverSize > 0) {
        totalStorageSize += coverSize;
        coverSizeCounted += coverSize;
        console.log(`🧮 Including cover bytes in storage decrement: +${coverSize} bytes (coverPath=${coverPath})`);
      } else {
        console.log(
          `ℹ️  Cover deletion not counted towards storage usage: ` +
          `isFreeCover=${isFreeCover} coverSize=${coverSize} coverPath=${coverPath || 'null'}`
        );
      }
    }

    // Delete album directory
    const albumDirPrefix = `${ownerId}/${bookId}/_album_/`;
    const albumDirSize = await calculateDirectorySize(albumDirPrefix);
    totalStorageSize += albumDirSize;
    albumDirSizeCounted += albumDirSize;
    console.log(`🧮 Album directory size (post-cover delete): ${albumDirSize} bytes (prefix=${albumDirPrefix})`);
    const deletedInPrefix = await deleteDirectory(albumDirPrefix);

    const coverDeleted = !!deletedCoverPath;
    const totalDeletedObjects = deletedInPrefix + (coverDeleted ? 1 : 0);
    console.log(
      `🧾 Album storage deletion summary: ` +
      `coverDeleted=${coverDeleted} deletedInPrefix=${deletedInPrefix} totalDeletedObjects≈${totalDeletedObjects} ` +
      `coverPath=${deletedCoverPath || 'null'}`
    );

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
      const usage = await addStorageUsage(db, ownerId, -totalStorageSize);
      console.log(
        `✅ Storage usage decremented for album delete: ` +
        `delta=-${totalStorageSize}B (coverCounted=${coverSizeCounted}B dirCounted=${albumDirSizeCounted}B) ` +
        `before=${usage.before}B after=${usage.after}B user=${ownerId} albumId=${bookId}`
      );
    } catch (err) {
      console.error(`⚠️ Failed to decrement storage for ${ownerId}:`, err?.message);
    }
  } else {
    console.log(
      `ℹ️  No storage decrement needed for album delete: ` +
      `totalStorageSize=0B (coverCounted=${coverSizeCounted}B dirCounted=${albumDirSizeCounted}B) albumId=${bookId}`
    );
  }

  return {
    success: true,
    deletedStorage: totalStorageSize,
    deletedBook: !!bookData,
    deletedAlbum: !!albumData,
  };
});
