import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_CONNECTING_DELAY_MS = 820;
const DEFAULT_SPEAKING_DELAY_MS = 1300;
const DEFAULT_SPEAKING_DURATION_MS = 1400;

export const TALK_STATUS_COPY = {
  idle: {
    label: 'Idle',
    helper: 'Press the mic to start talk mode.',
  },
  connecting: {
    label: 'Connecting...',
    helper: 'Preparing voice channel (UI demo only).',
  },
  listening: {
    label: 'Listening',
    helper: 'I am listening. Tap again to stop.',
  },
  speaking_demo: {
    label: 'Speaking (demo)',
    helper: 'Voice animation preview in progress.',
  },
};

const useTalkDemoState = ({
  connectingDelayMs = DEFAULT_CONNECTING_DELAY_MS,
  speakingDelayMs = DEFAULT_SPEAKING_DELAY_MS,
  speakingDurationMs = DEFAULT_SPEAKING_DURATION_MS,
} = {}) => {
  const [status, setStatus] = useState('idle');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const connectingTimerRef = useRef(null);
  const speakingStartTimerRef = useRef(null);
  const speakingEndTimerRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    applyPreference();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', applyPreference);
      return () => mediaQuery.removeEventListener('change', applyPreference);
    }

    mediaQuery.addListener(applyPreference);
    return () => mediaQuery.removeListener(applyPreference);
  }, []);

  const clearTimers = useCallback(() => {
    if (connectingTimerRef.current) {
      clearTimeout(connectingTimerRef.current);
      connectingTimerRef.current = null;
    }
    if (speakingStartTimerRef.current) {
      clearTimeout(speakingStartTimerRef.current);
      speakingStartTimerRef.current = null;
    }
    if (speakingEndTimerRef.current) {
      clearTimeout(speakingEndTimerRef.current);
      speakingEndTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const queueSpeakingDemo = useCallback(() => {
    if (prefersReducedMotion) return;

    speakingStartTimerRef.current = setTimeout(() => {
      setStatus('speaking_demo');
      speakingEndTimerRef.current = setTimeout(() => {
        setStatus('listening');
      }, speakingDurationMs);
    }, speakingDelayMs);
  }, [prefersReducedMotion, speakingDelayMs, speakingDurationMs]);

  const startDemoFlow = useCallback(() => {
    clearTimers();
    setStatus('connecting');
    connectingTimerRef.current = setTimeout(() => {
      setStatus('listening');
      queueSpeakingDemo();
    }, connectingDelayMs);
  }, [clearTimers, queueSpeakingDemo, connectingDelayMs]);

  const toggleMic = useCallback(() => {
    if (status === 'connecting') return;
    if (status === 'idle') {
      startDemoFlow();
      return;
    }

    clearTimers();
    setStatus('idle');
  }, [status, startDemoFlow, clearTimers]);

  const isActive = status !== 'idle';
  const isSpeaking = status === 'speaking_demo';
  const isListening = status === 'listening' || isSpeaking;

  const statusCopy = useMemo(
    () => TALK_STATUS_COPY[status] || TALK_STATUS_COPY.idle,
    [status],
  );

  return {
    status,
    statusCopy,
    toggleMic,
    isActive,
    isListening,
    isSpeaking,
    prefersReducedMotion,
  };
};

export default useTalkDemoState;
