const AgentServices = class {
  constructor({ ai, db }) {
    this.ai = ai;
    this.db = db;
    this.outlinePrompt = ai.prompt('airabook_chapter_outline');
    this.pagePrompt = ai.prompt('airabook_page_draft');
  }

  async getChapterContext({ userId, bookId, chapterId }) {
    const bookRef = this.db.collection('books').doc(bookId);
    const bookDoc = await bookRef.get();
    if (!bookDoc.exists) {
      throw new Error('Book not found.');
    }

    const bookData = bookDoc.data() || {};
    const isOwner = bookData.ownerId === userId;
    const isMember = bookData.members && bookData.members[userId];
    if (!isOwner && !isMember) {
      throw new Error('You do not have access to this book.');
    }

    const chapterRef = bookRef.collection('chapters').doc(chapterId);
    const chapterDoc = await chapterRef.get();
    if (!chapterDoc.exists) {
      throw new Error('Chapter not found.');
    }

    const chapterData = chapterDoc.data() || {};

    return {
      bookTitle: bookData.babyName || bookData.title || 'Untitled Book',
      bookDescription: bookData.description || bookData.description || 'Untitled Book',
      chapterTitle: chapterData.title || 'Untitled Chapter',
      chapterDescription: chapterData.description || '',
    };
  }

  async generateOutline({ transcript, bookTitle, chapterTitle, chapterDescription }) {
    const response = await this.outlinePrompt({
      transcript,
      bookTitle,
      chapterTitle,
      chapterDescription,
    });

    const pages = response.output?.pages;
    if (!Array.isArray(pages) || pages.length === 0) {
      return [
        {
          title: chapterTitle || 'Chapter Draft',
          summary: 'Draft the chapter based on the conversation.',
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
  }

  streamPageDraft({ page, transcript, bookTitle, chapterTitle, chapterDescription }) {
    return this.pagePrompt.stream({
      pageTitle: page.title,
      pageSummary: page.summary,
      pageKeyPoints: page.keyPoints,
      transcript,
      bookTitle,
      chapterTitle,
      chapterDescription,
    });
  }
};

module.exports = {
  AgentServices,
};
