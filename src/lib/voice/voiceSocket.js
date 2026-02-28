import { auth } from '@/lib/firebase';

/**
 * Voice WebSocket contract (FE ↔ Spring Boot)
 *
 * Transport
 * - WebSocket
 * - Text frames: JSON control + events
 * - Binary frames: raw PCM audio chunks (Int16LE)
 *
 * Client → Server (JSON)
 * - auth:  { type:'auth', token, bookId, chapterId, pageId }
 * - start: {
 *     type:'start',
 *     inputAudio:{ format:'pcm_s16le', sampleRate:16000, channels:1 },
 *     outputAudio:{ format:'pcm_s16le', sampleRate:24000, channels:1 },
 *     voice:{ provider:'google'|'elevenlabs', voiceId },
 *     mode:'assistant'
 *   }
 * - speechStart: { type:'speechStart' } (optional but recommended; client-side VAD)
 * - speechEnd:   { type:'speechEnd' }   (optional but recommended; client-side VAD)
 * - ping:        { type:'ping', t }     (optional keepalive)
 * - end:    { type:'end' }
 * - cancel: { type:'cancel' }
 *
 * Client → Server (binary)
 * - PCM frames (Int16LE) matching inputAudio.
 *
 * Server → Client (JSON)
 * - ready:            { type:'ready', sessionId }
 * - partialTranscript:{ type:'partialTranscript', text }
 * - finalTranscript:  { type:'finalTranscript', text }
 * - assistantText:    { type:'assistantText', text, messageId }
 * - error:            { type:'error', code, message }
 *
 * Server → Client (binary)
 * - PCM frames (Int16LE) matching outputAudio (for immediate playback).
 */

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
};

export const getVoiceWsUrl = () => {
  const explicit = import.meta.env.VITE_VOICE_WS_URL;
  if (explicit) return explicit;

  // Sensible local fallback if env var is missing.
  // This keeps dev ergonomics decent while still encouraging explicit config.
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('localhost')) {
    return 'ws://localhost:8000/ws/voice';
  }

  throw new Error('Missing VITE_VOICE_WS_URL (e.g. wss://your-spring-host/ws/voice).');
};

export class VoiceSocketClient {
  constructor({
    url = getVoiceWsUrl(),
    connectTimeoutMs = 6000,
    onJson,
    onBinary,
    onOpen,
    onClose,
    onError,
  } = {}) {
    this.url = url;
    this.connectTimeoutMs = connectTimeoutMs;
    this.ws = null;
    this.onJson = onJson;
    this.onBinary = onBinary;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onError = onError;
  }

  get isOpen() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  async connect({ signal } = {}) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    await new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      let didOpen = false;
      let settled = false;
      const settleOnce = (fn) => (arg) => {
        if (settled) return;
        settled = true;
        fn(arg);
      };

      const ws = new WebSocket(this.url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      const resolveOnce = settleOnce(resolve);
      const rejectOnce = settleOnce(reject);

      const cleanupAbort = () => {
        if (!signal) return;
        signal.removeEventListener('abort', onAbort);
      };

      const cleanupTimeout = () => {
        if (!connectTimeout) return;
        clearTimeout(connectTimeout);
      };

      const onAbort = () => {
        try {
          ws.close(1000, 'aborted');
        } catch (_) {
          // ignore
        }
        cleanupTimeout();
        cleanupAbort();
        rejectOnce(new DOMException('Aborted', 'AbortError'));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      const connectTimeout = setTimeout(() => {
        try {
          ws.close(1000, 'connect_timeout');
        } catch (_) {
          // ignore
        }
        cleanupAbort();
        rejectOnce(new Error(`Voice WebSocket connect timed out after ${this.connectTimeoutMs}ms.`));
      }, this.connectTimeoutMs);

      ws.onopen = () => {
        didOpen = true;
        cleanupTimeout();
        cleanupAbort();
        this.onOpen?.();
        resolveOnce();
      };

      ws.onerror = (evt) => {
        // onerror in browsers doesn’t expose much, so also rely on close/error JSON.
        this.onError?.(evt);
        if (!didOpen) {
          cleanupTimeout();
          cleanupAbort();
          rejectOnce(new Error('Voice WebSocket failed to connect.'));
        }
      };

      ws.onclose = (evt) => {
        cleanupTimeout();
        cleanupAbort();
        this.onClose?.(evt);
        if (!didOpen) {
          rejectOnce(new Error(`Voice WebSocket closed before open (code ${evt.code}${evt.reason ? `: ${evt.reason}` : ''}).`));
        }
      };

      ws.onmessage = (evt) => {
        if (typeof evt.data === 'string') {
          const msg = parseJson(evt.data);
          if (msg) this.onJson?.(msg);
          return;
        }
        if (evt.data instanceof ArrayBuffer) {
          this.onBinary?.(evt.data);
          return;
        }
        // Blob fallback (should be rare with binaryType='arraybuffer')
        if (typeof Blob !== 'undefined' && evt.data instanceof Blob) {
          evt.data.arrayBuffer().then((buf) => this.onBinary?.(buf));
        }
      };
    });
  }

  sendJson(payload) {
    if (!this.isOpen) return false;
    this.ws.send(JSON.stringify(payload));
    return true;
  }

  sendBinary(buffer) {
    if (!this.isOpen) return false;
    this.ws.send(buffer);
    return true;
  }

  close(code = 1000, reason = 'client_close') {
    try {
      this.ws?.close(code, reason);
    } catch (_) {
      // ignore
    } finally {
      this.ws = null;
    }
  }
}

export const getFirebaseIdToken = async () => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated.');
  }
  return await user.getIdToken();
};

