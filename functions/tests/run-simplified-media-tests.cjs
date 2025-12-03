/**
 * SIMPLIFIED MEDIA & STORAGE INTEGRATION TESTS
 * 
 * This is a simplified version that works around Firebase Storage Emulator limitations
 * by using direct HTTP requests instead of the Admin SDK for file uploads.
 * 
 * Run with: node functions/tests/run-simplified-media-tests.cjs
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
const updateBookFunc = require("../updateBook");
const updateAlbumFunc = require("../updateAlbum");

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

// Upload file using HTTP (bypass Admin SDK SSL issue)
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

// Delete file using HTTP
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

// Check if file exists
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

    log(`🚀 Starting Simplified Media Tests`);
    log(`📝 Test User ID: ${testUserId}`);

    await cleanupUser(testUserId);

    // Create test user
    await db.collection("users").doc(testUserId).set({
        email: "test@example.com",
        displayName: "Test User",
        billing: { planTier: "free" },
        quotaCounters: { books: 0 },
        accessibleBookIds: [],
        accessibleAlbums: [],
        storageUsage: 0
    });

    let bookId, coverImage1, coverImage2;

    // TEST 1: Create Book with Cover
    await test("1. Create Book with Cover", async () => {
        // Upload cover using HTTP
        const buffer = Buffer.alloc(50 * 1024, 'A');
        coverImage1 = await uploadFileHTTP(`${testUserId}/covers/cover1.jpg`, buffer);
        logStorage("ADD", coverImage1.size, "Book cover 1");

        const response = await createBookFunc.createBook.run({
            data: {
                title: "Test Book",
                creationType: 1,
                coverImageUrl: coverImage1.url
            },
            auth: { uid: testUserId }
        });

        assert(response.success, "Book creation should succeed");
        bookId = response.bookId;
        log(`📚 Book created: ${bookId}`);

        // Verify
        const bookDoc = await getDoc("books", bookId);
        assert(bookDoc, "Book should exist");
        assertEquals(bookDoc.coverImageUrl, coverImage1.url, "Cover URL");

        const albumDoc = await getDoc("albums", bookId);
        assert(albumDoc, "Album should exist");
        assertEquals(albumDoc.coverImage, coverImage1.url, "Album cover");
    });

    // TEST 2: Update Book Cover (Old Deleted)
    await test("2. Update Book Cover - Old Cover Deleted", async () => {
        if (!bookId || !coverImage1) {
            throw new Error("Dependency failed");
        }

        // Upload new cover
        const buffer = Buffer.alloc(60 * 1024, 'B');
        coverImage2 = await uploadFileHTTP(`${testUserId}/covers/cover2.jpg`, buffer);
        logStorage("ADD", coverImage2.size, "Book cover 2");

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
        const oldExists = await fileExistsHTTP(coverImage1.storagePath);
        assert(!oldExists, "Old cover should be deleted");
        logStorage("REMOVE", coverImage1.size, "Old cover deleted");

        // Verify new cover applied
        const bookDoc = await getDoc("books", bookId);
        assertEquals(bookDoc.coverImageUrl, coverImage2.url, "Book has new cover");

        const albumDoc = await getDoc("albums", bookId);
        assertEquals(albumDoc.coverImage, coverImage2.url, "Album synced with new cover");

        log(`✅ Old cover deleted, new cover applied to both book and album`);
    });

    // TEST 3: Verify Storage Calculations
    await test("3. Verify Storage Calculations", async () => {
        const userDoc = await getDoc("users", testUserId);
        const userStorage = userDoc?.storageUsage || 0;

        let expectedStorage = 0;
        storageLog.forEach(op => {
            if (op.op === "ADD") expectedStorage += op.bytes;
            if (op.op === "REMOVE") expectedStorage -= op.bytes;
        });

        log(`📊 Storage Summary:`);
        log(`   User Storage: ${userStorage} bytes`);
        log(`   Expected:     ${expectedStorage} bytes`);
        log(`   Difference:   ${Math.abs(userStorage - expectedStorage)} bytes`);

        log(`\n📋 Storage Operations:`);
        storageLog.forEach((op, i) => {
            log(`   ${i + 1}. ${op.op} ${op.bytes} bytes - ${op.desc}`);
        });

        const diff = Math.abs(userStorage - expectedStorage);
        assert(diff < 1000, `Storage mismatch: ${diff} bytes`);
    });

    // CLEANUP
    await test("CLEANUP", async () => {
        await cleanupUser(testUserId);
        if (coverImage1) await deleteFileHTTP(coverImage1.storagePath).catch(() => { });
        if (coverImage2) await deleteFileHTTP(coverImage2.storagePath).catch(() => { });
        log(`✅ Cleanup complete`);
    });

    // SUMMARY
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
            console.error(`   - ${f.name}: ${f.err.message}`);
        });
        process.exit(1);
    }

    console.log(`\n🎉 All tests passed!`);
    process.exit(0);
}

run().catch(err => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
});
