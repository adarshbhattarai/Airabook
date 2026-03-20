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

function buildShortNote(plainText) {
    return plainText
        ? plainText.substring(0, 40) + (plainText.length > 40 ? '...' : '')
        : 'New Page';
}

async function updatePageSummaryEntry(db, bookId, chapterId, pageId, plainText, order, isNew = false, pageName = undefined) {
    const chapterRef = db.collection('books').doc(bookId).collection('chapters').doc(chapterId);
    const chapterDoc = await chapterRef.get();

    if (!chapterDoc.exists) {
        console.warn('⚠️ Chapter document not found');
        return;
    }

    const chapterData = chapterDoc.data();
    const pagesSummary = chapterData.pagesSummary || [];
    const shortNote = buildShortNote(plainText);
    const normalizedPageName = pageName === undefined ? undefined : String(pageName || '').trim();

    console.log(`📝 Short note generated: "${shortNote}"`);

    if (isNew) {
        const newPageSummary = {
            pageId,
            pageName: normalizedPageName || '',
            shortNote,
            order: order || '',
        };

        await chapterRef.update({
            pagesSummary: FieldValue.arrayUnion(newPageSummary),
            updatedAt: FieldValue.serverTimestamp(),
        });
        console.log('✅ Added new page summary');
        return;
    }

    const updatedPagesSummary = pagesSummary.map((ps) =>
        ps.pageId === pageId
            ? {
                ...ps,
                shortNote,
                ...(normalizedPageName !== undefined ? { pageName: normalizedPageName } : {}),
                ...(order !== undefined && order !== null ? { order } : {}),
            }
            : ps
    );

    await chapterRef.update({
        pagesSummary: updatedPagesSummary,
        updatedAt: FieldValue.serverTimestamp(),
    });
    console.log('✅ Updated existing page summary');
}

async function refreshChapterSummary(db, bookId, chapterId, plainText) {
    const chapterRef = db.collection('books').doc(bookId).collection('chapters').doc(chapterId);
    const chapterDoc = await chapterRef.get();

    if (!chapterDoc.exists) {
        console.warn('⚠️ Chapter document not found for chapter summary refresh');
        return;
    }

    const chapterData = chapterDoc.data();
    const previousChapterSummary = chapterData.chapterSummary || '';
    const chapterTitle = chapterData.title || '';

    const newChapterSummary = await generateCumulativeSummary(
        previousChapterSummary,
        plainText,
        chapterTitle
    );

    await chapterRef.update({
        chapterSummary: newChapterSummary,
        updatedAt: FieldValue.serverTimestamp(),
    });
    console.log('✅ Updated chapter summary');
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
 * @param {string} pageName - Optional user-defined page name
 */
async function updateChapterPageSummary(db, bookId, chapterId, pageId, plainText, order, isNew = false, pageName = undefined, options = {}) {
    console.log(`📝 updateChapterPageSummary: ${isNew ? 'Creating' : 'Updating'} summary for page ${pageId}`);

    try {
        const { skipChapterSummary = false } = options || {};
        await updatePageSummaryEntry(db, bookId, chapterId, pageId, plainText, order, isNew, pageName);
        if (!skipChapterSummary) {
            await refreshChapterSummary(db, bookId, chapterId, plainText);
        }
    } catch (error) {
        console.error('❌ Error in updateChapterPageSummary:', error);
        throw error;
    }
}

module.exports = {
    buildShortNote,
    updatePageSummaryEntry,
    refreshChapterSummary,
    updateChapterPageSummary,
};
