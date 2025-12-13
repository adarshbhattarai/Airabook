const admin = require("firebase-admin");

// Usage: node scripts/setAdminProd.js <UID> <PATH_TO_SERVICE_ACCOUNT_KEY>

const uid = process.argv[2];
const serviceAccountPath = process.argv[3] || "./serviceAccountKey.json";

if (!uid) {
    console.error("❌ Error: Missing UID.");
    console.error("Usage: node scripts/setAdminProd.js <UID> [PATH_TO_KEY_JSON]");
    process.exit(1);
}

try {
    const serviceAccount = require(serviceAccountPath);

    console.log(`🔌 Connecting to Production Project: ${serviceAccount.project_id}`);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    console.log(`⚖️  Promoting user to Admin: ${uid}...`);

    admin.auth().setCustomUserClaims(uid, { admin: true })
        .then(() => {
            console.log("✅ Success! Custom claims set to { admin: true }");
            console.log("👉 The user must Sign Out and Sign In again to refresh their token.");
            process.exit();
        })
        .catch((error) => {
            console.error("❌ Error setting claims:", error);
            process.exit(1);
        });

} catch (error) {
    console.error(`❌ Error loading Service Account Key from "${serviceAccountPath}":`);
    console.error(error.message);
    console.error("\nPlease download a Service Account Key from Firebase Console > Project Settings > Service Accounts.");
    process.exit(1);
}
