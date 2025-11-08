
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const FieldValue = require("firebase-admin/firestore").FieldValue;

// Initialize AI utilities
try { require('dotenv').config(); } catch (_) {}
const { callAI } = require('./utils/aiClient');
const { buildChapterGenerationPrompt, extractChapterTitles, titlesToChapters } = require('./utils/prompts');

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

/**
 * Validates the create book request parameters
 * @param {Object} data - The request data containing title, creationType, promptMode, and prompt
 * @throws {functions.https.HttpsError} If validation fails
 */
function validateCreateBookRequest(data) {
  const { title, creationType, promptMode, prompt } = data;

  // Validate title
  if (!title || !title.trim()) {
    throw new functions.https.HttpsError('invalid-argument', 'Book title is required.');
  }

  if (title.length < 2) {
    throw new functions.https.HttpsError('invalid-argument', 'Book title must be at least 2 characters long.');
  }

  if (title.length > 50) {
    throw new functions.https.HttpsError('invalid-argument', 'Book title must be less than 50 characters.');
  }

  // Validate creationType (0 = auto-generate, 1 = blank)
  if (creationType !== 0 && creationType !== 1) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid creation type. Must be 0 (auto-generate) or 1 (blank).');
  }

  // Validate promptMode and prompt consistency
  if (creationType === 1 && promptMode) {
    throw new functions.https.HttpsError('invalid-argument', 'promptMode must be false when creationType is 1.');
  }

  if (creationType === 0 && promptMode && (!prompt || typeof prompt !== 'string' || !prompt.trim())) {
    throw new functions.https.HttpsError('invalid-argument', 'prompt is required when promptMode is true.');
  }

  if (creationType === 0 && promptMode && prompt && prompt.length > 500) {
    throw new functions.https.HttpsError('invalid-argument', 'prompt must be 500 characters or less.');
  }
}

/**
 * Creates a new baby book
 * Called from CreateBook.jsx
 */
