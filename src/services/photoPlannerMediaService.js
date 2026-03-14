import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, getDoc } from 'firebase/firestore';
import { firestore, storage } from '@/lib/firebase';
import { convertToEmulatorURL } from '@/lib/pageUtils';

const getMediaType = (file) => {
  if (!file?.type) return null;
  if (file.type.startsWith('video')) return 'video';
  if (file.type.startsWith('image')) return 'image';
  return null;
};

const getVideoDurationSec = (file) => new Promise((resolve) => {
  if (!file || !file.type?.startsWith('video') || typeof window === 'undefined') {
    resolve(undefined);
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';

  video.onloadedmetadata = () => {
    const duration = Number.isFinite(video.duration)
      ? Math.round(video.duration * 100) / 100
      : undefined;
    URL.revokeObjectURL(objectUrl);
    resolve(duration);
  };

  video.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    resolve(undefined);
  };

  video.src = objectUrl;
});

const getPlannerUploadErrorMessage = (error) => {
  if (error?.code === 'storage/unauthorized') {
    return 'You do not have permission to upload to this album.';
  }
  return error?.message || 'Upload failed';
};

const resolvePlannerUploadTarget = async ({ user, bookId, selectedAlbumId }) => {
  const targetAlbumId = selectedAlbumId || bookId;
  if (!user?.uid || !targetAlbumId) {
    throw new Error('A signed-in user and upload album are required.');
  }

  const [albumSnap, bookSnap] = await Promise.all([
    getDoc(doc(firestore, 'albums', targetAlbumId)),
    getDoc(doc(firestore, 'books', targetAlbumId)),
  ]);

  if (bookSnap.exists()) {
    const bookData = bookSnap.data() || {};
    const isOwner = bookData.ownerId === user.uid || bookData.members?.[user.uid] === 'Owner';
    const isCoAuthorWithMediaAccess = bookData.members?.[user.uid] === 'Co-author'
      && !!bookData.memberPermissions?.[user.uid]?.canManageMedia;

    if (!isOwner && !isCoAuthorWithMediaAccess) {
      throw new Error('You need owner access or co-author media permission to upload to this book album.');
    }
  } else if (albumSnap.exists()) {
    const albumData = albumSnap.data() || {};
    const albumOwnerId = albumData.accessPermission?.ownerId || albumData.ownerId || '';
    if (albumOwnerId !== user.uid) {
      throw new Error('Only the album owner can upload media to this asset.');
    }
  } else {
    throw new Error('The selected album no longer exists.');
  }

  return targetAlbumId;
};

const uploadPlannerMediaFile = async ({ user, bookId, selectedAlbumId, file, onProgress }) => {
  const mediaType = getMediaType(file);
  if (!mediaType) {
    throw new Error(`Unsupported media type for ${file?.name || 'file'}`);
  }

  const targetAlbumId = await resolvePlannerUploadTarget({ user, bookId, selectedAlbumId });
  const uniqueFileName = `${Date.now()}_${file.name}`;
  // Align planner uploads with book album media conventions.
  // Path format expected by mediaProcessor: {uid}/{bookId}/{chapterId}/{pageId}/media/{type}/{filename}
  // For album-level uploads, use _album_ placeholders for chapter/page.
  const storagePath = `${user.uid}/${targetAlbumId}/_album_/_album_/media/${mediaType}/${uniqueFileName}`;
  const storageRef = ref(storage, storagePath);

  const metadata = {
    customMetadata: {
      originalName: file.name,
      bookId: targetAlbumId,
      albumId: targetAlbumId,
      mediaType,
      source: 'photo_planner',
    },
  };

  const uploadTask = uploadBytesResumable(storageRef, file, metadata);

  return await new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = snapshot.totalBytes > 0
          ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          : 0;
        onProgress?.(progress);
      },
      (error) => reject(error),
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const durationSec = await getVideoDurationSec(file);

          resolve({
            url: convertToEmulatorURL(downloadURL),
            storagePath,
            name: file.name,
            type: mediaType,
            albumId: targetAlbumId,
            ...(typeof durationSec === 'number' ? { durationSec } : {}),
          });
        } catch (error) {
          reject(error);
        }
      }
    );
  });
};

export const uploadPlannerMediaFiles = async ({ user, bookId, selectedAlbumId, files = [], onFileProgress }) => {
  const uploaded = [];
  const errors = [];

  for (const file of files) {
    const mediaType = getMediaType(file);
    if (!mediaType) {
      errors.push({ fileName: file?.name || 'Unknown', message: 'Unsupported media type' });
      continue;
    }

    try {
      const item = await uploadPlannerMediaFile({
        user,
        bookId,
        selectedAlbumId,
        file,
        onProgress: (progress) => onFileProgress?.(file.name, progress),
      });
      uploaded.push(item);
    } catch (error) {
      errors.push({
        fileName: file.name,
        message: getPlannerUploadErrorMessage(error),
      });
    }
  }

  return { uploaded, errors };
};
