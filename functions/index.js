// Disable noisy GCP residency checks in local emulators (sandboxed network)
const storageEmulatorBucket = "demo-project.appspot.com";
const isEmulator = process.env.FUNCTIONS_EMULATOR === "true" || process.env.FIRESTORE_EMULATOR_HOST;
if (isEmulator) {
  process.env.GOOGLE_CLOUD_DISABLE_GCP_RESIDENCY_CHECK = "true";
}

// // Guard against accidental calls to functions.config() (removed in v7) by stubbing it
// try {
//   const functionsV1 = require("firebase-functions/v1");
//   // Force overwrite of config
//   functionsV1.config = () => {
//     console.warn("functions.config() called (stubbed)");
//     return {};
//   };
//   console.log("✅ functions.config() stubbed successfully");
// } catch (e) {
//   console.warn("Failed to stub functions.config:", e?.message);
// }

// Log uncaught errors early so emulator crashes show a stack trace
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception in functions runtime:", err?.stack || err);
  throw err;
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection in functions runtime:", reason?.stack || reason);
  throw reason;
});

const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const FieldValue = require("firebase-admin/firestore").FieldValue;

// Import Gen 1 functions FIRST to avoid global config pollution from V2/Genkit
// const { onUserCreate } = require("./onUserCreate");

// --- UTILITY FOR FRACTIONAL INDEXING ---
const getMidpointString = (prev = '', next = '') => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let p = 0;
  while (p < prev.length || p < next.length) {
    const prevChar = prev.charAt(p) || 'a';
    const nextChar = next.charAt(p) || 'z';
    if (prevChar !== nextChar) {
      const prevIndex = alphabet.indexOf(prevChar);
      const nextIndex = alphabet.indexOf(nextChar);
      if (nextIndex - prevIndex > 1) {
        const midIndex = Math.round((prevIndex + nextIndex) / 2);
        return prev.substring(0, p) + alphabet[midIndex];
      }
    }
    p++;
  }
  return prev + 'm';
};

const getNewOrderBetween = (prevOrder = '', nextOrder = '') =>
  getMidpointString(prevOrder, nextOrder);

// Get current project ID dynamically from environment
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'airabook-dev';
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`;

console.log(`🔧 Initializing Firebase Admin for project: ${PROJECT_ID}`);
console.log(`📦 Storage bucket: ${STORAGE_BUCKET}`);

// Initialize Firebase Admin (only if not already initialized)
if (!admin.apps.length) {
  const runningInEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const isDeployed = !!process.env.GCLOUD_PROJECT; // Cloud Functions set this automatically

  if (runningInEmulator) {
    // Emulator mode - use default initialization
    admin.initializeApp({
      storageBucket: storageEmulatorBucket,
    });
    console.log("🧪 Firebase Admin initialized for emulator environment with storage Bucket" + storageEmulatorBucket);
  } else if (isDeployed) {
    // Deployed to Cloud Functions - use Application Default Credentials (ADC)
    // ADC automatically uses the correct service account for the deployed environment
    admin.initializeApp({
      storageBucket: STORAGE_BUCKET,
    });
    console.log("☁️  Firebase Admin initialized with Application Default Credentials (deployed)");
    console.log(`   Project: ${PROJECT_ID}`);
  } else {
    // Local development - try to use service account key
    // Check for key in custom location via environment variable, or in default location
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.SERVICE_ACCOUNT_KEY_PATH || "./serviceAccountKey.json";

    try {
      const serviceAccount = require(keyPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: STORAGE_BUCKET,
      });
      console.log("🔑 Firebase Admin initialized with service account key (local development)");
      console.log(`   Key location: ${keyPath}`);
      console.log(`   Project from key: ${serviceAccount.project_id}`);
      if (serviceAccount.project_id !== PROJECT_ID) {
        console.warn(`⚠️  WARNING: Service account project (${serviceAccount.project_id}) doesn't match target project (${PROJECT_ID})`);
      }
    } catch (e) {
      // Fallback to default credentials
      admin.initializeApp({
        storageBucket: STORAGE_BUCKET,
      });
      console.log("🔧 Firebase Admin initialized with default credentials");
      console.warn(`⚠️  No service account key found at: ${keyPath}`);
      console.log("   This is fine for emulators or if using Application Default Credentials");
    }
  }
}

// Get default Firestore instance
const db = admin.firestore();


