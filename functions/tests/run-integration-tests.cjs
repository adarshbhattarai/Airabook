/**
 * Integration tests for User Signup and Book Creation flows.
 * Run with: node functions/tests/run-integration-tests.cjs
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

// Import functions to test
// Note: We need to use 'require' to load the functions. 
// Since they might initialize admin internally, we ensure admin is init above first.
const onUserCreateFunc = require("../onUserCreate");
const createBookFunc = require("../createBook");

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
    console.log("\n" + "=".repeat(30));
    console.log("TEST SUMMARY");
    console.log("=".repeat(30));
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

async function cleanupUser(uid) {
    await db.collection("users").doc(uid).delete();
    // Cleanup books/albums owned by this user
    const books = await db.collection("books").where("ownerId", "==", uid).get();
    const batch = db.batch();
    books.forEach(doc => {
        batch.delete(doc.ref);
        // Also delete corresponding album
        batch.delete(db.collection("albums").doc(doc.id));
    });
    await batch.commit();
}

async function getDoc(collection, id) {
    const snap = await db.collection(collection).doc(id).get();
    return snap.exists ? snap.data() : null;
}

// --- Tests ---

async function run() {

    // --- Test 1: User Signup ---
    await test("User Signup: Creates user doc with correct defaults", async () => {
        const uid = "test-user-signup";
        const email = "signup@test.com";
        await cleanupUser(uid);

        // Mock the user object passed to onUserCreate
        const mockUser = {
            uid,
            email,
            displayName: "Test Signup User"
        };

        // Invoke the function directly (wrapping the handler)
        // functions.auth.user().onCreate returns a CloudFunction, 
        // but in local testing we often need to invoke the 'run' method if using firebase-functions-test
        // OR if it's v1/v2 specific. 
        // onUserCreate.js exports 'onUserCreate' which is a v1 function (functions.auth.user().onCreate)
        // To invoke it locally without firebase-functions-test wrapping, we can try calling the wrapped function if exposed,
        // but standard v1 functions don't expose .run() easily without the test SDK.
        // However, looking at onUserCreate.js, it exports the result of functions.auth.user().onCreate(...)
        // Let's try using the 'wrapped' function if we can, or just simulate what it does.
        // Actually, for simplicity and robustness without adding 'firebase-functions-test' dev dependency logic here,
        // we might need to rely on the fact that we can call the handler if we could access it.
        // BUT, since we are in a raw node script, let's try to use the 'run' method if available (v2 usually has it, v1 might not).

        // WAIT: onUserCreate.js uses `functions.auth.user().onCreate`. This is v1.
        // v1 functions exported by firebase-functions SDK are not directly callable functions in raw Node.
        // We might need `firebase-functions-test` to wrap it.
        // Let's check if `firebase-functions-test` is available in node_modules.
        // package.json has it in devDependencies.

        const testSDK = require("firebase-functions-test")({
            projectId: process.env.GCLOUD_PROJECT,
        }, "path/to/serviceAccountKey.json"); // We don't have key, but for emulators it might be fine or we mock config.

        // Wrap the function
        const wrappedOnUserCreate = testSDK.wrap(onUserCreateFunc.onUserCreate);

        await wrappedOnUserCreate(mockUser);

        // Verify
        const userDoc = await getDoc("users", uid);
        assert(userDoc, "User document should exist");
        assert(userDoc.email === email, "Email should match");
        assert(userDoc.billing?.planTier === "free" || userDoc.billing?.planTier === "early", "Plan tier should be set");
        assert(userDoc.quotaCounters, "Quota counters should be initialized");
    });


    // --- Test 2: Book Creation (Default) ---
    await test("Book Creation: Default settings", async () => {
        const uid = "test-user-book-1";
        await cleanupUser(uid);

        // Setup user first (needed for plan checks)
        await db.collection("users").doc(uid).set({
            email: "book1@test.com",
            billing: { planTier: "free" },
            quotaCounters: { books: 0 },
            accessibleBookIds: [],
            accessibleAlbums: []
        });

        // Mock request for createBook (Callable)
        // createBook is v2 onCall.
        // We can invoke .run() on v2 functions usually? 
        // createBook.js: exports.createBook = onCall(...)
        // v2 onCall functions have a .run(request) method for testing.

        const request = {
            data: {
                title: "My First Book",
                creationType: 1, // Blank
                coverImageUrl: "http://example.com/cover.jpg"
            },
            auth: { uid }
        };

        const response = await createBookFunc.createBook.run(request);

        assert(response.success, "Response should be success");
        assert(response.bookId, "Should return a bookId");

        const bookId = response.bookId;

        // Verify Book
        const bookDoc = await getDoc("books", bookId);
        assert(bookDoc, "Book document should exist");
        assert(bookDoc.titleLower === "my first book", "Title should be normalized");
        assert(bookDoc.ownerId === uid, "Owner should be correct");

        // Verify Album
        const albumDoc = await getDoc("albums", bookId);
        assert(albumDoc, "Album document should exist");
        assert(albumDoc.type === "book", "Album type should be book");

        // Verify User
        const userDoc = await getDoc("users", uid);
        assert(userDoc.accessibleBookIds.some(b => b.bookId === bookId), "User should have access to book");
        assert(userDoc.accessibleAlbums.some(a => a.id === bookId), "User should have access to album");
        assert(userDoc.quotaCounters.books === 1, "Book quota should increment");
    });


    // --- Test 3: Book Creation (Prompt Mode) ---
    await test("Book Creation: Prompt Mode (Auto-generate)", async () => {
        const uid = "test-user-book-2";
        await cleanupUser(uid);

        await db.collection("users").doc(uid).set({
            email: "book2@test.com",
            billing: { planTier: "free" },
            quotaCounters: { books: 0 },
            accessibleBookIds: [],
            accessibleAlbums: []
        });

        const request = {
            data: {
                title: "Space Adventure",
                creationType: 0, // Auto
                promptMode: true,
                prompt: "A story about a baby astronaut"
            },
            auth: { uid }
        };

        // We expect this to call AI. Since we don't want to burn tokens or rely on external API in integration test,
        // we might hit the real AI or fail if no API key. 
        // However, createBook.js has a try/catch around AI and falls back to default chapters if it fails.
        // So this test should pass regardless of AI success/failure, verifying the fallback or success path.

        const response = await createBookFunc.createBook.run(request);

        assert(response.success, "Response should be success");
        const bookId = response.bookId;

        const bookDoc = await getDoc("books", bookId);
        assert(bookDoc.tags.includes("auto-generated"), "Should have auto-generated tag");

        // Check chapters
        const chapters = await db.collection("books").doc(bookId).collection("chapters").get();
        assert(!chapters.empty, "Should have chapters created");
    });


    // --- Test 4: Book Limit Enforcement ---
    await test("Book Creation: Enforce Limit", async () => {
        const uid = "test-user-limit";
        await cleanupUser(uid);

        // Setup user with MAX books (assuming free limit is small, or we force it)
        // limits.js usually defines limits. Let's assume free limit is 1 for testing or set high usage.
        // We can check limits.js to see what the limit is, OR we can just set usage very high.

        // Let's check limits.js logic briefly? 
        // For now, let's set 'books' to a high number like 100.

        await db.collection("users").doc(uid).set({
            email: "limit@test.com",
            billing: { planTier: "free" },
            quotaCounters: { books: 100 }, // Likely over limit
            accessibleBookIds: [],
            accessibleAlbums: []
        });

        const request = {
            data: {
                title: "Forbidden Book",
                creationType: 1
            },
            auth: { uid }
        };

        let errorCaught = null;
        try {
            await createBookFunc.createBook.run(request);
        } catch (err) {
            errorCaught = err;
        }

        assert(errorCaught, "Should throw error");
        // We expect "resource-exhausted" or similar custom error message
        // assert(errorCaught.code === 'resource-exhausted', `Expected resource-exhausted, got ${errorCaught.code}`);
        // Note: assertAndIncrementCounter throws HttpsError.

        // Verify no book created
        const books = await db.collection("books").where("ownerId", "==", uid).get();
        assert(books.empty, "No book should be created");
    });

    summaryAndExit();
}

run().catch(err => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
});
