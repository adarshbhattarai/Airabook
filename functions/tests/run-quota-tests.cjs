/**
 * Minimal, dependency-free test runner for quota/storage behaviors.
 * Assumes Firebase emulators are running locally:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
 *   STORAGE_EMULATOR_HOST=127.0.0.1:9199
 * And projectId "demo-test" (override via env PROJECT_ID).
 *
 * Run with: node functions/tests/run-quota-tests.cjs
 */

/* eslint-disable no-console */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || process.env.PROJECT_ID || "demo-test";
process.env.GCP_PROJECT = process.env.GCLOUD_PROJECT;
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.STORAGE_EMULATOR_HOST = process.env.STORAGE_EMULATOR_HOST || "127.0.0.1:9199";
process.env.FUNCTIONS_EMULATOR = "true";

const admin = require("firebase-admin");
const { consumeApiCallQuota, addStorageUsage } = require("../utils/limits");
const mediaProcessor = require("../mediaProcessor");

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT,
    storageBucket: `${process.env.GCLOUD_PROJECT}.appspot.com`,
  });
}
const db = admin.firestore();

// Simple test harness
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✅ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.error(`❌ ${name}:`, err?.message || err);
  }
}

function summaryAndExit() {
  const failed = results.filter(r => !r.ok);
  console.log(`\nTests completed: ${results.length}, Failed: ${failed.length}`);
  if (failed.length) {
    failed.forEach(f => console.error(` - ${f.name}: ${f.err?.message || f.err}`));
    process.exit(1);
  }
  process.exit(0);
}

// Helpers
async function resetCollection(path) {
  const snap = await db.collection(path).get();
  const batch = db.batch();
  snap.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}

async function setupUser(uid, overrides = {}) {
  const userRef = db.collection("users").doc(uid);
  await userRef.set({
    billing: {
      planTier: overrides.planTier || "free",
      planLabel: "Free",
    },
    quotaCounters: {
      apiCalls: { used: 0, windowStart: new Date() },
      storageBytesUsed: 0,
      books: 0,
      pages: 0,
    },
    accessibleBookIds: [],
    accessibleAlbums: [],
    ...overrides,
  });
  return userRef;
}

async function setupBook(uid, bookId = "book1") {
  await db.collection("books").doc(bookId).set({
    ownerId: uid,
    members: { [uid]: "Owner" },
    title: "Test Book",
  });
  return bookId;
}

async function run() {
  await resetCollection("users");
  await resetCollection("books");
  await resetCollection("albums");
  await resetCollection("mediaUrls");

  await test("API quota increments and blocks after limit", async () => {
    const uid = "user-api";
    await setupUser(uid, {
      billing: { planTier: "free", planLabel: "Free" },
      quotaCounters: { apiCalls: { used: 49, windowStart: new Date() } },
    });
    // 50th should pass
    await consumeApiCallQuota(db, uid, 1);
    // 51st should fail
    let threw = false;
    try {
      await consumeApiCallQuota(db, uid, 1);
    } catch (err) {
      threw = err.code === "resource-exhausted";
    }
    if (!threw) throw new Error("Expected resource-exhausted on 51st call");
  });

  await test("Storage usage increments on finalize", async () => {
    const uid = "user-storage";
    const bookId = await setupBook(uid, "book-storage");
    await setupUser(uid, {
      quotaCounters: {
        apiCalls: { used: 0, windowStart: new Date() },
        storageBytesUsed: 0,
        books: 0,
        pages: 0,
      },
    });

    const fakeEvent = {
      data: {
        name: `${uid}/${bookId}/chap1/page1/media/image/test.jpg`,
        bucket: `${process.env.GCLOUD_PROJECT}.appspot.com`,
        size: "1024",
        metadata: { metadata: { quotaCounted: "false" } },
      },
    };

    await mediaProcessor.onMediaUpload.run(fakeEvent);

    const snap = await db.collection("users").doc(uid).get();
    const usage = snap.data()?.quotaCounters?.storageBytesUsed || 0;
    if (usage < 1024) {
      throw new Error(`Expected storageBytesUsed >= 1024, got ${usage}`);
    }
  });

  await test("Storage usage decrements on delete", async () => {
    const uid = "user-storage";
    const bookId = "book-storage";
    await addStorageUsage(db, uid, 2048);

    const fakeDeleteEvent = {
      data: {
        name: `${uid}/${bookId}/chap1/page1/media/image/test.jpg`,
        size: "1024",
      },
    };
    await require("../mediaProcessor").onMediaDelete.run(fakeDeleteEvent);

    const snap = await db.collection("users").doc(uid).get();
    const usage = snap.data()?.quotaCounters?.storageBytesUsed || 0;
    if (usage !== 1024) {
      throw new Error(`Expected storageBytesUsed to be 1024 after delete, got ${usage}`);
    }
  });

  summaryAndExit();
}

run().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
