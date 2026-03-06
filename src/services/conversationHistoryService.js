import { auth } from '@/lib/firebase';
import { SERVICE_ENDPOINTS, buildServiceUrl } from '@/config/serviceEndpoints';

const DEFAULT_SCOPE = 'dashboard';
const DEFAULT_SIZE = 5;
const historyCache = new Map();
const STORAGE_PREFIX = 'airabook:conversation-history:';

const canUseSessionStorage = () => typeof window !== 'undefined' && !!window.sessionStorage;

const toScope = (value) => {
  const scope = String(value || DEFAULT_SCOPE).trim().toLowerCase();
  return scope || DEFAULT_SCOPE;
};

const toSize = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_SIZE;
  return Math.floor(numeric);
};

const cacheKeyOf = (scope, size) => `${toScope(scope)}::${toSize(size)}`;

const asArray = (value) => (Array.isArray(value) ? value : []);

const resolveConversationId = (item = {}) => String(
  item.conversationId
  || item.conversationID
  || item.conversation_id
  || item.threadId
  || item.threadID
  || item.thread_id
  || item.id
  || ''
).trim();

const resolveTitle = (item = {}, fallbackIndex = 0) => {
  const title = item.title
    || item.name
    || item.subject
    || item.topic
    || item.summaryTitle
    || '';
  const trimmed = String(title || '').trim();
  if (trimmed) return trimmed;
  return `Conversation ${fallbackIndex + 1}`;
};

const resolvePreview = (item = {}) => {
  const preview = item.preview
    || item.summary
    || item.lastMessage
    || item.latestMessage
    || item.message
    || item.snippet
    || '';
  return String(preview || '').trim();
};

const resolveTimestamp = (item = {}) => {
  const raw = item.updatedAt
    || item.lastUpdatedAt
    || item.lastMessageAt
    || item.createdAt
    || item.timestamp
    || item.ts
    || null;
  if (!raw) return null;
  if (typeof raw === 'number') return raw;
  const parsed = Date.parse(String(raw));
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeHistoryItem = (item = {}, index = 0) => {
  const conversationId = resolveConversationId(item);
  return {
    id: conversationId || `history-${index + 1}`,
    conversationId,
    title: resolveTitle(item, index),
    preview: resolvePreview(item),
    updatedAt: resolveTimestamp(item),
    raw: item,
  };
};

const normalizeBucketFromStorage = (raw = {}) => {
  const pagesObject = raw?.pages && typeof raw.pages === 'object' ? raw.pages : {};
  const pages = new Map(
    Object.entries(pagesObject).map(([key, value]) => [Number(key), asArray(value)])
  );
  return {
    scope: toScope(raw.scope),
    size: toSize(raw.size),
    pages,
    items: asArray(raw.items),
    totalPages: Number.isFinite(Number(raw.totalPages)) ? Number(raw.totalPages) : null,
    hasMore: typeof raw.hasMore === 'boolean' ? raw.hasMore : true,
    lastFetchedAt: Number.isFinite(Number(raw.lastFetchedAt)) ? Number(raw.lastFetchedAt) : null,
  };
};

const loadBucketFromStorage = (scope, size) => {
  if (!canUseSessionStorage()) return null;
  const key = `${STORAGE_PREFIX}${cacheKeyOf(scope, size)}`;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return normalizeBucketFromStorage(JSON.parse(raw));
  } catch {
    return null;
  }
};

const persistBucketToStorage = (scope, size, bucket) => {
  if (!canUseSessionStorage()) return;
  const key = `${STORAGE_PREFIX}${cacheKeyOf(scope, size)}`;
  const pages = Object.fromEntries(Array.from(bucket.pages.entries()));
  const payload = {
    scope: bucket.scope,
    size: bucket.size,
    pages,
    items: bucket.items,
    totalPages: bucket.totalPages,
    hasMore: bucket.hasMore,
    lastFetchedAt: bucket.lastFetchedAt,
  };
  try {
    window.sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore storage quota/read-only errors.
  }
};

