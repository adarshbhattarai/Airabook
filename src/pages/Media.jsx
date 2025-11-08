import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Camera, Video, Upload, BookOpen, Image as ImageIcon } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/context/AuthContext';

/**
 * Convert storage URL to emulator format if running in emulator mode
 */
const convertToEmulatorURL = (url) => {
  if (!url) return url;
  
  const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true' || import.meta.env.MODE === 'development';
  
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

const Media = () => {
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, appUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

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

  if (loading || !appUser) {
    return (
      <div className="min-h-screen py-8 px-4 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50">
      <Helmet>
        <title>Media Gallery - Baby Aira</title>
        <meta name="description" content="Browse through your photo and video albums. Watch precious moments captured with love." />
      </Helmet>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-purple-500 to-indigo-500 bg-clip-text text-transparent">
            Media Gallery
          </h1>
          <p className="text-xl text-gray-700 mb-8">
            Browse your photo and video albums
          </p>
        </motion.div>

        {/* Albums Grid */}
        {albums.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="text-center py-16"
          >
            <BookOpen className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-2xl font-bold text-gray-700 mb-2">No Albums Yet</h3>
            <p className="text-gray-600 mb-6">
              Start creating books and adding media to see them here.
            </p>
            <Button
              onClick={() => navigate('/dashboard')}
              className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white"
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
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                onClick={() => navigate(`/media/album/${album.id}`)}
                className="bg-white/70 backdrop-blur-sm rounded-3xl overflow-hidden shadow-xl border border-violet-100 hover:shadow-2xl transition-all duration-300 cursor-pointer group"
              >
                <div className="relative aspect-square bg-gradient-to-br from-violet-200 to-purple-300">
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
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="h-16 w-16 text-violet-400" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-semibold text-lg">
                      View Album
                    </div>
                  </div>
                  {(album.mediaCount || 0) > 0 && (
                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-2 shadow-lg">
                      <ImageIcon className="h-4 w-4 text-violet-600" />
                      <span className="text-sm font-semibold text-gray-800">
                        {album.mediaCount || 0}
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-2 truncate">
                    {album.name || 'Untitled Album'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {(album.mediaCount || 0) === 0
                      ? 'No media yet'
                      : `${album.mediaCount || 0} ${(album.mediaCount || 0) === 1 ? 'item' : 'items'}`}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Media;
