/**
 * PRODUCTION MEDIA TESTS
 * 
 * This test suite is designed for DEPLOYED Firebase projects (dev/staging/prod).
 * It uses the Firebase Admin SDK normally without emulator workarounds.
 * 
 * NOTE: Covers are FREE and not counted in storage usage.
 * 
 * Run with: node functions/tests/run-production-media-tests.cjs
 * 
 * Prerequisites:
 * - Firebase project deployed
 * - Service account key (for authentication)
 * - Set GOOGLE_APPLICATION_CREDENTIALS environment variable
 * 
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json"
 *   export FIREBASE_PROJECT_ID="your-project-id"
 *   node functions/tests/run-production-media-tests.cjs
 */

/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

// Configuration
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "airabook-dev";
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!SERVICE_ACCOUNT_PATH) {
    console.error("❌ ERROR: GOOGLE_APPLICATION_CREDENTIALS not set");
    console.error("   Set it to your service account key path:");
    console.error("   export GOOGLE_APPLICATION_CREDENTIALS=\"path/to/serviceAccountKey.json\"");
    process.exit(1);
}

// Initialize Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: PROJECT_ID,
        storageBucket: `${PROJECT_ID}.appspot.com`,
    });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

// Import functions (they'll use the deployed versions)
const createBookFunc = require("../createBook");
const createAlbumFunc = require("../createAlbum");
const updateBookFunc = require("../updateBook");
const updateAlbumFunc = require("../updateAlbum");
const trackMediaUsageFunc = require("../mediaUsage");
const deleteMediaAssetFunc = require("../deleteMedia");

// Test results
const results = [];
const storageLog = [];

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

