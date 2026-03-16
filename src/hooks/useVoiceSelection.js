import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'airabook:voice-selection:elevenlabs';
const HARDCODED_VOICES = [
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', gender: 'UNSPECIFIED' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Antony', gender: 'UNSPECIFIED' },
  { id: 'BaW4Cx7nYOh1XNVQBrK2', name: 'Sejoin', gender: 'UNSPECIFIED' },
];
const HARDCODED_DEFAULT_MODEL_ID = 'eleven_flash_v2_5';
const HARDCODED_DEFAULT_VOICE_ID = HARDCODED_VOICES[0].id;

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const normalizeString = (value) => (hasText(value) ? value.trim() : '');
const canUseLocalStorage = () => typeof window !== 'undefined' && !!window.localStorage;
const normalizeVoices = (voices) => (Array.isArray(voices) ? voices : HARDCODED_VOICES);

const readStoredVoiceId = () => {
  if (!canUseLocalStorage()) return '';
  try {
    return normalizeString(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return '';
  }
};

const writeStoredVoiceId = (voiceId) => {
  if (!canUseLocalStorage()) return;
  try {
    if (hasText(voiceId)) {
      window.localStorage.setItem(STORAGE_KEY, voiceId.trim());
      return;
    }
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
};

const resolveVoiceId = (voices, requestedVoiceId, fallbackVoiceId = '') => {
  const list = normalizeVoices(voices);
  const requested = normalizeString(requestedVoiceId);
  const fallback = normalizeString(fallbackVoiceId);

  if (requested) {
    const matchedRequestedVoice = list.find((voice) => voice.id.toLowerCase() === requested.toLowerCase());
    if (matchedRequestedVoice) {
      return matchedRequestedVoice.id;
    }
  }

  if (fallback) {
    const matchedFallbackVoice = list.find((voice) => voice.id.toLowerCase() === fallback.toLowerCase());
    if (matchedFallbackVoice) {
      return matchedFallbackVoice.id;
    }
  }

  return list[0]?.id || '';
};

export const useVoiceSelection = () => {
  const [selectedVoiceId, setSelectedVoiceId] = useState(() => readStoredVoiceId());
  const voices = HARDCODED_VOICES;
  const defaultVoiceId = HARDCODED_DEFAULT_VOICE_ID;
  const resolvedVoiceId = useMemo(
    () => resolveVoiceId(voices, selectedVoiceId, defaultVoiceId),
    [defaultVoiceId, selectedVoiceId, voices]
  );

  useEffect(() => {
    setSelectedVoiceId((current) => resolveVoiceId(voices, current || readStoredVoiceId(), defaultVoiceId));
  }, []);

  useEffect(() => {
    writeStoredVoiceId(resolvedVoiceId);
  }, [resolvedVoiceId]);

  const updateSelectedVoiceId = (nextVoiceId) => {
    setSelectedVoiceId(resolveVoiceId(voices, nextVoiceId, defaultVoiceId));
  };

  const voiceConfig = useMemo(() => ({
    provider: 'elevenlabs',
    voiceId: resolvedVoiceId,
    modelId: HARDCODED_DEFAULT_MODEL_ID,
  }), [resolvedVoiceId]);

  return {
    voices,
    selectedVoiceId: resolvedVoiceId,
    setSelectedVoiceId: updateSelectedVoiceId,
    voiceConfig,
    isLoading: false,
    error: null,
    hasVoiceOptions: voices.length > 0,
  };
};
