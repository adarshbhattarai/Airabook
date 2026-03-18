import { auth, storage } from '@/lib/firebase';

const decodeJwtPayload = (token) => {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export const ensureStorageUploadAuth = async ({ storagePath = '', uploadSource = '' } = {}) => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    const error = new Error('Your Firebase session is not ready. Refresh and sign in again.');
    error.code = 'storage/no-auth-session';
    console.error('[storageUpload] Missing authenticated user before upload', {
      uploadSource,
      storagePath,
      authUid: null,
      bucket: storage.app.options.storageBucket || null,
    });
    throw error;
  }

  await currentUser.getIdToken(true);
  return currentUser;
};

export const getStorageUploadDebugContext = async () => {
  const currentUser = auth.currentUser;
  const token = currentUser ? await currentUser.getIdToken() : null;
  const claims = decodeJwtPayload(token);

  return {
    authUid: currentUser?.uid || null,
    authEmail: currentUser?.email || null,
    tokenAud: claims?.aud || null,
    tokenIss: claims?.iss || null,
    tokenSub: claims?.sub || null,
    appCheckConfigured: typeof import.meta !== 'undefined' && !!import.meta.env?.VITE_RECAPTCHA_SITE_KEY,
    appCheckDebugToken: typeof self !== 'undefined' ? !!self.FIREBASE_APPCHECK_DEBUG_TOKEN : false,
    bucket: storage.app.options.storageBucket || null,
    projectId: storage.app.options.projectId || null,
  };
};

export const logStorageUploadFailure = ({
  error,
  storagePath = '',
  file = null,
  uploadSource = '',
  userUid = '',
  extra = {},
} = {}) => {
  console.error('[storageUpload] Upload failed', {
    uploadSource,
    code: error?.code || null,
    message: error?.message || String(error || ''),
    storagePath,
    fileName: file?.name || null,
    fileType: file?.type || null,
    fileSize: Number.isFinite(file?.size) ? file.size : null,
    authUid: auth.currentUser?.uid || null,
    userUid: userUid || null,
    bucket: storage.app.options.storageBucket || null,
    ...extra,
  });
};
