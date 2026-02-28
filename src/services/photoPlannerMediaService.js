import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
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

const uploadPlannerMediaFile = async ({ user, bookId, file, onProgress }) => {
  const mediaType = getMediaType(file);
  if (!mediaType) {
    throw new Error(`Unsupported media type for ${file?.name || 'file'}`);
  }

  const uniqueFileName = `${Date.now()}_${file.name}`;
  // Align planner uploads with book album media conventions.
  // Path format expected by mediaProcessor: {uid}/{bookId}/{chapterId}/{pageId}/media/{type}/{filename}
  // For album-level uploads, use _album_ placeholders for chapter/page.
  const storagePath = `${user.uid}/${bookId}/_album_/_album_/media/${mediaType}/${uniqueFileName}`;
  const storageRef = ref(storage, storagePath);

  const metadata = {
    customMetadata: {
      originalName: file.name,
      bookId,
      albumId: bookId,
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
            albumId: bookId,
            ...(typeof durationSec === 'number' ? { durationSec } : {}),
          });
        } catch (error) {
          reject(error);
        }
      }
    );
  });
};

export const uploadPlannerMediaFiles = async ({ user, bookId, files = [], onFileProgress }) => {
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
        file,
        onProgress: (progress) => onFileProgress?.(file.name, progress),
      });
      uploaded.push(item);
    } catch (error) {
      errors.push({
        fileName: file.name,
        message: error?.message || 'Upload failed',
      });
    }
  }

  return { uploaded, errors };
};
