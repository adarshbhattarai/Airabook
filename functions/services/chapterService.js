const normalizeOutlinePages = (pages, chapterTitle) => {
  if (!Array.isArray(pages) || pages.length === 0) {
    return [
      {
        title: chapterTitle || 'Chapter Draft',
        summary: 'Draft the chapter based on the conversation.',
        keyPoints: [],
      },
    ];
  }

  return pages
    .map((page) => ({
      title: String(page?.title || '').trim(),
      summary: String(page?.summary || '').trim(),
      keyPoints: Array.isArray(page?.keyPoints)
        ? page.keyPoints.map((item) => String(item).trim()).filter(Boolean)
        : [],
    }))
    .filter((page) => page.title);
};

const streamChapterGeneration = async ({
  agentServices,
  chapterPlanTool,
  createChapterPage,
  buildConversationTranscript,
  messages,
  userId,
  bookId,
  chapterId,
  db,
  isClosed,
  sendEvent,
  res,
}) => {
  const hasUserMessage = Array.isArray(messages)
    && messages.some((message) => message?.role === 'user' && message?.content);
  if (!hasUserMessage) {
    throw new Error('At least one user message is required.');
  }

  const transcript = buildConversationTranscript(messages);
  const chapterContext = await agentServices.getChapterContext({
    userId,
    bookId,
    chapterId,
  });

  let outlinePages = [];
  try {
    const planResult = await chapterPlanTool({
      transcript,
      bookTitle: chapterContext.bookTitle,
      chapterTitle: chapterContext.chapterTitle,
      chapterDescription: chapterContext.chapterDescription,
    });
    outlinePages = normalizeOutlinePages(planResult?.pages, chapterContext.chapterTitle);
  } catch (error) {
    outlinePages = normalizeOutlinePages([], chapterContext.chapterTitle);
  }

  sendEvent(res, 'outline', {
    pages: outlinePages,
    totalPages: outlinePages.length,
  });

  let responseText = '';
  const createdPageIds = [];
  let pageError = '';

  for (let index = 0; index < outlinePages.length; index += 1) {
    if (isClosed()) {
      break;
    }

    const page = outlinePages[index];
    sendEvent(res, 'page_start', {
      index,
      totalPages: outlinePages.length,
      title: page.title,
    });

    let pageText = '';

    try {
      const streamPayload = agentServices.streamPageDraft({
        page,
        transcript,
        bookTitle: chapterContext.bookTitle,
        chapterTitle: chapterContext.chapterTitle,
        chapterDescription: chapterContext.chapterDescription,
      });

      for await (const chunk of streamPayload.stream) {
        if (isClosed()) {
          break;
        }
        if (chunk?.text) {
          pageText += chunk.text;
          responseText += chunk.text;
          sendEvent(res, 'page_chunk', { index, text: chunk.text });
          sendEvent(res, 'chunk', { text: chunk.text });
        }
      }

      if (isClosed()) {
        break;
      }

      const finalResponse = await streamPayload.response;
      if (!pageText && finalResponse?.text) {
        pageText = finalResponse.text;
        responseText += finalResponse.text;
      }

      const createdPage = await createChapterPage({
        db,
        userId,
        bookId,
        chapterId,
        markdown: pageText,
      });
      createdPageIds.push(createdPage.id);

      sendEvent(res, 'page_done', {
        index,
        title: page.title,
        pageId: createdPage.id,
      });
    } catch (error) {
      console.error('Failed to generate chapter page:', error);
      pageError = error?.message || 'Failed to generate chapter page.';
      sendEvent(res, 'page_error', {
        index,
        title: page.title,
        message: pageError,
      });
      break;
    }
  }

  return {
    text: responseText,
    sources: [],
    actionPrompt: '',
    actions: [],
    createdPageIds,
    pageError,
  };
};

module.exports = {
  streamChapterGeneration,
};
