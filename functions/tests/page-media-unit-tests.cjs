const assert = require('node:assert/strict');
const test = require('node:test');

const { MAX_EMBEDDED_MEDIA_ITEMS, normalizeEmbeddedMedia } = require('../utils/pageMedia');

test('normalizeEmbeddedMedia keeps only supported page media fields', () => {
  assert.deepEqual(normalizeEmbeddedMedia([{
    url: ' https://example.test/invite.png ',
    storagePath: ' user/book/chapter/page/media/image/invite.png ',
    name: ' invite.png ',
    type: 'image',
    mimeType: 'image/png',
    albumId: 'book',
    blockId: 'block-1',
    blockIndex: 2,
    caption: 'Invite',
    source: 'upload',
    ignored: 'do not persist',
  }]), [{
    url: 'https://example.test/invite.png',
    storagePath: 'user/book/chapter/page/media/image/invite.png',
    name: 'invite.png',
    type: 'image',
    mimeType: 'image/png',
    albumId: 'book',
    blockId: 'block-1',
    caption: 'Invite',
    source: 'upload',
    blockIndex: 2,
  }]);
});

test('normalizeEmbeddedMedia removes unusable entries and caps the input array', () => {
  const rawItems = [
    null,
    {},
    ...Array.from({ length: MAX_EMBEDDED_MEDIA_ITEMS + 20 }, (_, index) => ({
      url: `https://example.test/${index}.png`,
      type: 'unsupported',
    })),
  ];

  const normalized = normalizeEmbeddedMedia(rawItems);
  assert.equal(normalized.length, MAX_EMBEDDED_MEDIA_ITEMS);
  assert.equal(normalized[0].type, 'image');
});