const getNested = (obj, path) => path.split('.').reduce(
  (acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined),
  obj
);

const pickFirstArray = (payload) => {
  const candidates = [
    'items',
    'content',
    'results',
    'conversations',
    'history',
    'data',
    'data.items',
    'data.content',
    'data.results',
    'result.items',
    'result.content',
    'response.items',
    'response.content',
  ];
  for (const path of candidates) {
    const candidate = getNested(payload, path);
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
};

const parseHistoryPayload = (payload, requestedPage, requestedSize) => {
  const list = pickFirstArray(payload).map(normalizeHistoryItem);

  const pageCandidates = [
    payload?.page,
    payload?.currentPage,
    payload?.data?.page,
    payload?.data?.currentPage,
    payload?.result?.page,
  ];
  const sizeCandidates = [
    payload?.size,
    payload?.data?.size,
    payload?.result?.size,
  ];
  const totalPagesCandidates = [
    payload?.totalPages,
    payload?.pageCount,
    payload?.data?.totalPages,
    payload?.data?.pageCount,
    payload?.result?.totalPages,
  ];
  const hasNextCandidates = [
    payload?.hasNext,
    payload?.data?.hasNext,
    payload?.result?.hasNext,
  ];
  const lastCandidates = [
    payload?.last,
    payload?.data?.last,
    payload?.result?.last,
  ];

  const pageCandidate = pageCandidates.find((value) => Number.isFinite(Number(value)));
  const sizeCandidate = sizeCandidates.find((value) => Number.isFinite(Number(value)));
  const totalPagesCandidate = totalPagesCandidates.find((value) => Number.isFinite(Number(value)));
  const hasNextFlagCandidate = hasNextCandidates.find((value) => typeof value === 'boolean');
  const lastFlagCandidate = lastCandidates.find((value) => typeof value === 'boolean');

  const page = Number.isFinite(Number(pageCandidate))
    ? Number(pageCandidate)
    : requestedPage;
  const size = Number.isFinite(Number(sizeCandidate))
    ? Number(sizeCandidate)
    : requestedSize;
  const totalPages = Number.isFinite(Number(totalPagesCandidate))
    ? Number(totalPagesCandidate)
    : null;
  const hasNextFlag = typeof hasNextFlagCandidate === 'boolean'
    ? hasNextFlagCandidate
    : (typeof lastFlagCandidate === 'boolean' ? !lastFlagCandidate : null);

  const hasMore = typeof hasNextFlag === 'boolean'
    ? hasNextFlag
    : (Number.isFinite(totalPages) ? page < totalPages : list.length >= size);

  return {
    list,
    page,
    size,
    totalPages: Number.isFinite(totalPages) ? totalPages : null,
    hasMore,
  };
};

const pickFirstValue = (payload, candidates = []) => {
  for (const path of candidates) {
    const value = getNested(payload, path);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
};

const normalizeRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'assistant' || normalized === 'model' || normalized === 'ai') return 'model';
  if (normalized === 'system') return 'assistant';
  return 'user';
};

const extractText = (item = {}) => {
  if (typeof item === 'string') return item.trim();

  const direct = item?.content ?? item?.text ?? item?.message ?? item?.value;
  if (typeof direct === 'string') return direct.trim();

  if (Array.isArray(item?.content)) {
    const joined = item.content
      .map((entry) => (typeof entry?.text === 'string' ? entry.text : ''))
      .filter(Boolean)
      .join('');
    return joined.trim();
  }

  if (item?.content && typeof item.content === 'object') {
    const nested = extractText(item.content);
    if (nested) return nested;
  }

  return '';
};

