const functions = require("firebase-functions");
const admin = require("firebase-admin");
const FieldValue = require("firebase-admin/firestore").FieldValue;

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

// Initialize Firebase Admin
// Use plain initializeApp on emulator; use service account only in production deploys
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

const {uploadMedia} = require("./imageProcessor");
const {rewriteNote} = require("./textGenerator");
const {createBook} = require("./createBook");
const {onMediaUpload, onMediaDelete} = require("./mediaProcessor");
const {inviteCoAuthor} = require("./inviteCoAuthor");

exports.helloWorld = functions.https.onRequest((request, response) => {
  functions.logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});

exports.uploadMedia = uploadMedia;
exports.rewriteNote = rewriteNote;
exports.createBook = createBook;
exports.onMediaUpload = onMediaUpload;
exports.onMediaDelete = onMediaDelete;
exports.inviteCoAuthor = inviteCoAuthor;

// Function to get chapters for a book (hot reload test)
exports.getBookChapters = functions.https.onCall(async (data, context) => {
  console.log("📚 getBookChapters function called at:", new Date().toISOString());
  console.log("📊 Received data:", JSON.stringify(data, null, 2));
  
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated to view chapters.');
  }

  const { bookId } = data;
  const userId = context.auth.uid;

  if (!bookId) {
    throw new functions.https.HttpsError('invalid-argument', 'Book ID is required.');
  }

  try {
    const admin = require("firebase-admin");
    const db = admin.firestore();

    // Verify user has access to this book
    const bookRef = db.collection('books').doc(bookId);
    const bookDoc = await bookRef.get();
    
    if (!bookDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Book not found.');
    }

    const bookData = bookDoc.data();
    // Check if user is owner or member
    const isOwner = bookData.ownerId === userId;
    const isMember = bookData.members && bookData.members[userId];
    
    if (!isOwner && !isMember) {
      throw new functions.https.HttpsError('permission-denied', 'You do not have access to this book.');
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

    console.log(`📚 Found ${chapters.length} chapters for book ${bookId}`);

    return {
      success: true,
      bookId: bookId,
      chapters: chapters,
      count: chapters.length
    };

  } catch (error) {
    console.error('Error fetching chapters:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch chapters. Please try again.');
  }
});

// Function to add a new chapter to a book
exports.addChapter = functions.https.onCall(async (data, context) => {
  console.log("📄 addChapter function called at:", new Date().toISOString());
  console.log("📊 Received data:", JSON.stringify(data, null, 2));
  
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated to add chapters.');
  }

  const { bookId, title, order } = data;
  const userId = context.auth.uid;

  if (!bookId || !title) {
    throw new functions.https.HttpsError('invalid-argument', 'Book ID and title are required.');
  }

  try {
    const admin = require("firebase-admin");
    const db = admin.firestore();

    // Verify user has access to this book
    const bookRef = db.collection('books').doc(bookId);
    const bookDoc = await bookRef.get();
    
    if (!bookDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Book not found.');
    }

    const bookData = bookDoc.data();
    // Check if user is owner or member
    const isOwner = bookData.ownerId === userId;
    const isMember = bookData.members && bookData.members[userId];
    
    if (!isOwner && !isMember) {
      throw new functions.https.HttpsError('permission-denied', 'You do not have access to this book.');
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

    console.log(`📄 Chapter "${title}" created with ID: ${chapterRef.id} in book ${bookId}`);

    return {
      success: true,
      bookId: bookId,
      chapterId: chapterRef.id,
      title: chapterData.title,
      order: chapterData.order,
      message: `Chapter "${title}" added successfully!`
    };

  } catch (error) {
    console.error('Error adding chapter:', error);
    throw new functions.https.HttpsError('internal', 'Failed to add chapter. Please try again.');
  }
});

// Function to add a page summary to a chapter
exports.addPageSummary = functions.https.onCall(async (data, context) => {
  console.log("📄 addPageSummary function called at:", new Date().toISOString());
  console.log("📊 Received data:", JSON.stringify(data, null, 2));
  
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated to add page summaries.');
  }

  const { bookId, chapterId, pageNumber, summary } = data;
  const userId = context.auth.uid;

  if (!bookId || !chapterId || !pageNumber || !summary) {
    throw new functions.https.HttpsError('invalid-argument', 'Book ID, chapter ID, page number, and summary are required.');
  }

  try {
    const admin = require("firebase-admin");
    const db = admin.firestore();

    // Verify user has access to this book
    const bookRef = db.collection('books').doc(bookId);
    const bookDoc = await bookRef.get();
    
    if (!bookDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Book not found.');
    }

    const bookData = bookDoc.data();
    const isOwner = bookData.ownerId === userId;
    const isMember = bookData.members && bookData.members[userId];
    
    if (!isOwner && !isMember) {
      throw new functions.https.HttpsError('permission-denied', 'You do not have access to this book.');
    }

    // Get the chapter
    const chapterRef = db
      .collection('books')
      .doc(bookId)
      .collection('chapters')
      .doc(chapterId);
    
    const chapterDoc = await chapterRef.get();
    if (!chapterDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Chapter not found.');
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

    console.log(`📄 Page summary added to chapter ${chapterId} in book ${bookId}`);

    return {
      success: true,
      bookId: bookId,
      chapterId: chapterId,
      pageSummary: newPageSummary,
      message: `Page summary added successfully!`
    };

  } catch (error) {
    console.error('Error adding page summary:', error);
    throw new functions.https.HttpsError('internal', 'Failed to add page summary. Please try again.');
  }
});