const { uploadMedia } = require("./imageProcessor");
const { rewriteNote } = require("./textGenerator");
const { createBook } = require("./createBook");
const { updateBook } = require("./updateBook");
const { createAlbum } = require("./createAlbum");
const { onMediaUpload, onMediaDelete } = require("./mediaProcessor");
const { inviteCoAuthor } = require("./inviteCoAuthor");
const { createCheckoutSession } = require("./payments/createCheckoutSession");
const { stripeWebhook } = require("./payments/stripeWebhook");
const { createPage } = require("./createPage");
const { updatePage } = require("./updatePage");
const { updateAlbum } = require("./updateAlbum");
const { queryBookFlow, generateChapterSuggestions } = require("./genkit");
const { airabookaiStream } = require("./airabookaiStream");
const { onBookDeleted, onPageDeleted, onChapterDeleted } = require("./usageTriggers");
const { deleteMediaAsset, deleteAlbumAssets } = require("./deleteMedia");
const { trackMediaUsage, untrackMediaUsage } = require("./mediaUsage");
const { createUserDoc } = require("./createUserDoc");

exports.helloWorld = onRequest({ region: "us-central1" }, (request, response) => {
  logger.info("Hello logs!", { structuredData: true });
  response.send("Hello from Firebase!");
});

exports.uploadMedia = uploadMedia;
exports.rewriteNote = rewriteNote;
exports.createBook = createBook;
exports.updateBook = updateBook;
exports.createAlbum = createAlbum;
exports.onMediaUpload = onMediaUpload;
exports.onMediaDelete = onMediaDelete;
exports.inviteCoAuthor = inviteCoAuthor;
exports.createCheckoutSession = createCheckoutSession;
exports.stripeWebhook = stripeWebhook;

exports.createPage = createPage;
exports.updatePage = updatePage;
exports.queryBookFlow = queryBookFlow;
exports.generateChapterSuggestions = generateChapterSuggestions;
exports.airabookaiStream = airabookaiStream;
exports.createUserDoc = createUserDoc;
exports.onBookDeleted = onBookDeleted;
exports.onPageDeleted = onPageDeleted;
exports.onChapterDeleted = onChapterDeleted;
exports.deleteMediaAsset = deleteMediaAsset;
exports.deleteAlbumAssets = deleteAlbumAssets;
exports.updateAlbum = updateAlbum;
exports.trackMediaUsage = trackMediaUsage;
exports.untrackMediaUsage = untrackMediaUsage;
exports.recalculateStorageUsage = require("./recalculateStorage").recalculateStorageUsage;

// Function to get chapters for a book (hot reload test)
exports.getBookChapters = onCall({ region: "us-central1", cors: true }, async (request) => {
  const { data, auth } = request;

  logger.log("getBookChapters called at:", new Date().toISOString());
  logger.log("Received data:", JSON.stringify(data, null, 2));

  // Check authentication
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to view chapters.');
  }

  const { bookId } = data;
  const userId = auth.uid;

  if (!bookId) {
    throw new HttpsError('invalid-argument', 'Book ID is required.');
  }

  try {

    // Verify user has access to this book
    const bookRef = db.collection('books').doc(bookId);
    const bookDoc = await bookRef.get();

    if (!bookDoc.exists) {
      throw new HttpsError('not-found', 'Book not found.');
    }

    const bookData = bookDoc.data();
    // Check if user is owner or member
    const isOwner = bookData.ownerId === userId;
    const isMember = bookData.members && bookData.members[userId];

    if (!isOwner && !isMember) {
      throw new HttpsError('permission-denied', 'You do not have access to this book.');
    }

    // Get chapters from the book's subcollection
    const chaptersSnapshot = await db
      .collection('books')
      .doc(bookId)
      .collection('chapters')
      .orderBy('order', 'asc')
      .get();

    const chapters = [];
    chaptersSnapshot.forEach(doc => {
      chapters.push({
        id: doc.id,
        ...doc.data()
      });
    });

    logger.log(`📚 Found ${chapters.length} chapters for book ${bookId}`);

    return {
      success: true,
      bookId: bookId,
      chapters: chapters,
      count: chapters.length
    };

  } catch (error) {
    logger.error('Error fetching chapters:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to fetch chapters. Please try again.');
  }
});

