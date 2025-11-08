const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();
const FieldValue = require("firebase-admin/firestore").FieldValue;

/**
 * Invite a user to be a co-author of a book
 * Parameters:
 * - bookId: string (required)
 * - uid: string (optional, if user already found)
 * - email: string (optional, for email lookup)
 * - username: string (optional, for username lookup)
 */
exports.inviteCoAuthor = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be signed in to invite co-authors."
    );
  }

  const { bookId, uid, email, username } = data;

  if (!bookId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Book ID is required."
    );
  }

  try {
    // Get book document
    const bookRef = db.collection("books").doc(bookId);
    const bookSnap = await bookRef.get();

    if (!bookSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Book not found."
      );
    }

    const bookData = bookSnap.data();

    // Check if caller is the owner
    if (bookData.ownerId !== context.auth.uid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only the book owner can invite co-authors."
      );
    }

    let targetUserId = uid;
    let targetUserData = null;

    // If uid provided, use it directly
    if (targetUserId) {
      const userRef = db.collection("users").doc(targetUserId);
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        targetUserData = { id: targetUserId, ...userSnap.data() };
      }
    } else if (email) {
      // Look up user by email
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
      // Look up user by username (displayNameLower)
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

    // If user found, add as co-author
    if (targetUserId && targetUserData) {
      // Check if user is already a member
      if (bookData.members && bookData.members[targetUserId]) {
        throw new functions.https.HttpsError(
          "already-exists",
          "User is already a member of this book."
        );
      }

      // Check if trying to invite self
      if (targetUserId === context.auth.uid) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "You cannot invite yourself as a co-author."
        );
      }

      // Update book members
      const updatedMembers = {
        ...bookData.members,
        [targetUserId]: "Co-author",
      };

      await bookRef.update({
        members: updatedMembers,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Update user's accessibleBookIds
      const userRef = db.collection("users").doc(targetUserId);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        const userData = userDoc.data();
        let accessibleBookIds = userData.accessibleBookIds || [];

        // Convert old string array to object array if needed
        if (accessibleBookIds.length > 0 && typeof accessibleBookIds[0] === "string") {
          // For old format, fetch book titles from Firestore
          const bookPromises = accessibleBookIds.map(async (id) => {
            const bRef = db.collection("books").doc(id);
            const bDoc = await bRef.get();
            const bData = bDoc.exists ? bDoc.data() : {};
            return {
              bookId: id,
              title: bData.babyName || bData.title || "Untitled Book",
              coverImage: bData.mediaCoverUrl || null,
            };
          });
          accessibleBookIds = await Promise.all(bookPromises);
        }

        // Add book if not already present
        const bookExists = accessibleBookIds.some((item) => item.bookId === bookId);
        if (!bookExists) {
          accessibleBookIds.push({
            bookId: bookId,
            title: bookData.babyName || bookData.title || "Untitled Book",
            coverImage: bookData.mediaCoverUrl || null,
          });
        }

        await userRef.update({
          accessibleBookIds: accessibleBookIds,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      console.log(`✅ Added ${targetUserId} as co-author to book ${bookId}`);

      return {
        success: true,
        status: "existing-user",
        userId: targetUserId,
        userData: {
          displayName: targetUserData.displayName,
          email: targetUserData.email,
        },
      };
    } else {
      // User not found - create invite document
      const inviteEmail = email || null;
      if (!inviteEmail) {
        throw new functions.https.HttpsError(
          "not-found",
          "User not found. Please provide an email address to send an invitation."
        );
      }

      const inviteRef = db.collection("invites").doc();
      await inviteRef.set({
        bookId: bookId,
        email: inviteEmail.toLowerCase(),
        invitedBy: context.auth.uid,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
      });

      console.log(`📧 Created pending invite for ${inviteEmail} to book ${bookId}`);

      return {
        success: true,
        status: "pending-invite",
        inviteId: inviteRef.id,
        email: inviteEmail,
      };
    }
  } catch (error) {
    console.error("Error inviting co-author:", error);
    if (error.code) {
      throw error; // Re-throw HttpsError
    }
    throw new functions.https.HttpsError(
      "internal",
      "Failed to invite co-author. Please try again.",
      error.message
    );
  }
});

