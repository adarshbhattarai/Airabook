const { extractTextFromHtml } = require('./utils/embeddingsClient');
const { updateChapterPageSummary } = require('./utils/chapterUtils');

// Mock Firestore
const mockDb = {
    collection: () => ({
        doc: () => ({
            collection: () => ({
                doc: () => ({
                    get: async () => ({
                        exists: true,
                        data: () => ({
                            pagesSummary: [
                                { pageId: 'page1', shortNote: 'New Page', order: 'a' }
                            ]
                        })
                    }),
                    update: async (data) => {
                        console.log('Update called with:', JSON.stringify(data, null, 2));
                    }
                })
            })
        })
    })
};

async function test() {
    console.log('--- Testing extractTextFromHtml ---');
    const html = '<p>Page 1 Content</p>';
    const plain = extractTextFromHtml(html);
    console.log(`HTML: ${html}`);
    console.log(`Plain: "${plain}"`);

    if (plain !== 'Page 1 Content') {
        console.error('❌ Extraction failed');
    } else {
        console.log('✅ Extraction passed');
    }

    console.log('\n--- Testing updateChapterPageSummary ---');
    await updateChapterPageSummary(mockDb, 'book1', 'chapter1', 'page1', plain, null, false);
}

test();
