import { apiService } from '@/services/ApiService';
import { SERVICE_ENDPOINTS, buildServiceUrl } from '@/config/serviceEndpoints';

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

const parseErrorResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await response.json();
    const error = new Error(json?.error || json?.message || `Request failed with ${response.status}`);
    error.status = response.status;
    error.response = json;
    throw error;
  }

  const text = await response.text();
  const error = new Error(text || `Request failed with ${response.status}`);
  error.status = response.status;
  throw error;
};

const resolvePlannerApplyUrl = (stream = false) => {
  if (stream && SERVICE_ENDPOINTS.spring.paths.bookCreationPlanStream) {
    return buildServiceUrl(
      SERVICE_ENDPOINTS.spring.baseUrl,
      SERVICE_ENDPOINTS.spring.paths.bookCreationPlanStream
    );
  }

  const applyPath = SERVICE_ENDPOINTS.spring.paths.bookCreationPlanApply;
  const streamPath = `${applyPath.replace(/\/$/, '')}/stream`;
  return buildServiceUrl(SERVICE_ENDPOINTS.spring.baseUrl, stream ? streamPath : applyPath);
};

const requestPlanner = async (payload, { stream = false } = {}) => {
  const token = await apiService.getAuthToken();
  const url = resolvePlannerApplyUrl(stream);
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
};

const parsePlannerSseResponse = async (response, onEvent) => {
  if (!response.body) {
    return { ok: true };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalPayload = null;
  let lastResponseSnapshot = null;

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
      const normalizedType = payload?.type || payload?.event || parsed.event || 'message';
      onEvent?.(normalizedType, payload);

      if (payload?.response && typeof payload.response === 'object') {
        lastResponseSnapshot = payload.response;
      }

      if (normalizedType === 'final') {
        finalPayload = payload?.response || payload;
      }

      if (normalizedType === 'error') {
        const error = new Error(payload?.summary || payload?.message || 'Planner stream failed.');
        error.response = payload;
        throw error;
      }

      if (parsed.event === 'done') {
        finalPayload = payload || finalPayload;
      }
    }
  }

  return finalPayload || lastResponseSnapshot || { ok: true };
};

export const applyPhotoDistribution = async (payload, onEvent) => {
  const response = await requestPlanner(payload, { stream: true });
  if (!response.ok) {
    await parseErrorResponse(response);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    return parsePlannerSseResponse(response, onEvent);
  }

  const data = await response.json();
  if (Array.isArray(data?.events)) {
    for (const event of data.events) {
      onEvent?.(event?.type || 'event', event || {});
    }
  } else if (data?.type) {
    onEvent?.(data.type, data);
  }
  return data;
};

const parseEventPayload = (eventType, payload, onEvent) => {
  if (Array.isArray(payload?.events)) {
    for (const event of payload.events) {
      onEvent?.(event?.type || 'event', event || {});
    }
  } else if (eventType) {
    onEvent?.(eventType, payload || {});
  }
};

const parseResponseData = async (response, onEvent) => {
  if (!response.ok) {
    await parseErrorResponse(response);
  }

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('text/event-stream')) {
    const data = await response.json();
    parseEventPayload(data?.event || data?.type, data, onEvent);
    return data;
  }

  if (!response.body) {
    return { ok: true };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let donePayload = null;

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

      onEvent?.(parsed.event, parsed.data || {});
      if (parsed.event === 'done') {
        donePayload = parsed.data || {};
      }
    }
  }

  return donePayload || { ok: true };
};

const resolveHitlResponseUrl = (responsePath) => {
  if (typeof responsePath === 'string' && /^https?:\/\//i.test(responsePath)) {
    return responsePath;
  }

  if (typeof responsePath === 'string' && responsePath.trim()) {
    return buildServiceUrl(SERVICE_ENDPOINTS.spring.baseUrl, responsePath.trim());
  }

  if (SERVICE_ENDPOINTS.spring.paths.bookCreationPlanHitlResponse) {
    return buildServiceUrl(
      SERVICE_ENDPOINTS.spring.baseUrl,
      SERVICE_ENDPOINTS.spring.paths.bookCreationPlanHitlResponse
    );
  }

  return buildServiceUrl(
    SERVICE_ENDPOINTS.spring.baseUrl,
    `${SERVICE_ENDPOINTS.spring.paths.bookCreationPlanApply}/response`
  );
};

export const respondToPlannerHitl = async (payload, options = {}, onEvent) => {
  const token = await apiService.getAuthToken();
  const url = resolveHitlResponseUrl(options?.responsePath);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  return parseResponseData(response, onEvent);
};
