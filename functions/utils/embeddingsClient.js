// functions/utils/embeddingsClient.js
// Gemini embeddings client for generating text embeddings

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getAi, textEmbedding004 } = require('../genkitClient');

// Get API key from environment
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let genAI = null;
if (GEMINI_API_KEY) {
    try {
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        console.log('✅ Gemini AI initialized for embeddings');
    } catch (e) {
        console.warn('⚠️ Gemini AI initialization failed:', e?.message);
    }
} else {
    console.warn('⚠️ GEMINI_API_KEY not found in environment variables');
}

/**
 * Extract plain text from HTML content
 * @param {string} html - HTML content
 * @returns {string} Plain text
 */
function extractTextFromHtml(html = '') {
    if (!html || typeof html !== 'string') return '';

    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<\/(p|div|br|li|h[1-6])>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#039;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * generateEmbeddings(input, options)
 *
 * input can be:
 *  - string
 *  - Genkit Document: { content: [{ text: "..." }, ...] }
 *  - array of parts: [{ text: "..." }, ...]
 */
async function generateEmbeddings(input, options = {}) {
    let text = "";

    // Case 1: simple string
    if (typeof input === "string") {
        text = input.trim();
    }

    // Case 2: full Document { content: [...] }
    else if (input && typeof input === "object" && Array.isArray(input.content)) {
        const texts = input.content
            .filter((part) => typeof part.text === "string" && part.text.trim())
            .map((part) => part.text.trim());

        text = texts.join("\n\n"); // handles multi-content
    }

    // Case 3: direct parts array [{ text }]
    else if (Array.isArray(input)) {
        const texts = input
            .filter((part) => typeof part.text === "string" && part.text.trim())
            .map((part) => part.text.trim());

        text = texts.join("\n\n");
    }

    if (!text) {
        throw new Error("Text is required for embeddings generation.");
    }

    const taskType = options.taskType || "RETRIEVAL_DOCUMENT";

    // Lazy init AI
    const ai = getAi();

    const result = await ai.embed({
        embedder: textEmbedding004,
        content: text,
        options: { taskType },
    });

    return result[0].embedding; // number[]
}
/**
 * Generate embeddings using Gemini embedding model
 * @param {string} text - Text to generate embeddings for
 * @param {Object} options - Options like taskType
 * @returns {Promise<Array<number>>} Embedding vector
 * @deprecated
 */
async function generateGeminiEmbeddings(text, options = {}) {
    if (!genAI) {
        throw new Error('Gemini AI not initialized. Please set GEMINI_API_KEY environment variable.');
    }

    if (!text || typeof text !== 'string' || !text.trim()) {
        throw new Error('Text is required for embeddings generation.');
    }

    try {
        // Use text-embedding-004 model
        const model = genAI.getGenerativeModel({
            model: 'text-embedding-004'
        });

        // taskType optimizes embeddings for specific use case
        // RETRIEVAL_DOCUMENT = for documents to be stored/searched
        // RETRIEVAL_QUERY = for search queries
        const taskType = options.taskType || 'RETRIEVAL_DOCUMENT';

        const result = await model.embedContent({
            content: {
                parts: [{ text }],  // Just the text content
                role: 'user'        // AI role, NOT Firebase userId
            },
            taskType  // Optimizes embeddings for retrieval
        });

        const embeddings = result.embedding.values;

        console.log(`✅ Generated Gemini embeddings: ${embeddings.length} dimensions`);
        return embeddings;

    } catch (error) {
        console.error('❌ Error generating Gemini embeddings:', error);
        throw new Error(`Failed to generate embeddings: ${error.message}`);
    }
}

module.exports = {
    extractTextFromHtml,
    generateGeminiEmbeddings,
    generateEmbeddings,
};
