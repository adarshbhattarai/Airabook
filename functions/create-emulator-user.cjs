const admin = require("firebase-admin");

// Set emulator environment variables
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.GOOGLE_CLOUD_PROJECT = "demo-project";

// Get current project ID dynamically from environment (defaults to demo-project for emulator)
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'demo-project';
const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;

console.log(`🔧 Using emulator with project: ${PROJECT_ID}`);

// Initialize Firebase Admin for emulator only
admin.initializeApp({
  projectId: PROJECT_ID,
  storageBucket: STORAGE_BUCKET,
});

// Connect to Firestore emulator
const db = admin.firestore();
db.settings({
  host: "localhost:8080",
  ssl: false
});

/**
 * Creates a test user in the Firebase emulator
 */
async function createEmulatorUser() {
  console.log("🔐 Creating test user in Firebase emulator...");

  try {
    // Create user in Auth emulator
    const testUser = await admin.auth().createUser({
      email: "test@example.com",
      password: "password123",
      displayName: "Test Parent"
    });
    console.log("✅ Created test user in emulator:", testUser.uid);

    // Create user document in Firestore emulator
    await db.collection('users').doc(testUser.uid).set({
      displayName: "Test Parent",
      email: "test@example.com",
      accessibleBookIds: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("✅ Created user document in Firestore emulator");

    console.log("\n🎉 Emulator user created successfully!");
    console.log("📊 Created:");
    console.log("  - 1 test user (test@example.com)");
    console.log("  - 1 user document in Firestore emulator");

    console.log("\n🔍 You can now:");
    console.log("  - Sign in with test@example.com / password123");
    console.log("  - View the user in emulator UI: http://localhost:4000/auth");
    console.log("  - View the user in emulator UI: http://localhost:4000/firestore");

  } catch (error) {
    console.error("❌ Error creating emulator user:", error);
  }
}

// Run if called directly
if (require.main === module) {
  createEmulatorUser().then(() => process.exit(0));
}

module.exports = { createEmulatorUser };
