const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("./utils/firestore");

// Firebase Admin should be initialized by index.js
// If not initialized, initialize with default settings (with console.log since logger might not be ready)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      storageBucket: "airaproject-f5298.appspot.com",
    });
    console.log("🔥 Firebase Admin initialized in createBook.js");
  } catch (error) {
    // Admin might already be initialized, ignore error
    console.warn("⚠️ Admin initialization skipped:", error?.message || "Unknown error");
  }
}

// Initialize AI utilities
try { require("dotenv").config(); } catch (_) {}
const { callAI } = require("./utils/aiClient");
const {
  buildChapterGenerationPrompt,
  extractChapterTitles,
  titlesToChapters,
} = require("./utils/prompts");

// --- Helper: safe stringify ---------------------------------------------------
function safeStringify(obj, space = 2) {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      if (typeof value === "function") return "[Function]";
      return value;
    },
    space
  );
}

// --- FRACTIONAL INDEXING HELPERS ---------------------------------------------
const getMidpointString = (prev = "", next = "") => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let p = 0;
  while (p < prev.length || p < next.length) {
    const prevChar = prev.charAt(p) || "a";
    const nextChar = next.charAt(p) || "z";
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
  return prev + "m";
};

const getNewOrderBetween = (prevOrder = "", nextOrder = "") =>
  getMidpointString(prevOrder, nextOrder);

// --- Validation --------------------------------------------------------------
function validateCreateBookRequest(data) {
  const { title, creationType, promptMode, prompt } = data;

  if (!title || !title.trim()) {
    throw new HttpsError("invalid-argument", "Book title is required.");
  }

  if (title.length < 2) {
    throw new HttpsError(
      "invalid-argument",
      "Book title must be at least 2 characters long."
    );
  }

  if (title.length > 50) {
    throw new HttpsError(
      "invalid-argument",
      "Book title must be less than 50 characters."
    );
  }

  // creationType: 0 = auto-generate, 1 = blank
  if (creationType !== 0 && creationType !== 1) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid creation type. Must be 0 (auto-generate) or 1 (blank)."
    );
  }

  // promptMode and prompt consistency
  if (creationType === 1 && promptMode) {
    throw new HttpsError(
      "invalid-argument",
      "promptMode must be false when creationType is 1."
    );
  }

  if (
    creationType === 0 &&
    promptMode &&
    (!prompt || typeof prompt !== "string" || !prompt.trim())
  ) {
    throw new HttpsError(
      "invalid-argument",
      "prompt is required when promptMode is true."
    );
  }

  if (creationType === 0 && promptMode && prompt && prompt.length > 500) {
    throw new HttpsError(
      "invalid-argument",
      "prompt must be 500 characters or less."
    );
  }
}

// --- MAIN CALLABLE: createBook -----------------------------------------------
/**
 * Creates a new baby book
 * Called from CreateBook.jsx via httpsCallable(functions, "createBook")
 */
