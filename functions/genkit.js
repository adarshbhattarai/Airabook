const { ai, textEmbedding004 } = require('./genkitClient');
const { z } = require('genkit');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { generateEmbeddings } = require('./utils/embeddingsClient');
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

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

        const queryEmbedding = await generateEmbeddings(input, {
            taskType: 'RETRIEVAL_QUERY',
        });

        console.log(
            'queryEmbedding length:',
            queryEmbedding.length
        );
        // Firestore Vector Search
        // CRITICAL: Filter by createdBy to ensure user isolation
        const coll = db.collectionGroup('pages');

        try {

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
const queryBookFlowRaw = ai.defineFlow(
    {
        name: 'queryBookFlow',
        inputSchema: z.object({
            messages: z.array(z.object({
                role: z.enum(['user', 'model', 'system', 'assistant']),
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

        // 1. Retrieve a larger set of candidate documents
        const initialDocs = await ai.retrieve({
            retriever: bookPagesRetriever,
            query: query,
            options: { userId: userId, k: 10 }, // Retrieve more docs for reranking
        });

        console.log(`Retrieved ${initialDocs.length} candidate documents.`);

        // 2. Rerank documents
        const scoredDocs = [];
        for (const doc of initialDocs) {
            const content = doc.content[0].text;

            // Ask LLM to score the relevance
            const scoringPrompt = `
            You are a relevance scorer. 
            Query: "${query}"
            Document: "${content}"
            
            Rate the relevance of the document to the query on a scale of 0 to 10. 
            Return ONLY the number.
            `;

            const scoreResponse = await ai.generate({
                prompt: scoringPrompt,
            });

            const scoreText = scoreResponse.text.trim();
            const score = parseFloat(scoreText);

            console.log(`Doc ID: ${doc.metadata.id}, Score: ${score}`);

            if (!isNaN(score)) {
                scoredDocs.push({ doc, score });
            }
        }

        // Sort by score descending
        scoredDocs.sort((a, b) => b.score - a.score);

        // 3. Select the best document (or top N)
        // For now, we'll take the single best document if it has a reasonable score (> 0)
        // If no docs or all 0, we might fall back to general knowledge (empty context)
        const bestDoc = scoredDocs.length > 0 && scoredDocs[0].score > 3 ? scoredDocs[0].doc : null;

        const finalDocs = bestDoc ? [bestDoc] : [];

        console.log("Selected best document:", bestDoc ? bestDoc.metadata.id : "None");

        // Construct history for the model (excluding the last message which is the current prompt)
        const history = messages.slice(0, -1).map(m => ({
            role: m.role === 'assistant' ? 'model' : m.role,
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
${finalDocs.map((d) => d.content[0].text).join('\n\n')}

Question: ${query}
      `,
        });

        return {
            answer: llmResponse.text,
            sources: finalDocs.map((d) => ({
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