exports.createBook = functions.https.onCall(async (data, context) => {

  console.log("🚀 createBook function called at:", new Date().toISOString());
  console.log("📊 Received data:", JSON.stringify(data, null, 2));
  console.log("👤 Context auth:", context.auth ? "User authenticated" : "No auth");
  
  // Check authentication
  if (!context.auth) {
    console.log("❌ Authentication failed - no user context");
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated to create a book.');
  }

  console.log("✅ User authenticated:", context.auth.uid);
  const { title, creationType, promptMode, prompt } = data;
  const userId = context.auth.uid;

  // Validate request parameters
  validateCreateBookRequest(data);

  try {
    console.log(`📚 Creating book "${title}" for user ${userId} with type: ${creationType}`);
    console.log(`⏰ Function execution started at: ${new Date().toISOString()}`);

    // Get Firestore instance
    const db = admin.firestore();
    console.log("🔥 Firestore instance obtained");

    // Normalize title for duplicate detection
    const titleNormalized = title.trim();
    const titleLower = titleNormalized.toLowerCase();

    // Check if user already has too many books (optional limit)
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    const currentBookCount = userData?.accessibleBookIds?.length || 0;
    
    if (currentBookCount >= 10) { // Optional: limit to 10 books per user
      throw new functions.https.HttpsError('resource-exhausted', 'You have reached the maximum number of books (10).');
    }

    // Check for duplicate title per user
    const dupSnap = await db
      .collection('books')
      .where('ownerId', '==', userId)
      .where('titleLower', '==', titleLower)
      .limit(1)
      .get();

    if (!dupSnap.empty) {
      console.log(`⚠️ Duplicate title detected for user ${userId}: ${titleNormalized}`);
      throw new functions.https.HttpsError(
        'already-exists',
        'You already have a book with this title.'
      );
    }
 
    // Additional processing based on parameters
    let chapters = [];
    let bookDescription = "";
    
    if (creationType === 0) { // 0 = auto-generate
      if (promptMode && prompt) {
        // Custom prompt mode - generate chapters based on AI prompt
        console.log(`🤖 Generating custom chapters from prompt: ${prompt.substring(0, 100)}...`);
        chapters = await generateChaptersFromPrompt(title, prompt);
        bookDescription = `A custom book "${title}" with AI-generated chapters based on your idea.`;
      } else {
        // Baby journal mode - generate standard baby journal chapters
        console.log(`📖 Generating standard baby journal chapters for: ${title}`);
        chapters = generateDefaultChapters(); 
        bookDescription = `A beautiful baby book for ${title} with pre-generated chapters to get you started.`;
      }
    } else { // 1 = blank
      chapters = [];
      bookDescription = `A blank baby book for ${title} - start writing your own story!`;
    }

    // Create the book document (matching your current structure)
    const bookData = {
      babyName: titleNormalized, // Using babyName to match your current structure
      titleLower,
      creationType: creationType, // Save as numeric value (0 or 1)
      description: bookDescription,
      ownerId: userId,
      members: {
        [userId]: "Owner" // Using members object to match your current structure
      },
      chapterCount: chapters.length,
      coverImageUrl: null,
      isPublic: false,
      tags: creationType === 0 ? ['auto-generated', 'starter'] : ['blank', 'custom'],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const bookRef = await db.collection('books').add(bookData);
    console.log(`✅ Book created with ID: ${bookRef.id}`);
    console.log(`📖 Book data saved to Firestore`);

    // Create chapters as subcollection under the book document
    const chapterPromises = chapters.map(async (chapter, index) => {
      const chapterData = {
        title: chapter.title,
        order: chapter.order || getNewOrderBetween('', ''), // Use fractional indexing
        notes: chapter.notes || [],
        pagesSummary:  [],
        ownerId: userId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      
      const chapterRef = await db
        .collection('books')
        .doc(bookRef.id)
        .collection('chapters')
        .add(chapterData);
      
      console.log(`📄 Chapter "${chapter.title}" created with ID: ${chapterRef.id} in book ${bookRef.id}`);
      return {
        id: chapterRef.id,
        title: chapter.title,
        order: chapterData.order
      };
    });

    const createdChapters = await Promise.all(chapterPromises);
    console.log(`📚 Created ${createdChapters.length} chapters for book ${bookRef.id}`);

    // Create album document for the book
    const albumRef = db.collection('albums').doc(bookRef.id);
    await albumRef.set({
      name: titleNormalized,
      type: 'book',
      bookId: bookRef.id,
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
    console.log(`✅ Created album document: albums/${bookRef.id}`);

    // Update user's accessible books (new structure: array of objects)
    // Reuse userDoc and userData from earlier in the function
    let accessibleBookIds = userData.accessibleBookIds || [];
    
    // Convert old string array to object array if needed
    if (accessibleBookIds.length > 0 && typeof accessibleBookIds[0] === 'string') {
      // For old format, we need to fetch book titles from Firestore
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
    
    // Add new book if not already present
    const bookExists = accessibleBookIds.some(item => item.bookId === bookRef.id);
    if (!bookExists) {
      accessibleBookIds.push({
        bookId: bookRef.id,
        title: titleNormalized,
        coverImage: null,
      });
    }

    // Update user's accessibleAlbums
    let accessibleAlbums = userData.accessibleAlbums || [];
    const albumExists = accessibleAlbums.some(item => item.id === bookRef.id);
    if (!albumExists) {
      accessibleAlbums.push({
        id: bookRef.id,
        coverImage: null,
        type: 'book',
        name: titleNormalized,
        mediaCount: 0,
        updatedAt: new Date(),
      });
    }

    await userRef.update({
      accessibleBookIds: accessibleBookIds,
      accessibleAlbums: accessibleAlbums,
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`👤 Updated user ${userId} with new book ID: ${bookRef.id}`);
    console.log(`🎉 Function execution completed successfully at: ${new Date().toISOString()}`);

    return {
      success: true,
      bookId: bookRef.id,
      babyName: title.trim(), // Using babyName to match your structure
      creationType: creationType, // Return numeric value (0 or 1)
      description: bookDescription,
      chaptersCount: createdChapters.length,
      chapters: createdChapters,
      message: `Book "${title}" created successfully with ${createdChapters.length} chapters!`,
    };
  } catch (error) {
    console.error('Error creating book:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create book. Please try again.');
  }
});

/**
 * Generates chapters from a custom AI prompt
 */
async function generateChaptersFromPrompt(title, prompt) {
  try {
    console.log('🤖 Calling AI to generate custom chapters...');
    
    const instruction = buildChapterGenerationPrompt(title, prompt);
    const content = await callAI(instruction, { maxTokens: 500, temperature: 0.8 });
    console.log('📝 AI response:', content);
    
    // Extract and convert chapter titles
    const titles = extractChapterTitles(content);
    const chapters = titlesToChapters(titles);
    
    console.log(`✅ Generated ${chapters.length} custom chapters`);
    return chapters;
  } catch (error) {
    console.error('❌ Error generating custom chapters:', error);
    // Fallback to default chapters if AI generation fails
    console.log('🔄 Falling back to default baby journal chapters');
    return generateDefaultChapters();
  }
}

/**
 * Generates default chapters for auto-generated books
 */
function generateDefaultChapters() {
  return [
    {
      id: 'welcome', 
      title: 'Welcome to the World', 
      order: 'a', 
      notes: []
    },
    {
      id: 'first-days', 
      title: 'First Days', 
      order: 'b', 
      notes: []
    },
    {
      id: 'milestones', 
      title: 'Milestones', 
      order: 'c', 
      notes: []
    },
    {
      id: 'firsts', 
      title: 'First Times', 
      order: 'd', 
      notes: []
    },
    {
      id: 'growth', 
      title: 'Growing Up', 
      order: 'e', 
      notes: []
    },
    {
      id: 'memories', 
      title: 'Special Memories', 
      order: 'f', 
      notes: []
    },
  ];
}
