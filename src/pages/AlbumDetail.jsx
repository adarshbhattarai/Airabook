import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Image as ImageIcon, Video, Loader2, Trash2, UploadCloud, PlusCircle, Pencil, X } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { firestore, storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { httpsCallable, getFunctions } from 'firebase/functions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

/**
 * Convert storage URL to emulator format if running in emulator mode
 */
const convertToEmulatorURL = (url) => {
  if (!url) return url;

  const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true';

  if (!useEmulator) {
    return url; // Return as-is if not in emulator mode
  }

  // Check if URL is already in emulator format
  if (url.includes('127.0.0.1:9199') || url.includes('localhost:9199')) {
    return url;
  }

  // Check if URL is a production storage URL
  if (url.includes('storage.googleapis.com')) {
    try {
      // Parse the URL
      // Format: https://storage.googleapis.com/{bucket}/{storagePath}
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);

      if (pathParts.length >= 1) {
        const bucket = pathParts[0];
        const storagePath = pathParts.slice(1).join('/');

        // Convert bucket name from .appspot.com to .firebasestorage.app if needed
        let emulatorBucket = bucket;
        if (bucket.endsWith('.appspot.com')) {
          emulatorBucket = bucket.replace('.appspot.com', '.firebasestorage.app');
        }

        // URL encode the storage path (each segment needs to be encoded separately for proper emulator format)
        // The emulator expects: /o/{encodedPath} where encodedPath has %2F for slashes
        const encodedPath = encodeURIComponent(storagePath);

        // Generate emulator URL format: http://127.0.0.1:9199/v0/b/{bucket}/o/{encodedPath}?alt=media&token={token}
        const token = urlObj.searchParams.get('token') || 'emulator-token';
        const emulatorURL = `http://127.0.0.1:9199/v0/b/${emulatorBucket}/o/${encodedPath}?alt=media&token=${token}`;

        console.log('Converted URL:', { original: url, emulator: emulatorURL });
        return emulatorURL;
      }
    } catch (error) {
      console.error('Error converting URL to emulator format:', error, url);
      return url; // Return original if conversion fails
    }
  }

  // If URL doesn't match known patterns, return as-is
  return url;
};

