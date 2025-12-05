const admin = require("firebase-admin");

// Get current project ID dynamically from environment
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'airabook-dev';
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`;

console.log(`🔧 Using project: ${PROJECT_ID}`);

// Initialize Firebase Admin
try {
  const serviceAccount = require("./serviceAccountKey.json");
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

// Connect to Firestore emulator
const db = admin.firestore();
db.settings({
  host: "localhost:8080",
  ssl: false
});

/**
 * Seeds the Firestore emulator with test data
 * Run this after starting emulators
 */
async function seedData() {
  console.log("🌱 Seeding Firestore with test data...");

  try {
    // Create test users
    const testUsers = [
      {
        id: "test-user-1",
        data: {
          displayName: "Test Parent",
          email: "test@example.com",
          accessibleBookIds: ["book-1", "book-2"]
        }
      },
      {
        id: "test-user-2", 
        data: {
          displayName: "Another Parent",
          email: "parent2@example.com",
          accessibleBookIds: ["book-2"]
        }
      }
    ];

    for (const user of testUsers) {
      await db.collection('users').doc(user.id).set(user.data);
      console.log(`✅ Created user: ${user.data.displayName}`);
    }

    // Create test books
    const testBooks = [
      {
        id: "book-1",
        data: {
          title: "Emma's First Year",
          creationType: "auto-generate",
          ownerId: "test-user-1",
          collaborators: ["test-user-1"],
          chapters: [
            {id: 'welcome', title: 'Welcome to the World', order: 1, notes: []},
            {id: 'first-days', title: 'First Days', order: 2, notes: []},
            {id: 'milestones', title: 'Milestones', order: 3, notes: []}
          ],
          coverImageUrl: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      },
      {
        id: "book-2",
        data: {
          title: "Liam's Adventures",
          creationType: "blank",
          ownerId: "test-user-1",
          collaborators: ["test-user-1", "test-user-2"],
          chapters: [],
          coverImageUrl: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      }
    ];

    for (const book of testBooks) {
      await db.collection('books').doc(book.id).set(book.data);
      console.log(`✅ Created book: ${book.data.title}`);
    }

    // Create test media URLs
    const testMedia = [
      {
        id: "media-1",
        data: {
          url: "https://example.com/baby-photo-1.jpg",
          userId: "test-user-1",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }
      }
    ];

    for (const media of testMedia) {
      await db.collection('mediaUrls').doc(media.id).set(media.data);
      console.log(`✅ Created media: ${media.data.url}`);
    }

    console.log("🎉 Seeding complete!");
    console.log("📊 Created:");
    console.log("  - 2 test users");
    console.log("  - 2 test books");
    console.log("  - 1 test media item");

  } catch (error) {
    console.error("❌ Error seeding data:", error);
  }
}

// Run if called directly
if (require.main === module) {
  seedData().then(() => process.exit(0));
}

module.exports = { seedData };
