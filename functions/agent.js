const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

/**
 * Search Agent Cloud Function
 * Receives a prompt from the dashboard and processes it.
 * Currently a stub that returns a success message.
 */
exports.searchAgent = functions.https.onCall(async (data, context) => {
    // Ensure user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'The function must be called while authenticated.'
        );
    }

    const { prompt } = data;
    const uid = context.auth.uid;

    console.log(`[SearchAgent] Received prompt from user ${uid}:`, prompt);

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'The function must be called with a valid "prompt" argument.'
        );
    }

    try {
        // TODO: Implement actual agent logic here (e.g., call LLM, search DB, etc.)

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1000));

        return {
            success: true,
            message: "Agent received your request",
            echo: prompt,
            timestamp: Date.now()
        };

    } catch (error) {
        console.error('[SearchAgent] Error processing request:', error);
        throw new functions.https.HttpsError(
            'internal',
            'An error occurred while processing the request.'
        );
    }
});
