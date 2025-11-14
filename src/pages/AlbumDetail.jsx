import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Image as ImageIcon, Video, Loader2 } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import {
  Dialog,
  DialogContent,
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

        console.log('Album data:', albumData);
        console.log('Images array:', albumData.images);
        console.log('Videos array:', albumData.videos);

        // Combine images and videos for preview navigation
        // Handle both old string format and new object format {url, storagePath}
        const images = (albumData.images || []).map(item => {
          const url = typeof item === 'string' ? item : item.url;
          return { url: convertToEmulatorURL(url), type: 'image' };
        });
        const videos = (albumData.videos || []).map(item => {
          const url = typeof item === 'string' ? item : item.url;
          return { url: convertToEmulatorURL(url), type: 'video' };
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
    return convertToEmulatorURL(url);
  }).filter(url => url); // Filter out null/undefined URLs
  const videos = (album?.videos || []).map(item => {
    const url = typeof item === 'string' ? item : item.url;
    return convertToEmulatorURL(url);
  }).filter(url => url); // Filter out null/undefined URLs
  const hasMedia = images.length > 0 || videos.length > 0;

  if (loading || !album) {
    return (
      <div className="min-h-screen py-8 px-4 flex justify-center items-center">
        <Loader2 className="h-12 w-12 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50">
      <Helmet>
        <title>{album.name || 'Album'} - Media Gallery</title>
      </Helmet>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="outline"
            onClick={() => navigate('/media')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Albums
          </Button>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-500 to-indigo-500 bg-clip-text text-transparent">
            {album.name || 'Album'}
          </h1>
          <p className="text-gray-600 mt-2">
            {(album.mediaCount || 0) === 0
              ? 'No media yet'
              : `${album.mediaCount || 0} ${(album.mediaCount || 0) === 1 ? 'item' : 'items'}`}
          </p>
        </div>

        {/* Media Grid */}
        {!hasMedia ? (
          <div className="text-center py-16">
            <ImageIcon className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-2xl font-bold text-gray-700 mb-2">No Media Yet</h3>
            <p className="text-gray-600">
              Upload media from the book page to see it here.
            </p>
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
                  {images.map((url, index) => (
                    <motion.div
                      key={`image-${index}-${url}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      onClick={() => openPreview(index, 'image')}
                      className="relative aspect-square bg-gray-200 rounded-lg overflow-hidden cursor-pointer group hover:shadow-xl transition-all duration-300"
                    >
                      <img
                        src={url}
                        alt={`Image ${index + 1}`}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        onError={(e) => {
                          console.error('Failed to load image:', url);
                          e.target.style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-semibold">
                          View
                        </div>
                      </div>
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
                  {videos.map((url, index) => (
                    <motion.div
                      key={`video-${index}-${url}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      onClick={() => openPreview(index, 'video')}
                      className="relative aspect-square bg-gray-200 rounded-lg overflow-hidden cursor-pointer group hover:shadow-xl transition-all duration-300"
                    >
                      <video
                        src={url}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          console.error('Failed to load video:', url);
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
    </div>
  );
};

export default AlbumDetail;
