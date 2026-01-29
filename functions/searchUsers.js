const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Initialize Admin SDK safely
if (!admin.apps.length) {
    admin.initializeApp();
}

// Get default Firestore instance
const db = admin.firestore();

/**
 * Search for users by email or display name.
 * Returns only public profile fields: id, displayName, email, photoURL.
 *
 * Request data:
 * - searchTerm: string (required)
 */
exports.searchUsers = onCall({ region: "us-central1", cors: true }, async (request) => {
    console.log("Here Searching from searchUsersJS")
    const { data, auth } = request;

    // Authentication required
    if (!auth) {
        throw new HttpsError(
            "unauthenticated",
            "You must be signed in to search users."
        );
    }

    const { searchTerm } = data || {};

    if (!searchTerm || searchTerm.length < 2) {
        return { results: [] };
    }

    try {
        const searchLower = searchTerm.toLowerCase();
        const usersRef = db.collection("users");
        let searchResults = [];

        // 1️⃣ Check if search term looks like an email
        if (searchTerm.includes("@")) {
            const snapshot = await usersRef
                .where("email", "==", searchLower)
                .limit(1)
                .get();

            searchResults = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } else {
            // 2️⃣ Search by displayNameLower
            const snapshot = await usersRef
                .orderBy("displayNameLower")
                .where("displayNameLower", ">=", searchLower)
                .where("displayNameLower", "<=", searchLower + "\uf8ff")
                .limit(20)
                .get();

            searchResults = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        }

        // 3️⃣ Filter and format results
        // Filter out current user and map only allowed fields
        const formattedResults = searchResults
            .filter(user => user.id !== auth.uid)
            .map(user => ({
                id: user.id,
                displayName: user.displayName || "Unknown User",
                email: user.email || "",
                photoURL: user.photoURL || null,
            }));

        return { results: formattedResults };
    } catch (error) {
        console.error("Error searching users:", error);
        throw new HttpsError(
            "internal",
            "Failed to search users. Please try again.",
            error.message
        );
    }
});
