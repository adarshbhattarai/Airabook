const { onRequest, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// Initialize Admin SDK safely
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();
const app = express();

// Enable CORS
app.use(cors({ origin: true }));

/**
 * GET /search?q=searchTerm
 * Returns only public profile fields using Auth and Firestore search.
 */
app.get("/search", async (req, res) => {
    const searchTerm = req.query.q;

    if (!searchTerm || searchTerm.length < 2) {
        return res.json({ results: [] });
    }

    try {
        const searchLower = searchTerm.toLowerCase();
        const usersRef = db.collection("users");
        let searchResults = [];

        // 1️⃣ Try searching Auth by exact email (fast)
        if (searchTerm.includes("@")) {
            try {
                const userRecord = await auth.getUserByEmail(searchLower);
                searchResults.push({
                    id: userRecord.uid,
                    displayName: userRecord.displayName,
                    email: userRecord.email,
                    photoURL: userRecord.photoURL
                });
            } catch (e) {
                // Not found in Auth, fallback to Firestore
            }
        }

        // 2️⃣ Search Firestore by displayNameLower (partial match)
        const snapshot = await usersRef
            .orderBy("displayNameLower")
            .where("displayNameLower", ">=", searchLower)
            .where("displayNameLower", "<=", searchLower + "\uf8ff")
            .limit(20)
            .get();

        snapshot.forEach(doc => {
            const data = doc.data();
            // Avoid duplicates from Auth search
            if (!searchResults.some(r => r.id === doc.id)) {
                searchResults.push({
                    id: doc.id,
                    displayName: data.displayName || "Unknown User",
                    email: data.email || "",
                    photoURL: data.photoURL || null,
                });
            }
        });

        // 3️⃣ Final filtering 
        // We don't have request.auth.uid here easily without a middleware, 
        // but the frontend will filter out the current user anyway.
        return res.json({ results: searchResults });
    } catch (error) {
        console.error("Error searching users:", error);
        return res.status(500).json({ error: "Failed to search users." });
    }
});

exports.users = onRequest({ region: "us-central1" }, app);
