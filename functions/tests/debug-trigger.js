const admin = require("firebase-admin");
const fft = require("firebase-functions-test")({
    projectId: "demo-project",
});

// Set emulator env vars so it writes to the emulator, not production
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "demo-project";

// Initialize admin (needed because onUserCreate expects it ready)
if (!admin.apps.length) {
    admin.initializeApp({ projectId: "demo-project" });
}

// Import the function
const { onUserCreate } = require("../onUserCreate");

async function runDebug() {
    console.log("🚀 Starting verification of onUserCreate logic...");

    // Wrap the function to invoke it directly
    const wrapped = fft.wrap(onUserCreate);

    const mockUser = {
        uid: "debug-user-" + Date.now(),
        email: "debug@test.com",
        displayName: "Debug User"
    };

    console.log("👤 Simulating creation for:", mockUser.uid);

    try {
        await wrapped(mockUser);
        console.log("✅ Function execution completed successfully.");
    } catch (e) {
        console.error("❌ Function execution failed:", e);
    }
}

runDebug();
