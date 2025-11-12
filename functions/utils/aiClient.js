// functions/utils/aiClient.js
// Centralized AI client initialization and utilities

const OpenAI = (() => { try { return require('openai'); } catch (e) { return null; } })();
const VertexAI = (() => {
  try {
    return require('@google-cloud/vertexai').VertexAI;
  } catch (e) {
    console.warn('⚠️ @google-cloud/vertexai not available:', e?.message);
    return null;
  }
})();

const PROJECT_ID = 'airaproject-f5298';
const LOCATION = 'us-central1';
const MODEL_NAME = 'gemini-2.5-flash';

// Initialize Vertex AI (wrap in try-catch to prevent module load errors)
let vertex = null;
let generativeModel = null;

if (VertexAI) {
  try {
    vertex = new VertexAI({ project: PROJECT_ID, location: LOCATION });
    generativeModel = vertex.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
      },
    });
    console.log('✅ Vertex AI initialized');
  } catch (e) {
    console.warn('⚠️ Vertex AI initialization failed:', e?.message);
    vertex = null;
    generativeModel = null;
  }
} else {
  console.warn('⚠️ Vertex AI not available - @google-cloud/vertexai package not found');
}

// Initialize OpenAI client if key is present
let openai = null;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (OPENAI_API_KEY && OpenAI) {
  try {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log('✅ OpenAI client initialized');
  } catch (e) {
    console.warn('⚠️ OpenAI initialization failed:', e?.message);
    openai = null;
  }
}

/**
 * Get the active AI client
 * @returns {Object|null} OpenAI client or null
 */
function getOpenAIClient() {
  return openai;
}

/**
 * Get Vertex AI generative model
 * @returns {Object} Vertex AI generative model
 */
function getVertexAIModel() {
  return generativeModel;
}

/**
 * Call OpenAI with a prompt
 * @param {string} prompt - The prompt text
 * @param {Object} options - Options like maxTokens, model, temperature
 * @returns {Promise<string>} The generated text
 */
async function callOpenAI(prompt, options = {}) {
  if (!openai) {
    throw new Error('OpenAI client not initialized');
  }

  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const maxTokens = options.maxTokens || 1024;
  const temperature = options.temperature || 0.7;

  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature,
  });

  return response.choices[0].message.content;
}

/**
 * Call Vertex AI with a prompt
 * @param {string} prompt - The prompt text
 * @param {Object} options - Options like maxTokens, temperature
 * @returns {Promise<string>} The generated text
 */
async function callVertexAI(prompt, options = {}) {
  if (!generativeModel) {
    throw new Error('Vertex AI not initialized');
  }

  const maxTokens = options.maxTokens || 1024;
  const temperature = options.temperature || 0.7;

  const response = await generativeModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  });

  return response?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
}

/**
 * Call AI (tries OpenAI first, falls back to Vertex)
 * @param {string} prompt - The prompt text
 * @param {Object} options - Options like maxTokens, temperature, model
 * @returns {Promise<string>} The generated text
 */
async function callAI(prompt, options = {}) {
  if (openai) {
    console.log('🤖 Using OpenAI');
    return await callOpenAI(prompt, options);
  } else if (generativeModel) {
    console.log('🤖 Using Vertex AI');
    return await callVertexAI(prompt, options);
  } else {
    throw new Error('No AI client available. Please configure OpenAI API key or Vertex AI credentials.');
  }
}

module.exports = {
  getOpenAIClient,
  getVertexAIModel,
  callOpenAI,
  callVertexAI,
  callAI,
  openai,
  generativeModel,
};

