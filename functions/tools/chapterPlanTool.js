const { z } = require('genkit');

const createChapterPlanTool = (ai) => {
  const outlinePrompt = ai.prompt('airabook_chapter_outline');

  return ai.defineTool(
    {
      name: 'createChapterPlan',
      description: 'Creates a chapter outline with page titles, summaries, and key points.',
      inputSchema: z.object({
        transcript: z.string(),
        bookTitle: z.string().optional(),
        chapterTitle: z.string().optional(),
        chapterDescription: z.string().optional(),
      }),
      outputSchema: z.object({
        pages: z.array(
          z.object({
            title: z.string(),
            summary: z.string(),
            keyPoints: z.array(z.string()).optional(),
          })
        ),
      }),
    },
    async (input) => {
      const response = await outlinePrompt({
        transcript: input.transcript,
        bookTitle: input.bookTitle,
        chapterTitle: input.chapterTitle,
        chapterDescription: input.chapterDescription,
      });

      const output = response.output || {};
      const pages = Array.isArray(output.pages) ? output.pages : [];
      return { pages };
    }
  );
};

module.exports = {
  createChapterPlanTool,
};
