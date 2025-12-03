/**
 * LOCAL EMULATOR MEDIA TESTS
 * 
 * This test suite is designed for the Firebase Emulator and works around
 * the Storage Emulator's SSL limitations by using HTTP directly.
 * 
 * NOTE: Covers are FREE and not counted in storage usage.
 * 
 * Run with: node functions/tests/run-local-media-tests.cjs
 * 
 * Prerequisites:
 * - Firebase emulators running (npm run emulator)
 */

/* eslint-disable no-console */
process.env.GCLOUD_PROJECT = "demo-test";
process.env.GCP_PROJECT = "demo-test";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
process.env.FUNCTIONS_EMULATOR = "true";

const admin = require("firebase-admin");
const http = require("http");

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: "demo-test",
        storageBucket: "demo-test.appspot.com",
    });
}

const db = admin.firestore();

// Import functions
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

// HTTP helpers for emulator
async function uploadFileHTTP(storagePath, buffer) {
    return new Promise((resolve, reject) => {
        const encodedPath = encodeURIComponent(storagePath);
        const options = {
            hostname: '127.0.0.1',
            port: 9199,
            path: `/v0/b/demo-test.appspot.com/o?name=${encodedPath}`,
            method: 'POST',
            headers: {
                'Content-Type': 'image/jpeg',
                'Content-Length': buffer.length
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const url = `http://127.0.0.1:9199/v0/b/demo-test.appspot.com/o/${encodedPath}?alt=media`;
                    resolve({ storagePath, url, size: buffer.length });
                } else {
                    reject(new Error(`Upload failed: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(buffer);
        req.end();
    });
}

async function deleteFileHTTP(storagePath) {
    return new Promise((resolve, reject) => {
        const encodedPath = encodeURIComponent(storagePath);
        const options = {
            hostname: '127.0.0.1',
            port: 9199,
            path: `/v0/b/demo-test.appspot.com/o/${encodedPath}`,
            method: 'DELETE'
        };

        const req = http.request(options, (res) => {
            res.on('end', () => resolve());
        });

        req.on('error', reject);
        req.end();
    });
}

async function fileExistsHTTP(storagePath) {
    return new Promise((resolve) => {
        const encodedPath = encodeURIComponent(storagePath);
        const options = {
            hostname: '127.0.0.1',
            port: 9199,
            path: `/v0/b/demo-test.appspot.com/o/${encodedPath}`,
            method: 'GET'
        };

        const req = http.request(options, (res) => {
            resolve(res.statusCode === 200);
        });

        req.on('error', () => resolve(false));
        req.end();
    });
}

async function getDoc(collection, id) {
    const snap = await db.collection(collection).doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function cleanupUser(uid) {
    log(`🧹 Cleaning up user: ${uid}`);
    await db.collection("users").doc(uid).delete().catch(() => { });

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

    const albums = await db.collection("albums").where("accessPermission.ownerId", "==", uid).get();
    for (const doc of albums.docs) {
        await doc.ref.delete();
    }
}

// ============================================================================
// MAIN TEST SUITE
// ============================================================================

async function run() {
    const testUserId = "test-user-" + Date.now();

    log(`🚀 Starting Local Emulator Media Tests`);
    log(`📝 Test User ID: ${testUserId}`);
    log(`ℹ️  NOTE: Cover images are FREE and not counted in storage`);

    await cleanupUser(testUserId);

    // Create test user
    await db.collection("users").doc(testUserId).set({
        email: "test@example.com",
        displayName: "Test User",
        billing: { planTier: "free" },
        quotaCounters: { books: 0, albums: 0 },
        accessibleBookIds: [],
        accessibleAlbums: [],
        storageUsage: 0
    });

    log(`✅ Test user created`);

    let bookId, albumId, coverImage, testMedia1, testMedia2;

    // ========================================================================
    // TEST 1: Create Book with Cover
    // ========================================================================
    await test("1. Create Book with Cover (Auto-creates Album)", async () => {
        // Upload cover (FREE - not counted)
        const buffer = Buffer.alloc(50 * 1024, 'A');
        coverImage = await uploadFileHTTP(`${testUserId}/covers/book-cover.jpg`, buffer);
        log(`📸 Cover uploaded: ${coverImage.size} bytes (FREE - not counted)`);

        const response = await createBookFunc.createBook.run({
            data: {
                title: "My Test Book",
                subtitle: "Testing covers and media",
                creationType: 1,
                coverImageUrl: coverImage.url
            },
            auth: { uid: testUserId }
        });

        assert(response.success, "Book creation should succeed");
        bookId = response.bookId;
        log(`📚 Book created: ${bookId}`);

        // Verify book
        const bookDoc = await getDoc("books", bookId);
        assert(bookDoc, "Book should exist");
        assertEquals(bookDoc.babyName, "My Test Book", "Book title");
        assertEquals(bookDoc.coverImageUrl, coverImage.url, "Book cover URL");

        // Verify album auto-created
        const albumDoc = await getDoc("albums", bookId);
        assert(albumDoc, "Album should be auto-created");
        assertEquals(albumDoc.type, "book", "Album type");
        assertEquals(albumDoc.coverImage, coverImage.url, "Album cover synced");
        assertEquals(albumDoc.mediaCount, 0, "Initial media count");

        // Verify user
        const userDoc = await getDoc("users", testUserId);
        assert(userDoc.accessibleBookIds.some(b => b.bookId === bookId), "User has book access");
        assert(userDoc.accessibleAlbums.some(a => a.id === bookId), "User has album access");
        assertEquals(userDoc.storageUsage, 0, "Storage usage is 0 (covers are free)");

        log(`✅ Book, album, and user verified`);
    });

    // ========================================================================
    // TEST 2: Create Standalone Album
    // ========================================================================
    await test("2. Create Standalone Album", async () => {
        const response = await createAlbumFunc.createAlbum.run({
            data: {
                name: "My Vacation Photos",
                type: "custom"
            },
            auth: { uid: testUserId }
        });

        assert(response.success, "Album creation should succeed");
        albumId = response.albumId;
        log(`📸 Standalone album created: ${albumId}`);

        const albumDoc = await getDoc("albums", albumId);
        assert(albumDoc, "Album should exist");
        assertEquals(albumDoc.type, "custom", "Album type");
        assert(!albumDoc.bookId, "No bookId for standalone album");
    });

    // ========================================================================
    // TEST 3: Upload Media to Album
    // ========================================================================
    await test("3. Upload Media to Book's Album", async () => {
        // Upload test media (COUNTED in storage)
        const buffer1 = Buffer.alloc(100 * 1024, 'B');
        const buffer2 = Buffer.alloc(150 * 1024, 'C');

        testMedia1 = await uploadFileHTTP(
            `${testUserId}/${bookId}/_album_/_album_/media/image/test1.jpg`,
            buffer1
        );
        testMedia2 = await uploadFileHTTP(
            `${testUserId}/${bookId}/_album_/_album_/media/image/test2.jpg`,
            buffer2
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
        assertEquals(albumDoc.mediaCount, 2, "Media count");

        const userDoc = await getDoc("users", testUserId);
        const expectedStorage = testMedia1.size + testMedia2.size;
        assertEquals(userDoc.storageUsage, expectedStorage, "Storage usage updated");

        log(`✅ Media uploaded and storage tracked`);
    });

    // ========================================================================
    // TEST 4: Attach Media to Page (usedIn tracking)
    // ========================================================================
    await test("4. Attach Media to Page (Track usedIn)", async () => {
        // Create chapter and page
        const chapterRef = await db.collection("books").doc(bookId)
            .collection("chapters").add({
                title: "Chapter 1",
                order: "a",
                pagesSummary: []
            });

        const pageRef = await db.collection("books").doc(bookId)
            .collection("chapters").doc(chapterRef.id)
            .collection("pages").add({
                title: "Page 1",
                content: "Test content",
                media: []
            });

        log(`📄 Created chapter ${chapterRef.id} and page ${pageRef.id}`);

        // Attach media to page
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
        assert(media1, "Media should exist");
        assert(media1.usedIn, "UsedIn should exist");
        assertEquals(media1.usedIn.length, 1, "Should have 1 usage");
        assertEquals(media1.usedIn[0].pageId, pageRef.id, "Page ID should match");

        log(`✅ UsedIn tracking verified`);
    });

    // ========================================================================
    // TEST 5: Delete Single Media Item
    // ========================================================================
    await test("5. Delete Single Media Item", async () => {
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
        const exists = await fileExistsHTTP(testMedia1.storagePath);
        assert(!exists, "File should be deleted from storage");

        // Verify removed from album
        const albumDoc = await getDoc("albums", bookId);
        const stillExists = albumDoc.images.some(img => img.storagePath === testMedia1.storagePath);
        assert(!stillExists, "Should be removed from album");
        assertEquals(albumDoc.mediaCount, 1, "Media count decremented");

        // Verify storage usage
        const userDoc = await getDoc("users", testUserId);
        const expectedStorage = testMedia2.size; // Only media2 remains
        assertEquals(userDoc.storageUsage, expectedStorage, "Storage usage decremented");

        log(`✅ Media deleted and storage updated`);
    });

    // ========================================================================
    // TEST 6: Verify Final Storage
    // ========================================================================
    await test("6. Verify Final Storage Calculations", async () => {
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

        // Clean up files
        if (coverImage) await deleteFileHTTP(coverImage.storagePath).catch(() => { });
        if (testMedia1) await deleteFileHTTP(testMedia1.storagePath).catch(() => { });
        if (testMedia2) await deleteFileHTTP(testMedia2.storagePath).catch(() => { });

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
    console.log(`\nℹ️  Note: This is the LOCAL EMULATOR version.`);
    console.log(`   For production testing, use run-production-media-tests.cjs`);
    process.exit(0);
}

run().catch(err => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
});
