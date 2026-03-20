import { doc, getDoc } from 'firebase/firestore';
import { auth, firestore, storage } from '@/lib/firebase';

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

const resolveBookOwnerId = (bookData = {}) => {
  if (typeof bookData?.ownerId === 'string' && bookData.ownerId) {
    return bookData.ownerId;
  }

  const ownerEntry = Object.entries(bookData?.members || {}).find(([, role]) => role === 'Owner');
  return ownerEntry?.[0] || '';
};

export const resolveStorageUploadAuthorization = async ({ targetId = '', actorUid = '' } = {}) => {
  if (!targetId) {
    throw new Error('A target id is required to resolve Storage upload authorization.');
  }

  const [bookSnap, albumSnap] = await Promise.all([
    getDoc(doc(firestore, 'books', targetId)),
    getDoc(doc(firestore, 'albums', targetId)),
  ]);

  const trace = {
    targetId,
    actorUid: actorUid || null,
    targetKind: 'missing',
    storageOwnerUid: null,
    pathOwnerReason: null,
    bookExists: bookSnap.exists(),
    albumExists: albumSnap.exists(),
    bookOwnerId: null,
    bookRole: null,
    canManageBookMedia: false,
    albumOwnerId: null,
    albumSharedWithActor: false,
    canManageAlbumMedia: false,
    overallAuthorized: false,
  };

  if (bookSnap.exists()) {
    const bookData = bookSnap.data() || {};
    const storageOwnerUid = resolveBookOwnerId(bookData);
    const bookRole = actorUid ? (bookData.members?.[actorUid] || null) : null;
    const isOwner = !!actorUid && (storageOwnerUid === actorUid || bookRole === 'Owner');
    const isCoAuthorWithMediaAccess = bookRole === 'Co-author'
      && !!bookData.memberPermissions?.[actorUid]?.canManageMedia;

    trace.targetKind = 'book';
    trace.storageOwnerUid = storageOwnerUid || null;
    trace.pathOwnerReason = 'book.ownerId';
    trace.bookOwnerId = storageOwnerUid || null;
    trace.bookRole = bookRole;
    trace.canManageBookMedia = isOwner || isCoAuthorWithMediaAccess;
    trace.overallAuthorized = trace.canManageBookMedia;
    return trace;
  }

  if (albumSnap.exists()) {
    const albumData = albumSnap.data() || {};
    const albumOwnerId = albumData.accessPermission?.ownerId || albumData.ownerId || '';
    const sharedWith = Array.isArray(albumData.accessPermission?.sharedWith)
      ? albumData.accessPermission.sharedWith
      : [];
    const albumSharedWithActor = !!actorUid && sharedWith.includes(actorUid);
    const canManageAlbumMedia = !!actorUid && (albumOwnerId === actorUid || albumSharedWithActor);

    trace.targetKind = albumData.bookId ? 'linked_album' : 'standalone_album';
    trace.storageOwnerUid = albumOwnerId || null;
    trace.pathOwnerReason = albumData.accessPermission?.ownerId ? 'album.accessPermission.ownerId' : 'album.ownerId';
    trace.albumOwnerId = albumOwnerId || null;
    trace.albumSharedWithActor = albumSharedWithActor;
    trace.canManageAlbumMedia = canManageAlbumMedia;
    trace.overallAuthorized = canManageAlbumMedia;
    return trace;
  }

  return trace;
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
