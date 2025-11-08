// functions/utils/prompts.js
// Centralized prompt templates for AI operations

/**
 * Build prompt for rewriting text in a baby journal context
 * @param {string} text - The text to rewrite
 * @param {string} instruction - User's instruction/prompt
 * @param {Object} options - Options like isHtml output
 * @returns {string} The full prompt
 */
function buildRewritePrompt(text, instruction, options = {}) {
  const { isHtml = false } = options;
  
  const baseGuardrails =
    `Context: You are assisting a parent writing a keepsake baby journal.\n` +
    `Goals: Improve readability while preserving the author's authentic voice and emotion.\n` +
    `Output form: ${isHtml ? 'Well-formed minimal HTML (paragraphs, basic inline tags only). Do not wrap with <html>/<body>.' : 'Plain text.'}\n` +
    `Do not add or invent facts.\n` +
    `Keep names, dates, measurements, and places unchanged unless clearly wrong.\n` +
    `Keep the point-of-view and tense unless explicitly requested.\n` +
    `Avoid flowery exaggerations; keep it genuine, warm, and concise.\n`;

  const userInstruction = (instruction || '').trim();
  const effectiveInstruction = userInstruction || 'Improve clarity';

  return (
    `Instruction: ${effectiveInstruction}.\n` +
    `${baseGuardrails}\n\n` +
    `Text:\n"""${text}"""`
  );
}

/**
 * Build prompt for generating custom chapter titles
 * @param {string} title - Book title
 * @param {string} prompt - User's book idea/prompt
 * @returns {string} The full prompt
 */
function buildChapterGenerationPrompt(title, prompt) {
  return `You are helping create a storybook/journal structure. Generate 6-8 chapter titles based on this book idea:\n\nTitle: "${title}"\n\nBook Idea: "${prompt}"\n\nReturn ONLY a JSON array of chapter titles in this exact format:\n[\n  "Chapter 1 Title",\n  "Chapter 2 Title",\n  "Chapter 3 Title"\n]\n\nMake the chapters logical, sequential, and suitable for story/journal development.`;
}

/**
 * Extract JSON array from AI response
 * @param {string} content - AI response text
 * @returns {Array<string>} Array of chapter titles
 */
function extractChapterTitles(content) {
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new Error('Could not parse JSON from AI response');
    }
  }
  throw new Error('Could not find JSON array in AI response');
}

/**
 * Convert chapter titles to chapter objects with fractional indexing
 * @param {Array<string>} titles - Array of chapter titles
 * @returns {Array<Object>} Array of chapter objects
 */
function titlesToChapters(titles) {
  return titles.map((title, index) => ({
    id: `custom-${index}`,
    title: title,
    order: String.fromCharCode(97 + index), // 'a', 'b', 'c', etc.
    notes: []
  }));
}

module.exports = {
  buildRewritePrompt,
  buildChapterGenerationPrompt,
  extractChapterTitles,
  titlesToChapters,
};

