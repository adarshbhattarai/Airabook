import { auth } from '@/lib/firebase';
import { SERVICE_ENDPOINTS, buildServiceUrl } from '@/config/serviceEndpoints';

const DEFAULT_CHAT_STREAM_PATH = 'api/v1/chat/stream';
const CHUNK_EVENTS = new Set(['chunk', 'delta', 'token', 'assistant_text', 'assistanttext', 'content', 'message']);
const DONE_EVENTS = new Set(['done', 'final', 'complete', 'completed', 'finish', 'finished']);
const ERROR_EVENTS = new Set(['error', 'failed', 'failure']);

const getStreamUrl = () => {
  const configuredPath = import.meta.env.VITE_SPRING_CHAT_STREAM_ENDPOINT || DEFAULT_CHAT_STREAM_PATH;
  if (/^https?:\/\//i.test(configuredPath)) {
    return configuredPath;
  }

  const normalizedPath = (
    SERVICE_ENDPOINTS.spring.baseUrl.endsWith('/api/v1') && configuredPath.startsWith('api/v1/')
      ? configuredPath.replace(/^api\/v1\//, '')
      : configuredPath
  );

  return buildServiceUrl(SERVICE_ENDPOINTS.spring.baseUrl, normalizedPath);
};

const normalizeRole = (role) => {
  if (role === 'assistant' || role === 'model') return 'assistant';
  if (role === 'system') return 'system';
  return 'user';
};

const normalizeEventName = (value) => {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/([A-Z])/g, '_$1')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
    .replace(/^_+/, '');
};

const extractTextFromPayload = (payload) => {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload?.text === 'string') return payload.text;
  if (typeof payload?.delta === 'string') return payload.delta;
  if (typeof payload?.content === 'string') return payload.content;
  if (typeof payload?.message === 'string') return payload.message;
  if (typeof payload?.outputText === 'string') return payload.outputText;

  if (Array.isArray(payload?.content)) {
    return payload.content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('');
  }

  if (payload?.response && typeof payload.response === 'object') {
    return extractTextFromPayload(payload.response);
  }

  return '';
};

const normalizeMessagesForBackend = (messages) => (
  Array.isArray(messages)
    ? messages
      .map((message) => {
        const content = typeof message?.content === 'string' ? message.content : '';
        if (!content.trim()) return null;
        return {
          role: normalizeRole(message?.role),
          content,
        };
      })
      .filter(Boolean)
    : []
);

const buildRequestPayload = ({
  messages,
  isSurprise = false,
  action,
  bookId,
  chapterId,
  scope,
}) => {
  const source = typeof scope === 'string' && scope.trim() ? scope.trim() : 'dashboard';
  const payload = {
    messages: normalizeMessagesForBackend(messages),
    source,
    scope: source,
    context: source,
    isSurprise: Boolean(isSurprise),
  };

  if (typeof action === 'string' && action.trim()) {
    payload.action = action.trim();
  }
  if (typeof bookId === 'string' && bookId.trim()) {
    payload.bookId = bookId.trim();
  }
  if (typeof chapterId === 'string' && chapterId.trim()) {
    payload.chapterId = chapterId.trim();
  }

  return payload;
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

  if (!dataLines.length) {
    return null;
  }

  const dataString = dataLines.join('\n');
  let data = null;
  try {
    data = JSON.parse(dataString);
  } catch (error) {
    data = { text: dataString };
  }

  return { event, data };
};

const parseNonSseResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return { text };
};

const parseErrorResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  let message = `Streaming request failed with ${response.status}`;

  if (contentType.includes('application/json')) {
    try {
      const json = await response.json();
      message = json?.error || json?.message || message;
    } catch (_) {
      // Ignore JSON parse failures and keep fallback message.
    }
  } else {
    const text = await response.text();
    if (text) message = text;
  }

  throw new Error(message);
};

export const streamAirabookAI = async ({
  messages,
  isSurprise = false,
  action,
  bookId,
  chapterId,
  scope,
  onChunk,
  onOutline,
  onPageStart,
  onPageChunk,
  onPageDone,
  onPageError,
  onEvent,
  onDone,
  onError,
  signal,
}) => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated.');
  }

  const idToken = await user.getIdToken();
  const payload = buildRequestPayload({ messages, isSurprise, action, bookId, chapterId, scope });
  const response = await fetch(getStreamUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    await parseErrorResponse(response);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream') || !response.body) {
    const data = await parseNonSseResponse(response);
    if (typeof onDone === 'function') {
      onDone(typeof data === 'object' ? data : { text: String(data || '') });
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let combinedText = '';
  let didEmitDone = false;

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
      const payloadData = parsed.data || {};
      const normalizedEvent = normalizeEventName(parsed.event || 'message');
      const payloadEvent = normalizeEventName(payloadData?.event || payloadData?.type || '');
      const eventName = payloadEvent || normalizedEvent || 'message';
      const chunkText = extractTextFromPayload(payloadData);

      if (eventName === 'outline') {
        if (typeof onOutline === 'function') {
          onOutline(payloadData);
        }
        if (typeof onEvent === 'function') {
          onEvent(eventName, payloadData);
        }
      } else if (eventName === 'page_start') {
        if (typeof onPageStart === 'function') {
          onPageStart(payloadData);
        }
        if (typeof onEvent === 'function') {
          onEvent(eventName, payloadData);
        }
      } else if (eventName === 'page_chunk') {
        if (typeof onPageChunk === 'function') {
          onPageChunk(payloadData);
        }
        if (typeof onEvent === 'function') {
          onEvent(eventName, payloadData);
        }
      } else if (eventName === 'page_done') {
        if (typeof onPageDone === 'function') {
          onPageDone(payloadData);
        }
        if (typeof onEvent === 'function') {
          onEvent(eventName, payloadData);
        }
      } else if (eventName === 'page_error') {
        if (typeof onPageError === 'function') {
          onPageError(payloadData);
        }
        if (typeof onEvent === 'function') {
          onEvent(eventName, payloadData);
        }
      } else if (DONE_EVENTS.has(eventName)) {
        didEmitDone = true;
        const donePayload = typeof payloadData === 'object' && payloadData
          ? { ...payloadData, text: extractTextFromPayload(payloadData) || combinedText || '' }
          : { text: combinedText || '' };
        if (typeof onDone === 'function') {
          onDone(donePayload);
        }
        if (typeof onEvent === 'function') {
          onEvent(eventName, payloadData);
        }
      } else if (ERROR_EVENTS.has(eventName)) {
        if (typeof onError === 'function') {
          onError(payloadData);
        }
        if (typeof onEvent === 'function') {
          onEvent(eventName, payloadData);
        }
      } else if (CHUNK_EVENTS.has(eventName) && chunkText) {
        combinedText += chunkText;
        if (typeof onChunk === 'function') {
          onChunk(chunkText);
        }
        if (typeof onEvent === 'function') {
          onEvent(eventName, payloadData);
        }
      } else if (typeof onEvent === 'function') {
        onEvent(eventName, payloadData);
      }
    }
  }

  if (!didEmitDone && combinedText && typeof onDone === 'function') {
    onDone({ text: combinedText });
  }
};
