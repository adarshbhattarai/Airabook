import { apiService } from '@/services/ApiService';
import { SERVICE_ENDPOINTS } from '@/config/serviceEndpoints';

const paths = SERVICE_ENDPOINTS.spring.paths;
const accountPath = (accountId) => paths.accountFiles.replace('{accountId}', encodeURIComponent(accountId));
const accountFilePath = (accountId, fileId) => paths.accountFile
  .replace('{accountId}', encodeURIComponent(accountId))
  .replace('{fileId}', encodeURIComponent(fileId));
const accountFileUploadPath = (accountId) => paths.accountFileUpload.replace('{accountId}', encodeURIComponent(accountId));
const referencePath = (accountId, fileId) => paths.accountFileReferences
  .replace('{accountId}', encodeURIComponent(accountId))
  .replace('{fileId}', encodeURIComponent(fileId));
const executePath = (accountId, fileId) => paths.accountFileExecute
  .replace('{accountId}', encodeURIComponent(accountId))
  .replace('{fileId}', encodeURIComponent(fileId));
const contentPath = (accountId, fileId) => paths.accountFileContent
  .replace('{accountId}', encodeURIComponent(accountId))
  .replace('{fileId}', encodeURIComponent(fileId));
const deleteFilePath = (accountId, fileId) => paths.accountFileDelete
  .replace('{accountId}', encodeURIComponent(accountId))
  .replace('{fileId}', encodeURIComponent(fileId));

export const normalizeAccountFile = (value = {}) => {
  const response = value?.data && !Array.isArray(value.data) ? value.data : value;
  const file = response.file || response;
  const name = String(file.name || file.fileName || file.displayName || 'Untitled file');
  const mimeType = String(file.mimeType || file.contentType || '');
  const documentType = String(file.documentType || (
    name.toLowerCase().endsWith('.pdf') ? 'PDF'
      : name.toLowerCase().endsWith('.docx') ? 'DOCX'
        : name.toLowerCase().endsWith('.md') || name.toLowerCase().endsWith('.markdown') ? 'MARKDOWN'
          : mimeType.includes('wordprocessingml') ? 'DOCX'
            : mimeType === 'application/pdf' ? 'PDF' : ''
  )).toUpperCase();
  const references = Array.isArray(file.references) ? file.references : [];
  const reference = (type) => references.find((item) => String(item.type || item.scope || '').toLowerCase() === type) || null;
  const conversationReference = reference('conversation');
  const pageReference = reference('page') || reference('book') || {};
  return {
    ...file,
    id: String(file.id || file.fileId || file.sourceDocumentId || ''),
    name,
    mimeType,
    documentType,
    sizeBytes: Number(file.sizeBytes ?? file.size ?? 0),
    status: String(file.status || file.uploadStatus || 'READY').toUpperCase(),
    canDelete: file.canDelete ?? file.permissions?.canDelete ?? false,
    scope: String(file.scope || file.referenceScope || 'library').toLowerCase(),
    references,
    conversationId: file.conversationId || conversationReference?.conversationId || conversationReference?.id || '',
    bookId: file.bookId || pageReference.bookId || '',
    chapterId: file.chapterId || pageReference.chapterId || '',
    pageId: file.pageId || pageReference.pageId || '',
    createdAt: file.createdAt || file.uploadedAt || null,
  };
};

export const uploadAccountFile = async ({ accountId, file, scope = 'library', onProgress, signal }) => {
  if (!accountId) throw new Error('Select a workspace before uploading.');
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('scope', scope);
  const result = await apiService.uploadWithProgress(accountFileUploadPath(accountId), form, { onProgress, signal });
  return normalizeAccountFile(result);
};

export const listAccountFiles = async ({ accountId, signal }) => {
  if (!accountId) throw new Error('Select a workspace to view files.');
  const result = await apiService.get(accountPath(accountId), { signal });
  const payload = result?.data && !Array.isArray(result.data) ? result.data : result;
  const files = Array.isArray(payload) ? payload : (payload?.items || payload?.files || result?.data || []);
  return files.map(normalizeAccountFile).filter((file) => file.id);
};

