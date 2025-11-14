const admin = require("firebase-admin");

// Get current project ID dynamically from environment
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'airabook-dev';
const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;

console.log(`🔧 Using project: ${PROJECT_ID}`);

// Initialize Firebase Admin
try {
  const serviceAccount = require("../functions/serviceAccountKey.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: STORAGE_BUCKET,
  });
  console.log("🔥 Firebase Admin initialized with service account");
} catch (e) {
  admin.initializeApp({
    storageBucket: STORAGE_BUCKET,
  });
  console.log("🔥 Firebase Admin initialized for local development");
}

/**
 * Test authentication with Firebase emulators
 * Run this after starting emulators
 */
async function testAuthentication() {
  console.log("🔐 Testing Authentication with Emulators...");

  try {
    // Test creating a user
    const testUser = await admin.auth().createUser({
      email: "test@example.com",
      password: "password123",
      displayName: "Test Parent"
    });
    console.log("✅ Created test user:", testUser.uid);

    // Test creating a custom token
    const customToken = await admin.auth().createCustomToken(testUser.uid);
    console.log("✅ Created custom token");

    // Test verifying the token
    const decodedToken = await admin.auth().verifyIdToken(customToken);
    console.log("✅ Verified token for user:", decodedToken.uid);

    // Test creating user document in Firestore
    const db = admin.firestore();
    await db.collection('users').doc(testUser.uid).set({
      displayName: "Test Parent",
      email: "test@example.com",
      accessibleBookIds: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("✅ Created user document in Firestore");

    // Test creating a book for the user
    const bookRef = await db.collection('books').add({
      title: "Test Baby Book",
      creationType: "auto-generate",
      ownerId: testUser.uid,
      collaborators: [testUser.uid],
      chapters: [
        {id: 'welcome', title: 'Welcome to the World', order: 1, notes: []},
        {id: 'first-days', title: 'First Days', order: 2, notes: []}
      ],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("✅ Created test book:", bookRef.id);

    // Update user with book access
    await db.collection('users').doc(testUser.uid).update({
      accessibleBookIds: admin.firestore.FieldValue.arrayUnion(bookRef.id)
    });
    console.log("✅ Updated user with book access");

    console.log("\n🎉 Authentication test completed successfully!");
    console.log("📊 Created:");
    console.log("  - 1 test user (test@example.com)");
    console.log("  - 1 user document in Firestore");
    console.log("  - 1 test book");
    console.log("  - User-book relationship");

    console.log("\n🔍 You can now:");
    console.log("  - Sign in with test@example.com / password123");
    console.log("  - View the user in emulator UI: http://localhost:4000/auth");
    console.log("  - View the book in emulator UI: http://localhost:4000/firestore");

  } catch (error) {
    console.error("❌ Authentication test failed:", error);
  }
}

// Run if called directly
if (require.main === module) {
  testAuthentication().then(() => process.exit(0));
}

module.exports = { testAuthentication };
