import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VoiceSocketClient, getFirebaseIdToken, getVoiceWsUrl } from '@/lib/voice/voiceSocket';
import { startMicCapture } from '@/lib/voice/micCapture';
import { PcmPlayer } from '@/lib/voice/pcmPlayer';

/**
 * Minimal state machine for voice sessions:
 * disconnected → connecting → ready → listening → speaking → ready
 *
 * Includes:
 * - WS lifecycle
 * - auth/start/end/cancel control messages
 * - mic capture (AudioWorklet → PCM Int16LE)
 * - server audio playback (PCM Int16LE)
 * - incoming JSON events (transcripts, assistant text, errors)
 */
export const useVoiceAssistant = ({
  bookId,
  chapterId,
  pageId,
  voice = { provider: 'google', voiceId: 'default' },
  inputAudio = { format: 'pcm_s16le', sampleRate: 16000, channels: 1 },
  outputAudio = { format: 'pcm_s16le', sampleRate: 24000, channels: 1 },
  url = getVoiceWsUrl(),
} = {}) => {
  const clientRef = useRef(null);
  const abortRef = useRef(null);
  const lastAudioAtRef = useRef(0);
  const speakingTimerRef = useRef(null);
  const micStopRef = useRef(null);
  const playerRef = useRef(null);
  const sessionActiveRef = useRef(false);
  const vadSpeakingRef = useRef(false);
  const vadHangoverTimerRef = useRef(null);

  const lastRmsAtRef = useRef(0);
  const statusRef = useRef('idle');
  const lastLevelUpdateRef = useRef(0);

  const [status, setStatus] = useState('idle'); // idle|connecting|listening|user_speaking|thinking|assistant_speaking|error|disconnected
  const [wsConnected, setWsConnected] = useState(false);
  const [level, setLevel] = useState(0); // 0..1
  const [vadSpeaking, setVadSpeaking] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [assistantText, setAssistantText] = useState('');
  const [lastError, setLastError] = useState(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const resetMessages = useCallback(() => {
    setPartialTranscript('');
    setFinalTranscript('');
    setAssistantText('');
    setLastError(null);
  }, []);

  const handleJson = useCallback((msg) => {
    if (!msg?.type) return;

    if (msg.type === 'ready') {
      setWsConnected(true);
      setStatus((s) => (s === 'connecting' ? 'idle' : s));
      return;
    }
    if (msg.type === 'partialTranscript') {
      setPartialTranscript(msg.text || '');
      return;
    }
    if (msg.type === 'finalTranscript') {
      setFinalTranscript(msg.text || '');
      setPartialTranscript('');
      return;
    }
    if (msg.type === 'assistantText') {
      setAssistantText(msg.text || '');
      return;
    }
    if (msg.type === 'error') {
      setLastError({ code: msg.code, message: msg.message || 'Voice error.' });
      setStatus('error');
    }
  }, []);

  const startMicCaptureAndStream = useCallback(async () => {
    micStopRef.current?.();
    micStopRef.current = null;

    const vadStartThreshold = 0.02;
    const vadEndThreshold = 0.015;
    const hangoverMs = 600;

    const mic = await startMicCapture({
      targetSampleRate: inputAudio.sampleRate,
      onPcm: ({ pcmBuffer, rms }) => {
        const now = Date.now();
        lastRmsAtRef.current = now;

        // Throttle UI updates for level/meter.
        if (now - lastLevelUpdateRef.current > 50) {
          lastLevelUpdateRef.current = now;
          // Smooth level a bit (simple EMA)
          setLevel((prev) => {
            const next = Math.min(1, Math.max(0, rms || 0));
            return prev * 0.75 + next * 0.25;
          });
        }

        if (!sessionActiveRef.current) return;

        // VAD
        if (!vadSpeakingRef.current) {
          if ((rms || 0) >= vadStartThreshold) {
            vadSpeakingRef.current = true;
            setVadSpeaking(true);
            setStatus('user_speaking');
            clientRef.current?.sendJson({ type: 'speechStart' });
          }
        } else {
          if ((rms || 0) >= vadEndThreshold) {
            if (vadHangoverTimerRef.current) clearTimeout(vadHangoverTimerRef.current);
            vadHangoverTimerRef.current = null;
          } else if (!vadHangoverTimerRef.current) {
            vadHangoverTimerRef.current = setTimeout(() => {
              vadHangoverTimerRef.current = null;
              if (!vadSpeakingRef.current) return;
              vadSpeakingRef.current = false;
              setVadSpeaking(false);
              clientRef.current?.sendJson({ type: 'speechEnd' });
              // Pause mic while thinking / assistant speaks.
              micStopRef.current?.();
              micStopRef.current = null;
              setStatus('thinking');
            }, hangoverMs);
          }
        }

        // Stream audio only while actively listening / user speaking.
        const s = statusRef.current;
        if (s === 'listening' || s === 'user_speaking') {
          clientRef.current?.sendBinary(pcmBuffer);
        }
      },
    });

    micStopRef.current = () => {
      mic.stop();
    };
  }, [inputAudio.sampleRate]);

  const handleBinary = useCallback((arrayBuffer) => {
    lastAudioAtRef.current = Date.now();
    // Avoid capturing mic while assistant is speaking (echo).
    micStopRef.current?.();
    micStopRef.current = null;
    setStatus('assistant_speaking');

    try {
      if (!playerRef.current) {
        playerRef.current = new PcmPlayer({ sampleRate: outputAudio.sampleRate });
      }
      playerRef.current.playChunk(arrayBuffer);
    } catch (e) {
      setLastError({ code: 'audio_playback_error', message: e?.message || 'Failed to play voice audio.' });
      setStatus('error');
      return;
    }

    if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
    speakingTimerRef.current = setTimeout(() => {
      const msSince = Date.now() - lastAudioAtRef.current;
      if (msSince > 550) {
        if (sessionActiveRef.current) {
          // Return to listening for the next user turn.
          startMicCaptureAndStream();
          setStatus('listening');
        } else {
          setStatus('idle');
        }
      }
    }, 650);
  }, [outputAudio.sampleRate, startMicCaptureAndStream]);

  const connect = useCallback(async () => {
    if (status === 'connecting' || wsConnected) return;
    if (!bookId) throw new Error('Missing bookId for voice session.');

    resetMessages();
    setStatus('connecting');
    abortRef.current?.abort?.();
    abortRef.current = new AbortController();

    const token = await getFirebaseIdToken();
    const client = new VoiceSocketClient({
      url,
      onJson: handleJson,
      onBinary: handleBinary,
      onClose: (evt) => {
        // If the server drops immediately, make it visible to the UI.
        if (evt?.code && evt.code !== 1000) {
          setLastError({
            code: `ws_close_${evt.code}`,
            message: `Voice connection closed (code ${evt.code}${evt.reason ? `: ${evt.reason}` : ''}).`,
          });
        }
        setWsConnected(false);
        setStatus('idle');
      },
      onError: () => {
        // close handler usually follows; keep a friendly state here
        setLastError({ code: 'ws_error', message: 'Voice connection error.' });
      },
    });
    clientRef.current = client;

    await client.connect({ signal: abortRef.current.signal });
    client.sendJson({
      type: 'auth',
      token,
      bookId,
      chapterId: chapterId || null,
      pageId: pageId || null,
    });
    // Backend should reply with {type:'ready'}
  }, [bookId, chapterId, pageId, handleBinary, handleJson, resetMessages, status, url, wsConnected]);

  const disconnect = useCallback(() => {
    abortRef.current?.abort?.();
    abortRef.current = null;
    micStopRef.current?.();
    micStopRef.current = null;
    playerRef.current?.stop?.();
    clientRef.current?.close(1000, 'user_disconnect');
    clientRef.current = null;
    sessionActiveRef.current = false;
    setWsConnected(false);
    setStatus('idle');
  }, []);

  const startListening = useCallback(async () => {
    if (!clientRef.current?.isOpen) {
      await connect();
    }
    if (playerRef.current) {
      await playerRef.current.resume();
    }

    const ok = clientRef.current?.sendJson({
      type: 'start',
      inputAudio,
      outputAudio,
      voice,
      mode: 'assistant',
    });
    if (!ok) {
      throw new Error('Voice socket is not open.');
    }

    sessionActiveRef.current = true;
    vadSpeakingRef.current = false;
    setVadSpeaking(false);
    await startMicCaptureAndStream();
    setStatus('listening');
  }, [connect, inputAudio, outputAudio, voice, startMicCaptureAndStream]);

  const stopListening = useCallback(() => {
    sessionActiveRef.current = false;
    micStopRef.current?.();
    micStopRef.current = null;
    if (vadSpeakingRef.current) {
      vadSpeakingRef.current = false;
      setVadSpeaking(false);
      clientRef.current?.sendJson({ type: 'speechEnd' });
    }
    clientRef.current?.sendJson({ type: 'end' });
    setStatus('idle');
  }, []);

  const interrupt = useCallback(() => {
    playerRef.current?.stop?.();
    clientRef.current?.sendJson({ type: 'cancel' });
    if (sessionActiveRef.current) {
      startMicCaptureAndStream().then(() => setStatus('listening'));
    } else {
      setStatus('idle');
    }
  }, [startMicCaptureAndStream]);

  useEffect(() => {
    return () => {
      if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
      abortRef.current?.abort?.();
      micStopRef.current?.();
      micStopRef.current = null;
      if (vadHangoverTimerRef.current) clearTimeout(vadHangoverTimerRef.current);
      playerRef.current?.close?.();
      playerRef.current = null;
      clientRef.current?.close(1000, 'unmount');
    };
  }, []);

  const canStart = useMemo(() => Boolean(bookId), [bookId]);

  return {
    status,
    canStart,
    wsConnected,
    level,
    vadSpeaking,
    partialTranscript,
    finalTranscript,
    assistantText,
    lastError,
    connect,
    disconnect,
    startListening,
    stopListening,
    interrupt,
    // Exposed for the next todo (audio capture/playback):
    _clientRef: clientRef,
  };
};

