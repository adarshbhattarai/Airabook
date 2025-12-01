const { onObjectFinalized, onObjectDeleted } = require("firebase-functions/v2/storage");
const admin = require("firebase-admin");
const FieldValue = require("firebase-admin/firestore").FieldValue;
const { addStorageUsage } = require("./utils/limits");

// Ensure Firebase Admin is initialized (may be initialized by index.js)
if (!admin.apps.length) {
  try {
    // Get current project ID dynamically from environment
    const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'airabook-dev';
    const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;

    admin.initializeApp({
      storageBucket: STORAGE_BUCKET,
    });
    console.log(`🔥 Firebase Admin initialized in mediaProcessor.js for project: ${PROJECT_ID}`);
  } catch (error) {
    // Admin might already be initialized, ignore error
    console.warn("⚠️ Admin initialization skipped in mediaProcessor.js:", error?.message || "Unknown error");
  }
}

// Get default Firestore instance
const db = admin.firestore();

/**
 * Parse Storage path to extract metadata
 * Expected format: {userId}/{bookId}/{chapterId}/{pageId}/media/{type}/{filename}
 * Example: "user123/book456/chapter789/page012/media/image/1234567890_photo.jpg"
 */
function parseStoragePath(storagePath) {
  const parts = storagePath.split('/');

  if (parts.length < 6) {
    throw new Error(`Invalid storage path format: ${storagePath}`);
  }

  const userId = parts[0];
  const bookId = parts[1];
  const chapterId = parts[2];
  const pageId = parts[3];

  if (parts[4] !== 'media') {
    throw new Error(`Expected 'media' in path, got: ${parts[4]}`);
  }

  const type = parts[5]; // 'image' or 'video'
  const filename = parts.slice(6).join('/'); // Handle filenames with paths

  return {
    userId,
    bookId,
    chapterId,
    pageId,
    type,
    filename,
  };
}

/**
 * Get or create album for a book
 */
