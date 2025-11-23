// functions/genkitClient.js
const { genkit } = require('genkit');
const { googleAI, gemini15Flash, textEmbedding004 } = require('@genkit-ai/googleai');

const ai = genkit({
    plugins: [googleAI()],
    model: gemini15Flash, // default LLM for ai.generate / flows
});

module.exports = {
    ai,
    textEmbedding004,
};
