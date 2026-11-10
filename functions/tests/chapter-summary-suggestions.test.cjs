const assert = require('node:assert/strict');
const test = require('node:test');

const { updateChapterPageSummary } = require('../utils/chapterUtils');
const { defineGenerateChapterSuggestionsFlow } = require('../flows/generateChapterSuggestions');

const makeFakeDb = (initialChapter) => {
  const chapter = { ...initialChapter };
  const updates = [];
  const chapterRef = {
    get: async () => ({ exists: true, data: () => ({ ...chapter }) }),
    update: async (fields) => {
      updates.push(fields);
      for (const [field, value] of Object.entries(fields)) {
        if (value?.constructor?.name === 'ArrayUnionTransform') {
          const existing = Array.isArray(chapter[field]) ? chapter[field] : [];
          chapter[field] = [...existing, ...value.elements.filter((item) => !existing.some((entry) => (
            JSON.stringify(entry) === JSON.stringify(item)
          )))];
        } else if (value?.constructor?.name !== 'ServerTimestampTransform') {
          chapter[field] = value;
        }
      }
    },
  };
  const db = {
    collection: (collectionName) => {
      assert.equal(collectionName, 'books');
      return {
        doc: (bookId) => {
          assert.equal(bookId, 'book-test');
          return {
            collection: (childCollection) => {
              assert.equal(childCollection, 'chapters');
              return { doc: (chapterId) => {
                assert.equal(chapterId, 'chapter-test');
                return chapterRef;
              } };
            },
          };
        },
      };
    },
  };

  return { db, chapter, updates };
};

test('page summary writes and cumulative chapter summary updates use the injected generator', async () => {
  const { db, chapter, updates } = makeFakeDb({
    title: 'A New Beginning',
    chapterSummary: 'The family prepared for a new arrival.',
    pagesSummary: [],
  });
  const generatorCalls = [];
  const summaryGenerator = async (...args) => {
    generatorCalls.push(args);
    return `Saved summary ${generatorCalls.length}`;
  };

  await updateChapterPageSummary(
    db,
    'book-test',
    'chapter-test',
    'page-test',
    'The baby arrived at sunrise.',
    'a',
    true,
    'The Arrival',
    { summaryGenerator },
  );

  assert.deepEqual(chapter.pagesSummary, [{
    pageId: 'page-test',
    pageName: 'The Arrival',
    shortNote: 'The baby arrived at sunrise.',
    order: 'a',
  }]);
  assert.equal(chapter.chapterSummary, 'Saved summary 1');
  assert.equal(generatorCalls[0][0], 'The family prepared for a new arrival.');
  assert.equal(generatorCalls[0][1], 'The baby arrived at sunrise.');
  assert.equal(generatorCalls[0][2], 'A New Beginning');
  assert.equal(updates[0].pagesSummary.constructor.name, 'ArrayUnionTransform');
  assert.equal(updates[1].chapterSummary, 'Saved summary 1');

  await updateChapterPageSummary(
    db,
    'book-test',
    'chapter-test',
    'page-test',
    'The family welcomed the baby together.',
    'b',
    false,
    'A Family Welcome',
    { summaryGenerator },
  );

  assert.deepEqual(chapter.pagesSummary, [{
    pageId: 'page-test',
    pageName: 'A Family Welcome',
    shortNote: 'The family welcomed the baby together.',
    order: 'b',
  }]);
  assert.equal(chapter.chapterSummary, 'Saved summary 2');
  assert.equal(generatorCalls[1][0], 'Saved summary 1');
  assert.equal(generatorCalls[1][1], 'The family welcomed the baby together.');
});

test('chapter suggestions include the latest saved chapter summary in the AI prompt', async () => {
  let flowHandler;
  let capturedPrompt = '';
  const fakeAi = {
    defineFlow: (_definition, handler) => {
      flowHandler = handler;
      return async (input, options) => flowHandler(input, options);
    },
    generate: async ({ prompt }) => {
      capturedPrompt = prompt;
      return { text: '["Write about the first family celebration."]' };
    },
  };
  const fakeZ = {
    string: () => ({ optional: () => ({}) }),
    boolean: () => ({ optional: () => ({}) }),
    object: (fields) => ({ fields }),
  };
  class FakeHttpsError extends Error {}

  const generateSuggestions = defineGenerateChapterSuggestionsFlow({
    ai: fakeAi,
    z: fakeZ,
    db: { collection: () => ({ doc: () => ({}) }) },
    HttpsError: FakeHttpsError,
  });
  const result = await generateSuggestions({
    bookId: 'book-test',
    chapterId: 'chapter-test',
  }, {
    context: {
      auth: { uid: 'owner-test' },
      bookData: { ownerId: 'owner-test', title: 'Our Family Journal' },
      chapterData: {
        title: 'A New Beginning',
        description: 'The first days together',
        chapterSummary: 'The family welcomed the baby and celebrated together.',
      },
    },
  });

  assert.deepEqual(result.suggestions, ['Write about the first family celebration.']);
  assert.match(capturedPrompt, /Chapter summary from saved pages: "The family welcomed the baby and celebrated together\."/);
});
