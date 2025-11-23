const admin = require("firebase-admin");

// Set emulator environment variables
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.GCLOUD_PROJECT = "demo-project";

admin.initializeApp({
    projectId: "demo-project"
});

const db = admin.firestore();

async function verifyUserCreation() {
    console.log("🔍 Verifying user creation in Firestore...");

    try {
        const snapshot = await db.collection('users')
            .where('email', '==', 'testuser_17183@example.com')
            .get();

        if (snapshot.empty) {
            console.log("❌ No user found with email: testuser_17183@example.com");
        } else {
            snapshot.forEach(doc => {
                console.log("✅ User found!");
                console.log("🆔 User ID:", doc.id);
                console.log("📄 Document Data:", JSON.stringify(doc.data(), null, 2));
            });
        }
    } catch (error) {
        console.error("❌ Error querying Firestore:", error);
    }
}

verifyUserCreation();
