const LOCAL_DEFAULT_BACKEND_API_URL = 'http://localhost:8000';
const VOICE_WS_DEFAULT_PATH = '/ws/voice';

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeHttpUrl = (value) => {
  const raw = trimString(value);
  if (!raw) return '';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};

const isLocalHostname = (hostname) => {
  const normalized = trimString(hostname).toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
};

const getWindowLocation = () => (typeof window !== 'undefined' ? window.location : null);

const getBrowserOrigin = () => {
  const location = getWindowLocation();
  return location?.origin ? normalizeHttpUrl(location.origin) : '';
};

const getLocalDefaultBackendUrl = () => normalizeHttpUrl(
  import.meta.env.VITE_LOCAL_BACKEND_API_URL || LOCAL_DEFAULT_BACKEND_API_URL
);

export const getBackendApiUrl = () => {
  const explicit = normalizeHttpUrl(import.meta.env.VITE_BACKEND_API_URL);
  if (explicit) return explicit;

  const location = getWindowLocation();
  if (isLocalHostname(location?.hostname)) {
    return getLocalDefaultBackendUrl();
  }

  return getBrowserOrigin();
};

export const getSpringApiUrl = () => {
  const explicit = normalizeHttpUrl(import.meta.env.VITE_SPRING_API_URL);
  if (explicit) return explicit;
  return getBackendApiUrl();
};

const toWsUrl = (value) => {
  const raw = trimString(value);
  if (!raw) return '';

  if (/^wss?:\/\//i.test(raw)) {
    return raw;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = VOICE_WS_DEFAULT_PATH;
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch {
      return '';
    }
  }

  return '';
};

export const getVoiceWsUrl = () => {
  const explicitWs = toWsUrl(import.meta.env.VITE_VOICE_WS_URL);
  if (explicitWs) return explicitWs;

  const backendWs = toWsUrl(import.meta.env.VITE_VOICE_BACKEND_URL)
    || toWsUrl(import.meta.env.VITE_SPRING_API_URL)
    || toWsUrl(import.meta.env.VITE_BACKEND_API_URL);
  if (backendWs) return backendWs;

  const location = getWindowLocation();
  if (isLocalHostname(location?.hostname)) {
    return toWsUrl(getLocalDefaultBackendUrl());
  }

  return toWsUrl(getBrowserOrigin());
};

export const getVoiceWsUnavailableReason = () => (
  getVoiceWsUrl()
    ? null
    : 'Voice backend is not configured. Set VITE_VOICE_WS_URL or backend API URL.'
);
