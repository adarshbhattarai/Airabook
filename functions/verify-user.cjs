const admin = require("firebase-admin");

// Set emulator environment variables
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.GCLOUD_PROJECT = "demo-project";

admin.initializeApp({
    projectId: "demo-project"
});

const db = admin.firestore();
db.settings({ ssl: false });

async function verifyUserCreation() {
    console.log("🔍 Verifying user creation in Firestore...");

    try {
        // Add a timeout
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 5000)
        );

        const queryPromise = db.collection('users')
            .where('email', '==', 'test_flow_8080@example.com')
            .get();

        const snapshot = await Promise.race([queryPromise, timeoutPromise]);

        if (snapshot.empty) {
            console.log("❌ No users found in the 'users' collection.");
        } else {
            console.log(`✅ Found ${snapshot.size} users:`);
            snapshot.forEach(doc => {
                const data = doc.data();
                console.log(`- ID: ${doc.id}, Email: ${data.email}, Name: ${data.displayName}`);
            });
        }
    } catch (error) {
        console.error("❌ Error querying Firestore:", error);
    } finally {
        process.exit(0);
    }
}

verifyUserCreation();