const AlbumDetail = () => {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  console.log('AlbumDetail component rendered');
  console.log('bookId from params:', bookId);
  console.log('user:', user);

  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewType, setPreviewType] = useState('image'); // 'image' or 'video'
  const [allMedia, setAllMedia] = useState([]); // Combined images and videos for preview
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingAlbumDelete, setConfirmingAlbumDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [editingCover, setEditingCover] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [updating, setUpdating] = useState(false);
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const functions = getFunctions();

  useEffect(() => {
    const fetchAlbum = async () => {
      if (!bookId) {
        console.error('No bookId provided');
        toast({
          title: 'Error',
          description: 'Album ID is missing.',
          variant: 'destructive',
        });
        navigate('/media');
        return;
      }

      if (!user) {
        console.error('User not authenticated');
        toast({
          title: 'Error',
          description: 'You must be logged in to view albums.',
          variant: 'destructive',
        });
        navigate('/media');
        return;
      }

      console.log('Fetching album for bookId:', bookId);
      console.log('User ID:', user.uid);

      try {
        setLoading(true);
        // Query single album document
        const albumRef = doc(firestore, 'albums', bookId);
        console.log('Album reference:', albumRef.path);

        const albumSnap = await getDoc(albumRef);
        console.log('Album snapshot exists:', albumSnap.exists());
        console.log('Album snapshot data:', albumSnap.data());

        if (!albumSnap.exists()) {
          console.error('Album document does not exist for bookId:', bookId);
          toast({
            title: 'Error',
            description: `Album not found for ID: ${bookId}. The album may not exist yet.`,
            variant: 'destructive',
          });
          // Don't navigate away immediately - let user see the error
          return;
        }

        const albumData = { id: albumSnap.id, ...albumSnap.data() };
        setAlbum(albumData);
        setEditingName(albumData.name || '');
        setCoverPreview(convertToEmulatorURL(albumData.coverImage));

        console.log('Album data:', albumData);
        console.log('Images array:', albumData.images);
        console.log('Videos array:', albumData.videos);

        // Combine images and videos for preview navigation
        // Handle both old string format and new object format {url, storagePath}
        const images = (albumData.images || []).map(item => {
          const url = typeof item === 'string' ? item : item.url;
          return {
            url: convertToEmulatorURL(url),
            storagePath: typeof item === 'string' ? null : item.storagePath,
            type: 'image'
          };
        });
        const videos = (albumData.videos || []).map(item => {
          const url = typeof item === 'string' ? item : item.url;
          return {
            url: convertToEmulatorURL(url),
            storagePath: typeof item === 'string' ? null : item.storagePath,
            type: 'video'
          };
        });
        setAllMedia([...images, ...videos]);

        console.log('Extracted images:', images);
        console.log('Extracted videos:', videos);
        console.log('All media:', [...images, ...videos]);
      } catch (error) {
        console.error('Error fetching album:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          bookId: bookId,
        });
        toast({
          title: 'Error',
          description: `Failed to load album: ${error.message || 'Unknown error'}`,
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAlbum();
  }, [bookId, navigate, toast, user]);

  const openPreview = (index, type) => {
    // Find index in combined media array
    const images = album.images || [];
    const videos = album.videos || [];

    if (type === 'image') {
      setPreviewIndex(index);
    } else {
      setPreviewIndex(images.length + index);
    }
    setPreviewType(type);
    setPreviewOpen(true);
  };

  const closePreview = () => setPreviewOpen(false);
  const requestDelete = () => setConfirmingDelete(true);
  const cancelDelete = () => setConfirmingDelete(false);
  const requestAlbumDelete = () => setConfirmingAlbumDelete(true);
  const cancelAlbumDelete = () => setConfirmingAlbumDelete(false);

  const handleDelete = async () => {
    const item = allMedia[previewIndex];
    if (!item || !item.storagePath) {
      toast({ title: 'Delete failed', description: 'Missing media reference.', variant: 'destructive' });
      setConfirmingDelete(false);
      return;
    }

    try {
      const call = httpsCallable(functions, 'deleteMediaAsset');
      await call({ storagePath: item.storagePath, bookId });
      toast({ title: 'Media deleted' });
      setConfirmingDelete(false);
      setPreviewOpen(false);
      // Refresh album
      const albumRef = doc(firestore, 'albums', bookId);
      const albumSnap = await getDoc(albumRef);
      if (albumSnap.exists()) {
        const albumData = { id: albumSnap.id, ...albumSnap.data() };
        setAlbum(albumData);
        const images = (albumData.images || []).map(m => ({
          url: convertToEmulatorURL(typeof m === 'string' ? m : m.url),
          storagePath: typeof m === 'string' ? null : m.storagePath,
          type: 'image',
        }));
        const videos = (albumData.videos || []).map(m => ({
          url: convertToEmulatorURL(typeof m === 'string' ? m : m.url),
          storagePath: typeof m === 'string' ? null : m.storagePath,
          type: 'video',
        }));
        setAllMedia([...images, ...videos]);
      }
    } catch (err) {
      console.error('Delete media failed:', err);
      toast({ title: 'Delete failed', description: err?.message || 'Could not delete media.', variant: 'destructive' });
      setConfirmingDelete(false);
    }
  };

  const handleDeleteAlbum = async () => {
    try {
      const call = httpsCallable(functions, 'deleteAlbumAssets');
      await call({ bookId });
      toast({ title: 'Album deleted' });
      setConfirmingAlbumDelete(false);
      navigate('/media');
    } catch (err) {
      console.error('Delete album failed:', err);
      toast({ title: 'Delete failed', description: err?.message || 'Could not delete album.', variant: 'destructive' });
      setConfirmingAlbumDelete(false);
    }
  };

  const handleUpdateAlbum = async (e) => {
    e.preventDefault();
    if (!editingName.trim()) return;

    setUpdating(true);
    try {
      let coverImageUrl = album.coverImage;

      // Upload new cover if selected
      if (editingCover) {
        const storagePath = `${user.uid}/albums/${bookId}/cover_${Date.now()}_${editingCover.name}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = await uploadBytesResumable(storageRef, editingCover);
        coverImageUrl = await getDownloadURL(uploadTask.ref);
      }

      const updateAlbumFn = httpsCallable(functions, 'updateAlbum');
      await updateAlbumFn({
        albumId: bookId,
        name: editingName,
        coverImage: coverImageUrl,
      });

      setAlbum(prev => ({
        ...prev,
        name: editingName,
        coverImage: coverImageUrl,
      }));

      toast({ title: 'Success', description: 'Album updated successfully.' });
      setEditModalOpen(false);
    } catch (error) {
      console.error('Update failed:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update album.', variant: 'destructive' });
    } finally {
      setUpdating(false);
    }
  };

  const handleCoverSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setEditingCover(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCoverPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    files.forEach(file => handleUpload(file));
    // Reset input
    event.target.value = '';
  };

  const handleUpload = (file) => {
    if (!file || !user) return;

    setUploading(true);
    const mediaType = file.type.startsWith('video') ? 'video' : 'image';
    const uniqueFileName = `${Date.now()}_${file.name}`;
    // Construct path to match mediaProcessor expectation: {userId}/{bookId}/{chapterId}/{pageId}/media/{type}/{filename}
    // For albums, we use albumId as bookId, and '_album_' as placeholders for chapter/page
    const storagePath = `${user.uid}/${bookId}/_album_/_album_/media/${mediaType}/${uniqueFileName}`;
    const storageRef = ref(storage, storagePath);

    // Add custom metadata for original name
    const metadata = {
      customMetadata: {
        originalName: file.name
      }
    };

    const uploadTask = uploadBytesResumable(storageRef, file, metadata);

    uploadTask.on('state_changed',
      (snapshot) => {
        // Optional: Handle progress
      },
      (error) => {
        console.error('Upload error:', error);
        toast({ title: 'Upload Error', description: error.message, variant: 'destructive' });
        setUploading(false);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then(async (downloadURL) => {
          const newMediaItem = {
            url: downloadURL,
            storagePath,
            type: mediaType,
            name: file.name,
            uploadedAt: new Date().toISOString(),
          };

          // NOTE: We do NOT update Firestore here anymore.
          // The 'onMediaUpload' Cloud Function in mediaProcessor.js will handle:
          // 1. Updating the album document
          // 2. Updating user's accessible albums
          // 3. Tracking storage usage

          try {
            // Update local state for immediate UI feedback
            setAlbum(prev => {
              if (!prev) return prev;
              const updated = { ...prev };
              if (mediaType === 'video') {
                updated.videos = [...(updated.videos || []), newMediaItem];
              } else {
                updated.images = [...(updated.images || []), newMediaItem];
              }
              updated.mediaCount = (updated.mediaCount || 0) + 1;
              return updated;
            });

            // Update allMedia for preview
            setAllMedia(prev => [...prev, {
              url: convertToEmulatorURL(downloadURL),
              storagePath,
              type: mediaType
            }]);

            toast({ title: 'Upload Success', description: `"${file.name}" uploaded.` });
          } catch (error) {
            console.error('Local state update error:', error);
          } finally {
            setUploading(false);
          }
        });
      }
    );
  };

  const goPrev = () => {
    if (allMedia.length === 0) return;
    const newIndex = (previewIndex - 1 + allMedia.length) % allMedia.length;
    setPreviewIndex(newIndex);
    setPreviewType(allMedia[newIndex].type);
  };

  const goNext = () => {
    if (allMedia.length === 0) return;
    const newIndex = (previewIndex + 1) % allMedia.length;
    setPreviewIndex(newIndex);
    setPreviewType(allMedia[newIndex].type);
  };

  // Keyboard navigation for preview
  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'Escape') closePreview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewOpen, allMedia.length, previewIndex]);

  const previewItem = allMedia[previewIndex] || null;
  // Handle both old string format and new object format {url, storagePath}
  // Convert URLs to emulator format if needed
  const images = (album?.images || []).map(item => {
    const url = typeof item === 'string' ? item : item.url;
    return {
      url: convertToEmulatorURL(url),
      storagePath: typeof item === 'string' ? null : item.storagePath,
    };
  }).filter(item => item.url); // Filter out null/undefined URLs
  const videos = (album?.videos || []).map(item => {
    const url = typeof item === 'string' ? item : item.url;
    return {
      url: convertToEmulatorURL(url),
      storagePath: typeof item === 'string' ? null : item.storagePath,
    };
  }).filter(item => item.url); // Filter out null/undefined URLs
  const hasMedia = images.length > 0 || videos.length > 0;

  if (loading || !album) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-10 w-10 animate-spin text-app-iris" />
      </div>
    );
  }

  return (
    <div className="py-6 px-4 sm:px-6 lg:px-8">
      <Helmet>
        <title>{album.name || 'Album'} - Media Gallery</title>
      </Helmet>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Button
              variant="appGhost"
              onClick={() => navigate('/media')}
              className="mb-3 inline-flex items-center gap-2 text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to albums
            </Button>
            <div className="flex items-center gap-3">
              <h1 className="text-[28px] font-semibold text-app-gray-900 leading-tight">
                {album.name || 'Album'}
              </h1>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-500 hover:text-gray-900"
                onClick={() => {
                  setEditingName(album.name || '');
                  setCoverPreview(convertToEmulatorURL(album.coverImage));
                  setEditingCover(null);
                  setEditModalOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1 text-xs text-app-gray-600">
              {(album.mediaCount || 0) === 0
                ? 'No media yet'
                : `${album.mediaCount || 0} ${(album.mediaCount || 0) === 1 ? 'item' : 'items'}`}
            </p>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="appPrimary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-2"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              {uploading ? 'Uploading...' : 'Upload media'}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={requestAlbumDelete}
            >
              Delete album
            </Button>
          </div>
        </div>

        {/* Media Grid */}
        {!hasMedia ? (
          <div className="text-center py-16">
            <ImageIcon className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-2xl font-bold text-gray-700 mb-2">No Media Yet</h3>
            <p className="text-gray-600 mb-6">
              Upload media to see it here.
            </p>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              <PlusCircle className="h-4 w-4" />
              Upload now
            </Button>
          </div>
        ) : (
          <>
            {/* Images Section */}
            {images.length > 0 && (
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Images</h2>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
                >
                  {images.map((item, index) => (
                    <motion.div
                      key={`image-${index}-${item.url}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      onClick={() => openPreview(index, 'image')}
                      className="relative aspect-square bg-gray-200 rounded-lg overflow-hidden cursor-pointer group hover:shadow-xl transition-all duration-300"
                    >
                      <img
                        src={item.url}
                        alt={`Image ${index + 1}`}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        onError={(e) => {
                          console.error('Failed to load image:', item.url);
                          e.target.style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-semibold">
                          View
                        </div>
                      </div>
                      {item.storagePath && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewIndex(index);
                            setPreviewType('image');
                            requestDelete();
                          }}
                          className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 group-hover:bg-red-600 transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            )}

            {/* Videos Section */}
            {videos.length > 0 && (
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Videos</h2>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
                >
                  {videos.map((item, index) => (
                    <motion.div
                      key={`video-${index}-${item.url}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      onClick={() => openPreview(index, 'video')}
                      className="relative aspect-square bg-gray-200 rounded-lg overflow-hidden cursor-pointer group hover:shadow-xl transition-all duration-300"
                    >
                      <video
                        src={item.url}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          console.error('Failed to load video:', item.url);
                          e.target.style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                        <Video className="h-8 w-8 text-white" />
                      </div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-semibold">
                          View
                        </div>
                      </div>
                      {item.storagePath && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewIndex(images.length + index);
                            setPreviewType('video');
                            requestDelete();
                          }}
                          className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 group-hover:bg-red-600 transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-transparent border-0 shadow-none">
          {previewItem && (
            <div className="relative">
              <button
                onClick={closePreview}
                className="absolute top-4 right-4 z-10 bg-black/50 text-white rounded-full p-2 hover:bg-black/70 transition-colors"
              >
                ✕
              </button>

              {previewItem.type === 'image' ? (
                <img
                  src={previewItem.url}
                  alt="Preview"
                  className="w-full h-auto max-h-[80vh] object-contain"
                />
              ) : (
                <video
                  src={previewItem.url}
                  controls
                  className="w-full h-auto max-h-[80vh]"
                  autoPlay
                />
              )}

              {/* Navigation */}
              {allMedia.length > 1 && (
                <>
                  <button
                    onClick={goPrev}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-3 hover:bg-black/70 transition-colors"
                  >
                    <ArrowLeft className="h-6 w-6" />
                  </button>
                  <button
                    onClick={goNext}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-3 hover:bg-black/70 transition-colors"
                  >
                    <ArrowLeft className="h-6 w-6 rotate-180" />
                  </button>
                </>
              )}

              {/* Counter */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-sm">
                {previewIndex + 1} / {allMedia.length}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <Dialog open={confirmingDelete} onOpenChange={(open) => !open && cancelDelete()}>
        <DialogContent className="max-w-md p-6 bg-white rounded-2xl shadow-xl">
          <div className="space-y-3 text-left">
            <h3 className="text-lg font-semibold text-app-gray-900">Delete media?</h3>
            <p className="text-sm text-app-gray-700">
              Are you sure you want to delete this media? This will permanently remove it from all books and album references and delete it from storage.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={cancelDelete}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Album Delete */}
      <Dialog open={confirmingAlbumDelete} onOpenChange={(open) => !open && cancelAlbumDelete()}>
        <DialogContent className="max-w-md p-6 bg-white rounded-2xl shadow-xl">
          <div className="space-y-3 text-left">
            <h3 className="text-lg font-semibold text-app-gray-900">Delete album?</h3>
            <p className="text-sm text-app-gray-700">
              Are you sure you want to delete this album? This will remove all media from this album, delete files from storage, and remove references from books.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={cancelAlbumDelete}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteAlbum}>Delete</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Edit Album Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-md p-6 bg-white rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle>Edit Album</DialogTitle>
            <DialogDescription>Update album details and cover image.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateAlbum} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="album-name">Album Name</Label>
              <Input
                id="album-name"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                placeholder="Enter album name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Cover Image</Label>
              <div
                className="relative w-40 aspect-[3/4] mx-auto bg-gray-100 rounded-lg overflow-hidden border-2 border-dashed border-gray-300 hover:border-app-iris cursor-pointer transition-colors flex items-center justify-center group"
                onClick={() => coverInputRef.current?.click()}
              >
                {coverPreview ? (
                  <>
                    <img src={coverPreview} alt="Cover preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-white font-medium text-sm">Change Cover</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-500">
                    <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <span className="text-sm">Click to upload cover</span>
                  </div>
                )}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverSelect}
                />
              </div>
              {coverPreview && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-600 hover:bg-red-50 h-auto p-0 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCoverPreview(null);
                    setEditingCover(null);
                    if (coverInputRef.current) coverInputRef.current.value = '';
                  }}
                >
                  Remove cover
                </Button>
              )}
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="appPrimary" disabled={updating || !editingName.trim()}>
                {updating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AlbumDetail;
