// functions/createPage.js
// Cloud Function to create a new page with embeddings

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const FieldValue = require('firebase-admin/firestore').FieldValue;
const { assertAndIncrementCounter, resolveUserPlanLimits } = require('./utils/limits');

const { extractTextFromHtml, generateEmbeddings } = require('./utils/embeddingsClient');
const { updateChapterPageSummary } = require('./utils/chapterUtils');

// Firebase Admin initialized in index.js
const db = admin.firestore();

/**
 * Create a new page with embeddings
 * Called from BookDetail.jsx via httpsCallable(functions, 'createPage')
 */
exports.createPage = onCall(
    { region: 'us-central1', cors: true },
    async (request) => {
        const { data, auth } = request;
        let reservedPageSlot = false;

        logger.log('📄 createPage called at:', new Date().toISOString());
        logger.log('📦 Request data:', JSON.stringify(data, null, 2));

        // Check authentication
        if (!auth) {
            logger.error('❌ Authentication failed');
            throw new HttpsError('unauthenticated', 'User must be authenticated to create pages.');
        }

        const { bookId, chapterId, note, media, order, type, templateVersion, content, theme, pageName } = data;
        const userId = auth.uid;

        // Validate required fields
        if (!bookId || !chapterId) {
            throw new HttpsError('invalid-argument', 'Book ID and chapter ID are required.');
        }

        try {
            // Verify user has access to this book
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

            // Verify chapter exists
            const chapterRef = db.collection('books').doc(bookId).collection('chapters').doc(chapterId);
            const chapterDoc = await chapterRef.get();

            if (!chapterDoc.exists) {
                throw new HttpsError('not-found', 'Chapter not found.');
            }

            const { tier, limits } = await resolveUserPlanLimits(db, userId);
            const pagePerChapterLimit = Number(limits?.pagesPerChapter);
            if (Number.isFinite(pagePerChapterLimit) && pagePerChapterLimit > 0 && tier !== 'god') {
                const existingPagesSnap = await chapterRef
                    .collection('pages')
                    .limit(pagePerChapterLimit)
                    .get();
                if (existingPagesSnap.size >= pagePerChapterLimit) {
                    throw new HttpsError(
                        'resource-exhausted',
                        `You can create up to ${pagePerChapterLimit} pages per chapter on your current plan.`
                    );
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

            // Extract plain text from HTML
            const plainText = extractTextFromHtml(note || '');

            // Generate embeddings (only if there's text content)
            let embeddings = [];
            let embeddingModel = null;

            if (plainText && plainText.length > 0) {
                try {
                    embeddings = await generateEmbeddings(plainText, {
                        taskType: 'RETRIEVAL_DOCUMENT'  // For documents to be searched later
                    });
                    embeddingModel = 'text-embedding-004';
                    logger.log(`✅ Generated embeddings: ${embeddings.length} dimensions`);
                } catch (embError) {
                    logger.error('⚠️ Failed to generate embeddings, saving page without embeddings:', embError);
                    // Continue without embeddings - don't fail the page creation
                }
            } else {
                logger.log('ℹ️ No text content, skipping embeddings generation');
            }

            // Create page document
            const pageData = {
                note: note || '',
                plainText: plainText,
                embeddings: (embeddings && embeddings.length > 0) ? FieldValue.vector(embeddings) : null,
                embeddingModel: embeddingModel,
                media: media || [],
                pageName: String(pageName || '').trim(),
                order: order || '',
                ...(type ? { type } : {}),
                ...(templateVersion ? { templateVersion } : {}),
                ...(content ? { content } : {}),
                ...(theme ? { theme } : {}),
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                createdBy: userId,
            };

            const pageRef = await db
                .collection('books')
                .doc(bookId)
                .collection('chapters')
                .doc(chapterId)
                .collection('pages')
                .add(pageData);

            logger.log(`📄 Page created with ID: ${pageRef.id}`);

            // Update chapter's pagesSummary using helper
            await updateChapterPageSummary(db, bookId, chapterId, pageRef.id, plainText, order, true, pageName);

            logger.log(`✅ Chapter pagesSummary updated`);

            return {
                success: true,
                page: {
                    id: pageRef.id,
                    ...pageData,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                message: 'Page created successfully!',
            };

        } catch (error) {
            if (reservedPageSlot) {
                try {
                    await assertAndIncrementCounter(db, userId, 'pages', -1);
                } catch (revertErr) {
                    logger.error('⚠️ Failed to revert page counter after error:', revertErr);
                }
            }
            logger.error('❌ Error creating page:', error);
            if (error instanceof HttpsError) {
                throw error;
            }
            throw new HttpsError('internal', `Failed to create page: ${error.message}`);
        }
    }
);
