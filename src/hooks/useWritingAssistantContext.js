import { useState } from 'react';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { stripHtml } from '@/lib/pageUtils';

const PAGE_TEXT_LIMIT = 12000;
const contextError = (message) => Object.assign(new Error(message), { name: 'WritingContextError' });

export const useWritingAssistantContext = ({ bookId, bookTitle, chapters = [], chapterId, pageId, pages = [], getPageContext }) => {
  const [selection, setSelection] = useState({ mode: 'follow' });
  const [pageDirectory, setPageDirectory] = useState({});
  const scope = selection.mode === 'follow' ? (pageId ? 'page' : chapterId ? 'chapter' : 'book') : selection.mode;
  const contextChapterId = scope === 'book' ? undefined : selection.mode === 'follow' ? chapterId : selection.chapterId;
  const contextPageId = scope !== 'page' ? undefined : selection.mode === 'follow' ? pageId : selection.pageId;
  const chapter = chapters.find((item) => item.id === contextChapterId);
  const pageOptions = (item) => item.id === chapterId && pages.length
    ? pages.map((page) => ({ ...page, pageId: page.id }))
    : pageDirectory[item.id] || item.pagesSummary || [];
  const page = chapter && pageOptions(chapter).find((item) => (item.pageId || item.id) === contextPageId);
  const title = scope === 'page' ? page?.pageName || 'Untitled page'
    : scope === 'chapter' ? chapter?.title || 'Chapter' : bookTitle || 'Your book';
  const label = `${scope === 'book' ? 'Book' : scope === 'chapter' ? 'Chapter' : 'Page'} · ${title}`;

  const loadPageOptions = async (id) => {
    const snapshot = await getDocs(query(collection(firestore, 'books', bookId, 'chapters', id, 'pages'), orderBy('order')));
    const entries = snapshot.docs.map((item) => ({ pageId: item.id, pageName: item.data().pageName || '', shortNote: item.data().shortNote || '' }));
    setPageDirectory((previous) => ({ ...previous, [id]: entries }));
  };

  // Resolve the snapshot at send time. Pinned context uses IDs, so it stays
  // current and does not retain a stale copy of a chapter or page.
  const getRequestContext = async () => {
    const uiContext = {
      surface: 'book_writer',
      scope,
      book: { id: bookId, title: bookTitle || 'Untitled book' },
    };
    if (scope === 'book') {
      uiContext.book.chapters = chapters.slice(0, 100).map(({ id, title }) => ({ id, title }));
      return { uiContext, chapterId: undefined, pageId: undefined };
    }
    if (!contextChapterId) throw contextError('Choose a chapter for this conversation.');
    const chapterSnapshot = await getDoc(doc(firestore, 'books', bookId, 'chapters', contextChapterId));
    if (!chapterSnapshot.exists()) throw contextError('This chapter is no longer available. Choose another context.');
    const chapterData = chapterSnapshot.data();
    uiContext.chapter = {
      id: contextChapterId,
      title: chapterData.title || 'Untitled chapter',
      summary: String(chapterData.chapterSummary || '').slice(0, 1200),
    };
    if (scope === 'page') {
      if (!contextPageId) throw contextError('Choose a page for this conversation.');
      let pageData = getPageContext?.(contextChapterId, contextPageId);
      if (!pageData) {
        const pageSnapshot = await getDoc(doc(firestore, 'books', bookId, 'chapters', contextChapterId, 'pages', contextPageId));
        if (!pageSnapshot.exists()) throw contextError('This page is no longer available. Choose another context.');
        const saved = pageSnapshot.data();
        pageData = { title: saved.pageName, text: saved.plainText || stripHtml(saved.note || ''), isDraft: false };
      }
      const text = String(pageData.text || '');
      uiContext.page = {
        id: contextPageId,
        title: pageData.title || 'Untitled page',
        text: text.slice(0, PAGE_TEXT_LIMIT),
        isDraft: Boolean(pageData.isDraft),
        truncated: text.length > PAGE_TEXT_LIMIT,
      };
    }
    return { uiContext, chapterId: contextChapterId, pageId: contextPageId };
  };

  return { selection, setSelection, scope, chapterId: contextChapterId, pageId: contextPageId, label, title, pageOptions, loadPageOptions, getRequestContext };
};
