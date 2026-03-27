import { apiService } from '@/services/ApiService';
import { SERVICE_ENDPOINTS, buildServiceUrl } from '@/config/serviceEndpoints';

const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;
const BARE_HOST_PATTERN = /^(localhost|127\.0\.0\.1|\[::1\]|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(:\d+)?(?:\/.*)?$/i;

const unwrapResponse = (payload) => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data;
  }
  return payload;
};

const replacePathParam = (template, key, value) => template.replace(`{${key}}`, encodeURIComponent(value));

const normalizeRequestBase = (url) => {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) return '';
  if (raw.startsWith('/')) return raw;
  if (ABSOLUTE_URL_PATTERN.test(raw)) return raw;
  if (BARE_HOST_PATTERN.test(raw)) {
    const protocol = typeof window !== 'undefined' ? (window.location?.protocol || 'https:') : 'https:';
    return `${protocol}//${raw}`;
  }
  return raw;
};

const withQuery = (url, params = {}) => {
  const normalizedUrl = normalizeRequestBase(url);

  try {
    const target = new URL(normalizedUrl, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (value == null || value === '') return;
      target.searchParams.set(key, value);
    });
    return target.toString();
  } catch {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value == null || value === '') return;
      searchParams.set(key, value);
    });

    const query = searchParams.toString();
    if (!query) return normalizedUrl || '/';

    const separator = (normalizedUrl || '').includes('?') ? '&' : '?';
    return `${normalizedUrl || '/'}${separator}${query}`;
  }
};

const springUrl = (pathTemplate, pathParams = {}, queryParams = {}) => {
  let resolvedPath = pathTemplate;
  Object.entries(pathParams).forEach(([key, value]) => {
    resolvedPath = replacePathParam(resolvedPath, key, value);
  });

  const baseUrl = buildServiceUrl(SERVICE_ENDPOINTS.spring.baseUrl, resolvedPath);
  return withQuery(baseUrl, queryParams);
};

const parseErrorResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await response.json();
    const message = json?.details || json?.message || json?.error || `Request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.response = json;
    throw error;
  }

  const text = await response.text();
  const error = new Error(text || `Request failed with ${response.status}`);
  error.status = response.status;
  throw error;
};

const parseSseEvent = (rawEvent) => {
  const lines = rawEvent.split('\n');
  let event = 'message';
  const dataLines = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.replace('event:', '').trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.replace('data:', '').trim());
    }
  }

  if (dataLines.length === 0) return null;
  const dataString = dataLines.join('\n');
  try {
    return { event, data: JSON.parse(dataString) };
  } catch {
    return { event, data: { text: dataString } };
  }
};

const normalizeJobPayload = (payload) => unwrapResponse(payload) || null;

const normalizeTransportError = (error, fallbackMessage) => {
  if (!error || error.name === 'AbortError') {
    return error;
  }

  const message = typeof error.message === 'string' ? error.message : '';
  if (
    /expected pattern/i.test(message)
    || /failed to construct 'url'/i.test(message)
    || /invalid url/i.test(message)
  ) {
    const normalizedError = new Error(
      fallbackMessage || 'Movies could not reach the video service. Check the Spring API URL configuration and refresh the page.'
    );
    normalizedError.cause = error;
    return normalizedError;
  }

  return error;
};

const request = async (url, { method = 'GET', body } = {}) => {
  const token = await apiService.getAuthToken();
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body == null ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw normalizeTransportError(error);
  }

  if (!response.ok) {
    await parseErrorResponse(response);
  }

  return response;
};

export const createPageClip = async (payload) => {
  const response = await request(
    springUrl(SERVICE_ENDPOINTS.spring.paths.videoPageClipsCreate),
    { method: 'POST', body: payload }
  );
  const json = await response.json();
  return normalizeJobPayload(json);
};

export const revisePageClip = async ({ bookId, jobId, instruction }) => {
  const response = await request(
    springUrl(
      SERVICE_ENDPOINTS.spring.paths.videoPageClipsRevise,
      { jobId },
      { bookId }
    ),
    { method: 'POST', body: { instruction } }
  );
  const json = await response.json();
  return normalizeJobPayload(json);
};

export const renderPageClip = async ({ bookId, jobId, quality = 'medium' } = {}) => {
  const response = await request(
    springUrl(
      SERVICE_ENDPOINTS.spring.paths.videoPageClipsRender,
      { jobId },
      { bookId }
    ),
    { method: 'POST', body: { quality } }
  );
  const json = await response.json();
  return normalizeJobPayload(json);
};

export const getPageClip = async ({ bookId, jobId }) => {
  const response = await request(
    springUrl(
      SERVICE_ENDPOINTS.spring.paths.videoPageClipsById,
      { jobId },
      { bookId }
    )
  );
  const json = await response.json();
  return normalizeJobPayload(json);
};

export const listPageClipsForBook = async (bookId) => {
  const response = await request(
    springUrl(
      SERVICE_ENDPOINTS.spring.paths.videoPageClipsByBook,
      { bookId }
    )
  );
  const json = await response.json();
  return unwrapResponse(json)?.jobs || [];
};

export const streamPageClip = async ({ bookId, jobId, onEvent, signal }) => {
  const token = await apiService.getAuthToken();
  let response;
  try {
    response = await fetch(
      springUrl(
        SERVICE_ENDPOINTS.spring.paths.videoPageClipsStream,
        { jobId },
        { bookId }
      ),
      {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal,
      }
    );
  } catch (error) {
    throw normalizeTransportError(
      error,
      'Movies could not open live video updates. Check the Spring API URL configuration and try again.'
    );
  }

  if (!response.ok) {
    await parseErrorResponse(response);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream') || !response.body) {
    const json = await response.json();
    const job = normalizeJobPayload(json);
    onEvent?.('snapshot', { jobId, status: job?.status, job });
    return job;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let latestJob = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let separatorIndex = buffer.indexOf('\n\n');

    while (separatorIndex !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex).replace(/\r/g, '').trim();
      buffer = buffer.slice(separatorIndex + 2);
      separatorIndex = buffer.indexOf('\n\n');

      if (!rawEvent) continue;
      const parsed = parseSseEvent(rawEvent);
      if (!parsed) continue;

      const payload = parsed.data || {};
      const eventName = payload?.type || parsed.event || 'message';
      const job = payload?.job || null;
      if (job) {
        latestJob = job;
      }
      onEvent?.(eventName, payload);

      if (eventName === 'error') {
        const error = new Error(payload?.message || 'Video stream failed.');
        error.response = payload;
        throw error;
      }
    }
  }

  return latestJob;
};
