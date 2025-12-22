/**
 * Utility functions for page management and content processing.
 */

// --- UTILITY FOR FRACTIONAL INDEXING ---
export const getMidpointString = (prev = '', next = '') => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let p = 0;
  while (p < prev.length || p < next.length) {
    const prevChar = prev.charAt(p) || 'a';
    const nextChar = next.charAt(p) || 'z';
    if (prevChar !== nextChar) {
      const prevIndex = alphabet.indexOf(prevChar);
      const nextIndex = alphabet.indexOf(nextChar);
      if (nextIndex - prevIndex > 1) {
        const midIndex = Math.round((prevIndex + nextIndex) / 2);
        return prev.substring(0, p) + alphabet[midIndex];
      }
    }
    p++;
  }
  return prev + 'm';
};

export const getNewOrderBetween = (prevOrder = '', nextOrder = '') =>
  getMidpointString(prevOrder, nextOrder);

// --- helper to strip HTML for shortNote ---
export const stripHtml = (html = '') =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|br|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// --- Smart Page Score Calculator ---
// Calculates "fullness" based on text length + vertical space (newlines/images)
export const calculatePageScore = (html = '') => {
  if (!html) return 0;

  // 1. Count actual text characters
  const textLength = stripHtml(html).length;

  // 2. Count vertical blockers
  // - Paragraphs/Divs/Breaks: ~60 chars of vertical space
  // - Images: ~500 chars of vertical space
  const blockCount = (html.match(/<\/(p|div|li)|<br/gi) || []).length;
  const imgCount = (html.match(/<img/gi) || []).length;

  const score = textLength + (blockCount * 60) + (imgCount * 500);
  return score;
};

// Turn plain text into simple HTML paragraphs for preview fallback
export const textToHtml = (text = '') =>
  String(text)
    .split('\n')
    .map(seg => seg.trim())
    .filter(Boolean)
    .map(seg => `<p>${seg.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('');

// Heuristic: does a string look like HTML?
export const isLikelyHtml = (s = '') => /<\w+[^>]*>/.test(s);

// Convert production storage URLs to emulator URLs when running locally
export const convertToEmulatorURL = (url) => {
  if (!url) return url;

  const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true';

  if (!useEmulator) {
    return url;
  }

  if (url.includes('127.0.0.1:9199') || url.includes('localhost:9199')) {
    return url;
  }

  if (url.includes('storage.googleapis.com')) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);

      if (pathParts.length >= 1) {
        const bucket = pathParts[0];
        const storagePath = pathParts.slice(1).join('/');

        let emulatorBucket = bucket;
        if (bucket.endsWith('.appspot.com')) {
          emulatorBucket = bucket.replace('.appspot.com', '.firebasestorage.app');
        }

        const encodedPath = encodeURIComponent(storagePath);
        const token = urlObj.searchParams.get('token') || 'emulator-token';
        return `http://127.0.0.1:9199/v0/b/${emulatorBucket}/o/${encodedPath}?alt=media&token=${token}`;
      }
    } catch (error) {
      console.error('Error converting URL to emulator format:', error, url);
      return url;
    }
  }

  return url;
};
