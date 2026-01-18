const admin = require('firebase-admin');
const FieldValue = require('firebase-admin/firestore').FieldValue;
const { ai } = require('../genkitClient');

/**
 * Generates a cumulative summary by combining previous summary with new page content
 * @param {string} previousSummary - The existing chapter summary
 * @param {string} newPageContent - The new page plain text content
 * @param {string} chapterTitle - The chapter title
 * @returns {Promise<string>} - The new cumulative summary
 */
async function generateCumulativeSummary(previousSummary, newPageContent, chapterTitle) {
    console.log('🤖 Generating cumulative summary...');

    try {
        const { text } = await ai.prompt('airabook_chapter_summary')({
            previousSummary: previousSummary || undefined,
            newPageContent,
            chapterTitle: chapterTitle || undefined,
        });

        console.log('✅ Cumulative summary generated successfully');
        return text;
    } catch (error) {
        console.error('❌ Error generating cumulative summary:', error);
        // Fallback: simple concatenation with truncation
        const combined = previousSummary
            ? `${previousSummary}\n\n${newPageContent.substring(0, 500)}`
            : newPageContent.substring(0, 500);
        return combined.substring(0, 1000) + (combined.length > 1000 ? '...' : '');
    }
}

/**
 * Updates the chapter's pagesSummary with the latest shortNote for a page.
 * Also generates and updates the cumulative chapter summary.
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
        const chapterDoc = await chapterRef.get();

        if (!chapterDoc.exists) {
            console.warn('⚠️ Chapter document not found');
            return;
        }

        const chapterData = chapterDoc.data();
        const pagesSummary = chapterData.pagesSummary || [];
        const previousChapterSummary = chapterData.chapterSummary || '';
        const chapterTitle = chapterData.title || '';

        // Generate short note
        const shortNote = plainText
            ? plainText.substring(0, 40) + (plainText.length > 40 ? '...' : '')
            : 'New Page';

        console.log(`📝 Short note generated: "${shortNote}"`);

        // Generate cumulative summary
        const newChapterSummary = await generateCumulativeSummary(
            previousChapterSummary,
            plainText,
            chapterTitle
        );

        if (isNew) {
            // Append new page summary
            const newPageSummary = {
                pageId,
                shortNote,
                order: order || '',
            };

            await chapterRef.update({
                pagesSummary: FieldValue.arrayUnion(newPageSummary),
                chapterSummary: newChapterSummary,
                updatedAt: FieldValue.serverTimestamp(),
            });
            console.log('✅ Added new page summary and updated chapter summary');
        } else {
            // Update existing page summary
            const updatedPagesSummary = pagesSummary.map(ps =>
                ps.pageId === pageId
                    ? { ...ps, shortNote } // Update shortNote, keep other fields (like order)
                    : ps
            );

            await chapterRef.update({
                pagesSummary: updatedPagesSummary,
                chapterSummary: newChapterSummary,
                updatedAt: FieldValue.serverTimestamp(),
            });
            console.log('✅ Updated existing page summary and chapter summary');
        }
    } catch (error) {
        console.error('❌ Error in updateChapterPageSummary:', error);
        throw error;
    }
}

module.exports = { updateChapterPageSummary };
