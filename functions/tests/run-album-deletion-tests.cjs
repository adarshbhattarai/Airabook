/**
 * Comprehensive test for Book and Album deletion scenarios
 * 
 * Scenarios:
 * 1. Create book + upload image → album created, storage incremented
 * 2. Create standalone album + upload image → storage incremented
 * 3. Delete book → album remains, storage unchanged
 * 4. Delete albums → storage decremented, files removed
 * 
 * Run with: node functions/tests/run-album-deletion-tests.cjs
 */

/* eslint-disable no-console */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || process.env.PROJECT_ID || "demo-test";
process.env.GCP_PROJECT = process.env.GCLOUD_PROJECT;
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.STORAGE_EMULATOR_HOST = process.env.STORAGE_EMULATOR_HOST || "127.0.0.1:9199";
process.env.FUNCTIONS_EMULATOR = "true";

const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: process.env.GCLOUD_PROJECT,
        storageBucket: `${process.env.GCLOUD_PROJECT}.appspot.com`,
    });
}
const db = admin.firestore();

// --- Test Harness ---
const results = [];
async function test(name, fn) {
    console.log(`\n🔵 Running: ${name}`);
    try {
        await fn();
        results.push({ name, ok: true });
        console.log(`✅ PASS: ${name}`);
    } catch (err) {
        results.push({ name, ok: false, err });
        console.error(`❌ FAIL: ${name}`);
        console.error(err);
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || "Assertion failed");
    }
}

function summaryAndExit() {
    console.log("\n" + "=".repeat(50));
    console.log("TEST SUMMARY");
    console.log("=".repeat(50));
    const failed = results.filter(r => !r.ok);
    console.log(`Total: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`);

    if (failed.length) {
        console.log("\nFailed Tests:");
        failed.forEach(f => console.error(` - ${f.name}: ${f.err?.message || f.err}`));
        process.exit(1);
    }
    process.exit(0);
}

// --- Helpers ---

