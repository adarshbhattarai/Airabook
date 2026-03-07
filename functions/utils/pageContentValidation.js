const { HttpsError } = require('firebase-functions/v2/https');

const MAX_PAGE_LINES = 10000;
const MAX_PAGE_UTF8_BYTES = 524288; // 512 KB

const decodeHtmlEntities = (value = '') =>
  String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'");

const htmlToPlainTextWithLines = (html = '') => {
  if (!html) return '';

  return decodeHtmlEntities(
    String(html)
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
};

const countLines = (text = '') => {
  if (!text) return 0;
  return String(text).split('\n').length;
};

const flattenContentToText = (value) => {
  if (value == null) return '';
  if (typeof value === 'string') return htmlToPlainTextWithLines(value);
  if (Array.isArray(value)) {
    return value.map((item) => flattenContentToText(item)).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    return Object.values(value).map((item) => flattenContentToText(item)).filter(Boolean).join('\n');
  }
  return String(value);
};

const serializeContent = (content) => {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  try {
    return JSON.stringify(content);
  } catch (_) {
    return String(content);
  }
};

const validatePageContentLimits = ({ note = '', content } = {}) => {
  const noteText = htmlToPlainTextWithLines(note);
  const contentText = flattenContentToText(content);
  const combinedText = [noteText, contentText].filter(Boolean).join('\n');
  const lineCount = countLines(combinedText);

  if (lineCount > MAX_PAGE_LINES) {
    throw new HttpsError(
      'invalid-argument',
      `Page content exceeds the ${MAX_PAGE_LINES.toLocaleString()} line limit (${lineCount.toLocaleString()} lines).`
    );
  }

  const noteBytes = Buffer.byteLength(String(note || ''), 'utf8');
  const contentBytes = Buffer.byteLength(serializeContent(content), 'utf8');
  const totalBytes = noteBytes + contentBytes;

  if (totalBytes > MAX_PAGE_UTF8_BYTES) {
    throw new HttpsError(
      'invalid-argument',
      `Page content exceeds the 512KB limit (${(totalBytes / 1024).toFixed(1)}KB).`
    );
  }

  return { lineCount, totalBytes };
};

module.exports = {
  MAX_PAGE_LINES,
  MAX_PAGE_UTF8_BYTES,
  validatePageContentLimits,
};
