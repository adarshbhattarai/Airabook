import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Camera, Video, Upload, Heart } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const Media = () => {
  const [activeTab, setActiveTab] = useState('photos');
  const [photos, setPhotos] = useState([]);
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    // Load media from localStorage
    const savedPhotos = JSON.parse(localStorage.getItem('babyAiraPhotos') || '[]');
    const savedVideos = JSON.parse(localStorage.getItem('babyAiraVideos') || '[]');
    
    // Add some sample data if empty
    if (savedPhotos.length === 0) {
      const samplePhotos = [
        { id: 1, title: "First Smile", date: "2024-01-15" },
        { id: 2, title: "Tummy Time", date: "2024-01-20" },
        { id: 3, title: "Bath Time Fun", date: "2024-01-25" },
        { id: 4, title: "Sleeping Angel", date: "2024-02-01" },
        { id: 5, title: "Playing with Toys", date: "2024-02-05" },
        { id: 6, title: "Family Cuddles", date: "2024-02-10" }
      ];
      setPhotos(samplePhotos);
      localStorage.setItem('babyAiraPhotos', JSON.stringify(samplePhotos));
    } else {
      setPhotos(savedPhotos);
    }

    if (savedVideos.length === 0) {
      const sampleVideos = [
        { id: 1, title: "First Laugh", date: "2024-01-18", duration: "0:15" },
        { id: 2, title: "Learning to Crawl", date: "2024-02-03", duration: "0:45" },
        { id: 3, title: "Babbling Sounds", date: "2024-02-08", duration: "0:30" }
      ];
      setVideos(sampleVideos);
      localStorage.setItem('babyAiraVideos', JSON.stringify(sampleVideos));
    } else {
      setVideos(savedVideos);
    }
  }, []);

  const handleUpload = () => {
    toast({
      title: "📸 Upload Feature",
      description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      duration: 5000,
    });
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <Helmet>
        <title>Media Gallery - Baby Aira</title>
        <meta name="description" content="Browse through Baby Aira's precious photo and video memories. Watch her grow and discover new milestones in our beautiful gallery." />
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
            Aira's Gallery
          </h1>
          <p className="text-xl text-gray-700 mb-8">
            Precious moments captured with love
          </p>
          
          <Button
            onClick={handleUpload}
            className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white px-6 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Upload className="h-5 w-5 mr-2" />
            Upload New Media
          </Button>
        </motion.div>

        {/* Tabs */}
        <div className="flex justify-center mb-12">
          <div className="bg-white/70 backdrop-blur-sm rounded-full p-2 shadow-lg border border-violet-100">
            <button
              onClick={() => setActiveTab('photos')}
              className={`flex items-center space-x-2 px-6 py-3 rounded-full transition-all duration-200 ${
                activeTab === 'photos'
                  ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-lg'
                  : 'text-gray-700 hover:bg-violet-50'
              }`}
            >
              <Camera className="h-5 w-5" />
              <span className="font-medium">Photos</span>
            </button>
            <button
              onClick={() => setActiveTab('videos')}
              className={`flex items-center space-x-2 px-6 py-3 rounded-full transition-all duration-200 ${
                activeTab === 'videos'
                  ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-lg'
                  : 'text-gray-700 hover:bg-violet-50'
              }`}
            >
              <Video className="h-5 w-5" />
              <span className="font-medium">Videos</span>
            </button>
          </div>
        </div>

        {/* Photos Grid */}
        {activeTab === 'photos' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {photos.map((photo, index) => (
              <motion.div
                key={photo.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white/70 backdrop-blur-sm rounded-3xl overflow-hidden shadow-xl border border-violet-100 hover:shadow-2xl transition-all duration-300"
              >
                <div className="relative">
                  <img 
                    className="w-full h-64 object-cover"
                    alt={`Baby Aira - ${photo.title}`}
                   src="https://images.unsplash.com/photo-1506727955196-38974d930ebf" />
                  <div className="absolute top-4 right-4 bg-white/80 backdrop-blur-sm rounded-full p-2">
                    <Heart className="h-5 w-5 text-violet-500" />
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-2">{photo.title}</h3>
                  <p className="text-gray-600">{new Date(photo.date).toLocaleDateString()}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Videos Grid */}
        {activeTab === 'videos' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {videos.map((video, index) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white/70 backdrop-blur-sm rounded-3xl overflow-hidden shadow-xl border border-indigo-100 hover:shadow-2xl transition-all duration-300"
              >
                <div className="relative">
                  <img 
                    className="w-full h-64 object-cover"
                    alt={`Baby Aira video - ${video.title}`}
                   src="https://images.unsplash.com/photo-1676664488037-ee497751808b" />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <div className="bg-white/90 backdrop-blur-sm rounded-full p-4">
                      <Video className="h-8 w-8 text-indigo-600" />
                    </div>
                  </div>
                  <div className="absolute bottom-4 right-4 bg-black/70 text-white px-3 py-1 rounded-full text-sm">
                    {video.duration}
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-2">{video.title}</h3>
                  <p className="text-gray-600">{new Date(video.date).toLocaleDateString()}</p>
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