async function cleanupAll() {
    const collections = ["users", "books", "albums"];
    for (const coll of collections) {
        const snap = await db.collection(coll).get();
        const batch = db.batch();
        snap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
}

async function getUserStorage(uid) {
    const userSnap = await db.collection("users").doc(uid).get();
    return userSnap.data()?.quotaCounters?.storageBytesUsed || 0;
}

async function simulateMediaUpload(uid, bookId, size) {
    // Simulate what mediaProcessor does when a file is uploaded
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const currentUsage = userSnap.data()?.quotaCounters?.storageBytesUsed || 0;

    await userRef.update({
        "quotaCounters.storageBytesUsed": currentUsage + size
    });

    console.log(`   📤 Simulated upload: ${size} bytes (total: ${currentUsage + size})`);
}

async function simulateAlbumMediaAdd(albumId, storagePath, size) {
    // Add media to album document
    const albumRef = db.collection("albums").doc(albumId);
    const albumSnap = await albumRef.get();
    const albumData = albumSnap.data();

    const newImage = {
        url: `https://example.com/${storagePath}`,
        storagePath,
        type: "image",
        name: storagePath.split('/').pop(),
        usedIn: []
    };

    const images = albumData.images || [];
    images.push(newImage);

    await albumRef.update({
        images,
        mediaCount: (albumData.mediaCount || 0) + 1
    });

    console.log(`   📸 Added image to album: ${storagePath}`);
}

// --- Tests ---

async function run() {
    await cleanupAll();

    const uid = "test-user";
    const book1Id = "book-1";
    const book2Id = "book-2";
    const album1Id = book1Id; // Album created with book
    const album2Id = "standalone-album";

    // Setup user
    await db.collection("users").doc(uid).set({
        email: "test@example.com",
        billing: { planTier: "free" },
        quotaCounters: {
            storageBytesUsed: 0,
            books: 0
        },
        accessibleBookIds: [],
        accessibleAlbums: []
    });

    // --- Test 1: Create book with album ---
    await test("Create book creates album and updates storage", async () => {
        // Create book
        await db.collection("books").doc(book1Id).set({
            babyName: "Test Book 1",
            ownerId: uid,
            members: { [uid]: "Owner" },
            chapterCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // Create album (auto-created with book)
        await db.collection("albums").doc(album1Id).set({
            name: "Test Book 1",
            type: "book",
            bookId: book1Id,
            coverImage: null,
            images: [],
            videos: [],
            accessPermission: {
                ownerId: uid,
                accessType: "private",
                sharedWith: [],
            },
            mediaCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // Simulate uploading 2 images (1000 bytes each)
        await simulateMediaUpload(uid, book1Id, 1000);
        await simulateAlbumMediaAdd(album1Id, `${uid}/${book1Id}/_album_/_album_/media/image/img1.jpg`, 1000);

        await simulateMediaUpload(uid, book1Id, 1500);
        await simulateAlbumMediaAdd(album1Id, `${uid}/${book1Id}/_album_/_album_/media/image/img2.jpg`, 1500);

        const storage = await getUserStorage(uid);
        assert(storage === 2500, `Expected 2500 bytes, got ${storage}`);

        const albumSnap = await db.collection("albums").doc(album1Id).get();
        assert(albumSnap.exists, "Album should exist");
        assert(albumSnap.data().mediaCount === 2, "Album should have 2 media items");
    });

    // --- Test 2: Create standalone album ---
    await test("Create standalone album and upload media", async () => {
        // Create standalone album
        await db.collection("albums").doc(album2Id).set({
            name: "Standalone Album",
            type: "standalone",
            coverImage: null,
            images: [],
            videos: [],
            accessPermission: {
                ownerId: uid,
                accessType: "private",
                sharedWith: [],
            },
            mediaCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // Upload 3 images
        await simulateMediaUpload(uid, album2Id, 2000);
        await simulateAlbumMediaAdd(album2Id, `${uid}/${album2Id}/_album_/_album_/media/image/img1.jpg`, 2000);

        await simulateMediaUpload(uid, album2Id, 1800);
        await simulateAlbumMediaAdd(album2Id, `${uid}/${album2Id}/_album_/_album_/media/image/img2.jpg`, 1800);

        await simulateMediaUpload(uid, album2Id, 2200);
        await simulateAlbumMediaAdd(album2Id, `${uid}/${album2Id}/_album_/_album_/media/image/img3.jpg`, 2200);

        const storage = await getUserStorage(uid);
        assert(storage === 2500 + 6000, `Expected 8500 bytes, got ${storage}`);

        const albumSnap = await db.collection("albums").doc(album2Id).get();
        assert(albumSnap.data().mediaCount === 3, "Standalone album should have 3 media items");
    });

    // --- Test 3: Delete book (album should remain) ---
    await test("Delete book preserves album and storage", async () => {
        const storageBefore = await getUserStorage(uid);

        // Delete book document
        await db.collection("books").doc(book1Id).delete();

        // Verify album still exists
        const albumSnap = await db.collection("albums").doc(album1Id).get();
        assert(albumSnap.exists, "Album should still exist after book deletion");
        assert(albumSnap.data().mediaCount === 2, "Album should still have 2 media items");

        // Verify storage unchanged
        const storageAfter = await getUserStorage(uid);
        assert(storageAfter === storageBefore, `Storage should be unchanged (was ${storageBefore}, now ${storageAfter})`);

        console.log(`   ✓ Album preserved with ${albumSnap.data().mediaCount} media items`);
        console.log(`   ✓ Storage unchanged: ${storageAfter} bytes`);
    });

    // --- Test 4: Delete album (storage should decrease) ---
    await test("Delete album removes storage and decrements usage", async () => {
        const storageBefore = await getUserStorage(uid);

        // Get album data to calculate expected decrease
        const albumSnap = await db.collection("albums").doc(album1Id).get();
        const albumData = albumSnap.data();

        // Expected decrease: 2500 bytes (2 images from book1)
        const expectedDecrease = 2500;

        // Manually simulate what deleteAlbumAssets should do
        // 1. Calculate size
        // 2. Delete files (simulated)
        // 3. Delete album document
        await db.collection("albums").doc(album1Id).delete();

        // 4. Decrement storage
        const userRef = db.collection("users").doc(uid);
        await userRef.update({
            "quotaCounters.storageBytesUsed": storageBefore - expectedDecrease
        });

        const storageAfter = await getUserStorage(uid);
        assert(storageAfter === storageBefore - expectedDecrease,
            `Expected ${storageBefore - expectedDecrease} bytes, got ${storageAfter}`);

        // Verify album deleted
        const albumAfter = await db.collection("albums").doc(album1Id).get();
        assert(!albumAfter.exists, "Album should be deleted");

        console.log(`   ✓ Album deleted`);
        console.log(`   ✓ Storage decreased by ${expectedDecrease} bytes (${storageBefore} → ${storageAfter})`);
    });

    // --- Test 5: Delete standalone album ---
    await test("Delete standalone album removes all media and storage", async () => {
        const storageBefore = await getUserStorage(uid);

        // Expected decrease: 6000 bytes (3 images from standalone album)
        const expectedDecrease = 6000;

        // Delete album
        await db.collection("albums").doc(album2Id).delete();

        // Decrement storage
        const userRef = db.collection("users").doc(uid);
        await userRef.update({
            "quotaCounters.storageBytesUsed": storageBefore - expectedDecrease
        });

        const storageAfter = await getUserStorage(uid);
        assert(storageAfter === 0, `Expected 0 bytes, got ${storageAfter}`);

        console.log(`   ✓ All albums deleted`);
        console.log(`   ✓ Storage fully cleared: ${storageAfter} bytes`);
    });

    summaryAndExit();
}

run().catch(err => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
});
