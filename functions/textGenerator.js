// functions/textGenerator.js
const { onCall, HttpsError } = require('firebase-functions/v2/https');

// Load env for emulator/local
try { require('dotenv').config(); } catch (_) {}

// Import AI utilities
const { callAI } = require('./utils/aiClient');
const { buildRewritePrompt } = require('./utils/prompts');

// Region for the function
const LOCATION = 'us-central1';

exports.rewriteNote = onCall({ region: LOCATION }, async (request) => {
  const {
    note,
    noteText,
    text, // backward compatibility
    prompt, // preferred field from frontend
    maxTokens,
    bookId, // not used now, reserved for future context/rules
    chapterId,
    pageId,
  } = request.data || {};

  // Auth (optional but recommended)
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Please sign in to use this feature.');
  }
  // prefer plain text when provided, fall back to html, then legacy "text"
  const sourceText =
    (typeof noteText === 'string' && noteText.trim()) ? noteText.trim() :
    (typeof note === 'string' && note.trim()) ? note.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() :
    (typeof text === 'string' && text.trim()) ? text.trim() : '';

  if (!sourceText) {
    throw new HttpsError('invalid-argument', '`note` or `noteText` (string) is required.');
  }
  const selectedStyle = (typeof prompt === 'string' && prompt.trim()) ? prompt.trim() : '';
  if (!selectedStyle) {
    throw new HttpsError('invalid-argument', '`prompt` (string) is required.');
  }

  const isHtmlSource = (typeof note === 'string') && /<\w+[^>]*>/.test(note);
  const builtPrompt = buildRewritePrompt(sourceText, selectedStyle, { isHtml: isHtmlSource });

  try {
    const effectiveMax = Number.isFinite(Number(maxTokens)) ? Math.max(32, Math.min(1024, Number(maxTokens))) : undefined;
    const rewritten = await callAI(builtPrompt, { maxTokens: effectiveMax, temperature: 0.7 });
    
    if (!rewritten) throw new Error('Empty AI response');
    
    return { rewritten };
  } catch (err) {
    console.error('rewriteNote error:', err);
    throw new HttpsError('internal', 'Failed to generate text');
  }
});
