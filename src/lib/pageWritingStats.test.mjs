import test from 'node:test';
import assert from 'node:assert/strict';
import { getPageWritingStats } from './pageWritingStats.js';

test('counts writing in nested lists, links and tables without counting media metadata', () => {
  const stats = getPageWritingStats({ blocks: [
    { type: 'heading', content: [{ text: 'Trip notes' }] },
    { type: 'paragraph', content: [{ text: 'Read ' }, { type: 'link', content: [{ text: 'our itinerary' }] }], children: [
      { type: 'paragraph', content: [{ text: 'आज राम्रो दिन' }] },
    ] },
    { type: 'table', content: { rows: [{ cells: [[{ text: 'Kathmandu' }], [{ type: 'tableCell', content: [{ text: 'Arrival day' }] }]] }] } },
    { type: 'image', props: { name: 'metadata should not affect the writing guide', url: 'https://example.com/photo' } },
  ] });
  assert.equal(stats.words, 11);
  assert.equal(stats.readingMinutes, 1);
});

test('counts saved HTML and empty drafts consistently', () => {
  assert.equal(getPageWritingStats({ html: '<p>Hello&nbsp;world</p><p>Second<br>line &amp; notes.</p>' }).words, 5);
  assert.equal(getPageWritingStats({ html: '<table><tr><td>Day one</td><td>Kathmandu arrival</td></tr></table>' }).words, 4);
  assert.deepEqual(getPageWritingStats({ blocks: [], html: '<p>Old saved text</p>' }), { words: 0, readingMinutes: 0 });
});

test('long entries remain countable above any suggested length', () => {
  assert.deepEqual(getPageWritingStats({ blocks: [{ content: [{ text: 'journal '.repeat(2001) }] }] }), { words: 2001, readingMinutes: 11 });
});
