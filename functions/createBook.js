const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const admin = require("firebase-admin");
const FieldValue = require("firebase-admin/firestore").FieldValue;
const { assertAndIncrementCounter } = require("./utils/limits");

// Firebase Admin should be initialized by index.js
// If not initialized, initialize with default settings (with console.log since logger might not be ready)
if (!admin.apps.length) {
  try {
    // Get current project ID dynamically from environment
    const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'airabook-dev';
    const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;
    
    admin.initializeApp({
      storageBucket: STORAGE_BUCKET,
    });
    console.log(`🔥 Firebase Admin initialized in createBook.js for project: ${PROJECT_ID}`);
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
  { region: "us-central1" },
  async (request) => {
    console.log("=".repeat(80));
    console.log("🔥 createBook function called at:", new Date().toISOString());
    console.log("=".repeat(80));
    
    const { data, auth, rawRequest } = request; // v2 shape
    
    // Log request details
    console.log("📦 Request data:", safeStringify(data));
    console.log("🔐 Auth context:", safeStringify(auth));
    console.log("🌐 Raw request available:", !!rawRequest);
    
    // Log auth token details if present
    if (rawRequest?.headers) {
      console.log("📋 Request headers:");
      console.log("  - Authorization:", rawRequest.headers.authorization ? "Present" : "Missing");
      console.log("  - Origin:", rawRequest.headers.origin);
      console.log("  - User-Agent:", rawRequest.headers['user-agent']);
    }

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

    logger.log("👤 Auth context:", auth ? safeStringify(auth) : "No auth");
    
    // Detailed auth logging
    if (auth) {
      console.log("✅ Auth object found:");
      console.log("  - UID:", auth.uid);
      console.log("  - Token:", auth.token ? safeStringify(auth.token) : "No token");
    } else {
      console.log("❌ No auth object in request");
    }

    // Check authentication
    if (!auth) {
      logger.error("❌ Authentication failed - no user context");
      console.log("❌ Request was unauthenticated - rejecting");
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to create a book."
      );
    }

    logger.log("✅ User authenticated:", auth.uid);

    const { title, creationType, promptMode, prompt } = data;
    const userId = auth.uid;

    let reservedBookSlot = false;

    try {
      // Validate input
      validateCreateBookRequest(data);
      logger.log(
        `📚 Creating book "${title}" for user ${userId} with type: ${creationType}`
      );
      logger.log(
        `⏰ Function execution started at: ${new Date().toISOString()}`
      );

      // Get Firestore instance - using default database
      const db = admin.firestore();
      logger.log(`🔥 Firestore instance obtained (default database)`);
      logger.log(`🔍 Attempting to access users collection for userId: ${userId}`);

      const titleNormalized = title.trim();
      const titleLower = titleNormalized.toLowerCase();

      // Ensure user doc exists + get current book count
      logger.log(`📖 Getting user document: users/${userId}`);
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();
      
      let userData = {};
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

      const currentBookCount = userData?.accessibleBookIds?.length || 0;
      logger.log(`📚 Current book count (legacy): ${currentBookCount}`);


      // Duplicate title check for this user
      logger.log(`🔍 Checking for duplicate title: "${titleNormalized}" for user ${userId}`);
      const dupSnap = await db
        .collection("books")
        .where("ownerId", "==", userId)
        .where("titleLower", "==", titleLower)
        .limit(1)
        .get();
      logger.log(`✅ Duplicate check completed. Found ${dupSnap.size} duplicate(s)`);


      if (!dupSnap.empty) {
        logger.log(
          `⚠️ Duplicate title detected for user ${userId}: ${titleNormalized}`
        );
        throw new HttpsError(
          "already-exists",
          "You already have a book with this title."
        );
      }

       // Enforce plan-based book limit
       await assertAndIncrementCounter(
        db,
        userId,
        "books",
        1,
        undefined,
        "You have reached your book limit for this plan."
      );
      reservedBookSlot = true;

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
      logger.log(`📝 Creating book document`);
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
      const bookRef = await db.collection("books").add(bookData);
      logger.log(`✅ Book created with ID: ${bookRef.id}`);
      logger.log(`📖 Book data saved to Firestore`);


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
      if (reservedBookSlot) {
        try {
          await assertAndIncrementCounter(db, auth.uid, "books", -1);
        } catch (revertErr) {
          logger.error("Failed to revert book counter after error:", revertErr);
        }
      }
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
