import { useCallback, useEffect, useMemo, useState } from 'react';
import { useVoiceAssistant } from '@/hooks/useVoiceAssistant';

export const TALK_STATUS_COPY = {
  idle: {
    label: 'Idle',
    helper: 'Press the mic to start talk mode.',
  },
  connecting: {
    label: 'Connecting...',
    helper: 'Opening voice channel…',
  },
  listening: {
    label: 'Listening',
    helper: 'I am listening. Tap again to stop.',
  },
  user_speaking: {
    label: 'Listening',
    helper: 'You are speaking…',
  },
  thinking: {
    label: 'Thinking',
    helper: 'Processing your voice…',
  },
  assistant_speaking: {
    label: 'Speaking',
    helper: 'Assistant is speaking. Tap mic to interrupt.',
  },
  error: {
    label: 'Voice error',
    helper: 'Voice channel error. Tap mic to retry.',
  },
  disconnected: {
    label: 'Disconnected',
    helper: 'Voice channel closed. Tap mic to reconnect.',
  },
};

const useTalkDemoState = ({
  bookId,
  chapterId,
  pageId,
} = {}) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const {
    status,
    canStart,
    hasBookContext,
    voiceUnavailableReason,
    wsConnected,
    lastError,
    startListening,
    stopListening,
    interrupt,
    disconnect,
  } = useVoiceAssistant({ bookId, chapterId, pageId });

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

  const toggleMic = useCallback(async () => {
    if (!canStart || status === 'connecting') return;

    if (status === 'assistant_speaking') {
      interrupt();
      return;
    }

    if (status === 'listening' || status === 'user_speaking' || status === 'thinking') {
      stopListening();
      return;
    }

    if (status === 'error' || status === 'disconnected') {
      disconnect();
    }

    try {
      await startListening();
    } catch (error) {
      console.error('[dashboard-talk] startListening failed:', error);
    }
  }, [canStart, disconnect, interrupt, startListening, status, stopListening]);

  const isActive = status !== 'idle' && status !== 'disconnected' && status !== 'error';
  const isSpeaking = status === 'assistant_speaking';
  const isListening = status === 'listening' || status === 'user_speaking';

  const statusCopy = useMemo(() => {
    if (!hasBookContext) {
      return {
        label: 'No book context',
        helper: 'Open a book or select context before using talk mode.',
      };
    }
    if (!canStart) {
      return {
        label: 'Voice unavailable',
        helper: voiceUnavailableReason || 'Voice backend is not connected.',
      };
    }
    if (status === 'error') {
      return {
        label: TALK_STATUS_COPY.error.label,
        helper: lastError?.message || TALK_STATUS_COPY.error.helper,
      };
    }
    return TALK_STATUS_COPY[status] || TALK_STATUS_COPY.idle;
  }, [canStart, hasBookContext, lastError?.message, status, voiceUnavailableReason]);

  return {
    status: canStart ? status : 'idle',
    statusCopy,
    toggleMic,
    isActive,
    isListening,
    isSpeaking,
    prefersReducedMotion,
    canStart,
    wsConnected,
    lastError,
  };
};

export default useTalkDemoState;
