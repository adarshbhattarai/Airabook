const DROPZONE_MARKER = 'data:dropzone/placeholder';
const EMBEDDED_MEDIA_TYPES = new Set(['image', 'video']);

const stringOrEmpty = (value) => (typeof value === 'string' ? value.trim() : '');

const parseBlockMediaMetadata = (block) => {
  const rawMetadata = block?.props?.name;
  if (!rawMetadata || typeof rawMetadata !== 'string') return {};

  try {
    const parsed = JSON.parse(rawMetadata);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const visitBlocks = (blocks, visitor) => {
  if (!Array.isArray(blocks)) return;

  blocks.forEach((block) => {
    visitor(block);
    if (Array.isArray(block?.children) && block.children.length > 0) {
      visitBlocks(block.children, visitor);
    }
  });
};

export const extractEmbeddedMedia = (blocks) => {
  const embeddedMedia = [];
  let blockIndex = 0;

  visitBlocks(blocks, (block) => {
    const currentBlockIndex = blockIndex;
    blockIndex += 1;

    if (!EMBEDDED_MEDIA_TYPES.has(block?.type)) return;

    const url = stringOrEmpty(block?.props?.url);
    if (!url || url === DROPZONE_MARKER) return;

    const metadata = parseBlockMediaMetadata(block);
    const type = metadata.mediaType === 'video' || block.type === 'video' ? 'video' : 'image';
    const storagePath = stringOrEmpty(metadata.storagePath);
    const caption = stringOrEmpty(block?.props?.caption);
    const originalName = stringOrEmpty(metadata.originalName);
    const albumId = stringOrEmpty(metadata.albumId);
    const mimeType = stringOrEmpty(metadata.mimeType);
    const source = stringOrEmpty(metadata.source);
    const blockId = stringOrEmpty(block?.id);

    embeddedMedia.push({
      url,
      ...(storagePath ? { storagePath } : {}),
      name: originalName || caption || `${type === 'video' ? 'Video' : 'Image'} ${embeddedMedia.length + 1}`,
      type,
      ...(mimeType ? { mimeType } : {}),
      ...(albumId ? { albumId } : {}),
      ...(blockId ? { blockId } : {}),
      blockIndex: currentBlockIndex,
      ...(caption ? { caption } : {}),
      ...(source ? { source } : {}),
    });
  });

  return embeddedMedia;
};

const mediaIdentity = (item) => stringOrEmpty(item?.storagePath) || stringOrEmpty(item?.url);

export const mergePageMedia = (media, embeddedMedia) => {
  const merged = [];
  const seen = new Set();

  [
    ...(Array.isArray(media) ? media.map((item) => ({ ...item, placement: 'gallery' })) : []),
    ...(Array.isArray(embeddedMedia)
      ? embeddedMedia
        .slice()
        .sort((left, right) => (left?.blockIndex ?? 0) - (right?.blockIndex ?? 0))
        .map((item) => ({ ...item, placement: 'embedded' }))
      : []),
  ].forEach((item) => {
    const identity = mediaIdentity(item);
    if (!identity || seen.has(identity)) return;
    seen.add(identity);
    merged.push(item);
  });

  return merged;
};

