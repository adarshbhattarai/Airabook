import { apiService } from '@/services/ApiService';

const asArray = (value) => (Array.isArray(value) ? value : []);

const normalizeVoice = (voice = {}) => ({
  id: String(voice.id || '').trim(),
  name: String(voice.name || '').trim(),
  gender: String(voice.gender || '').trim(),
});

const normalizeProvider = (provider = {}) => ({
  provider: String(provider.provider || '').trim().toLowerCase(),
  defaultModelId: String(provider.defaultModelId || '').trim(),
  defaultVoiceId: String(provider.defaultVoiceId || '').trim(),
  models: asArray(provider.models),
  voices: asArray(provider.voices)
    .map(normalizeVoice)
    .filter((voice) => voice.id),
});

export const fetchVoiceOptions = async () => {
  const response = await apiService.get('api/v1/voice/options');
  const payload = response?.data || response || {};

  return {
    defaultProvider: String(payload.defaultProvider || '').trim().toLowerCase(),
    providers: asArray(payload.providers)
      .map(normalizeProvider)
      .filter((provider) => provider.provider),
  };
};