async function getOrCreateAlbum(bookId, userId) {
  const albumRef = db.collection('albums').doc(bookId);
  const albumDoc = await albumRef.get();

  if (!albumDoc.exists) {
    // Get book data for album name
    const bookRef = db.collection('books').doc(bookId);
    const bookDoc = await bookRef.get();
    const bookData = bookDoc.exists ? bookDoc.data() : {};

    // Create album document
    await albumRef.set({
      name: bookData.babyName || bookData.title || 'Untitled Album',
      type: 'book',
      bookId: bookId,
      coverImage: null,
      images: [],
      videos: [],
      accessPermission: {
        ownerId: userId,
        accessType: 'private',
        sharedWith: [],
      },
      mediaCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`✅ Created album document: albums/${bookId}`);
    return { albumId: bookId, isNew: true };
  }

  return { albumId: bookId, isNew: false };
}

/**
 * Generate download URL for storage file
 * Handles both emulator and production environments
 */
async function getDownloadURL(bucket, storagePath) {
    // Check if running in emulator
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      process.env.STORAGE_EMULATOR_HOST ||
      process.env.FIREBASE_STORAGE_EMULATOR_HOST;

    if (isEmulator) {
      // Generate emulator URL format: http://127.0.0.1:9199/v0/b/{bucket}/o/{encodedPath}?alt=media&token={token}
      // URL encode the storage path (keep slashes as %2F)
      const encodedPath = encodeURIComponent(storagePath);
      const token = require('crypto').randomUUID();
      const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
      const protocol = emulatorHost.startsWith('http') ? '' : 'http://';
      const downloadURL = `${protocol}${emulatorHost}/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${token}`;
      console.log(`🔗 Generated emulator URL: ${downloadURL}`);
      return downloadURL;
    }

    // Production: use signed URL
    try {
      const bucketObj = admin.storage().bucket(bucket);
      const file = bucketObj.file(storagePath);
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: '03-09-2491', // Far future expiration
      });
      console.log(`🔗 Generated signed URL for production`);
      return signedUrl;
    } catch (error) {
      // Fallback: construct public URL
      console.log(`⚠️  Signed URL failed, using public URL: ${error.message}`);
      return `https://storage.googleapis.com/${bucket}/${storagePath}`;
    }
  }

  /**
   * Update album document with new media URL
   */
  async function updateAlbumWithMedia(albumId, downloadURL, mediaType, storagePath, metadata = {}) {
    const albumRef = db.collection('albums').doc(albumId);
    const albumDoc = await albumRef.get();

    if (!albumDoc.exists) {
      throw new Error(`Album ${albumId} does not exist`);
    }

    const albumData = albumDoc.data();
    const updateData = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Store URL with metadata: {url, storagePath, name, uploadedAt}
    const mediaItem = {
      url: downloadURL,
      storagePath: storagePath,
      name: metadata.originalName || storagePath.split('/').pop(),
      uploadedAt: new Date().toISOString()
    };

    // Add URL to appropriate array
    if (mediaType === 'image') {
      updateData.images = FieldValue.arrayUnion(mediaItem);
    } else {
      updateData.videos = FieldValue.arrayUnion(mediaItem);
    }

    // Update media count
    const currentImages = albumData.images || [];
    const currentVideos = albumData.videos || [];
    const newCount = mediaType === 'image'
      ? currentImages.length + 1 + currentVideos.length
      : currentImages.length + currentVideos.length + 1;
    updateData.mediaCount = newCount;

    // Set cover image if this is the first image
    if (mediaType === 'image' && !albumData.coverImage) {
      updateData.coverImage = downloadURL;
      console.log(`📸 Setting cover image for album ${albumId}`);
    }

    await albumRef.update(updateData);
    console.log(`✅ Updated album ${albumId} with new ${mediaType}: count=${newCount}`);

    return {
      coverImage: updateData.coverImage || albumData.coverImage,
      mediaCount: newCount,
    };
  }

  /**
   * Update user's accessibleBookIds with cover image
   */
  async function updateUserAccessibleBookIds(userId, bookId, coverImage) {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.warn(`⚠️  User ${userId} does not exist`);
      return;
    }

    const userData = userDoc.data();
    let accessibleBookIds = userData.accessibleBookIds || [];

    // Convert old string array to object array if needed
    if (accessibleBookIds.length > 0 && typeof accessibleBookIds[0] === 'string') {
      // For old format, fetch book titles from Firestore
      const bookPromises = accessibleBookIds.map(async (id) => {
        const bookRef = db.collection('books').doc(id);
        const bookDoc = await bookRef.get();
        const bookData = bookDoc.exists ? bookDoc.data() : {};
        return {
          bookId: id,
          title: bookData.babyName || bookData.title || 'Untitled Book',
          coverImage: bookData.mediaCoverUrl || null,
        };
      });
      accessibleBookIds = await Promise.all(bookPromises);
    }

    // Find and update book entry
    const bookIndex = accessibleBookIds.findIndex(item => item.bookId === bookId);
    if (bookIndex >= 0) {
      accessibleBookIds[bookIndex].coverImage = coverImage;
    } else {
      // If book not found, it's likely an album (not a book), so don't add it to accessibleBookIds
      console.log(`ℹ️  Book ${bookId} not found in accessibleBookIds, skipping (likely an album)`);
      return;
    }

    await userRef.update({
      accessibleBookIds: accessibleBookIds,
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`✅ Updated user ${userId} accessibleBookIds with cover image`);
  }

  /**
   * Update user's accessibleAlbums
   */
  async function updateUserAccessibleAlbums(userId, albumId, albumName, coverImage, mediaCount) {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.warn(`⚠️  User ${userId} does not exist`);
      return;
    }

    const userData = userDoc.data();
    let accessibleAlbums = userData.accessibleAlbums || [];

    // Find and update or add album entry
    const albumIndex = accessibleAlbums.findIndex(item => item.id === albumId);
    if (albumIndex >= 0) {
      accessibleAlbums[albumIndex].coverImage = coverImage;
      accessibleAlbums[albumIndex].mediaCount = mediaCount;
      accessibleAlbums[albumIndex].updatedAt = new Date();
    } else {
      accessibleAlbums.push({
        id: albumId,
        coverImage: coverImage,
        type: 'book',
        name: albumName,
        mediaCount: mediaCount,
        updatedAt: new Date(),
      });
    }

    await userRef.update({
      accessibleAlbums: accessibleAlbums,
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`✅ Updated user ${userId} accessibleAlbums`);
  }

  /**
   * Storage trigger function that runs when a file is uploaded
   * Updates albums/{albumId} document with URL in images/videos array
   */
  exports.onMediaUpload = onObjectFinalized(
    {
      region: "us-central1"
    },
    async (event) => {
      const storagePath = event.data.name;
      const bucket = event.data.bucket;
      const metaSize = parseInt(event.data?.size || "0", 10) || 0;
      const quotaCounted =
        event.data?.metadata?.metadata?.quotaCounted === "true" ||
        event.data?.metadata?.customMetadata?.quotaCounted === "true";
      const customMetadata = event.data?.metadata?.customMetadata || {};

      console.log(`📸 Storage trigger fired for: ${storagePath}`);

      // --- AVATAR CLEANUP LOGIC ---
      // Check for avatar upload: {userId}/avatars/{filename}
      const avatarMatch = storagePath.match(/^([^/]+)\/avatars\/(.+)$/);
      if (avatarMatch) {
        const userId = avatarMatch[1];
        console.log(`👤 Avatar upload detected for user: ${userId}`);

        try {
          const bucketObj = admin.storage().bucket(bucket);
          // List all files in the user's avatar directory
          const [files] = await bucketObj.getFiles({ prefix: `${userId}/avatars/` });

          // Delete all files EXCEPT the one currently being processed
          const deletePromises = files
            .filter(file => file.name !== storagePath)
            .map(file => {
              console.log(`🗑️ Deleting old avatar: ${file.name}`);
              return file.delete();
            });

          if (deletePromises.length > 0) {
            await Promise.all(deletePromises);
            console.log(`✅ Cleanup complete: Deleted ${deletePromises.length} old avatar(s) for user ${userId}`);
          } else {
            console.log(`✨ No old avatars to delete.`);
          }

          return null; // Stop processing (avatars are not book media)
        } catch (error) {
          console.error("❌ Error cleaning up avatars:", error);
          return null;
        }
      }
      // -----------------------------

      // Skip if not a media file
      if (!storagePath || (!storagePath.includes('/media/image/') && !storagePath.includes('/media/video/'))) {
        console.log(`⏭️  Skipping non-media file: ${storagePath}`);
        return null;
      }

      try {
        // Parse storage path to extract metadata
        const metadata = parseStoragePath(storagePath);
        // Update user's accessibleAlbums
        await updateUserAccessibleAlbums(
          metadata.userId,
          albumId,
          albumName,
          albumUpdate.coverImage,
          albumUpdate.mediaCount
        );

        if (!quotaCounted && metaSize > 0) {
          try {
            await addStorageUsage(db, metadata.userId, metaSize);
            console.log(`📈 Added ${metaSize} bytes to storage usage for ${metadata.userId}`);
          } catch (usageErr) {
            console.error("⚠️ Failed to add storage usage on media upload:", usageErr);
          }
        }

        console.log(`✅ Successfully processed media upload: ${storagePath} -> albums/${albumId}`);

        return { success: true, albumId };

      } catch (error) {
        console.error(`❌ Error processing media upload ${storagePath}:`, error);
        return null;
      }
    }
  );

  exports.onMediaDelete = onObjectDeleted(
    {
      region: "us-central1"
    },
    async (event) => {
      const storagePath = event.data.name;

      console.log(`🗑️  Storage delete trigger fired for: ${storagePath}`);

      // Skip if not a media file
      if (!storagePath || (!storagePath.includes('/media/image/') && !storagePath.includes('/media/video/'))) {
        console.log(`⏭️  Skipping non-media file deletion: ${storagePath}`);
        return null;
      }

      try {
        // Parse storage path to extract metadata
        const metadata = parseStoragePath(storagePath);

        console.log(`📋 Parsed deletion metadata:`, metadata);

        const albumRef = db.collection('albums').doc(metadata.bookId);
        const albumDoc = await albumRef.get();

        if (!albumDoc.exists) {
          console.log(`⚠️  Album ${metadata.bookId} not found`);
          return null;
        }

        const albumData = albumDoc.data();
        const images = albumData.images || [];
        const videos = albumData.videos || [];

        // Find the URL that matches this storage path
        const updateData = {
          updatedAt: FieldValue.serverTimestamp(),
        };

        // Find URL to remove by matching storage path
        let mediaItemToRemove = null;
        if (metadata.type === 'image') {
          // Find image item that matches storage path
          mediaItemToRemove = images.find(item => {
            const itemObj = typeof item === 'string' ? { url: item } : item;
            return itemObj.storagePath === storagePath || itemObj.url?.includes(metadata.chapterId);
          });

          if (!mediaItemToRemove && images.length > 0) {
            // Fallback: remove last image if can't find match
            mediaItemToRemove = images[images.length - 1];
          }

          if (mediaItemToRemove) {
            const itemUrl = typeof mediaItemToRemove === 'string' ? mediaItemToRemove : mediaItemToRemove.url;
            updateData.images = FieldValue.arrayRemove(mediaItemToRemove);
            const remainingImages = images.filter(item => {
              const itemObj = typeof item === 'string' ? { url: item } : item;
              return itemObj.url !== itemUrl;
            });
            updateData.mediaCount = remainingImages.length + videos.length;

            // Update cover image if deleted image was cover
            if (albumData.coverImage === itemUrl) {
              const nextImage = remainingImages.length > 0
                ? (typeof remainingImages[0] === 'string' ? remainingImages[0] : remainingImages[0].url)
                : null;
              updateData.coverImage = nextImage;
            }
          }
        } else {
          // Find video item that matches storage path
          mediaItemToRemove = videos.find(item => {
            const itemObj = typeof item === 'string' ? { url: item } : item;
            return itemObj.storagePath === storagePath || itemObj.url?.includes(metadata.chapterId);
          });

          if (!mediaItemToRemove && videos.length > 0) {
            // Fallback: remove last video if can't find match
            mediaItemToRemove = videos[videos.length - 1];
          }

          if (mediaItemToRemove) {
            updateData.videos = FieldValue.arrayRemove(mediaItemToRemove);
            const remainingVideos = videos.filter(item => {
              const itemObj = typeof item === 'string' ? { url: item } : item;
              const itemUrl = typeof mediaItemToRemove === 'string' ? mediaItemToRemove : mediaItemToRemove.url;
              return itemObj.url !== itemUrl;
            });
            updateData.mediaCount = images.length + remainingVideos.length;
          }
        }

        if (!mediaItemToRemove) {
          console.log(`⚠️  Could not find media item to remove for storage path: ${storagePath}`);
          return null;
        }

        const itemUrl = typeof mediaItemToRemove === 'string' ? mediaItemToRemove : mediaItemToRemove.url;

        await albumRef.update(updateData);
        console.log(`🗑️  Removed media from album ${metadata.bookId}`);

        // Update user's accessibleBookIds and accessibleAlbums
        const newCoverImage = updateData.coverImage !== undefined ? updateData.coverImage : albumData.coverImage;
        await updateUserAccessibleBookIds(metadata.userId, metadata.bookId, newCoverImage);

        const albumName = albumData.name || 'Untitled Album';
        await updateUserAccessibleAlbums(
          metadata.userId,
          metadata.bookId,
          albumName,
          newCoverImage,
          updateData.mediaCount
        );

        const sizeBytes = parseInt(event.data?.size || "0", 10) || 0;
        if (sizeBytes > 0) {
          try {
            await addStorageUsage(db, metadata.userId, -sizeBytes);
            console.log(`📉 Decremented storage usage by ${sizeBytes} bytes for user ${metadata.userId}`);
          } catch (usageErr) {
            console.error("⚠️ Failed to update storage usage after delete:", usageErr);
          }
        }

        return { success: true };
      } catch (error) {
        console.error(`❌ Error processing media deletion ${storagePath}:`, error);
        return null;
      }
    }
  );