const hasLocation = (file, location) => {
  const referenceTypes = (file.references || []).map((reference) => String(
    reference.type || reference.referenceType || reference.scope || ''
  ).toLowerCase());
  const hasConversation = file.scope === 'conversation' || !!file.conversationId || referenceTypes.includes('conversation');
  const hasPage = ['page', 'book'].includes(file.scope) || !!file.bookId || !!file.pageId
    || referenceTypes.some((type) => type === 'page' || type === 'book');
  if (location === 'conversation') return hasConversation;
  if (location === 'page') return hasPage;
  if (location === 'unlinked') return !(file.references || []).length && !file.conversationId && !file.bookId && !file.pageId;
  return true;
};

const sortAccountFiles = (files, sortBy, direction) => {
  const sign = direction === 'asc' ? 1 : -1;
  const compare = (left, right) => {
    let result = 0;
    if (sortBy === 'sizeBytes') {
      result = (Number(left.sizeBytes) || 0) - (Number(right.sizeBytes) || 0);
    } else if (sortBy === 'createdAt') {
      result = (new Date(left.createdAt || 0).getTime() || 0) - (new Date(right.createdAt || 0).getTime() || 0);
    } else {
      result = String(left[sortBy] || '').localeCompare(String(right[sortBy] || ''), undefined, { numeric: true, sensitivity: 'base' });
    }
    return result === 0 ? String(left.id).localeCompare(String(right.id)) : result * sign;
  };
  return [...files].sort(compare);
};

const buildLocalFilePage = (files, options) => {
  const {
    page = 0, size = 25, sortBy = 'createdAt', direction = 'desc', documentType,
    location = 'all', minSizeBytes, maxSizeBytes, q, uploadedAfter, uploadedBefore,
  } = options;
  const query = String(q || '').trim().toLocaleLowerCase();
  const after = uploadedAfter ? new Date(uploadedAfter).getTime() : null;
  const before = uploadedBefore ? new Date(uploadedBefore).getTime() : null;
  const filtered = files.filter((file) => {
    const fileSize = Number(file.sizeBytes) || 0;
    const createdAt = file.createdAt ? new Date(file.createdAt).getTime() : NaN;
    if (documentType && file.documentType !== documentType) return false;
    if (!hasLocation(file, location)) return false;
    if (minSizeBytes != null && minSizeBytes !== '' && fileSize < Number(minSizeBytes)) return false;
    if (maxSizeBytes != null && maxSizeBytes !== '' && fileSize > Number(maxSizeBytes)) return false;
    if (query && !file.name.toLocaleLowerCase().includes(query)) return false;
    if (after != null && Number.isFinite(createdAt) && createdAt < after) return false;
    if (before != null && Number.isFinite(createdAt) && createdAt > before) return false;
    return true;
  });
  const sorted = sortAccountFiles(filtered, sortBy, direction);
  const totalItems = sorted.length;
  const totalPages = Math.ceil(totalItems / size);
  const currentPage = Math.min(page, Math.max(0, totalPages - 1));
  const start = currentPage * size;
  return {
    items: sorted.slice(start, start + size),
    page: currentPage,
    size,
    totalItems,
    totalPages,
    hasNext: currentPage + 1 < totalPages,
    hasPrevious: currentPage > 0,
    sortBy,
    direction,
  };
};

