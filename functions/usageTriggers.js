const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { assertAndIncrementCounter } = require("./utils/limits");

// Ensure Admin SDK is initialized (index.js should handle this, but keep safe)
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const storage = admin.storage();

/**
 * Extract storage path from a Firebase Storage download URL.
 * Returns null if the URL is not a valid Firebase Storage URL.
 */
function extractStoragePathFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  
  try {
    // Handle URLs like: https://firebasestorage.googleapis.com/v0/b/BUCKET/o/PATH?token=...
    // or emulator URLs: http://127.0.0.1:9199/v0/b/BUCKET/o/PATH?token=...
    const match = url.match(/\/o\/([^?]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch (err) {
    console.warn("Failed to extract storage path from URL:", url, err);
  }
  return null;
}

/**
 * Decrement book counter when a book is deleted.
 * Works for deletions from UI or backend.
 */
exports.onBookDeleted = onDocumentDeleted(
  {
    region: "us-central1",
    document: "books/{bookId}",
  },
  async (event) => {
    const prev = event.data?.data() || event.data?.previous?.data() || {};
    const ownerId = prev.ownerId;
    const members = prev.members || {};
    const userIds = new Set([ownerId, ...Object.keys(members || {})].filter(Boolean));

    if (!ownerId) {
      console.warn("onBookDeleted: missing ownerId, skipping quota update");
      return null;
    }

    try {
      await assertAndIncrementCounter(db, ownerId, "books", -1);
      console.log(`📉 Decremented book counter for user ${ownerId}`);
    } catch (err) {
      console.error("❌ Failed to decrement book counter on delete:", err);
    }

    // Remove book access for owner + members, but keep albums/assets intact
    await Promise.all(
      Array.from(userIds).map(async (uid) => {
        const userRef = db.collection("users").doc(uid);
        const snap = await userRef.get();
        if (!snap.exists) return;
        const data = snap.data() || {};
        const filteredBooks = (data.accessibleBookIds || []).filter((b) => {
          const id = typeof b === "string" ? b : b.bookId;
          return id !== event.params.bookId;
        });
        try {
          await userRef.update({
            accessibleBookIds: filteredBooks,
          });
          console.log(`🧹 Removed book ${event.params.bookId} from user ${uid} accessibleBookIds`);
        } catch (err) {
          console.error(`⚠️ Failed to update accessibleBookIds for user ${uid}:`, err);
        }
      })
    );

    // Delete cover image from storage if it exists
    const coverImageUrl = prev.coverImageUrl;
    if (coverImageUrl) {
      const storagePath = extractStoragePathFromUrl(coverImageUrl);
      if (storagePath) {
        try {
          const bucket = storage.bucket();
          await bucket.file(storagePath).delete();
          console.log(`🗑️ Deleted cover image from storage: ${storagePath}`);
        } catch (err) {
          // File might not exist or already deleted - log but don't fail
          if (err.code === 404) {
            console.log(`ℹ️ Cover image already deleted or not found: ${storagePath}`);
          } else {
            console.error(`⚠️ Failed to delete cover image from storage:`, err);
          }
        }
      }
    }

    return null;
  }
);

/**
 * Decrement page counter when a page is deleted.
 */
exports.onPageDeleted = onDocumentDeleted(
  {
    region: "us-central1",
    document: "books/{bookId}/chapters/{chapterId}/pages/{pageId}",
  },
  async (event) => {
    const prev = event.data?.data() || event.data?.previous?.data() || {};
    const createdBy = prev.createdBy;
    if (!createdBy) {
      console.warn("onPageDeleted: missing createdBy, skipping quota update");
      return null;
    }

    try {
      await assertAndIncrementCounter(db, createdBy, "pages", -1);
      console.log(`📉 Decremented page counter for user ${createdBy}`);
    } catch (err) {
      console.error("❌ Failed to decrement page counter on delete:", err);
    }
    return null;
  }
);

/**
 * When a chapter is deleted, delete all its pages and decrement page counters per user.
 */
exports.onChapterDeleted = onDocumentDeleted(
  {
    region: "us-central1",
    document: "books/{bookId}/chapters/{chapterId}",
  },
  async (event) => {
    const { bookId, chapterId } = event.params;
    const pagesRef = db.collection("books").doc(bookId).collection("chapters").doc(chapterId).collection("pages");

    try {
      const pagesSnap = await pagesRef.get();
      if (pagesSnap.empty) {
        console.log(`🗂️ No pages to clean for chapter ${chapterId}`);
        return null;
      }

      // Aggregate counts by creator
      const countsByUser = {};
      pagesSnap.forEach((doc) => {
        const data = doc.data() || {};
        const creator = data.createdBy;
        if (creator) {
          countsByUser[creator] = (countsByUser[creator] || 0) + 1;
        }
      });

      // Delete pages in batches (Firestore batch limit 500)
      const docs = pagesSnap.docs;
      let idx = 0;
      while (idx < docs.length) {
        const batch = db.batch();
        for (let i = 0; i < 500 && idx < docs.length; i++, idx++) {
          batch.delete(docs[idx].ref);
        }
        await batch.commit();
      }

      // Decrement counters per user
      await Promise.all(
        Object.entries(countsByUser).map(async ([uid, count]) => {
          try {
            await assertAndIncrementCounter(db, uid, "pages", -count);
            console.log(`📉 Decremented ${count} pages for user ${uid} after chapter delete`);
          } catch (err) {
            console.error(`❌ Failed to decrement pages for user ${uid}:`, err);
          }
        })
      );
    } catch (err) {
      console.error(`❌ Chapter delete cleanup failed for ${chapterId}:`, err);
    }

    return null;
  }
);
