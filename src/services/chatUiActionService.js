import { auth } from '@/lib/firebase';
import { SERVICE_ENDPOINTS, buildServiceUrl } from '@/config/serviceEndpoints';
import { materializeTemplate, extractTextFromPayload } from '@/lib/chatUiEvents';

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

const parseResponseBody = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  return { text };
};

const parseErrorResponse = async (response) => {
  const payload = await parseResponseBody(response);
  const message = payload?.error || payload?.message || extractTextFromPayload(payload) || `Request failed with ${response.status}`;
  const error = new Error(message);
  error.status = response.status;
  error.response = payload;
  throw error;
};

const resolveActionUrl = (endpointPath) => {
  if (!endpointPath || typeof endpointPath !== 'string') return '';
  if (/^https?:\/\//i.test(endpointPath)) return endpointPath;
  return buildServiceUrl(SERVICE_ENDPOINTS.spring.baseUrl, endpointPath);
};

const parseSseResponse = async (response, onEvent) => {
  if (!response.body) return { ok: true };

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalPayload = null;
  let latestPayload = null;

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

      latestPayload = parsed.data || {};
      onEvent?.(parsed.event || 'message', latestPayload);
      if (parsed.event === 'done' || parsed.event === 'final') {
        finalPayload = latestPayload;
      }
    }
  }

  return finalPayload || latestPayload || { ok: true };
};

const buildDefaultHitlBody = (context = {}) => ({
  action: 'human_in_loop_response',
  interactionId: context.interactionId || '',
  runId: context.runId || '',
  conversationId: context.conversationId || '',
  source: context.source || 'chat_assistant',
  selectedIndex: Number.isFinite(Number(context.selectedIndex)) ? Number(context.selectedIndex) : 0,
  selectedOption: context.selectedOption || {},
  context: context.hitlContext || {},
});

export const executeChatUiAction = async ({
  action = {},
  card = null,
  context = {},
  onEvent,
}) => {
  const normalizedAction = action && typeof action === 'object' ? action : {};
  const isLinkAction = normalizedAction.kind === 'link' || Boolean(normalizedAction.link);
  if (isLinkAction) {
    const target = normalizedAction.link || normalizedAction.endpoint;
    if (!target) throw new Error('Missing link target for action.');
    window.open(target, '_blank', 'noopener,noreferrer');
    return { ok: true, message: 'Opened link.' };
  }

  const method = String(normalizedAction.method || 'POST').toUpperCase();
  const endpoint = normalizedAction.endpoint
    || normalizedAction.path
    || (card?.cardType === 'HITL_REQUEST'
      ? (context.responsePath || SERVICE_ENDPOINTS.spring.paths.chatPlannerHitlDecision)
      : '');
  const url = resolveActionUrl(endpoint);
  if (!url) {
    throw new Error('No endpoint configured for this action.');
  }

  const templateVariables = {
    ...context,
    card: card?.payload || {},
    action: {
      id: normalizedAction.id || '',
      label: normalizedAction.label || '',
      kind: normalizedAction.kind || '',
    },
  };
  const bodyFromTemplate = normalizedAction.bodyTemplate
    ? materializeTemplate(normalizedAction.bodyTemplate, templateVariables)
    : null;
  const body = bodyFromTemplate
    || normalizedAction.body
    || (card?.cardType === 'HITL_REQUEST' ? buildDefaultHitlBody(context) : null);

  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body || {}),
  });

  if (!response.ok) {
    await parseErrorResponse(response);
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('text/event-stream')
    ? await parseSseResponse(response, onEvent)
    : await parseResponseBody(response);

  return {
    ok: true,
    payload,
    message: payload?.message || payload?.summary || extractTextFromPayload(payload) || 'Action acknowledged.',
  };
};