const pickFirstMessageArray = (payload) => {
  if (Array.isArray(payload)) return payload;

  const candidates = [
    'data',
    'messages',
    'history',
    'conversation.messages',
    'conversation.history',
    'data.messages',
    'data.history',
    'data.data',
    'result.data',
    'response.data',
    'data.conversation.messages',
    'result.messages',
    'result.history',
    'response.messages',
    'response.history',
  ];

  for (const path of candidates) {
    const value = getNested(payload, path);
    if (Array.isArray(value)) return value;
  }

  return [];
};

const normalizeConversationMessages = (items = [], fallbackConversationId = '') => items
  .map((item, index) => {
    if (item == null) return null;
    const content = extractText(item);
    if (!content) return null;

    const messageId = String(
      item?.id
      || item?.messageId
      || item?.message_id
      || `${fallbackConversationId || 'conversation'}-${index + 1}`
    ).trim();

    return {
      id: messageId,
      role: normalizeRole(item?.role),
      content,
      actions: [],
    };
  })
  .filter(Boolean);

const buildConversationByIdUrl = (conversationId) => {
  const endpointTemplate = SERVICE_ENDPOINTS.spring.paths.conversationById;
  const encodedConversationId = encodeURIComponent(String(conversationId || '').trim());
  const pathWithId = endpointTemplate.includes('{conversationId}')
    ? endpointTemplate.replace('{conversationId}', encodedConversationId)
    : `${String(endpointTemplate || '').replace(/\/$/, '')}/${encodedConversationId}`;

  return buildServiceUrl(SERVICE_ENDPOINTS.spring.baseUrl, pathWithId);
};

const parseConversationDetailPayload = (payload = {}, requestedConversationId = '') => {
  const resolvedConversationId = String(
    pickFirstValue(payload, [
      'conversationId',
      'conversationID',
      'conversation_id',
      'conversation.id',
      'data.conversationId',
      'data.conversation.id',
      'result.conversationId',
      'response.conversationId',
    ])
    || requestedConversationId
  ).trim();

  const title = String(
    pickFirstValue(payload, [
      'title',
      'name',
      'conversation.title',
      'conversation.name',
      'data.title',
      'data.conversation.title',
      'result.title',
      'response.title',
    ])
    || ''
  ).trim();

  const messages = normalizeConversationMessages(
    pickFirstMessageArray(payload),
    resolvedConversationId || requestedConversationId
  );

  return {
    conversationId: resolvedConversationId,
    title,
    messages,
    raw: payload,
  };
};

const getOrCreateCacheBucket = (scope, size) => {
  const key = cacheKeyOf(scope, size);
  const existing = historyCache.get(key);
  if (existing) return existing;
  const persisted = loadBucketFromStorage(scope, size);
  if (persisted) {
    historyCache.set(key, persisted);
    return persisted;
  }
  const bucket = {
    scope: toScope(scope),
    size: toSize(size),
    pages: new Map(),
    items: [],
    totalPages: null,
    hasMore: true,
    lastFetchedAt: null,
  };
  historyCache.set(key, bucket);
  return bucket;
};

const rebuildItemsFromPages = (bucket) => {
  const orderedPages = Array.from(bucket.pages.keys()).sort((a, b) => a - b);
  const byId = new Map();
  const merged = [];

  for (const page of orderedPages) {
    const pageItems = asArray(bucket.pages.get(page));
    for (const item of pageItems) {
      const key = item.conversationId || item.id;
      if (!key) {
        merged.push(item);
        continue;
      }
      if (byId.has(key)) {
        const index = byId.get(key);
        merged[index] = { ...merged[index], ...item };
      } else {
        byId.set(key, merged.length);
        merged.push(item);
      }
    }
  }

  bucket.items = merged.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
};