exports.createBook = onCall(
  async (request) => {
    const { data, auth } = request; // v2 shape

    logger.log("🚀 createBook function called at:", new Date().toISOString());

    logger.log(
      "📊 Received data:",
      safeStringify({
        title: data?.title,
        creationType: data?.creationType,
        promptMode: data?.promptMode,
        prompt: data?.prompt
          ? data.prompt.length > 100
            ? data.prompt.substring(0, 100) + "..."
            : data.prompt
          : undefined,
      })
    );

    console.log("Trying to make an update")

    logger.log("👤 Auth in request:", auth ? auth.uid : "No auth");

    // Check authentication
    if (!auth) {
      logger.error("❌ Authentication failed - no user context");
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to create a book."
      );
    }

    logger.log("✅ User authenticated:", auth.uid);

    const { title, creationType, promptMode, prompt } = data;
    const userId = auth.uid;

    

    try {
      // Validate input
      validateCreateBookRequest(data);
      logger.log(
        `📚 Creating book "${title}" for user ${userId} with type: ${creationType}`
      );
      logger.log(
        `⏰ Function execution started at: ${new Date().toISOString()}`
      );

      // Get Firestore instance - try named database first, fall back to default if not found
      let { db, databaseId } = getFirestore();
      logger.log(`🔥 Firestore instance obtained for database: ${databaseId}`);
      logger.log(`🔍 Attempting to access users collection for userId: ${userId}`);
      logger.log(`🔍 Database project: ${db.app?.options?.projectId || 'unknown'}`);

      const titleNormalized = title.trim();
      const titleLower = titleNormalized.toLowerCase();

      // Ensure user doc exists + get current book count
      logger.log(`📖 Getting user document: users/${userId}`);
      const userRef = db.collection("users").doc(userId);
      logger.log(`✅ User reference created: ${userRef.path}`);
      
      let userDoc;
      let userData = {};
      try {
        logger.log(`🔍 Fetching user document from database "${databaseId}"...`);
        userDoc = await userRef.get();
        logger.log(`✅ User document fetched. Exists: ${userDoc.exists}`);
        
        if (userDoc.exists) {
          userData = userDoc.data();
          logger.log(`📊 User data retrieved:`, {
            hasDisplayName: !!userData.displayName,
            hasEmail: !!userData.email,
            bookCount: userData?.accessibleBookIds?.length || 0
          });
        } else {
          logger.log(`⚠️ User document does not exist. Will be created if needed.`);
        }
      } catch (error) {
        // Check if it's a NOT_FOUND error (database doesn't exist)
        const isNotFoundError = error.code === 5 || 
                               error.message?.includes('NOT_FOUND') || 
                               error.message?.includes('not found') ||
                               error.details?.includes('NOT_FOUND');
        
        if (isNotFoundError && databaseId !== '(default)') {
          logger.warn(`⚠️ Database "${databaseId}" not found (error code: ${error.code}). Falling back to default database.`);
          logger.warn(`⚠️ Error message: ${error.message}`);
          
          // Fall back to default database
          try {
            const defaultDbInfo = getFirestore({
              databaseId: '(default)',
              forceRefresh: true,
              remember: true,
            });
            db = defaultDbInfo.db;
            databaseId = defaultDbInfo.databaseId;
            logger.log(`✅ Switched to default Firestore database`);
            
            // Retry the operation with default database
            const defaultUserRef = db.collection("users").doc(userId);
            logger.log(`🔍 Retrying user document fetch from default database...`);
            userDoc = await defaultUserRef.get();
            logger.log(`✅ User document fetched from default database. Exists: ${userDoc.exists}`);
            
            if (userDoc.exists) {
              userData = userDoc.data();
              logger.log(`📊 User data retrieved from default database:`, {
                hasDisplayName: !!userData.displayName,
                hasEmail: !!userData.email,
                bookCount: userData?.accessibleBookIds?.length || 0
              });
            } else {
              logger.log(`⚠️ User document does not exist in default database. Will be created if needed.`);
            }
          } catch (fallbackError) {
            logger.error(`❌ Error fetching user document from default database:`, fallbackError);
            logger.error(`❌ Error code: ${fallbackError.code}`);
            logger.error(`❌ Error message: ${fallbackError.message}`);
            throw new HttpsError(
              "internal",
              `Failed to access user document: ${fallbackError.message}`
            );
          }
        } else {
          logger.error(`❌ Error fetching user document:`, error);
          logger.error(`❌ Error code: ${error.code}`);
          logger.error(`❌ Error message: ${error.message}`);
          logger.error(`❌ Error details:`, error.details);
          throw new HttpsError(
            "internal",
            `Failed to access user document in database "${databaseId}": ${error.message}`
          );
        }
      }

      const currentBookCount = userData?.accessibleBookIds?.length || 0;
      if (currentBookCount >= 10) {
        throw new HttpsError(
          "resource-exhausted",
          "You have reached the maximum number of books (10)."
        );
      }

      // Duplicate title check for this user
      logger.log(`🔍 Checking for duplicate title: "${titleNormalized}" for user ${userId}`);
      let dupSnap;
      try {
        dupSnap = await db
          .collection("books")
          .where("ownerId", "==", userId)
          .where("titleLower", "==", titleLower)
          .limit(1)
          .get();
        logger.log(`✅ Duplicate check completed. Found ${dupSnap.size} duplicate(s)`);
      } catch (error) {
        logger.error(`❌ Error checking for duplicate title:`, error);
        logger.error(`❌ Error code: ${error.code}`);
        logger.error(`❌ Error message: ${error.message}`);
        throw new HttpsError(
          "internal",
          `Failed to check for duplicate title in database "${databaseId}": ${error.message}`
        );
      }

      if (!dupSnap.empty) {
        logger.log(
          `⚠️ Duplicate title detected for user ${userId}: ${titleNormalized}`
        );
        throw new HttpsError(
          "already-exists",
          "You already have a book with this title."
        );
      }

      // Decide chapters + description
      let chapters = [];
      let bookDescription = "";

      if (creationType === 0) {
        if (promptMode && prompt) {
          logger.log(
            `🤖 Generating custom chapters from prompt: ${prompt.substring(
              0,
              100
            )}...`
          );
          chapters = await generateChaptersFromPrompt(title, prompt);
          bookDescription = `A custom book "${title}" with AI-generated chapters based on your idea.`;
        } else {
          logger.log(
            `📖 Generating standard baby journal chapters for: ${title}`
          );
          chapters = generateDefaultChapters();
          bookDescription = `A beautiful baby book for ${title} with pre-generated chapters to get you started.`;
        }
      } else {
        chapters = [];
        bookDescription = `A blank baby book for ${title} - start writing your own story!`;
      }

      // Create book document
      logger.log(`📝 Creating book document in database: ${databaseId}`);
      const bookData = {
        babyName: titleNormalized,
        titleLower,
        creationType,
        description: bookDescription,
        ownerId: userId,
        members: {
          [userId]: "Owner",
        },
        chapterCount: chapters.length,
        coverImageUrl: null,
        isPublic: false,
        tags:
          creationType === 0
            ? ["auto-generated", "starter"]
            : ["blank", "custom"],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      logger.log(`🔍 Attempting to add book to collection: books`);
      let bookRef;
      try {
        bookRef = await db.collection("books").add(bookData);
        logger.log(`✅ Book created with ID: ${bookRef.id}`);
        logger.log(`📖 Book data saved to Firestore in database: ${databaseId}`);
      } catch (error) {
        logger.error(`❌ Error creating book document:`, error);
        logger.error(`❌ Error code: ${error.code}`);
        logger.error(`❌ Error message: ${error.message}`);
        logger.error(`❌ Error details:`, error.details);
        throw new HttpsError(
          "internal",
          `Failed to create book document in database "${databaseId}": ${error.message}`
        );
      }

      // Create chapter docs
      const chapterPromises = chapters.map(async (chapter) => {
        const chapterData = {
          title: chapter.title,
          order: chapter.order || getNewOrderBetween("", ""),
          notes: chapter.notes || [],
          pagesSummary: [],
          ownerId: userId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        const chapterRef = await db
          .collection("books")
          .doc(bookRef.id)
          .collection("chapters")
          .add(chapterData);

        logger.log(
          `📄 Chapter "${chapter.title}" created with ID: ${chapterRef.id} in book ${bookRef.id}`
        );
        return {
          id: chapterRef.id,
          title: chapter.title,
          order: chapterData.order,
        };
      });

      const createdChapters = await Promise.all(chapterPromises);
      logger.log(
        `📚 Created ${createdChapters.length} chapters for book ${bookRef.id}`
      );

      // Create album document for the book
      const albumRef = db.collection("albums").doc(bookRef.id);
      await albumRef.set({
        name: titleNormalized,
        type: "book",
        bookId: bookRef.id,
        coverImage: null,
        images: [],
        videos: [],
        accessPermission: {
          ownerId: userId,
          accessType: "private",
          sharedWith: [],
        },
        mediaCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      logger.log(`✅ Created album document: albums/${bookRef.id}`);

      // Update user doc with accessible books + albums
      let accessibleBookIds = userData.accessibleBookIds || [];

      // Migrate old string array -> object array if needed
      if (accessibleBookIds.length > 0 && typeof accessibleBookIds[0] === "string") {
        const bookPromises = accessibleBookIds.map(async (id) => {
          const bookDoc = await db.collection("books").doc(id).get();
          const bData = bookDoc.exists ? bookDoc.data() : {};
          return {
            bookId: id,
            title: bData.babyName || bData.title || "Untitled Book",
            coverImage: bData.mediaCoverUrl || null,
          };
        });
        accessibleBookIds = await Promise.all(bookPromises);
      }

      if (!accessibleBookIds.some((b) => b.bookId === bookRef.id)) {
        accessibleBookIds.push({
          bookId: bookRef.id,
          title: titleNormalized,
          coverImage: null,
        });
      }

      let accessibleAlbums = userData.accessibleAlbums || [];
      if (!accessibleAlbums.some((a) => a.id === bookRef.id)) {
        accessibleAlbums.push({
          id: bookRef.id,
          coverImage: null,
          type: "book",
          name: titleNormalized,
          mediaCount: 0,
          updatedAt: new Date(),
        });
      }

      await userRef.set(
        {
          accessibleBookIds,
          accessibleAlbums,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      logger.log(
        `👤 Updated user ${userId} with new book ID: ${bookRef.id}`
      );
      logger.log(
        `🎉 Function execution completed successfully at: ${new Date().toISOString()}`
      );

      return {
        success: true,
        bookId: bookRef.id,
        babyName: title.trim(),
        creationType,
        description: bookDescription,
        chaptersCount: createdChapters.length,
        chapters: createdChapters,
        message: `Book "${title}" created successfully with ${createdChapters.length} chapters!`,
      };
    } catch (error) {
      logger.error("Error creating book:", error);
      logger.error("Error stack:", error.stack);
      // Re-throw HttpsError as-is if it's already one
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        `Failed to create book: ${error.message || "Unknown error"}`
      );
    }
  }
);

// --- AI helpers --------------------------------------------------------------
async function generateChaptersFromPrompt(title, prompt) {
  try {
    logger.log("🤖 Calling AI to generate custom chapters...");
    const instruction = buildChapterGenerationPrompt(title, prompt);
    const content = await callAI(instruction, {
      maxTokens: 500,
      temperature: 0.8,
    });
    logger.log("📝 AI response:", content);

    const titles = extractChapterTitles(content);
    const chapters = titlesToChapters(titles);

    logger.log(`✅ Generated ${chapters.length} custom chapters`);
    return chapters;
  } catch (error) {
    logger.error("❌ Error generating custom chapters:", error);
    logger.log("🔄 Falling back to default baby journal chapters");
    return generateDefaultChapters();
  }
}

function generateDefaultChapters() {
  return [
    { id: "welcome", title: "Welcome to the World", order: "a", notes: [] },
    { id: "first-days", title: "First Days", order: "b", notes: [] },
    { id: "milestones", title: "Milestones", order: "c", notes: [] },
    { id: "firsts", title: "First Times", order: "d", notes: [] },
    { id: "growth", title: "Growing Up", order: "e", notes: [] },
    { id: "memories", title: "Special Memories", order: "f", notes: [] },
  ];
}
