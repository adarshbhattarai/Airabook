const { genkit, z } = require('genkit');
const { googleAI, gemini15Flash, textEmbedding004 } = require('@genkit-ai/googleai');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// Configure Genkit
const ai = genkit({
    plugins: [googleAI()],
    model: gemini15Flash, // Default model
});

// Define the Retriever
const bookPagesRetriever = ai.defineRetriever(
    {
        name: 'bookPagesRetriever',
        configSchema: z.object({
            userId: z.string(),
            k: z.number().default(3),
        }),
    },
    async (input, options) => {
        const { userId, k } = options;
        const queryEmbedding = await ai.embed({
            embedder: textEmbedding004,
            content: input,
        });

        // Firestore Vector Search
        // CRITICAL: Filter by createdBy to ensure user isolation
        const coll = db.collectionGroup('pages');
        const snapshot = await coll
            .where('createdBy', '==', userId)
            .findNearest('embeddings', queryEmbedding, {
                limit: k,
                distanceMeasure: 'COSINE',
            })
            .get();

        const documents = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                content: [
                    {
                        text: data.plainText || data.note || '',
                    },
                ],
                metadata: {
                    id: doc.id,
                    bookId: doc.ref.parent.parent.parent.parent.id, // books/{bookId}/chapters/{chapterId}/pages/{pageId}
                    chapterId: doc.ref.parent.parent.id,
                    ...data,
                },
            };
        });

        return { documents };
    }
);

// Define the RAG Flow
const queryBookFlowRaw = ai.defineFlow(
    {
        name: 'queryBookFlow',
        inputSchema: z.object({
            query: z.string(),
        }),
    },
    async (input, { context }) => {
        if (!context || !context.auth) {
            throw new Error('User must be authenticated.');
        }
        const userId = context.auth.uid;
        const { query } = input;

        // Retrieve relevant documents
        const docs = await ai.retrieve({
            retriever: bookPagesRetriever,
            query: query,
            options: { userId: userId, k: 3 },
        });

        // Generate answer
        const llmResponse = await ai.generate({
            prompt: `
You are a helpful AI assistant for a book writing app.
Use the following context from the user's book to answer their question.
If the answer is not in the context, say you don't know based on the available notes.

Context:
${docs.map((d) => d.content[0].text).join('\n\n')}

Question: ${query}
      `,
        });

        return {
            answer: llmResponse.text,
            sources: docs.map((d) => ({
                id: d.metadata.id,
                shortNote: d.metadata.plainText?.substring(0, 50) || 'Page',
            })),
        };
    }
);

// Export as a Callable Cloud Function
const queryBookFlow = onCall(
    { cors: true },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated.');
        }

        try {
            // Invoke the flow with auth context
            return await queryBookFlowRaw(request.data, {
                context: { auth: request.auth }
            });
        } catch (e) {
            console.error("Flow error:", e);
            throw new HttpsError('internal', e.message);
        }
    }
);

module.exports = {
    queryBookFlow,
};
