const resolveRoute = ({ action, hasChapterContext }) => {
  if (action === 'generate_chapter') {
    if (!hasChapterContext) {
      return { route: 'error', error: 'Book and chapter context is required.' };
    }
    return { route: 'chapter' };
  }

  return { route: 'rag' };
};

module.exports = {
  resolveRoute,
};
