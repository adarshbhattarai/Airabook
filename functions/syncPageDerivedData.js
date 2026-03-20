const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const FieldValue = require('firebase-admin/firestore').FieldValue;

const { generateEmbeddings } = require('./utils/embeddingsClient');
const { refreshChapterSummary } = require('./utils/chapterUtils');

const db = admin.firestore();

function pageContentChanged(beforeData = {}, afterData = {}) {
  return (
    (beforeData.note || '') !== (afterData.note || '') ||
    (beforeData.plainText || '') !== (afterData.plainText || '') ||
    (beforeData.pageName || '') !== (afterData.pageName || '') ||
    (beforeData.order || '') !== (afterData.order || '')
  );
}

exports.syncPageDerivedData = onDocumentWritten(
  {
    region: 'us-central1',
    document: 'books/{bookId}/chapters/{chapterId}/pages/{pageId}',
  },
  async (event) => {
    const beforeExists = event.data.before.exists;
    const afterExists = event.data.after.exists;

    if (!afterExists) {
      return;
    }

    const beforeData = beforeExists ? (event.data.before.data() || {}) : null;
    const afterData = event.data.after.data() || {};
    const { bookId, chapterId, pageId } = event.params;
    const pageRef = db.collection('books').doc(bookId).collection('chapters').doc(chapterId).collection('pages').doc(pageId);

    const contentChanged = !beforeData || pageContentChanged(beforeData, afterData);
    const needsEmbeddingSync = afterData.embeddingStatus === 'pending';
    const plainText = String(afterData.plainText || '').trim();

    if (!contentChanged && !needsEmbeddingSync) {
      return;
    }

    logger.log('🧠 syncPageDerivedData started', {
      bookId,
      chapterId,
      pageId,
      contentChanged,
      needsEmbeddingSync,
    });

    if (needsEmbeddingSync) {
      try {
        if (plainText) {
          const embeddings = await generateEmbeddings(plainText, {
            taskType: 'RETRIEVAL_DOCUMENT',
          });

          await pageRef.update({
            embeddings: embeddings.length ? FieldValue.vector(embeddings) : null,
            embeddingModel: embeddings.length ? 'text-embedding-004' : null,
            embeddingStatus: 'ready',
            embeddingError: FieldValue.delete(),
            embeddingUpdatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          await pageRef.update({
            embeddings: null,
            embeddingModel: null,
            embeddingStatus: 'ready',
            embeddingError: FieldValue.delete(),
            embeddingUpdatedAt: FieldValue.serverTimestamp(),
          });
        }
      } catch (error) {
        logger.error('⚠️ Failed async page embedding sync', { bookId, chapterId, pageId, error: error?.message || error });
        await pageRef.update({
          embeddingStatus: 'error',
          embeddingError: String(error?.message || error || 'Unknown embedding error'),
          embeddingUpdatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    if (contentChanged) {
      try {
        await refreshChapterSummary(db, bookId, chapterId, plainText);
      } catch (error) {
        logger.error('⚠️ Failed async chapter summary refresh', { bookId, chapterId, pageId, error: error?.message || error });
      }
    }
  }
);
