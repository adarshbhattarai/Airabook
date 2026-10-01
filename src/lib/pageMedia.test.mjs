import assert from 'node:assert/strict';
import test from 'node:test';

import { extractEmbeddedMedia, mergePageMedia } from './pageMedia.js';

test('extractEmbeddedMedia indexes nested BlockNote image and video blocks in document order', () => {
  const blocks = [
    { id: 'paragraph-1', type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
    {
      id: 'image-1',
      type: 'image',
      props: {
        url: 'https://example.test/invite.png',
        caption: 'Birthday invite',
        name: JSON.stringify({
          storagePath: 'user/book/chapter/page/media/image/invite.png',
          albumId: 'book',
          originalName: 'invite.png',
          mediaType: 'image',
          mimeType: 'image/png',
          source: 'upload',
        }),
      },
      children: [
        {
          id: 'video-1',
          type: 'video',
          props: {
            url: 'https://example.test/clip.mp4',
            caption: '',
            name: JSON.stringify({
              storagePath: 'user/book/chapter/page/media/video/clip.mp4',
              originalName: 'clip.mp4',
              mediaType: 'video',
              source: 'assetRegistry',
            }),
          },
        },
      ],
    },
    {
      id: 'dropzone',
      type: 'image',
      props: { url: 'data:dropzone/placeholder', name: '' },
    },
  ];

  assert.deepEqual(extractEmbeddedMedia(blocks), [
    {
      url: 'https://example.test/invite.png',
      storagePath: 'user/book/chapter/page/media/image/invite.png',
      name: 'invite.png',
      type: 'image',
      mimeType: 'image/png',
      albumId: 'book',
      blockId: 'image-1',
      blockIndex: 1,
      caption: 'Birthday invite',
      source: 'upload',
    },
    {
      url: 'https://example.test/clip.mp4',
      storagePath: 'user/book/chapter/page/media/video/clip.mp4',
      name: 'clip.mp4',
      type: 'video',
      blockId: 'video-1',
      blockIndex: 2,
      source: 'assetRegistry',
    },
  ]);
});

test('mergePageMedia keeps legacy gallery order and deduplicates embedded assets', () => {
  const merged = mergePageMedia(
    [{ url: 'https://example.test/a.png', storagePath: 'a', type: 'image' }],
    [
      { url: 'https://example.test/b.png', storagePath: 'b', type: 'image', blockIndex: 4 },
      { url: 'https://example.test/a.png', storagePath: 'a', type: 'image', blockIndex: 2 },
    ],
  );

  assert.deepEqual(merged, [
    {
      url: 'https://example.test/a.png',
      storagePath: 'a',
      type: 'image',
      placement: 'gallery',
    },
    {
      url: 'https://example.test/b.png',
      storagePath: 'b',
      type: 'image',
      blockIndex: 4,
      placement: 'embedded',
    },
  ]);
});
