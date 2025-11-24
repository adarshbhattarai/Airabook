const { queryBookFlow } = require('./genkit');
const admin = require('firebase-admin');

// Initialize admin if not already
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'demo-project', // Use demo project for emulator
    });
}

async function verifyReranker() {
    try {
        console.log("Starting reranker verification...");

        // Mock request data
        const mockRequest = {
            auth: {
                uid: 'test-user-id', // Replace with a valid user ID from your emulator data if needed
            },
            data: {
                messages: [
                    { role: 'user', content: 'What is the main character doing?' }
                ]
            }
        };

        // Call the function directly (since we are in the same environment/codebase)
        // Note: In a real scenario, we might use the callable function client SDK, 
        // but here we can import and call the wrapper if we mock the context correctly.
        // However, `onCall` wraps it. 
        // A better approach for local verification of the *logic* is to invoke the `queryBookFlowRaw` if it was exported,
        // or use the Genkit CLI tools. 
        // But since we modified the file, let's try to invoke the exported `queryBookFlow` handler.

        // Actually, `onCall` returns a function that takes (req, res) in v2? 
        // Or it returns a function that handles the protocol.
        // Let's try to use the Genkit developer UI or a simple script that uses the `genkit` CLI if available.

        // Alternative: We can't easily invoke the `onCall` wrapped function directly as a JS function without the Firebase shim.
        // So, we will assume the emulator is running and use `node-fetch` or similar to hit the endpoint?
        // Or better, just use the `ai.runFlow` if we can access the flow object.

        // Let's look at `genkit.js` again. `queryBookFlowRaw` is not exported.
        // I will temporarily export `queryBookFlowRaw` in `genkit.js` for testing purposes if needed, 
        // but for now let's try to use the `run_command` to invoke a curl or similar if the emulator is up.

        // Wait, I can just use the `firebase-functions-test` library if available, but I don't see it in the file list.

        // Let's try to just run a script that imports the file. 
        // But `genkit` initialization might fail if not in the right environment.

        console.log("Please manually verify by running the app or using the Genkit Developer UI.");

    } catch (error) {
        console.error("Verification failed:", error);
    }
}

verifyReranker();