async function test(name, fn) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🔵 TEST: ${name}`);
    console.log("=".repeat(80));
    try {
        await fn();
        results.push({ name, ok: true });
        console.log(`✅ PASS: ${name}\n`);
    } catch (err) {
        results.push({ name, ok: false, err });
        console.error(`❌ FAIL: ${name}`);
        console.error(err.message);
        console.error(err.stack);
        console.log("");
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
}

function assertEquals(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
}

function logStorage(op, bytes, desc) {
    storageLog.push({ op, bytes, desc });
    log(`📊 Storage ${op}: ${bytes} bytes - ${desc}`);
}

// Helper to create test image
async function createTestImage(storagePath, sizeKB) {
    const buffer = Buffer.alloc(sizeKB * 1024, 'A');
    const file = bucket.file(storagePath);

    await file.save(buffer, {
        metadata: {
            contentType: 'image/jpeg',
            customMetadata: {
                originalName: path.basename(storagePath)
            }
        }
    });

    const [metadata] = await file.getMetadata();
    const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 1000 * 60 * 60 // 1 hour
    });

    return {
        storagePath,
        url,
        size: parseInt(metadata.size, 10)
    };
}

async function getDoc(collection, id) {
    const snap = await db.collection(collection).doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function cleanupUser(uid) {
    log(`🧹 Cleaning up user: ${uid}`);

    // Delete user document
    await db.collection("users").doc(uid).delete().catch(() => { });

    // Delete books and subcollections
    const books = await db.collection("books").where("ownerId", "==", uid).get();
    for (const doc of books.docs) {
        const chapters = await doc.ref.collection("chapters").get();
        for (const chapterDoc of chapters.docs) {
            const pages = await chapterDoc.ref.collection("pages").get();
            for (const pageDoc of pages.docs) {
                await pageDoc.ref.delete();
            }
            await chapterDoc.ref.delete();
        }
        await doc.ref.delete();
    }

    // Delete albums
    const albums = await db.collection("albums").where("accessPermission.ownerId", "==", uid).get();
    for (const doc of albums.docs) {
        await doc.ref.delete();
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

// ============================================================================
// MAIN TEST SUITE
// ============================================================================

async function run() {
    const testUserId = "test-prod-user-" + Date.now();

    log(`🚀 Starting Production Media Tests`);
    log(`📝 Project: ${PROJECT_ID}`);
    log(`📝 Test User ID: ${testUserId}`);
    log(`ℹ️  NOTE: Cover images are FREE and not counted in storage`);

    await cleanupUser(testUserId);

    // Create test user
    await db.collection("users").doc(testUserId).set({
        email: "test-prod@example.com",
        displayName: "Production Test User",
        billing: { planTier: "free" },
        quotaCounters: { books: 0, albums: 0 },
        accessibleBookIds: [],
        accessibleAlbums: [],
        storageUsage: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    log(`✅ Test user created`);

    let bookId, albumId, coverImage1, coverImage2, testMedia1, testMedia2;

    // ========================================================================
    // TEST 1: Create Book with Cover
    // ========================================================================
    await test("1. Create Book with Cover (Auto-creates Album)", async () => {
        // Create cover (FREE - not counted)
        coverImage1 = await createTestImage(`${testUserId}/covers/book-cover-1.jpg`, 50);
        log(`📸 Cover uploaded: ${coverImage1.size} bytes (FREE - not counted)`);

        const response = await createBookFunc.createBook.run({
            data: {
                title: "Production Test Book",
                subtitle: "Testing in real Firebase",
                creationType: 1,
                coverImageUrl: coverImage1.url
            },
            auth: { uid: testUserId }
        });

        assert(response.success, "Book creation should succeed");
        bookId = response.bookId;
        log(`📚 Book created: ${bookId}`);

        // Verify book
        const bookDoc = await getDoc("books", bookId);
        assert(bookDoc, "Book should exist");
        assertEquals(bookDoc.babyName, "Production Test Book", "Book title");

        // Verify album auto-created
        const albumDoc = await getDoc("albums", bookId);
        assert(albumDoc, "Album should be auto-created");
        assertEquals(albumDoc.type, "book", "Album type");
        assertEquals(albumDoc.mediaCount, 0, "Initial media count");

        // Verify user
        const userDoc = await getDoc("users", testUserId);
        assert(userDoc.accessibleBookIds.some(b => b.bookId === bookId), "User has book access");
        assertEquals(userDoc.storageUsage, 0, "Storage is 0 (covers are free)");

        log(`✅ Book, album, and user verified`);
    });

    // ========================================================================
    // TEST 2: Update Book Cover (Old Deleted)
    // ========================================================================
    await test("2. Update Book Cover - Old Cover Deleted", async () => {
        // Create new cover
        coverImage2 = await createTestImage(`${testUserId}/covers/book-cover-2.jpg`, 60);
        log(`📸 New cover uploaded: ${coverImage2.size} bytes`);

        // Update book
        await updateBookFunc.updateBook.run({
            data: {
                bookId,
                coverImageUrl: coverImage2.url
            },
            auth: { uid: testUserId }
        });

        log(`✅ Book cover updated`);

        // Verify old cover deleted
        const oldCoverFile = bucket.file(coverImage1.storagePath);
        const [exists] = await oldCoverFile.exists();
        assert(!exists, "Old cover should be deleted from storage");

        log(`🗑️ Old cover deleted successfully`);

        // Verify new cover applied
        const bookDoc = await getDoc("books", bookId);
        assert(bookDoc.coverImageUrl.includes(coverImage2.storagePath), "Book has new cover");

        // Verify album synced
        const albumDoc = await getDoc("albums", bookId);
        assert(albumDoc.coverImage.includes(coverImage2.storagePath), "Album synced with new cover");

        log(`✅ Old cover deleted, new cover applied to both book and album`);
    });

    // ========================================================================
    // TEST 3: Create Standalone Album
    // ========================================================================
    await test("3. Create Standalone Album", async () => {
        const response = await createAlbumFunc.createAlbum.run({
            data: {
                name: "Production Test Album",
                type: "custom"
            },
            auth: { uid: testUserId }
        });

        assert(response.success, "Album creation should succeed");
        albumId = response.albumId;
        log(`📸 Standalone album created: ${albumId}`);

        const albumDoc = await getDoc("albums", albumId);
        assertEquals(albumDoc.type, "custom", "Album type");
        assert(!albumDoc.bookId, "No bookId for standalone album");
    });

    // ========================================================================
    // TEST 4: Upload Media to Album
    // ========================================================================
    await test("4. Upload Media to Book's Album", async () => {
        // Upload test media (COUNTED in storage)
        testMedia1 = await createTestImage(
            `${testUserId}/${bookId}/_album_/_album_/media/image/test1.jpg`,
            100
        );
        testMedia2 = await createTestImage(
            `${testUserId}/${bookId}/_album_/_album_/media/image/test2.jpg`,
            150
        );

        logStorage("ADD", testMedia1.size, "Test media 1");
        logStorage("ADD", testMedia2.size, "Test media 2");

        // Add to album
        await db.collection("albums").doc(bookId).update({
            images: admin.firestore.FieldValue.arrayUnion(
                {
                    url: testMedia1.url,
                    storagePath: testMedia1.storagePath,
                    name: "test1.jpg",
                    uploadedAt: new Date().toISOString(),
                    usedIn: []
                },
                {
                    url: testMedia2.url,
                    storagePath: testMedia2.storagePath,
                    name: "test2.jpg",
                    uploadedAt: new Date().toISOString(),
                    usedIn: []
                }
            ),
            mediaCount: 2
        });

        // Update storage usage
        await db.collection("users").doc(testUserId).update({
            storageUsage: admin.firestore.FieldValue.increment(testMedia1.size + testMedia2.size)
        });

        // Verify
        const albumDoc = await getDoc("albums", bookId);
        assertEquals(albumDoc.images.length, 2, "Should have 2 images");

        const userDoc = await getDoc("users", testUserId);
        const expectedStorage = testMedia1.size + testMedia2.size;
        assertEquals(userDoc.storageUsage, expectedStorage, "Storage usage updated");

        log(`✅ Media uploaded and storage tracked`);
    });

    // ========================================================================
    // TEST 5: Attach Media to Page (usedIn tracking)
    // ========================================================================
    await test("5. Attach Media to Page (Track usedIn)", async () => {
        // Create chapter and page
        const chapterRef = await db.collection("books").doc(bookId)
            .collection("chapters").add({
                title: "Test Chapter",
                order: "a",
                pagesSummary: []
            });

        const pageRef = await db.collection("books").doc(bookId)
            .collection("chapters").doc(chapterRef.id)
            .collection("pages").add({
                title: "Test Page",
                content: "Test content",
                media: []
            });

        log(`📄 Created chapter ${chapterRef.id} and page ${pageRef.id}`);

        // Attach media
        await pageRef.update({
            media: admin.firestore.FieldValue.arrayUnion({
                url: testMedia1.url,
                storagePath: testMedia1.storagePath,
                type: "image",
                name: "test1.jpg",
                albumId: bookId
            })
        });

        // Track usage
        await trackMediaUsageFunc.trackMediaUsage.run({
            data: {
                albumId: bookId,
                storagePath: testMedia1.storagePath,
                bookId,
                chapterId: chapterRef.id,
                pageId: pageRef.id
            },
            auth: { uid: testUserId }
        });

        // Verify usedIn
        const albumDoc = await getDoc("albums", bookId);
        const media1 = albumDoc.images.find(img => img.storagePath === testMedia1.storagePath);
        assert(media1.usedIn, "UsedIn should exist");
        assertEquals(media1.usedIn.length, 1, "Should have 1 usage");
        assertEquals(media1.usedIn[0].pageId, pageRef.id, "Page ID should match");

        log(`✅ UsedIn tracking verified`);
    });

    // ========================================================================
    // TEST 6: Delete Single Media Item
    // ========================================================================
    await test("6. Delete Single Media Item", async () => {
        await deleteMediaAssetFunc.deleteMediaAsset.run({
            data: {
                storagePath: testMedia1.storagePath,
                bookId
            },
            auth: { uid: testUserId }
        });

        log(`🗑️ Media deleted: ${testMedia1.storagePath}`);
        logStorage("REMOVE", testMedia1.size, "Test media 1 deleted");

        // Verify file deleted
        const file = bucket.file(testMedia1.storagePath);
        const [exists] = await file.exists();
        assert(!exists, "File should be deleted from storage");

        // Verify removed from album
        const albumDoc = await getDoc("albums", bookId);
        const stillExists = albumDoc.images.some(img => img.storagePath === testMedia1.storagePath);
        assert(!stillExists, "Should be removed from album");
        assertEquals(albumDoc.mediaCount, 1, "Media count decremented");

        // Verify storage usage
        const userDoc = await getDoc("users", testUserId);
        const expectedStorage = testMedia2.size;
        assertEquals(userDoc.storageUsage, expectedStorage, "Storage usage decremented");

        log(`✅ Media deleted and storage updated`);
    });

    // ========================================================================
    // TEST 7: Verify Final Storage
    // ========================================================================
    await test("7. Verify Final Storage Calculations", async () => {
        const userDoc = await getDoc("users", testUserId);
        const userStorage = userDoc.storageUsage;

        let expectedStorage = 0;
        storageLog.forEach(op => {
            if (op.op === "ADD") expectedStorage += op.bytes;
            if (op.op === "REMOVE") expectedStorage -= op.bytes;
        });

        log(`📊 Storage Summary:`);
        log(`   User Storage: ${userStorage} bytes`);
        log(`   Expected:     ${expectedStorage} bytes`);
        log(`   Covers:       FREE (not counted)`);

        log(`\n📋 Storage Operations:`);
        storageLog.forEach((op, i) => {
            log(`   ${i + 1}. ${op.op} ${op.bytes} bytes - ${op.desc}`);
        });

        assertEquals(userStorage, expectedStorage, "Storage should match");
        log(`✅ Storage calculations verified`);
    });

    // ========================================================================
    // CLEANUP
    // ========================================================================
    await test("CLEANUP", async () => {
        await cleanupUser(testUserId);
        log(`✅ Cleanup complete`);
    });

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("TEST SUMMARY");
    console.log("=".repeat(80));

    const failed = results.filter(r => !r.ok);
    const passed = results.filter(r => r.ok);

    console.log(`Total: ${results.length}`);
    console.log(`✅ Passed: ${passed.length}`);
    console.log(`❌ Failed: ${failed.length}`);

    if (failed.length > 0) {
        console.log(`\n❌ Failed Tests:`);
        failed.forEach(f => {
            console.error(`   - ${f.name}`);
            console.error(`     ${f.err.message}`);
        });
        process.exit(1);
    }

    console.log(`\n🎉 All tests passed!`);
    console.log(`\n✅ Production tests completed successfully on ${PROJECT_ID}`);
    process.exit(0);
}

run().catch(err => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
});
