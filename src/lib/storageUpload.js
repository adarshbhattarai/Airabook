import { auth, storage } from '@/lib/firebase';

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
