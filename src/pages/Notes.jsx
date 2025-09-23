import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PenTool, Calendar, Heart, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const Notes = () => {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    // Load notes from localStorage
    const savedNotes = JSON.parse(localStorage.getItem('babyAiraNotes') || '[]');
    
    // Add some sample data if empty
    if (savedNotes.length === 0) {
      const sampleNotes = [
        {
          id: 1,
          title: "Aira's First Smile",
          excerpt: "Today was magical! Aira gave us her very first real smile, and our hearts just melted...",
          content: "Today was absolutely magical! Aira gave us her very first real smile, and our hearts just melted. It wasn't just gas this time - she was looking right at us with those beautiful eyes and her little mouth curved into the sweetest smile. We both started crying happy tears. This moment will be etched in our hearts forever.",
          date: "2024-01-15",
          author: "Mommy",
          comments: 5
        },
        {
          id: 2,
          title: "Rolling Over Milestone",
          excerpt: "Our little champion rolled over for the first time today! She's getting so strong...",
          content: "Our little champion rolled over for the first time today! She's getting so strong and determined. We were doing tummy time when suddenly she just rolled right over onto her back. The look of surprise on her face was priceless! She seemed so proud of herself. We cheered and clapped, and she gave us the biggest grin.",
          date: "2024-02-03",
          author: "Daddy",
          comments: 8
        },
        {
          id: 3,
          title: "First Giggle",
          excerpt: "The most beautiful sound in the world - Aira's first giggle! It happened during peek-a-boo...",
          content: "The most beautiful sound in the world happened today - Aira's first real giggle! It happened during our morning peek-a-boo game. When I popped out from behind my hands, she burst into the most adorable giggle. We spent the next hour playing peek-a-boo just to hear that precious sound over and over again.",
          date: "2024-02-10",
          author: "Mommy",
          comments: 12
        }
      ];
      setNotes(sampleNotes);
      localStorage.setItem('babyAiraNotes', JSON.stringify(sampleNotes));
    } else {
      setNotes(savedNotes);
    }
  }, []);

  const handleNewNote = () => {
    toast({
      title: "✍️ Create New Note",
      description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      duration: 5000,
    });
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <Helmet>
        <title>Notes & Stories - Baby Aira</title>
        <meta name="description" content="Read heartwarming stories and milestones from Baby Aira's journey. Parents share precious moments and memories of their little angel." />
      </Helmet>

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-purple-500 to-indigo-500 bg-clip-text text-transparent">
            Aira's Stories
          </h1>
          <p className="text-xl text-gray-700 mb-8">
            Precious moments and milestones shared with love
          </p>
          
          <Button
            onClick={handleNewNote}
            className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white px-6 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <PenTool className="h-5 w-5 mr-2" />
            Write New Story
          </Button>
        </motion.div>

        {/* Notes List */}
        <div className="space-y-8">
          {notes.map((note, index) => (
            <motion.article
              key={note.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-violet-100 hover:shadow-2xl transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <div className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full p-3">
                    <Heart className="h-6 w-6 text-white fill-current" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-1">
                      <Link 
                        to={`/notes/${note.id}`}
                        className="hover:text-violet-600 transition-colors"
                      >
                        {note.title}
                      </Link>
                    </h2>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(note.date).toLocaleDateString()}</span>
                      </div>
                      <span>by {note.author}</span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-gray-700 leading-relaxed mb-6">
                {note.excerpt}
              </p>

              <div className="flex items-center justify-between">
                <Link
                  to={`/notes/${note.id}`}
                  className="text-violet-600 hover:text-violet-700 font-medium transition-colors"
                >
                  Read full story →
                </Link>
                <div className="flex items-center space-x-1 text-gray-600">
                  <MessageCircle className="h-4 w-4" />
                  <span className="text-sm">{note.comments} comments</span>
                </div>
              </div>
            </motion.article>
          ))}
        </div>

        {/* Empty State */}
        {notes.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="text-center py-16"
          >
            <div className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full p-6 w-24 h-24 mx-auto mb-6">
              <PenTool className="h-12 w-12 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-4">No stories yet</h3>
            <p className="text-gray-600 mb-8">Start sharing Aira's precious moments and milestones!</p>
            <Button
              onClick={handleNewNote}
              className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white px-6 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
            >
              Write First Story
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Notes;