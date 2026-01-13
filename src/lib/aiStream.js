import { auth } from '@/lib/firebase';

const REGION = 'us-central1';

const getStreamUrl = () => {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error('Missing Firebase project ID.');
  }

  const currentMode = import.meta.env.MODE;
  const isProduction = currentMode === 'production';
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  let useEmulator = false;
  let useFunctionsEmulatorOnly = false;

  if (!isProduction && hostname) {
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('localhost');
    const emulatorFlag = import.meta.env.VITE_USE_EMULATOR;
    useEmulator = isLocalhost && (emulatorFlag === 'true' || emulatorFlag === true);

    const functionsEmulatorFlag = import.meta.env.VITE_USE_FUNCTIONS_EMULATOR;
    useFunctionsEmulatorOnly =
      !useEmulator && isLocalhost && (functionsEmulatorFlag === 'true' || functionsEmulatorFlag === true);
  }

  if (useEmulator || useFunctionsEmulatorOnly) {
    return `http://127.0.0.1:5001/${projectId}/${REGION}/airabookaiStream`;
  }

  return `https://${REGION}-${projectId}.cloudfunctions.net/airabookaiStream`;
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

export const streamAirabookAI = async ({
  messages,
  isSurprise = false,
  action,
  bookId,
  chapterId,
  mode,
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
  const response = await fetch(getStreamUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ messages, isSurprise, action, bookId, chapterId, mode }),
    signal,
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(errorText || 'Streaming request failed.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

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

      if (parsed.event === 'chunk') {
        if (parsed.data?.text && typeof onChunk === 'function') {
          onChunk(parsed.data.text);
        }
      } else if (parsed.event === 'outline') {
        if (typeof onOutline === 'function') {
          onOutline(parsed.data || {});
        }
        if (typeof onEvent === 'function') {
          onEvent(parsed.event, parsed.data || {});
        }
      } else if (parsed.event === 'page_start') {
        if (typeof onPageStart === 'function') {
          onPageStart(parsed.data || {});
        }
        if (typeof onEvent === 'function') {
          onEvent(parsed.event, parsed.data || {});
        }
      } else if (parsed.event === 'page_chunk') {
        if (typeof onPageChunk === 'function') {
          onPageChunk(parsed.data || {});
        }
        if (typeof onEvent === 'function') {
          onEvent(parsed.event, parsed.data || {});
        }
      } else if (parsed.event === 'page_done') {
        if (typeof onPageDone === 'function') {
          onPageDone(parsed.data || {});
        }
        if (typeof onEvent === 'function') {
          onEvent(parsed.event, parsed.data || {});
        }
      } else if (parsed.event === 'page_error') {
        if (typeof onPageError === 'function') {
          onPageError(parsed.data || {});
        }
        if (typeof onEvent === 'function') {
          onEvent(parsed.event, parsed.data || {});
        }
      } else if (parsed.event === 'done') {
        if (typeof onDone === 'function') {
          onDone(parsed.data || {});
        }
        if (typeof onEvent === 'function') {
          onEvent(parsed.event, parsed.data || {});
        }
      } else if (parsed.event === 'error') {
        if (typeof onError === 'function') {
          onError(parsed.data || {});
        }
        if (typeof onEvent === 'function') {
          onEvent(parsed.event, parsed.data || {});
        }
      } else if (typeof onEvent === 'function') {
        onEvent(parsed.event, parsed.data || {});
      }
    }
  }
};
