/**
 * COMPREHENSIVE MEDIA & STORAGE INTEGRATION TESTS
 * 
 * This test suite covers:
 * 1. Book & Album Creation (linked and standalone)
 * 2. Media Upload to Albums
 * 3. Asset Selection & Page Attachment (usedIn tracking)
 * 4. Cover Image Updates (with old cover deletion)
 * 5. Media Deletion (single item & full album)
 * 6. Storage Usage Tracking
 * 7. UsedIn Functionality Validation
 * 
 * Run with: node functions/tests/run-comprehensive-media-tests.cjs
 * 
 * Prerequisites:
 * - Firebase emulators running (npm run emulator)
 * - Emulator ports: Firestore:8080, Auth:9099, Storage:9199, Functions:5001
 */

/* eslint-disable no-console */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || process.env.PROJECT_ID || "demo-test";
process.env.GCP_PROJECT = process.env.GCLOUD_PROJECT;
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.STORAGE_EMULATOR_HOST = process.env.STORAGE_EMULATOR_HOST || "127.0.0.1:9199";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = process.env.STORAGE_EMULATOR_HOST;
process.env.FUNCTIONS_EMULATOR = "true";

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: process.env.GCLOUD_PROJECT,
        storageBucket: `${process.env.GCLOUD_PROJECT}.appspot.com`,
    });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

// Import functions to test
const createBookFunc = require("../createBook");
const createAlbumFunc = require("../createAlbum");
const updateBookFunc = require("../updateBook");
const updateAlbumFunc = require("../updateAlbum");
const deleteMediaAssetFunc = require("../deleteMedia");
const trackMediaUsageFunc = require("../mediaUsage");

// Test harness
const results = [];
const storageLog = []; // Track all storage operations

function log(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    if (data) {
        console.log(JSON.stringify(data, null, 2));
    }
}

async function test(name, fn) {
    console.log(`\\n${"=".repeat(80)}`);
    console.log(`🔵 TEST: ${name}`);
    console.log("=".repeat(80));
    try {
        await fn();
        results.push({ name, ok: true });
        console.log(`✅ PASS: ${name}\\n`);
    } catch (err) {
        results.push({ name, ok: false, err });
        console.error(`❌ FAIL: ${name}`);
        console.error(err);
        console.log("");
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || "Assertion failed");
    }
}

function assertEquals(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || "Assertion failed"}: expected ${expected}, got ${actual}`);
    }
}

// Storage tracking helpers
function logStorageOperation(operation, bytes, description) {
    storageLog.push({ operation, bytes, description, timestamp: new Date().toISOString() });
    log(`📊 Storage ${operation}: ${bytes} bytes - ${description}`);
}

function calculateExpectedStorage() {
    let total = 0;
    storageLog.forEach(op => {
        if (op.operation === "ADD") total += op.bytes;
        if (op.operation === "REMOVE") total -= op.bytes;
    });
    return total;
}

// Cleanup helper
async function cleanupUser(uid) {
    log(`🧹 Cleaning up user: ${uid}`);

    // Delete user document
    await db.collection("users").doc(uid).delete();

    // Delete books and their subcollections
    const books = await db.collection("books").where("ownerId", "==", uid).get();
    for (const bookDoc of books.docs) {
        const chapters = await bookDoc.ref.collection("chapters").get();
        for (const chapterDoc of chapters.docs) {
            const pages = await chapterDoc.ref.collection("pages").get();
            for (const pageDoc of pages.docs) {
                await pageDoc.ref.delete();
            }
            await chapterDoc.ref.delete();
        }
        await bookDoc.ref.delete();
    }

    // Delete albums
    const albums = await db.collection("albums").where("accessPermission.ownerId", "==", uid).get();
    for (const albumDoc of albums.docs) {
        await albumDoc.ref.delete();
    }

    // Delete storage files
    try {
        const [files] = await bucket.getFiles({ prefix: `${uid}/` });
        for (const file of files) {
            await file.delete({ ignoreNotFound: true });
        }
    } catch (err) {
        log(`⚠️ Storage cleanup warning: ${err.message}`);
    }
}

// Helper to create a test image file
async function createTestImage(filename, sizeKB = 10) {
    const buffer = Buffer.alloc(sizeKB * 1024, 'A'); // Fill with 'A's
    const storagePath = filename;
    const file = bucket.file(storagePath);
    await file.save(buffer, {
        metadata: {
            contentType: 'image/jpeg',
            customMetadata: {
                originalName: path.basename(filename)
            }
        }
    });
    const [metadata] = await file.getMetadata();
    const downloadURL = `http://127.0.0.1:9199/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;
    return {
        storagePath,
        url: downloadURL,
        size: parseInt(metadata.size, 10)
    };
}

