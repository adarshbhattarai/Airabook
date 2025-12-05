// functions/genkitClient.js
const { genkit } = require('genkit');
const { googleAI, gemini15Flash, textEmbedding004 } = require('@genkit-ai/googleai');

let aiInstance = null;

const getAi = () => {
    if (!aiInstance) {
        aiInstance = genkit({
            plugins: [googleAI()],
            model: googleAI.model('gemini-2.5-flash'), // default LLM for ai.generate / flows
        });
    }
    return aiInstance;
};

module.exports = {
    getAi,
    textEmbedding004,
};
