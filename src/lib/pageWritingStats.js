import { stripHtml } from './pageUtils.js';

const inlineText = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(inlineText).join('');
  if (!content || typeof content !== 'object') return '';
  if (typeof content.text === 'string') return content.text;
  if (Array.isArray(content.rows)) {
    return content.rows.map((row) => (row.cells || []).map(inlineText).join(' ')).join('\n');
  }
  return inlineText(content.content);
};

const blocksToText = (blocks) => blocks.map((block) => [
  inlineText(block.content),
  blocksToText(block.children || []),
].filter(Boolean).join('\n')).join('\n');

const wordSegmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'word' })
  : null;

export const getPageWritingText = ({ blocks, html = '' } = {}) => (
  Array.isArray(blocks)
    ? blocksToText(blocks)
    : stripHtml(html.replace(/<br\s*\/?\s*>|<\/(?:td|th|tr|blockquote|pre)>/gi, ' '))
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#\d+;|&[a-z]+;/gi, ' ')
);

export const getPageWritingStats = (page = {}) => {
  const text = getPageWritingText(page);
  const words = wordSegmenter
    ? Array.from(wordSegmenter.segment(text)).filter((segment) => segment.isWordLike).length
    : (text.trim().match(/\S+/gu) || []).length;
  return { words, readingMinutes: words ? Math.max(1, Math.ceil(words / 200)) : 0 };
};