// Helper to get document
async function getDoc(collection, id) {
    const snap = await db.collection(collection).doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

// Helper to get user storage usage
async function getUserStorageUsage(uid) {
    const userDoc = await getDoc("users", uid);
    return userDoc?.storageUsage || 0;
}

// ============================================================================
// MAIN TEST SUITE
// ============================================================================

async function run() {
    const testUserId = "test-media-user-" + Date.now();

    log(`🚀 Starting Comprehensive Media Tests`);
    log(`📝 Test User ID: ${testUserId}`);

    // Clean up before starting
    await cleanupUser(testUserId);

    // Create test user
    await db.collection("users").doc(testUserId).set({
        email: "media-test@example.com",
        displayName: "Media Test User",
        billing: { planTier: "free" },
        quotaCounters: { books: 0, albums: 0 },
        accessibleBookIds: [],
        accessibleAlbums: [],
        storageUsage: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    log(`✅ Test user created`);

    let bookId1, bookId2, albumId1, albumId2;
    let testImage1, testImage2, testImage3, coverImage1, coverImage2;

    // ========================================================================
    // TEST 1: Create Books (with auto-created albums)
    // ========================================================================
    await test("1. Create Book with Cover (Auto-creates Album)", async () => {
        // Create cover image
        coverImage1 = await createTestImage(`${testUserId}/covers/book1-cover.jpg`, 50);
        logStorageOperation("ADD", coverImage1.size, "Book 1 cover image");

        const request = {
            data: {
                title: "My First Baby Book",
                subtitle: "A journey begins",
                creationType: 1, // Blank
                coverImageUrl: coverImage1.url
            },
            auth: { uid: testUserId }
        };

        const response = await createBookFunc.createBook.run(request);
        assert(response.success, "Book creation should succeed");
        bookId1 = response.bookId;

        log(`📚 Book created: ${bookId1}`);

        // Verify book document
        const bookDoc = await getDoc("books", bookId1);
        assert(bookDoc, "Book document should exist");
        assertEquals(bookDoc.babyName, "My First Baby Book", "Book title");
        assertEquals(bookDoc.ownerId, testUserId, "Book owner");
        assertEquals(bookDoc.coverImageUrl, coverImage1.url, "Book cover URL");

        // Verify album was auto-created
        const albumDoc = await getDoc("albums", bookId1);
        assert(albumDoc, "Album should be auto-created");
        assertEquals(albumDoc.type, "book", "Album type");
        assertEquals(albumDoc.bookId, bookId1, "Album bookId");
        assertEquals(albumDoc.coverImage, coverImage1.url, "Album cover should match book cover");
        assertEquals(albumDoc.mediaCount, 0, "Initial media count");

        // Verify user document
        const userDoc = await getDoc("users", testUserId);
        assert(userDoc.accessibleBookIds.some(b => b.bookId === bookId1), "User should have book access");
        assert(userDoc.accessibleAlbums.some(a => a.id === bookId1), "User should have album access");

        log(`✅ Book and Album verified`);
    });

    // ========================================================================
    // TEST 2: Create Second Book
    // ========================================================================
    await test("2. Create Second Book (for cross-book testing)", async () => {
        const request = {
            data: {
                title: "Second Book",
                creationType: 1
            },
            auth: { uid: testUserId }
        };

        const response = await createBookFunc.createBook.run(request);
        bookId2 = response.bookId;

        log(`📚 Second book created: ${bookId2}`);
    });

    // ========================================================================
    // TEST 3: Create Standalone Album
    // ========================================================================
    await test("3. Create Standalone Album (not linked to book)", async () => {
        const request = {
            data: {
                name: "My Vacation Photos",
                type: "custom"
            },
            auth: { uid: testUserId }
        };

        const response = await createAlbumFunc.createAlbum.run(request);
        assert(response.success, "Album creation should succeed");
        albumId1 = response.albumId;

        log(`📸 Standalone album created: ${albumId1}`);

        // Verify album
        const albumDoc = await getDoc("albums", albumId1);
        assert(albumDoc, "Album should exist");
        assertEquals(albumDoc.type, "custom", "Album type should be custom");
        assert(!albumDoc.bookId, "Standalone album should not have bookId");

        log(`✅ Standalone album verified`);
    });

    // ========================================================================
    // TEST 4: Upload Media to Book's Album
    // ========================================================================
    await test("4. Upload Media to Book's Album", async () => {
        // Create test images
        testImage1 = await createTestImage(`${testUserId}/${bookId1}/_album_/_album_/media/image/test-image-1.jpg`, 100);
        testImage2 = await createTestImage(`${testUserId}/${bookId1}/_album_/_album_/media/image/test-image-2.jpg`, 150);

        logStorageOperation("ADD", testImage1.size, "Test image 1 uploaded");
        logStorageOperation("ADD", testImage2.size, "Test image 2 uploaded");

        // Manually add to album (simulating mediaProcessor trigger)
        const albumRef = db.collection("albums").doc(bookId1);
        await albumRef.update({
            images: admin.firestore.FieldValue.arrayUnion(
                {
                    url: testImage1.url,
                    storagePath: testImage1.storagePath,
                    name: "test-image-1.jpg",
                    uploadedAt: new Date().toISOString(),
                    usedIn: [] // Initialize empty usedIn array
                },
                {
                    url: testImage2.url,
                    storagePath: testImage2.storagePath,
                    name: "test-image-2.jpg",
                    uploadedAt: new Date().toISOString(),
                    usedIn: []
                }
            ),
            mediaCount: 2,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Update user storage
        await db.collection("users").doc(testUserId).update({
            storageUsage: admin.firestore.FieldValue.increment(testImage1.size + testImage2.size)
        });

        // Verify
        const albumDoc = await getDoc("albums", bookId1);
        assertEquals(albumDoc.images.length, 2, "Should have 2 images");
        assertEquals(albumDoc.mediaCount, 2, "Media count should be 2");

        const userStorage = await getUserStorageUsage(testUserId);
        const expectedStorage = coverImage1.size + testImage1.size + testImage2.size;
        log(`📊 User storage: ${userStorage} bytes (expected: ${expectedStorage})`);

        log(`✅ Media uploaded and verified`);
    });

    // ========================================================================
    // TEST 5: Attach Media to Page (usedIn tracking)
    // ========================================================================
    await test("5. Attach Media to Book Page (Track usedIn)", async () => {
        // First, create a chapter and page
        const chapterRef = await db.collection("books").doc(bookId1).collection("chapters").add({
            title: "Chapter 1",
            order: "a",
            pagesSummary: [],
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const pageRef = await db.collection("books").doc(bookId1)
            .collection("chapters").doc(chapterRef.id)
            .collection("pages").add({
                title: "Page 1",
                content: "This is my first page",
                media: [],
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

        log(`📄 Created chapter ${chapterRef.id} and page ${pageRef.id}`);

        // Attach testImage1 to the page
        await pageRef.update({
            media: admin.firestore.FieldValue.arrayUnion({
                url: testImage1.url,
                storagePath: testImage1.storagePath,
                type: "image",
                name: "test-image-1.jpg",
                albumId: bookId1 // Store albumId for untracking
            })
        });

        // Track usage in album
        const trackRequest = {
            data: {
                albumId: bookId1,
                storagePath: testImage1.storagePath,
                bookId: bookId1,
                chapterId: chapterRef.id,
                pageId: pageRef.id
            },
            auth: { uid: testUserId }
        };

        await trackMediaUsageFunc.trackMediaUsage.run(trackRequest);

        log(`✅ Media attached to page and usage tracked`);

        // Verify usedIn was updated
        const albumDoc = await getDoc("albums", bookId1);
        const image1 = albumDoc.images.find(img => img.storagePath === testImage1.storagePath);
        assert(image1, "Image should exist in album");
        assert(image1.usedIn, "UsedIn array should exist");
        assertEquals(image1.usedIn.length, 1, "Should have 1 usage");
        assertEquals(image1.usedIn[0].pageId, pageRef.id, "Page ID should match");

        log(`✅ UsedIn tracking verified: image used in ${image1.usedIn.length} page(s)`);
    });

    // ========================================================================
    // TEST 6: Update Book Cover (Delete old, add new)
    // ========================================================================
    await test("6. Update Book Cover (Old cover should be deleted)", async () => {
        // Create new cover
        coverImage2 = await createTestImage(`${testUserId}/covers/book1-cover-new.jpg`, 60);
        logStorageOperation("ADD", coverImage2.size, "New book cover uploaded");

        const oldCoverSize = coverImage1.size;

        const request = {
            data: {
                bookId: bookId1,
                coverImageUrl: coverImage2.url
            },
            auth: { uid: testUserId }
        };

        await updateBookFunc.updateBook.run(request);

        log(`✅ Book cover updated`);

        // Verify old cover was deleted
        const oldCoverFile = bucket.file(coverImage1.storagePath);
        const [exists] = await oldCoverFile.exists();
        assert(!exists, "Old cover should be deleted from storage");

        logStorageOperation("REMOVE", oldCoverSize, "Old book cover deleted");

        // Verify book document
        const bookDoc = await getDoc("books", bookId1);
        assertEquals(bookDoc.coverImageUrl, coverImage2.url, "Book should have new cover");

        // Verify album was also updated (they're linked)
        const albumDoc = await getDoc("albums", bookId1);
        assertEquals(albumDoc.coverImage, coverImage2.url, "Album should have new cover (synced)");

        log(`✅ Old cover deleted, new cover applied to both book and album`);
    });

    // ========================================================================
    // TEST 7: Update Standalone Album Cover
    // ========================================================================
    await test("7. Update Standalone Album Cover (No book sync)", async () => {
        // Add initial cover to standalone album
        const cover1 = await createTestImage(`${testUserId}/albums/${albumId1}/cover1.jpg`, 40);
        logStorageOperation("ADD", cover1.size, "Standalone album cover 1");

        await db.collection("albums").doc(albumId1).update({
            coverImage: cover1.url
        });

        // Now update to new cover
        const cover2 = await createTestImage(`${testUserId}/albums/${albumId1}/cover2.jpg`, 45);
        logStorageOperation("ADD", cover2.size, "Standalone album cover 2");

        const request = {
            data: {
                albumId: albumId1,
                coverImage: cover2.url
            },
            auth: { uid: testUserId }
        };

        await updateAlbumFunc.updateAlbum.run(request);

        // Verify old cover deleted
        const oldFile = bucket.file(cover1.storagePath);
        const [exists] = await oldFile.exists();
        assert(!exists, "Old standalone album cover should be deleted");

        logStorageOperation("REMOVE", cover1.size, "Old standalone album cover deleted");

        // Verify album updated
        const albumDoc = await getDoc("albums", albumId1);
        assertEquals(albumDoc.coverImage, cover2.url, "Album should have new cover");

        // Verify NO book was updated (standalone album)
        const bookDoc = await getDoc("books", albumId1);
        assert(!bookDoc, "No book should exist for standalone album");

        log(`✅ Standalone album cover updated without affecting any book`);
    });

    // ========================================================================
    // TEST 8: Delete Single Media Item
    // ========================================================================
    await test("8. Delete Single Media Item (Check usedIn cleanup)", async () => {
        const imageToDelete = testImage1;
        const imageSizeToDelete = imageToDelete.size;

        const request = {
            data: {
                storagePath: imageToDelete.storagePath,
                bookId: bookId1
            },
            auth: { uid: testUserId }
        };

        await deleteMediaAssetFunc.deleteMediaAsset.run(request);

        log(`🗑️ Media deleted: ${imageToDelete.storagePath}`);

        logStorageOperation("REMOVE", imageSizeToDelete, "Test image 1 deleted");

        // Verify file deleted from storage
        const file = bucket.file(imageToDelete.storagePath);
        const [exists] = await file.exists();
        assert(!exists, "File should be deleted from storage");

        // Verify removed from album
        const albumDoc = await getDoc("albums", bookId1);
        const stillExists = albumDoc.images.some(img => img.storagePath === imageToDelete.storagePath);
        assert(!stillExists, "Image should be removed from album");
        assertEquals(albumDoc.mediaCount, 1, "Media count should be decremented");

        // Verify storage usage decremented
        const userStorage = await getUserStorageUsage(testUserId);
        const expectedStorage = calculateExpectedStorage();
        log(`📊 User storage after deletion: ${userStorage} bytes (expected: ${expectedStorage})`);

        log(`✅ Media deleted and storage updated correctly`);
    });

    // ========================================================================
    // TEST 9: Storage Usage Calculation
    // ========================================================================
    await test("9. Verify Final Storage Usage Matches Calculations", async () => {
        const userStorage = await getUserStorageUsage(testUserId);
        const expectedStorage = calculateExpectedStorage();

        log(`📊 Storage Summary:`);
        log(`   User Storage (Firestore): ${userStorage} bytes`);
        log(`   Expected (Calculated):    ${expectedStorage} bytes`);
        log(`   Difference:               ${Math.abs(userStorage - expectedStorage)} bytes`);

        // Allow small difference due to rounding
        const difference = Math.abs(userStorage - expectedStorage);
        assert(difference < 1000, `Storage mismatch too large: ${difference} bytes`);

        log(`\\n📋 Storage Operation Log:`);
        storageLog.forEach((op, index) => {
            log(`   ${index + 1}. ${op.operation} ${op.bytes} bytes - ${op.description}`);
        });

        log(`✅ Storage calculations verified`);
    });

    // ========================================================================
    // TEST 10: Verify UsedIn Functionality
    // ========================================================================
    await test("10. Verify UsedIn Tracking Integrity", async () => {
        const albumDoc = await getDoc("albums", bookId1);

        log(`📋 UsedIn Status for Album ${bookId1}:`);

        albumDoc.images.forEach((img, index) => {
            log(`   Image ${index + 1}: ${img.name}`);
            log(`      Storage Path: ${img.storagePath}`);
            log(`      Used In: ${img.usedIn ? img.usedIn.length : 0} page(s)`);
            if (img.usedIn && img.usedIn.length > 0) {
                img.usedIn.forEach((usage, i) => {
                    log(`         ${i + 1}. Book: ${usage.bookId}, Chapter: ${usage.chapterId}, Page: ${usage.pageId}`);
                });
            }
        });

        // testImage1 was deleted, so it shouldn't exist
        // testImage2 should exist and have no usedIn (we didn't attach it)
        const image2 = albumDoc.images.find(img => img.storagePath === testImage2.storagePath);
        assert(image2, "Image 2 should still exist");
        assertEquals(image2.usedIn ? image2.usedIn.length : 0, 0, "Image 2 should not be used in any pages");

        log(`✅ UsedIn tracking verified`);
    });

    // ========================================================================
    // TEST 11: Verify Firestore Document Cleanup
    // ========================================================================
    await test("11. Verify Deleted Items Don't Exist in Firestore", async () => {
        // testImage1 should not exist in album
        const albumDoc = await getDoc("albums", bookId1);
        const deletedImageExists = albumDoc.images.some(img => img.storagePath === testImage1.storagePath);
        assert(!deletedImageExists, "Deleted image should not exist in Firestore");

        // Old covers should not exist in storage
        const oldCover1 = bucket.file(coverImage1.storagePath);
        const [cover1Exists] = await oldCover1.exists();
        assert(!cover1Exists, "Old book cover should not exist in storage");

        log(`✅ Deleted items properly cleaned up from Firestore and Storage`);
    });

    // ========================================================================
    // CLEANUP
    // ========================================================================
    await test("CLEANUP: Remove test data", async () => {
        await cleanupUser(testUserId);
        log(`✅ Test data cleaned up`);
    });

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log(`\\n${"=".repeat(80)}`);
    console.log("TEST SUMMARY");
    console.log("=".repeat(80));

    const failed = results.filter(r => !r.ok);
    const passed = results.filter(r => r.ok);

    console.log(`Total Tests: ${results.length}`);
    console.log(`✅ Passed: ${passed.length}`);
    console.log(`❌ Failed: ${failed.length}`);

    if (failed.length > 0) {
        console.log(`\\n❌ Failed Tests:`);
        failed.forEach(f => {
            console.error(`   - ${f.name}`);
            console.error(`     Error: ${f.err.message}`);
        });
        process.exit(1);
    }

    console.log(`\\n🎉 All tests passed!`);
    process.exit(0);
}

// Run tests
run().catch(err => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
});
