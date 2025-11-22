const admin = require('firebase-admin');
const FieldValue = require('firebase-admin/firestore').FieldValue;

/**
 * Updates the chapter's pagesSummary with the latest shortNote for a page.
 * Handles both adding a new page summary and updating an existing one.
 * 
 * @param {Object} db - Firestore instance
 * @param {string} bookId - The ID of the book
 * @param {string} chapterId - The ID of the chapter
 * @param {string} pageId - The ID of the page
 * @param {string} plainText - The plain text content of the page
 * @param {string} order - The order string (required for new pages)
 * @param {boolean} isNew - Whether this is a new page being created
 */
async function updateChapterPageSummary(db, bookId, chapterId, pageId, plainText, order, isNew = false) {
    console.log(`📝 updateChapterPageSummary: ${isNew ? 'Creating' : 'Updating'} summary for page ${pageId}`);

    try {
        const chapterRef = db.collection('books').doc(bookId).collection('chapters').doc(chapterId);

        // Generate short note
        const shortNote = plainText
            ? plainText.substring(0, 40) + (plainText.length > 40 ? '...' : '')
            : 'New Page';

        console.log(`📝 Short note generated: "${shortNote}"`);

        if (isNew) {
            // Append new page summary
            const newPageSummary = {
                pageId,
                shortNote,
                order: order || '',
            };

            await chapterRef.update({
                pagesSummary: FieldValue.arrayUnion(newPageSummary),
                updatedAt: FieldValue.serverTimestamp(),
            });
            console.log('✅ Added new page summary to chapter');
        } else {
            // Update existing page summary
            const chapterDoc = await chapterRef.get();
            if (chapterDoc.exists) {
                const pagesSummary = chapterDoc.data().pagesSummary || [];

                const updatedPagesSummary = pagesSummary.map(ps =>
                    ps.pageId === pageId
                        ? { ...ps, shortNote } // Update shortNote, keep other fields (like order)
                        : ps
                );

                await chapterRef.update({
                    pagesSummary: updatedPagesSummary,
                    updatedAt: FieldValue.serverTimestamp(),
                });
                console.log('✅ Updated existing page summary in chapter');
            } else {
                console.warn('⚠️ Chapter document not found');
            }
        }
    } catch (error) {
        console.error('❌ Error in updateChapterPageSummary:', error);
        throw error;
    }
}

module.exports = { updateChapterPageSummary };
