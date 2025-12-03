/**
 * Debug test for album deletion to identify why storage files remain
 * Run with: node functions/tests/debug-album-deletion.cjs
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
const bucket = admin.storage().bucket();

const { deleteAlbumAssets } = require("../deleteMedia");

async function debugAlbumDeletion() {
    console.log("\n🔍 DEBUGGING ALBUM DELETION\n");

    const uid = "debug-user";
    const albumId = "debug-album";

    // Step 1: Create test user
    console.log("1️⃣ Creating test user...");
    await db.collection("users").doc(uid).set({
        email: "debug@test.com",
        billing: { planTier: "free" },
        quotaCounters: { storageBytesUsed: 0 },
        accessibleAlbums: [{ id: albumId, name: "Debug Album" }]
    });

    // Step 2: Create test album
    console.log("2️⃣ Creating test album...");
    await db.collection("albums").doc(albumId).set({
        name: "Debug Album",
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

    // Step 3: Upload test files to storage
    console.log("3️⃣ Uploading test files to storage...");
    const testFiles = [
        `${uid}/${albumId}/_album_/_album_/media/image/test1.jpg`,
        `${uid}/${albumId}/_album_/_album_/media/image/test2.jpg`,
        `${uid}/${albumId}/_album_/_album_/media/video/test.mp4`,
    ];

    for (const path of testFiles) {
        const file = bucket.file(path);
        await file.save("test content", {
            metadata: {
                contentType: path.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg',
            }
        });
        console.log(`   ✓ Created: ${path}`);
    }

    // Step 4: Verify files exist
    console.log("\n4️⃣ Verifying files exist in storage...");
    const prefix = `${uid}/${albumId}/`;
    const [filesBefore] = await bucket.getFiles({ prefix });
    console.log(`   Found ${filesBefore.length} files:`);
    for (const file of filesBefore) {
        const [metadata] = await file.getMetadata();
        console.log(`   - ${file.name} (${metadata.size} bytes)`);
    }

    // Step 5: Check user storage usage BEFORE deletion
    console.log("\n5️⃣ Checking user storage usage BEFORE deletion...");
    let userBefore = await db.collection("users").doc(uid).get();
    console.log(`   storageBytesUsed: ${userBefore.data().quotaCounters?.storageBytesUsed || 0} bytes`);

    // Step 6: Delete album
    console.log("\n6️⃣ Deleting album...");
    try {
        const result = await deleteAlbumAssets.run({
            data: { bookId: albumId },
            auth: { uid }
        });
        console.log("   Result:", JSON.stringify(result, null, 2));
    } catch (err) {
        console.error("   ❌ Deletion failed:", err.message);
        console.error("   Stack:", err.stack);
    }

    // Step 7: Verify files deleted from storage
    console.log("\n7️⃣ Verifying files deleted from storage...");
    const [filesAfter] = await bucket.getFiles({ prefix });
    if (filesAfter.length === 0) {
        console.log("   ✅ All files deleted successfully");
    } else {
        console.log(`   ❌ ${filesAfter.length} files still remain:`);
        for (const file of filesAfter) {
            console.log(`   - ${file.name}`);
        }
    }

    // Step 8: Verify album document deleted
    console.log("\n8️⃣ Verifying album document deleted...");
    const albumAfter = await db.collection("albums").doc(albumId).get();
    if (!albumAfter.exists) {
        console.log("   ✅ Album document deleted");
    } else {
        console.log("   ❌ Album document still exists");
    }

    // Step 9: Check user storage usage AFTER deletion
    console.log("\n9️⃣ Checking user storage usage AFTER deletion...");
    let userAfter = await db.collection("users").doc(uid).get();
    const usageAfter = userAfter.data()?.quotaCounters?.storageBytesUsed || 0;
    console.log(`   storageBytesUsed: ${usageAfter} bytes`);

    if (usageAfter === 0) {
        console.log("   ✅ Storage usage correctly decremented");
    } else {
        console.log(`   ❌ Storage usage not decremented (should be 0, is ${usageAfter})`);
    }

    // Step 10: Check accessibleAlbums
    console.log("\n🔟 Checking accessibleAlbums...");
    const accessibleAlbums = userAfter.data()?.accessibleAlbums || [];
    if (accessibleAlbums.length === 0) {
        console.log("   ✅ accessibleAlbums cleared");
    } else {
        console.log(`   ❌ accessibleAlbums still has ${accessibleAlbums.length} entries`);
    }

    console.log("\n" + "=".repeat(50));
    console.log("DEBUG COMPLETE");
    console.log("=".repeat(50) + "\n");
}

debugAlbumDeletion().catch(err => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
});