// Function to add a new chapter to a book
exports.addChapter = onCall({ region: "us-central1", cors: true }, async (request) => {
  const { data, auth } = request;

  logger.log("addChapter called at:", new Date().toISOString());
  logger.log("Received data:", JSON.stringify(data, null, 2));

  // Check authentication
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to add chapters.');
  }

  const { bookId, title, order } = data;
  const userId = auth.uid;

  if (!bookId || !title) {
    throw new HttpsError('invalid-argument', 'Book ID and title are required.');
  }

  try {

    // Verify user has access to this book
    const bookRef = db.collection('books').doc(bookId);
    const bookDoc = await bookRef.get();

    if (!bookDoc.exists) {
      throw new HttpsError('not-found', 'Book not found.');
    }

    const bookData = bookDoc.data();
    // Check if user is owner or member
    const isOwner = bookData.ownerId === userId;
    const isMember = bookData.members && bookData.members[userId];

    if (!isOwner && !isMember) {
      throw new HttpsError('permission-denied', 'You do not have access to this book.');
    }

    // Get existing chapters to calculate proper order
    const chaptersSnapshot = await db
      .collection('books')
      .doc(bookId)
      .collection('chapters')
      .orderBy('order', 'asc')
      .get();

    const existingChapters = chaptersSnapshot.docs.map(doc => doc.data());
    const lastChapter = existingChapters[existingChapters.length - 1];
    const newOrder = order || getNewOrderBetween(lastChapter?.order || '', '');

    // Create new chapter in the book's subcollection
    const chapterData = {
      title: title.trim(),
      order: newOrder,
      notes: [],
      pagesSummary: [], // Initialize empty pagesSummary
      ownerId: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const chapterRef = await db
      .collection('books')
      .doc(bookId)
      .collection('chapters')
      .add(chapterData);

    // Update book's chapter count
    await bookRef.update({
      chapterCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp()
    });

    logger.log(`📄 Chapter "${title}" created with ID: ${chapterRef.id} in book ${bookId}`);

    return {
      success: true,
      bookId: bookId,
      chapterId: chapterRef.id,
      title: chapterData.title,
      order: chapterData.order,
      message: `Chapter "${title}" added successfully!`
    };

  } catch (error) {
    logger.error('Error adding chapter:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to add chapter. Please try again.');
  }
});

// Function to add a page summary to a chapter
exports.addPageSummary = onCall({ region: "us-central1", cors: true }, async (request) => {
  const { data, auth } = request;

  logger.log("addPageSummary called at:", new Date().toISOString());
  logger.log("Received data:", JSON.stringify(data, null, 2));

  // Check authentication
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to add page summaries.');
  }

  const { bookId, chapterId, pageNumber, summary } = data;
  const userId = auth.uid;

  if (!bookId || !chapterId || !pageNumber || !summary) {
    throw new HttpsError('invalid-argument', 'Book ID, chapter ID, page number, and summary are required.');
  }

  try {

    // Verify user has access to this book
    const bookRef = db.collection('books').doc(bookId);
    const bookDoc = await bookRef.get();

    if (!bookDoc.exists) {
      throw new HttpsError('not-found', 'Book not found.');
    }

    const bookData = bookDoc.data();
    const isOwner = bookData.ownerId === userId;
    const isMember = bookData.members && bookData.members[userId];

    if (!isOwner && !isMember) {
      throw new HttpsError('permission-denied', 'You do not have access to this book.');
    }

    // Get the chapter
    const chapterRef = db
      .collection('books')
      .doc(bookId)
      .collection('chapters')
      .doc(chapterId);

    const chapterDoc = await chapterRef.get();
    if (!chapterDoc.exists) {
      throw new HttpsError('not-found', 'Chapter not found.');
    }

    // Get existing pages to calculate proper order
    const pagesSnapshot = await db
      .collection('books')
      .doc(bookId)
      .collection('chapters')
      .doc(chapterId)
      .collection('pages')
      .orderBy('order', 'asc')
      .get();

    const existingPages = pagesSnapshot.docs.map(doc => doc.data());
    const lastPage = existingPages[existingPages.length - 1];
    const newPageOrder = getNewOrderBetween(lastPage?.order || '', '');

    // Add page summary to the chapter
    const newPageSummary = {
      pageNumber: parseInt(pageNumber),
      summary: summary.trim(),
      order: newPageOrder,
      addedAt: FieldValue.serverTimestamp(),
      addedBy: userId
    };

    await chapterRef.update({
      pagesSummary: FieldValue.arrayUnion(newPageSummary),
      updatedAt: FieldValue.serverTimestamp()
    });

    logger.log(`📄 Page summary added to chapter ${chapterId} in book ${bookId}`);

    return {
      success: true,
      bookId: bookId,
      chapterId: chapterId,
      pageSummary: newPageSummary,
      message: `Page summary added successfully!`
    };

  } catch (error) {
    logger.error('Error adding page summary:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to add page summary. Please try again.');
  }
});


