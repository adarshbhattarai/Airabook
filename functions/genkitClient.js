// functions/genkitClient.js
const { genkit } = require('genkit');
const { googleAI, gemini15Flash, textEmbedding004 } = require('@genkit-ai/googleai');

const ai = genkit({
    plugins: [googleAI()],
    promptDir: './genkit_doc/prompts',
    model: googleAI.model('gemini-2.5-flash'), // default LLM for ai.generate / flows
});

module.exports = {
    ai,
    textEmbedding004,
};
