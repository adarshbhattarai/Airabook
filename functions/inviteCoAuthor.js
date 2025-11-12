const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Initialize Admin SDK safely
if (!admin.apps.length) {
  admin.initializeApp();
}

// Helper function to get Firestore instance with database name from env or default to "airabook"
function getFirestoreDB() {
  const app = admin.app();
  // Get database name from environment variable, default to "airabook"
  const databaseId = process.env.FIRESTORE_DATABASE_ID || "airabook";
  
  try {
    const db = admin.firestore(app, databaseId);
    console.log(`🔥 Firestore instance obtained for database: ${databaseId}`);
    return db;
  } catch (error) {
    console.error(`❌ Error getting Firestore instance for database "${databaseId}":`, error);
    throw error;
  }
}

const db = getFirestoreDB();
const FieldValue = admin.firestore.FieldValue;

/**
 * Invite a user to be a co-author of a book.
 *
 * Request data:
 * - bookId: string (required)
 * - uid: string (optional; direct user ID)
 * - email: string (optional; for email lookup)
 * - username: string (optional; for username lookup; matches displayNameLower)
 */
exports.inviteCoAuthor = onCall({ region: "us-central1" }, async (request) => {
  const { data, auth } = request;

  // Authentication required
  if (!auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be signed in to invite co-authors."
    );
  }

  const { bookId, uid, email, username } = data || {};

  if (!bookId) {
    throw new HttpsError("invalid-argument", "Book ID is required.");
  }

  try {
    // 1️⃣ Fetch book
    const bookRef = db.collection("books").doc(bookId);
    const bookSnap = await bookRef.get();

    if (!bookSnap.exists) {
      throw new HttpsError("not-found", "Book not found.");
    }

    const bookData = bookSnap.data();

    // 2️⃣ Ensure caller is the owner
    if (bookData.ownerId !== auth.uid) {
      throw new HttpsError(
        "permission-denied",
        "Only the book owner can invite co-authors."
      );
    }

    // 3️⃣ Resolve target user (uid / email / username)
    let targetUserId = uid || null;
    let targetUserData = null;

    // a) Direct UID
    if (targetUserId) {
      const userSnap = await db.collection("users").doc(targetUserId).get();
      if (userSnap.exists) {
        targetUserData = { id: targetUserId, ...userSnap.data() };
      }
    } else if (email) {
      // b) Lookup by email
      const usersSnap = await db
        .collection("users")
        .where("email", "==", email.toLowerCase())
        .limit(1)
        .get();

      if (!usersSnap.empty) {
        const userDoc = usersSnap.docs[0];
        targetUserId = userDoc.id;
        targetUserData = { id: targetUserId, ...userDoc.data() };
      }
    } else if (username) {
      // c) Lookup by username (displayNameLower)
      const usersSnap = await db
        .collection("users")
        .where("displayNameLower", "==", username.toLowerCase())
        .limit(1)
        .get();

      if (!usersSnap.empty) {
        const userDoc = usersSnap.docs[0];
        targetUserId = userDoc.id;
        targetUserData = { id: targetUserId, ...userDoc.data() };
      }
    }

    // 4️⃣ If existing user found, add as co-author
    if (targetUserId && targetUserData) {
      // Already member?
      if (bookData.members && bookData.members[targetUserId]) {
        throw new HttpsError(
          "already-exists",
          "User is already a member of this book."
        );
      }

      // Inviting self?
      if (targetUserId === auth.uid) {
        throw new HttpsError(
          "invalid-argument",
          "You cannot invite yourself as a co-author."
        );
      }

      // Update book.members
      const updatedMembers = {
        ...(bookData.members || {}),
        [targetUserId]: "Co-author",
      };

      await bookRef.update({
        members: updatedMembers,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Update target user's accessibleBookIds
      const userRef = db.collection("users").doc(targetUserId);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        const userData = userDoc.data();
        let accessibleBookIds = userData.accessibleBookIds || [];

        // Migrate old string[] format -> object[] format
        if (
          accessibleBookIds.length > 0 &&
          typeof accessibleBookIds[0] === "string"
        ) {
          const bookPromises = accessibleBookIds.map(async (id) => {
            const bDoc = await db.collection("books").doc(id).get();
            const bData = bDoc.exists ? bDoc.data() : {};
            return {
              bookId: id,
              title: bData.babyName || bData.title || "Untitled Book",
              coverImage: bData.mediaCoverUrl || null,
            };
          });

          accessibleBookIds = await Promise.all(bookPromises);
        }

        // Add this book if missing
        const alreadyHasBook = accessibleBookIds.some(
          (item) => item.bookId === bookId
        );

        if (!alreadyHasBook) {
          accessibleBookIds.push({
            bookId,
            title: bookData.babyName || bookData.title || "Untitled Book",
            coverImage: bookData.mediaCoverUrl || null,
          });
        }

        await userRef.update({
          accessibleBookIds,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      console.log(`✅ Added ${targetUserId} as co-author to book ${bookId}`);

      return {
        success: true,
        status: "existing-user",
        userId: targetUserId,
        userData: {
          displayName: targetUserData.displayName || null,
          email: targetUserData.email || null,
        },
      };
    }

    // 5️⃣ No existing user found → create pending invite
    const inviteEmail = email || null;

    if (!inviteEmail) {
      throw new HttpsError(
        "not-found",
        "User not found. Please provide an email address to send an invitation."
      );
    }

    const inviteRef = db.collection("invites").doc();
    await inviteRef.set({
      bookId,
      email: inviteEmail.toLowerCase(),
      invitedBy: auth.uid,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    console.log(
      `📧 Created pending invite for ${inviteEmail} to book ${bookId}`
    );

    return {
      success: true,
      status: "pending-invite",
      inviteId: inviteRef.id,
      email: inviteEmail,
    };
  } catch (error) {
    console.error("Error inviting co-author:", error);

    // Preserve existing HttpsError
    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      "Failed to invite co-author. Please try again.",
      error.message
    );
  }
});
