// functions/utils/aiClient.js
// Centralized AI client initialization and utilities (lazy-loaded to keep cold-start fast)

// Disable Genkit telemetry during function discovery to avoid extra network during cold start
if (!process.env.GENKIT_DISABLE_TELEMETRY) {
  process.env.GENKIT_DISABLE_TELEMETRY = 'true';
}

const OpenAI = (() => {
  try {
    return require('openai');
  } catch (e) {
    return null;
  }
})();

const VertexAI = (() => {
  try {
    return require('@google-cloud/vertexai').VertexAI;
  } catch (e) {
    console.warn('ƒsÿ‹,? @google-cloud/vertexai not available:', e?.message);
    return null;
  }
})();

// Get current project ID dynamically from environment
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'airabook-dev';
const LOCATION = 'us-central1';
const MODEL_NAME = 'gemini-2.5-flash';

console.log(`dY- AI Client initialized for project: ${PROJECT_ID}`);

let vertex = null;
let generativeModel = null;
let openai = null;

// Lazy init helpers keep module load quick and retry-friendly in cloud deploy discovery
const initVertex = () => {
  if (generativeModel || !VertexAI) {
    return generativeModel;
  }
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
    console.log('ƒo. Vertex AI initialized');
  } catch (e) {
    console.warn('ƒsÿ‹,? Vertex AI initialization failed:', e?.message);
    vertex = null;
    generativeModel = null;
  }
  return generativeModel;
};

const initOpenAI = () => {
  if (openai || !OpenAI) {
    return openai;
  }
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return null;
  }
  try {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log('ƒo. OpenAI client initialized');
  } catch (e) {
    console.warn('ƒsÿ‹,? OpenAI initialization failed:', e?.message);
    openai = null;
  }
  return openai;
};

/**
 * Get the active AI client
 * @returns {Object|null} OpenAI client or null
 */
function getOpenAIClient() {
  return initOpenAI();
}

/**
 * Get Vertex AI generative model
 * @returns {Object} Vertex AI generative model
 */
function getVertexAIModel() {
  return initVertex();
}

/**
 * Call OpenAI with a prompt
 * @param {string} prompt - The prompt text
 * @param {Object} options - Options like maxTokens, model, temperature
 * @returns {Promise<string>} The generated text
 */
async function callOpenAI(prompt, options = {}) {
  const client = initOpenAI();
  if (!client) {
    throw new Error('OpenAI client not initialized');
  }

  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const maxTokens = options.maxTokens || 1024;
  const temperature = options.temperature || 0.7;

  const response = await client.chat.completions.create({
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
  const model = initVertex();
  if (!model) {
    throw new Error('Vertex AI not initialized');
  }

  const maxTokens = options.maxTokens || 1024;
  const temperature = options.temperature || 0.7;

  const response = await model.generateContent({
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
  const client = initOpenAI();
  if (client) {
    console.log('dY- Using OpenAI');
    return await callOpenAI(prompt, options);
  }

  const model = initVertex();
  if (model) {
    console.log('dY- Using Vertex AI');
    return await callVertexAI(prompt, options);
  }

  throw new Error('No AI client available. Please configure OpenAI API key or Vertex AI credentials.');
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
