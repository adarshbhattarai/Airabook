const admin = require("firebase-admin");

// Set environment variables to force connection to emulator
// Adjust ports if your emulator config is different
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "demo-project";

console.log("🔌 Connecting to Auth Emulator at", process.env.FIREBASE_AUTH_EMULATOR_HOST);

admin.initializeApp({
    projectId: "demo-project"
});

const uid = process.argv[2];

if (!uid) {
    console.error("❌ Error: Missing UID.");
    console.error("Usage: node scripts/setAdmin.js <UID>");
    process.exit(1);
}

console.log(`⚖️  Promoting user to Admin: ${uid}...`);

admin.auth().setCustomUserClaims(uid, { admin: true })
    .then(() => {
        console.log("✅ Success! Custom claims set to { admin: true }");
        console.log("👉 NOTE: The user must Sign Out and Sign In again to refresh their token.");
        process.exit();
    })
    .catch((error) => {
        console.error("❌ Error setting claims:", error);
        process.exit(1);
    });
