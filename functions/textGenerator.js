const { onCall, HttpsError } = require("firebase-functions/v2/https");

// Load env for emulator/local
try {
  require("dotenv").config();
} catch (_) {}

// AI utilities
const { callAI } = require("./utils/aiClient");
const { buildRewritePrompt } = require("./utils/prompts");

const LOCATION = "us-central1";

/**
 * Callable function to rewrite a note with a given style/prompt.
 *
 * Request data:
 * - note: string (optional, may be HTML – legacy)
 * - noteText: string (preferred, plain text)
 * - text: string (legacy plain text)
 * - prompt: string (required; describes style/instructions)
 * - maxTokens: number (optional; clamped 32–1024)
 * - bookId: string (optional; reserved for future use)
 * - chapterId: string (optional)
 * - pageId: string (optional)
 */
exports.rewriteNote = onCall({ region: LOCATION }, async (request) => {
  const { data, auth } = request;

  // Require auth
  if (!auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Please sign in to use this feature."
    );
  }

  const {
    note,
    noteText,
    text, // backward compatibility
    prompt, // preferred from frontend
    maxTokens,
    bookId, // reserved for future context
    chapterId,
    pageId,
  } = data || {};

  // Prefer plain text -> then strip HTML -> then legacy text
  const sourceText =
    typeof noteText === "string" && noteText.trim()
      ? noteText.trim()
      : typeof note === "string" && note.trim()
      ? note
          .replace(/<[^>]+>/g, " ") // strip HTML tags
          .replace(/\s+/g, " ")
          .trim()
      : typeof text === "string" && text.trim()
      ? text.trim()
      : "";

  if (!sourceText) {
    throw new HttpsError(
      "invalid-argument",
      "`note` or `noteText` (string) is required."
    );
  }

  const selectedStyle =
    typeof prompt === "string" && prompt.trim() ? prompt.trim() : "";

  if (!selectedStyle) {
    throw new HttpsError(
      "invalid-argument",
      "`prompt` (string) is required."
    );
  }

  const isHtmlSource =
    typeof note === "string" && /<\w+[^>]*>/.test(note || "");

  const builtPrompt = buildRewritePrompt(sourceText, selectedStyle, {
    isHtml: isHtmlSource,
    // room for future context: bookId, chapterId, pageId
  });

  try {
    const numericMax = Number(maxTokens);
    const effectiveMax = Number.isFinite(numericMax)
      ? Math.max(32, Math.min(1024, numericMax))
      : undefined;

    const rewritten = await callAI(builtPrompt, {
      maxTokens: effectiveMax,
      temperature: 0.7,
    });

    if (!rewritten) {
      throw new Error("Empty AI response");
    }

    return {
      rewritten,
      meta: {
        bookId: bookId || null,
        chapterId: chapterId || null,
        pageId: pageId || null,
      },
    };
  } catch (err) {
    console.error("rewriteNote error:", err);
    throw new HttpsError("internal", "Failed to generate text");
  }
});