/** Load one My files table page, falling back to client-side paging for older array responses. */
export const listAccountFilesPage = async (options = {}) => {
  const {
    accountId, page = 0, size = 25, sortBy = 'createdAt', direction = 'desc', signal,
    documentType, location = 'all', minSizeBytes, maxSizeBytes, q, uploadedAfter, uploadedBefore,
  } = options;
  if (!accountId) throw new Error('Select a workspace to view files.');

  const query = new URLSearchParams({
    page: String(page),
    size: String(size),
    sortBy,
    direction,
    location,
  });
  for (const [key, value] of Object.entries({ documentType, minSizeBytes, maxSizeBytes, q, uploadedAfter, uploadedBefore })) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }

  const result = await apiService.get(`${accountPath(accountId)}?${query.toString()}`, { signal });
  const payload = result?.data && !Array.isArray(result.data) ? result.data : result;
  const rawFiles = Array.isArray(payload) ? payload : (payload?.items || payload?.files || result?.data || []);
  const items = rawFiles.map(normalizeAccountFile).filter((file) => file.id);
  const hasPageMetadata = !Array.isArray(payload)
    && Number.isFinite(Number(payload?.page))
    && Number.isFinite(Number(payload?.size))
    && Number.isFinite(Number(payload?.totalItems))
    && Number.isFinite(Number(payload?.totalPages));

  if (!hasPageMetadata) return buildLocalFilePage(items, options);

  return {
    ...payload,
    items,
    page: Number(payload.page),
    size: Number(payload.size),
    totalItems: Number(payload.totalItems),
    totalPages: Number(payload.totalPages),
    hasNext: Boolean(payload.hasNext),
    hasPrevious: Boolean(payload.hasPrevious),
    sortBy: payload.sortBy || sortBy,
    direction: payload.direction || direction,
  };
};

export const getAccountFile = async ({ accountId, fileId, signal }) => {
  if (!accountId || !fileId) throw new Error('Choose a file before loading its details.');
  const result = await apiService.get(accountFilePath(accountId, fileId), { signal });
  return normalizeAccountFile(result);
};

export const accountFilesQueryKey = (accountId) => ['account-files', String(accountId || '')];

export const linkAccountFile = async ({ accountId, fileId, reference }) => {
  return apiService.post(referencePath(accountId, fileId), reference);
};

export const unlinkAccountFile = async ({ accountId, fileId, referenceId }) => {
  return apiService.delete(`${referencePath(accountId, fileId)}/${encodeURIComponent(referenceId)}`);
};

export const deleteAccountFile = async ({ accountId, fileId, signal }) => {
  if (!accountId || !fileId) throw new Error('Choose a file before deleting it.');
  return apiService.delete(deleteFilePath(accountId, fileId), { signal });
};

// Resolve the stored source on Spring; never send client-supplied Storage URLs.
export const vectorizeAccountFile = async ({ accountId, fileId, signal }) => {
  if (!accountId || !fileId) throw new Error('Choose a file before vectorizing it.');
  const path = paths.accountFileVectorize
    .replace('{accountId}', encodeURIComponent(accountId))
    .replace('{fileId}', encodeURIComponent(fileId));
  return apiService.post(path, {}, { signal });
};

export const executeAccountFile = async ({ accountId, fileId, documentType = 'PDF', destination, translation = { enabled: false, sourceLanguage: 'en', targetLanguage: null }, signal }) => {
  if (!accountId || !fileId) throw new Error('Choose a file before starting processing.');
  return apiService.post(executePath(accountId, fileId), {
    operation: documentType === 'MARKDOWN' ? 'MARKDOWN_TO_BOOK' : 'PDF_TO_BOOK',
    destination,
    translation,
  }, { signal });
};

export const getAccountFileContent = async ({ accountId, fileId, signal }) => {
  if (!accountId || !fileId) throw new Error('Choose a file before opening it.');
  return apiService.getBlob(contentPath(accountId, fileId), {
    headers: { Accept: 'application/pdf, text/markdown, text/plain' },
    signal,
  });
};

export const formatFileSize = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const MAX_ACCOUNT_FILE_BYTES = 10 * 1024 * 1024;
export const acceptedFileExtensions = ['.pdf', '.md', '.markdown', '.docx'];
export const acceptedFilesLabel = 'PDF, Markdown, or Word (.docx), up to 10 MiB';
export const getAccountFileValidationError = (file) => {
  if (!acceptedFileExtensions.some((extension) => file?.name?.toLowerCase().endsWith(extension))) {
    return 'Choose a PDF, Markdown, or DOCX file.';
  }
  if (Number(file.size) > MAX_ACCOUNT_FILE_BYTES) return 'Files must be 10 MiB or smaller.';
  return '';
};
export const isAcceptedAccountFile = (file) => !getAccountFileValidationError(file);
