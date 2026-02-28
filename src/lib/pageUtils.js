/**
 * Utility functions for page management and content processing.
 */

// --- UTILITY FOR FRACTIONAL INDEXING ---
export const getMidpointString = (prev = '', next = '') => {
  const charset = '0123456789abcdefghijklmnopqrstuvwxyz';
  const base = charset.length;
  const left = String(prev || '');
  const right = String(next || '');

  let prefix = '';
  let i = 0;

  while (true) {
    const leftChar = i < left.length ? left[i] : null;
    const rightChar = i < right.length ? right[i] : null;
    const leftIndex = leftChar == null ? -1 : charset.indexOf(leftChar);
    const rightIndex = rightChar == null ? base : charset.indexOf(rightChar);

    const safeLeftIndex = leftIndex < 0 ? -1 : leftIndex;
    const safeRightIndex = rightIndex < 0 ? base : rightIndex;

    if (safeLeftIndex + 1 < safeRightIndex) {
      const midIndex = Math.floor((safeLeftIndex + safeRightIndex) / 2);
      return prefix + charset[midIndex];
    }

    // No room at this position, carry current left digit forward and keep searching.
    if (leftChar != null && safeLeftIndex >= 0) {
      prefix += leftChar;
    } else {
      prefix += charset[0];
    }

    i += 1;
    if (i > 64) {
      return `${prefix}${charset[Math.floor(base / 2)]}`;
    }
  }
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

  try {
    const urlObj = new URL(url);
    const isEmulatorHost = (
      (urlObj.hostname === '127.0.0.1' || urlObj.hostname === 'localhost') &&
      urlObj.port === '9199'
    );

    if (isEmulatorHost) {
      if (!urlObj.searchParams.get('alt')) {
        urlObj.searchParams.set('alt', 'media');
      }
      return urlObj.toString();
    }

    let bucket = null;
    let storagePath = null;

    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const isFirebaseStorageApiHost = urlObj.hostname.includes('firebasestorage.googleapis.com');
    const isGoogleStorageApiHost = urlObj.hostname === 'storage.googleapis.com';
    const hasFirebaseApiPath = pathParts[0] === 'v0' && pathParts[1] === 'b';

    if ((isFirebaseStorageApiHost || isGoogleStorageApiHost) && hasFirebaseApiPath) {
      const bucketIndex = pathParts.indexOf('b');
      const objectIndex = pathParts.indexOf('o');
      if (bucketIndex >= 0 && objectIndex > bucketIndex && pathParts[bucketIndex + 1]) {
        bucket = decodeURIComponent(pathParts[bucketIndex + 1]);
        storagePath = decodeURIComponent(pathParts.slice(objectIndex + 1).join('/'));
      }
    } else if (isGoogleStorageApiHost && pathParts.length >= 2) {
      bucket = decodeURIComponent(pathParts[0]);
      storagePath = decodeURIComponent(pathParts.slice(1).join('/'));
    } else {
      return url;
    }

    if (!bucket || !storagePath) {
      return url;
    }

    const encodedPath = encodeURIComponent(storagePath);
    const token = urlObj.searchParams.get('token') || 'emulator-token';
    return `http://127.0.0.1:9199/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${token}`;
  } catch (error) {
    console.error('Error converting URL to emulator format:', error, url);
    return url;
  }
};
