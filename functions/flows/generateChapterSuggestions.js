const parseSuggestionList = (text) => {
  if (!text) return [];
  const cleaned = String(text).replace(/```json|```/g, '').trim();
  if (!cleaned) return [];

  const toList = (value) => {
    if (!Array.isArray(value)) return [];
    return value
      .map(item => String(item))
      .map(item => item.trim())
      .filter(Boolean);
  };

  const tryParse = (value) => {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return toList(parsed);
      if (parsed && Array.isArray(parsed.suggestions)) return toList(parsed.suggestions);
    } catch (e) {
      return [];
    }
    return [];
  };

  const direct = tryParse(cleaned);
  if (direct.length) return direct;

  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    const sliced = cleaned.slice(start, end + 1);
    const fromSlice = tryParse(sliced);
    if (fromSlice.length) return fromSlice;
  }

  return cleaned
    .split('\n')
    .map(line => line.replace(/^[\s*\d.)-]+/, '').trim())
    .filter(Boolean);
};

const defineGenerateChapterSuggestionsFlow = ({ ai, z, db, HttpsError }) => (
  ai.defineFlow(
    {
      name: 'generateChapterSuggestionsFlow',
      inputSchema: z.object({
        bookId: z.string(),
        chapterId: z.string(),
        userId: z.string().optional(),
        refresh: z.boolean().optional(),
      }),
    },
    async (input, { context }) => {
      if (!context || !context.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
      }

      const authUserId = context.auth.uid;
      const { bookId, chapterId, userId } = input;

      if (!bookId || !chapterId) {
        throw new HttpsError('invalid-argument', 'Book ID and chapter ID are required.');
      }

      if (userId && userId !== authUserId) {
        throw new HttpsError('permission-denied', 'User mismatch.');
      }

      const bookRef = db.collection('books').doc(bookId);
      let bookData = context?.bookData;

      if (!bookData) {
        const bookDoc = await bookRef.get();
        if (!bookDoc.exists) {
          throw new HttpsError('not-found', 'Book not found.');
        }
        bookData = bookDoc.data() || {};
      }

      const isOwner = bookData.ownerId === authUserId;
      const isMember = bookData.members && bookData.members[authUserId];

      if (!isOwner && !isMember) {
        throw new HttpsError('permission-denied', 'You do not have access to this book.');
      }

      let chapterData = context?.chapterData;
      if (!chapterData) {
        const chapterRef = bookRef.collection('chapters').doc(chapterId);
        const chapterDoc = await chapterRef.get();
        if (!chapterDoc.exists) {
          throw new HttpsError('not-found', 'Chapter not found.');
        }
        chapterData = chapterDoc.data() || {};
      }

      const bookTitle = bookData.babyName || bookData.title || 'Untitled Book';
      const chapterTitle = chapterData.title || 'Untitled Chapter';
      const chapterDescription = chapterData.description || 'Untitled Chapter';

      const isBabyJournal = bookData.creationType === 0;
      const promptIntro = isBabyJournal
        ? `You are writing a baby journal for Airabook. Airabook is a platform where parents document children's journeys. Generate 6 concise writing prompts for the chapter below. If this is the first year, include prompts about Mom and Dad's experience before the child was born and what the child is doing now, something related to the experience`
        : 'You are an AI writing assistant for Airabook. Generate 6 concise writing prompts for the chapter below.';
      const prompt = `
${promptIntro}
Each prompt should be a short, actionable idea (max 12 words).
Return ONLY a JSON array of strings.

Book: "${bookTitle}",
Chapter: "${chapterTitle}",
chapterDescription: "${chapterDescription}"
        `.trim();

      const llmResponse = await ai.generate({ prompt });
      const parsed = parseSuggestionList(llmResponse.text);
      const fallback = [
        `Write the opening scene for "${chapterTitle}".`,
        'Describe a key moment you want to remember.',
        'Introduce the main people involved in this chapter.',
        'Note the setting: place, time, and mood.',
      ];

      return {
        suggestions: (parsed.length ? parsed : fallback).slice(0, 8),
      };
    }
  )
);

module.exports = {
  defineGenerateChapterSuggestionsFlow,
};
