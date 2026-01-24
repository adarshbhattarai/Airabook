// functions/updatePage.js
// Cloud Function to update a page and regenerate embeddings

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const FieldValue = require('firebase-admin/firestore').FieldValue;

const { extractTextFromHtml, generateEmbeddings } = require('./utils/embeddingsClient');
const { updateChapterPageSummary } = require('./utils/chapterUtils');

const db = admin.firestore();

/**
 * Update an existing page with new embeddings
 * Called from BookDetail.jsx via httpsCallable(functions, 'updatePage')
 */
exports.updatePage = onCall(
    { region: 'us-central1', cors: true },
    async (request) => {
        const { data, auth } = request;

        logger.log('📝 updatePage called at:', new Date().toISOString());

        if (!auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated to update pages.');
        }

        const { bookId, chapterId, pageId, note, media, type, templateVersion, content, theme } = data;
        const userId = auth.uid;

        if (!bookId || !chapterId || !pageId) {
            throw new HttpsError('invalid-argument', 'Book ID, chapter ID, and page ID are required.');
        }

        try {
            // Verify access
            const bookRef = db.collection('books').doc(bookId);
            const bookDoc = await bookRef.get();

            if (!bookDoc.exists) {
                throw new HttpsError('not-found', 'Book not found.');
            }

            const bookData = bookDoc.data();
            const isOwner = bookData.ownerId === userId;
            const isMember = bookData.members && bookData.members[userId];

            if (!isOwner && !isMember) {
                throw new HttpsError('permission-denied', 'You do not have access to this book.');
            }

            // Get existing page
            const pageRef = db
                .collection('books')
                .doc(bookId)
                .collection('chapters')
                .doc(chapterId)
                .collection('pages')
                .doc(pageId);

            const pageDoc = await pageRef.get();
            if (!pageDoc.exists) {
                throw new HttpsError('not-found', 'Page not found.');
            }

            // Extract plain text
            const plainText = extractTextFromHtml(note || '');

            // Regenerate embeddings if text changed
            let embeddings = pageDoc.data().embeddings || [];
            let embeddingModel = pageDoc.data().embeddingModel || null;

            if (plainText && plainText.length > 0) {
                try {
                    embeddings = await generateEmbeddings(plainText, {
                        taskType: 'RETRIEVAL_DOCUMENT'
                    });
                    embeddingModel = 'text-embedding-004';
                    logger.log(`✅ Regenerated embeddings: ${embeddings.length} dimensions`);
                } catch (embError) {
                    logger.error('⚠️ Failed to regenerate embeddings:', embError);
                    // Keep existing embeddings
                }
            } else {
                // No text content, clear embeddings
                embeddings = [];
                embeddingModel = null;
            }

            // Update page
            const updateData = {
                note: note || '',
                plainText,
                embeddings: (embeddings && embeddings.length > 0) ? FieldValue.vector(embeddings) : null,
                embeddingModel,
                media: media !== undefined ? media : pageDoc.data().media,
                updatedAt: FieldValue.serverTimestamp(),
            };
            if (type) updateData.type = type;
            if (templateVersion) updateData.templateVersion = templateVersion;
            if (content !== undefined) updateData.content = content;
            if (theme !== undefined) updateData.theme = theme;

            await pageRef.update(updateData);
            logger.log(`✅ Page ${pageId} updated`);

            logger.log(`📝 About to update chapter summary. plainText: "${plainText}"`);

            // Update chapter's pagesSummary using helper
            await updateChapterPageSummary(db, bookId, chapterId, pageId, plainText, null, false);

            logger.log(`✅ Chapter summary update completed`);

            return {
                success: true,
                page: {
                    id: pageId,
                    ...updateData,
                    updatedAt: new Date(),
                },
                message: 'Page updated successfully!',
            };

        } catch (error) {
            logger.error('❌ Error updating page:', error);
            if (error instanceof HttpsError) {
                throw error;
            }
            throw new HttpsError('internal', `Failed to update page: ${error.message}`);
        }
    }
);
