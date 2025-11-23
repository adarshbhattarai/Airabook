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
            options: { taskType: 'RETRIEVAL_QUERY' },
        });

        console.log("queryEmbedding generated, length:", queryEmbedding.length);

        // Firestore Vector Search
        // CRITICAL: Filter by createdBy to ensure user isolation
        const coll = db.collectionGroup('pages');
        console.log("coll", coll);
        try {

            const snapshot2 = await coll
                .where('createdBy', '==', userId)
                .get();

            console.log("snapshot2 docs:", snapshot2.docs.map(d => ({
                id: d.id,
                path: d.ref.path,
                data: d.data()
            })));

            const snapshot = await coll
                .where('createdBy', '==', userId)
                .findNearest('embeddings', queryEmbedding, {
                    limit: k,
                    distanceMeasure: 'COSINE',
                })
                .get();

            console.log(`Found ${snapshot.docs.length} documents`);
            return {
                documents: snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        content: [{ text: data.plainText || data.note || '' }],
                        metadata: {
                            id: doc.id,
                            bookId: doc.ref.parent.parent.parent.parent.id,
                            chapterId: doc.ref.parent.parent.id,
                            ...data,
                        },
                    };
                })
            };
        } catch (error) {
            console.error("Vector search failed:", error);
            // Return empty documents on error to allow flow to continue with general knowledge
            return { documents: [] };
        }
    }
);

// Define the RAG Flow
// Define the RAG Flow
const queryBookFlowRaw = ai.defineFlow(
    {
        name: 'queryBookFlow',
        inputSchema: z.object({
            messages: z.array(z.object({
                role: z.enum(['user', 'model', 'system']),
                content: z.string(),
            })),
        }),
    },
    async (input, { context }) => {
        if (!context || !context.auth) {
            throw new Error('User must be authenticated.');
        }
        const userId = context.auth.uid;
        const { messages } = input;

        // Get the latest user query (last message)
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'user') {
            throw new Error('Last message must be from user.');
        }
        const query = lastMessage.content;

        // Retrieve relevant documents based on the latest query
        const docs = await ai.retrieve({
            retriever: bookPagesRetriever,
            query: query,
            options: { userId: userId, k: 3 },
        });

        // Construct history for the model (excluding the last message which is the current prompt)
        const history = messages.slice(0, -1).map(m => ({
            role: m.role,
            content: [{ text: m.content }]
        }));

        // Generate answer
        const llmResponse = await ai.generate({
            history: history,
            prompt: `
You are a helpful AI assistant for a book writing app called Airabook.
Use the following context from the user's book to answer their question if relevant.
If the answer is not in the context, answer from your general knowledge.
Be helpful, encouraging, and creative.

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
