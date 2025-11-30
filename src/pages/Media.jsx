import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Camera, Video, Upload, BookOpen, Image as ImageIcon, MoreVertical, Trash2, Eye } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/context/AuthContext';
import AppLoader from '@/components/app/AppLoader';
import { httpsCallable, getFunctions } from 'firebase/functions';

/**
 * Convert storage URL to emulator format if running in emulator mode
 */
const convertToEmulatorURL = (url) => {
  if (!url) return url;

  const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true';

  if (!useEmulator) {
    return url;
  }

  if (url.includes('127.0.0.1:9199') || url.includes('localhost:9199')) {
    return url;
  }

  if (url.includes('storage.googleapis.com')) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);

      if (pathParts.length >= 1) {
        const bucket = pathParts[0];
        const storagePath = pathParts.slice(1).join('/');

        let emulatorBucket = bucket;
        if (bucket.endsWith('.appspot.com')) {
          emulatorBucket = bucket.replace('.appspot.com', '.firebasestorage.app');
        }

        const encodedPath = encodeURIComponent(storagePath);
        const token = urlObj.searchParams.get('token') || 'emulator-token';
        return `http://127.0.0.1:9199/v0/b/${emulatorBucket}/o/${encodedPath}?alt=media&token=${token}`;
      }
    } catch (error) {
      console.error('Error converting URL to emulator format:', error, url);
      return url;
    }
  }

  return url;
};

const AssetRegistry = () => {
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [targetAlbum, setTargetAlbum] = useState(null);
  const { user, appUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const functions = getFunctions();

  useEffect(() => {
    const fetchAlbums = async () => {
      if (!user || !appUser) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Get albums from user's accessibleAlbums array
        const albumsList = appUser.accessibleAlbums || [];
        setAlbums(albumsList);
      } catch (error) {
        console.error('Error fetching albums:', error);
        toast({
          title: 'Error',
          description: 'Failed to load albums. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAlbums();
  }, [user, appUser, toast]);

  const handleUpload = () => {
    toast({
      title: "📸 Upload Feature",
      description: "Navigate to a book page to upload media to that album.",
      duration: 5000,
    });
  };

  const openMenu = (albumId) => {
    setMenuOpenId(prev => (prev === albumId ? null : albumId));
  };

  const requestDelete = (album) => {
    setTargetAlbum(album);
    setConfirmingDelete(true);
    setMenuOpenId(null);
  };

  const cancelDelete = () => {
    setConfirmingDelete(false);
    setTargetAlbum(null);
  };

  const handleDeleteAlbum = async () => {
    if (!targetAlbum) return;
    try {
      const call = httpsCallable(functions, 'deleteAlbumAssets');
      await call({ bookId: targetAlbum.id });
      toast({ title: 'Album deleted' });
      setAlbums((prev) => prev.filter((a) => a.id !== targetAlbum.id));
    } catch (err) {
      console.error('Album delete failed:', err);
      toast({ title: 'Delete failed', description: err?.message || 'Could not delete album.', variant: 'destructive' });
    } finally {
      cancelDelete();
    }
  };

  if (loading || !appUser) {
    return <AppLoader message="Loading your albums..." />;
  }

  return (
    <div className="py-6 px-4 sm:px-6 lg:px-8">
      <Helmet>
        <title>Asset Registry - Baby Aira</title>
        <meta name="description" content="Browse and manage your photo and video assets attached to your books." />
      </Helmet>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <h1 className="text-[28px] font-semibold text-app-gray-900 leading-tight">
            Asset registry
          </h1>
            <p className="mt-2 text-sm text-app-gray-600 max-w-md">
            Browse and manage photo and video assets attached to your books.
            </p>
        </motion.div>

        {/* Albums Grid */}
        {albums.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="text-center py-16 rounded-2xl border border-app-gray-100 bg-white shadow-appSoft"
          >
            <BookOpen className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-app-gray-900 mb-2">No albums yet</h3>
            <p className="text-sm text-app-gray-600 mb-6">
              Start creating books and adding media to see them here.
            </p>
            <Button
              onClick={() => navigate('/dashboard')}
              variant="appPrimary"
            >
              Go to Dashboard
            </Button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            {albums.map((album, index) => (
              <motion.div
                key={album.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="bg-white rounded-2xl overflow-hidden shadow-appSoft border border-app-gray-100 hover:shadow-appCard transition-all duration-200 group relative"
              >
                <button
                  className="absolute top-2 right-2 z-10 rounded-full p-2 hover:bg-app-gray-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    openMenu(album.id);
                  }}
                >
                  <MoreVertical className="h-4 w-4 text-app-gray-700" />
                </button>
                {menuOpenId === album.id && (
                  <div className="absolute top-10 right-2 z-20 bg-white border border-app-gray-100 rounded-lg shadow-appSoft w-36">
                    <button
                      className="w-full px-3 py-2 text-left text-sm hover:bg-app-gray-50 flex items-center gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/media/album/${album.id}`);
                      }}
                    >
                      <Eye className="h-4 w-4" /> Open
                    </button>
                    <button
                      className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestDelete(album);
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  </div>
                )}
                <div
                  onClick={() => navigate(`/media/album/${album.id}`)}
                  className="cursor-pointer"
                >
                  <div className="relative aspect-square bg-app-gray-100">
                    {album.coverImage ? (
                      <img
                        src={convertToEmulatorURL(album.coverImage)}
                        alt={album.name || 'Album cover'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          console.error('Failed to load cover image:', album.coverImage);
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-app-iris">
                        <BookOpen className="h-12 w-12" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-all duration-200 flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-semibold text-sm">
                        View Album
                      </div>
                    </div>
                    {(album.mediaCount || 0) > 0 && (
                      <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1 flex items-center gap-1.5 shadow-appSoft">
                        <ImageIcon className="h-3.5 w-3.5 text-app-iris" />
                        <span className="text-xs font-medium text-app-gray-900">
                          {album.mediaCount || 0}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-app-gray-900 mb-1 truncate">
                      {album.name || 'Untitled Album'}
                    </h3>
                    <p className="text-xs text-app-gray-600">
                      {(album.mediaCount || 0) === 0
                        ? 'No media yet'
                        : `${album.mediaCount || 0} ${(album.mediaCount || 0) === 1 ? 'item' : 'items'}`}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
      {/* Confirm Album Delete */}
      <Dialog open={confirmingDelete} onOpenChange={(open) => !open && cancelDelete()}>
        <DialogContent className="max-w-md p-6 bg-white rounded-2xl shadow-xl">
          <div className="space-y-3 text-left">
            <h3 className="text-lg font-semibold text-app-gray-900">Delete album?</h3>
            <p className="text-sm text-app-gray-700">
              Are you sure you want to delete this album? This will remove all media, delete files from storage, and remove references from books.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={cancelDelete}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteAlbum}>Delete</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AssetRegistry;
