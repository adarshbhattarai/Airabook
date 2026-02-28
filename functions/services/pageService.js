const { FieldValue } = require('firebase-admin/firestore');
const { extractTextFromHtml, generateEmbeddings } = require('../utils/embeddingsClient');
const { updateChapterPageSummary } = require('../utils/chapterUtils');
const { assertAndIncrementCounter, resolveUserPlanLimits } = require('../utils/limits');

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const markdownToHtml = (markdown = '') => {
  const lines = String(markdown).split(/\r?\n/);
  let html = '';
  let inList = false;

  const closeList = () => {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }

    if (line.startsWith('### ')) {
      closeList();
      html += `<h3>${escapeHtml(line.slice(4))}</h3>`;
      continue;
    }

    if (line.startsWith('## ')) {
      closeList();
      html += `<h2>${escapeHtml(line.slice(3))}</h2>`;
      continue;
    }

    if (line.startsWith('# ')) {
      closeList();
      html += `<h1>${escapeHtml(line.slice(2))}</h1>`;
      continue;
    }

    if (line.startsWith('- ')) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${escapeHtml(line.slice(2))}</li>`;
      continue;
    }

    closeList();
    html += `<p>${escapeHtml(line)}</p>`;
  }

  closeList();
  return html;
};

const getMidpointString = (prev = '', next = '') => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let p = 0;
  while (p < prev.length || p < next.length) {
    const prevChar = prev.charAt(p) || 'a';
    const nextChar = next.charAt(p) || 'z';
    if (prevChar !== nextChar) {
      const prevIndex = alphabet.indexOf(prevChar);
      const nextIndex = alphabet.indexOf(nextChar);
      if (nextIndex - prevIndex > 1) {
        const midIndex = Math.round((prevIndex + nextIndex) / 2);
        return prev.substring(0, p) + alphabet[midIndex];
      }
    }
    p += 1;
  }
  return prev + 'm';
};

const getNewOrderBetween = (prevOrder = '', nextOrder = '') =>
  getMidpointString(prevOrder, nextOrder);

const createChapterPage = async ({ db, userId, bookId, chapterId, markdown }) => {
  let reservedPageSlot = false;

  try {
    const bookRef = db.collection('books').doc(bookId);
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

    const { tier, limits } = await resolveUserPlanLimits(db, userId);
    const pagePerChapterLimit = Number(limits?.pagesPerChapter);
    if (Number.isFinite(pagePerChapterLimit) && pagePerChapterLimit > 0 && tier !== 'god') {
      const existingPagesSnap = await chapterRef
        .collection('pages')
        .limit(pagePerChapterLimit)
        .get();
      if (existingPagesSnap.size >= pagePerChapterLimit) {
        throw new Error(`You can create up to ${pagePerChapterLimit} pages per chapter on your current plan.`);
      }
    }

    await assertAndIncrementCounter(
      db,
      userId,
      'pages',
      1,
      undefined,
      'You have reached your page limit for this plan.'
    );
    reservedPageSlot = true;

    const lastPageSnap = await chapterRef
      .collection('pages')
      .orderBy('order', 'desc')
      .limit(1)
      .get();
    const lastPage = lastPageSnap.docs[0]?.data();
    const newPageOrder = getNewOrderBetween(lastPage?.order || '', '');

    const html = markdownToHtml(markdown || '');
    const plainText = extractTextFromHtml(html);

    let embeddings = [];
    let embeddingModel = null;
    if (plainText) {
      try {
        embeddings = await generateEmbeddings(plainText, {
          taskType: 'RETRIEVAL_DOCUMENT',
        });
        embeddingModel = 'text-embedding-004';
      } catch (error) {
        console.error('Failed to generate embeddings for AI page:', error);
      }
    }

    const pageData = {
      note: html,
      plainText: plainText,
      embeddings: embeddings.length ? FieldValue.vector(embeddings) : null,
      embeddingModel: embeddingModel,
      media: [],
      order: newPageOrder,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: userId,
    };

    const pageRef = await chapterRef.collection('pages').add(pageData);
    await updateChapterPageSummary(db, bookId, chapterId, pageRef.id, plainText, newPageOrder, true);

    return {
      id: pageRef.id,
      order: newPageOrder,
    };
  } catch (error) {
    if (reservedPageSlot) {
      try {
        await assertAndIncrementCounter(db, userId, 'pages', -1);
      } catch (revertError) {
        console.error('Failed to revert page counter after error:', revertError);
      }
    }
    throw error;
  }
};

module.exports = {
  createChapterPage,
};
