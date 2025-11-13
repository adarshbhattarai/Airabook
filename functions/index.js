const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("./utils/firestore");

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

// Initialize Firebase Admin (only if not already initialized)
if (!admin.apps.length) {
  const runningInEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (runningInEmulator) {
    admin.initializeApp({
      storageBucket: "airaproject-f5298.appspot.com",
    });
    console.log("🔥 Firebase Admin initialized for emulator environment");
  } else {
    try {
      const serviceAccount = require("./serviceAccountKey.json");
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: "airaproject-f5298.appspot.com",
      });
      console.log("🔥 Firebase Admin initialized with service account");
    } catch (e) {
      admin.initializeApp({
        storageBucket: "airaproject-f5298.appspot.com",
      });
      console.log("🔥 Firebase Admin initialized with default credentials");
    }
  }
}

const {uploadMedia} = require("./imageProcessor");
const {rewriteNote} = require("./textGenerator");
const {createBook} = require("./createBook");
const {onMediaUpload, onMediaDelete} = require("./mediaProcessor");
const {inviteCoAuthor} = require("./inviteCoAuthor");

exports.helloWorld = onRequest({ region: "us-central1" }, (request, response) => {
  logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});

exports.uploadMedia = uploadMedia;
exports.rewriteNote = rewriteNote;
exports.createBook = createBook;
exports.onMediaUpload = onMediaUpload;
exports.onMediaDelete = onMediaDelete;
exports.inviteCoAuthor = inviteCoAuthor;

// Function to get chapters for a book (hot reload test)
exports.getBookChapters = onCall({ region: "us-central1" }, async (request) => {
  const { data, auth } = request;
  
  logger.log("📚 getBookChapters function called at:", new Date().toISOString());
  logger.log("📊 Received data:", JSON.stringify(data, null, 2));
  
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
    const { db } = getFirestore();

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
exports.addChapter = onCall({ region: "us-central1" }, async (request) => {
  const { data, auth } = request;
  
  logger.log("📄 addChapter function called at:", new Date().toISOString());
  logger.log("📊 Received data:", JSON.stringify(data, null, 2));
  
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
    const { db } = getFirestore();

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
exports.addPageSummary = onCall({ region: "us-central1" }, async (request) => {
  const { data, auth } = request;
  
  logger.log("📄 addPageSummary function called at:", new Date().toISOString());
  logger.log("📊 Received data:", JSON.stringify(data, null, 2));
  
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
    const { db } = getFirestore();

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
