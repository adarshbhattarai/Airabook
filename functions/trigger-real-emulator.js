const admin = require("firebase-admin");

// Point to the running emulator
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "demo-project";

// Initialize admin
if (!admin.apps.length) {
    admin.initializeApp({ projectId: "demo-project" });
}

async function trigger() {
    console.log("🚀 Connecting to Emulator Auth...");
    const uid = "emulator-trigger-" + Date.now();
    const email = `trigger-${Date.now()}@test.com`;

    try {
        console.log(`👤 Creating user ${uid} in Emulator...`);
        await admin.auth().createUser({
            uid,
            email,
            displayName: "Emulator Trigger User"
        });
        console.log("✅ User created! Check the emulator logs for function execution.");
    } catch (e) {
        console.error("❌ Failed to create user:", e);
    }
}

trigger();
