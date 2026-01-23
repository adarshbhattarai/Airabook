const { randomUUID } = require('crypto');
const admin = require('firebase-admin');
const { googleAI } = require('@genkit-ai/googleai');
const { ai } = require('../genkitClient');
const { buildImagePrompt } = require('../utils/prompts');

// Use Gemini 2.5 Flash Image model per latest guidance
const DEFAULT_MODEL = googleAI.model('gemini-2.5-flash-image');

const isEmulator =
  process.env.FUNCTIONS_EMULATOR === 'true' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  process.env.STORAGE_EMULATOR_HOST ||
  process.env.FIREBASE_STORAGE_EMULATOR_HOST;

/**
 * Convert a data URL to a buffer + mime
 * @param {string} dataUrl
 * @returns {{ buffer: Buffer, mimeType: string }}
 */
function dataUrlToBuffer(dataUrl = '') {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL from image generation');
  }
  const mimeType = match[1] || 'image/png';
  const base64Data = match[2];
  return {
    buffer: Buffer.from(base64Data, 'base64'),
    mimeType,
  };
}

/**
 * Upload generated image buffer to Firebase Storage and return URL + path
 * @param {Object} params
 * @param {Buffer} params.buffer
 * @param {string} params.mimeType
 * @param {string} params.userId
 * @param {string} params.bookId
 * @param {string} params.chapterId
 * @param {string} params.pageId
 */
async function uploadGeneratedImage({ buffer, mimeType, userId, bookId, chapterId, pageId }) {
  const bucket = admin.storage().bucket();
  const token = randomUUID();
  const filename = `gen-${Date.now()}-${Math.round(Math.random() * 1e6)}.png`;
  const storagePath = `${userId}/${bookId}/${chapterId}/${pageId}/media/image/${filename}`;

  const metadata = {
    metadata: { firebaseStorageDownloadTokens: token },
    contentType: mimeType || 'image/png',
    cacheControl: 'public,max-age=31536000',
  };

  await bucket.file(storagePath).save(buffer, {
    contentType: metadata.contentType,
    metadata,
    resumable: false,
    public: false,
  });

  const encodedPath = encodeURIComponent(storagePath);
  const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
  const baseUrl = isEmulator
    ? `${emulatorHost.startsWith('http') ? '' : 'http://'}${emulatorHost}/v0/b/${bucket.name}/o/${encodedPath}`
    : `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}`;
  const downloadURL = `${baseUrl}?alt=media&token=${token}`;

  return { storagePath, url: downloadURL };
}

/**
 * Generate an image with Genkit + Vertex Imagen and persist to Storage
 * @param {Object} params
 * @param {string} params.userPrompt
 * @param {string} [params.pageContext]
 * @param {string} params.userId
 * @param {string} params.bookId
 * @param {string} params.chapterId
 * @param {string} params.pageId
 */
async function generateImageForPage({
  userPrompt,
  pageContext,
  userId,
  bookId,
  chapterId,
  pageId,
}) {
  const prompt = buildImagePrompt({ userPrompt, pageContext });

  const response = await ai.generate({
    model: DEFAULT_MODEL,
    prompt,
    output: { format: 'media' },
  });

  const dataUrl = response?.media?.url || response?.media?.[0]?.url;
  if (!dataUrl) {
     throw new Error('Image generation returned no media');
  }

  const { buffer, mimeType } = dataUrlToBuffer(dataUrl);
  const uploadResult = await uploadGeneratedImage({
    buffer,
    mimeType,
    userId,
    bookId,
    chapterId,
    pageId,
  });

  return {
    storagePath: uploadResult.storagePath,
    url: uploadResult.url,
    albumId: bookId,
    type: 'image',
    name: 'AI generated image',
  };
}

module.exports = {
  generateImageForPage,
};
