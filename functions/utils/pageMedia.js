const MAX_EMBEDDED_MEDIA_ITEMS = 100;
const MAX_STRING_LENGTH = 4096;
const VALID_MEDIA_TYPES = new Set(['image', 'video']);

const normalizeString = (value, maxLength = MAX_STRING_LENGTH) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
};

const normalizeBlockIndex = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
};

const normalizeEmbeddedMedia = (rawItems) => {
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map((rawItem) => {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return null;

      const url = normalizeString(rawItem.url);
      const storagePath = normalizeString(rawItem.storagePath);
      if (!url && !storagePath) return null;

      const requestedType = normalizeString(rawItem.type, 32);
      const type = VALID_MEDIA_TYPES.has(requestedType) ? requestedType : 'image';
      const blockIndex = normalizeBlockIndex(rawItem.blockIndex);
      const item = {
        ...(url ? { url } : {}),
        ...(storagePath ? { storagePath } : {}),
        name: normalizeString(rawItem.name, 512) || (type === 'video' ? 'Video' : 'Image'),
        type,
      };

      [
        ['mimeType', 128],
        ['albumId', 256],
        ['blockId', 256],
        ['caption', 1024],
        ['source', 64],
      ].forEach(([field, maxLength]) => {
        const value = normalizeString(rawItem[field], maxLength);
        if (value) item[field] = value;
      });

      if (blockIndex !== null) item.blockIndex = blockIndex;
      return item;
    })
    .filter(Boolean)
    .slice(0, MAX_EMBEDDED_MEDIA_ITEMS);
};

module.exports = {
  MAX_EMBEDDED_MEDIA_ITEMS,
  normalizeEmbeddedMedia,
};