export const getConversationHistoryCache = ({ scope = DEFAULT_SCOPE, size = DEFAULT_SIZE } = {}) => {
  const key = cacheKeyOf(scope, size);
  const bucket = historyCache.get(key);
  if (!bucket) {
    return {
      items: [],
      hasMore: true,
      nextPage: 1,
      totalPages: null,
      cached: false,
    };
  }

  const loadedPages = Array.from(bucket.pages.keys()).sort((a, b) => a - b);
  const nextPage = loadedPages.length > 0 ? (loadedPages[loadedPages.length - 1] + 1) : 1;
  return {
    items: bucket.items,
    hasMore: bucket.hasMore,
    nextPage,
    totalPages: bucket.totalPages,
    cached: true,
  };
};

export const fetchConversationHistory = async ({
  scope = DEFAULT_SCOPE,
  page = 1,
  size = DEFAULT_SIZE,
  force = false,
} = {}) => {
  const safeScope = toScope(scope);
  const safeSize = toSize(size);
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const bucket = getOrCreateCacheBucket(safeScope, safeSize);

  if (!force && bucket.pages.has(safePage)) {
    const loadedPages = Array.from(bucket.pages.keys()).sort((a, b) => a - b);
    const nextPage = loadedPages.length > 0 ? (loadedPages[loadedPages.length - 1] + 1) : safePage + 1;
    return {
      items: bucket.items,
      page: safePage,
      size: safeSize,
      hasMore: bucket.hasMore,
      nextPage,
      totalPages: bucket.totalPages,
      fromCache: true,
    };
  }

  const endpoint = SERVICE_ENDPOINTS.spring.paths.conversationHistory;
  const url = new URL(buildServiceUrl(SERVICE_ENDPOINTS.spring.baseUrl, endpoint));
  url.searchParams.set('request', safeScope);
  url.searchParams.set('requestParam', safeScope);
  url.searchParams.set('source', safeScope);
  url.searchParams.set('page', String(safePage));
  url.searchParams.set('size', String(safeSize));

  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Conversation history request failed with ${response.status}`);
  }

  const payload = await response.json();
  const parsed = parseHistoryPayload(payload, safePage, safeSize);
  bucket.pages.set(parsed.page, parsed.list);
  bucket.hasMore = parsed.hasMore;
  bucket.totalPages = parsed.totalPages;
  bucket.lastFetchedAt = Date.now();
  rebuildItemsFromPages(bucket);
  persistBucketToStorage(safeScope, safeSize, bucket);

  return {
    items: bucket.items,
    page: parsed.page,
    size: parsed.size,
    hasMore: parsed.hasMore,
    nextPage: parsed.page + 1,
    totalPages: parsed.totalPages,
    fromCache: false,
  };
};

export const fetchConversationById = async ({ conversationId } = {}) => {
  const trimmedConversationId = String(conversationId || '').trim();
  if (!trimmedConversationId) {
    throw new Error('conversationId is required');
  }

  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(buildConversationByIdUrl(trimmedConversationId), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Conversation fetch failed with ${response.status}`);
  }

  const payload = await response.json();
  return parseConversationDetailPayload(payload, trimmedConversationId);
};

export const upsertConversationHistory = ({
  scope = DEFAULT_SCOPE,
  size = DEFAULT_SIZE,
  item,
} = {}) => {
  if (!item || typeof item !== 'object') return;
  const bucket = getOrCreateCacheBucket(scope, size);
  const normalized = normalizeHistoryItem(item, 0);
  const pageOne = asArray(bucket.pages.get(1));
  const index = pageOne.findIndex((entry) => (entry.conversationId || entry.id) === (normalized.conversationId || normalized.id));
  const nextItem = { ...normalized, updatedAt: normalized.updatedAt || Date.now() };

  if (index >= 0) {
    pageOne[index] = { ...pageOne[index], ...nextItem };
  } else {
    pageOne.unshift(nextItem);
  }

  bucket.pages.set(1, pageOne.slice(0, Math.max(5, bucket.size)));
  rebuildItemsFromPages(bucket);
  persistBucketToStorage(scope, size, bucket);
};
