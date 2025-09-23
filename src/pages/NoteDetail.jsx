import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Heart, MessageCircle, ArrowLeft, Send } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const NoteDetail = () => {
  const { id } = useParams();
  const [note, setNote] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commenterName, setCommenterName] = useState('');

  useEffect(() => {
    // Load note from localStorage
    const savedNotes = JSON.parse(localStorage.getItem('babyAiraNotes') || '[]');
    const foundNote = savedNotes.find(n => n.id === parseInt(id));
    setNote(foundNote);

    // Load comments for this note
    const savedComments = JSON.parse(localStorage.getItem(`babyAiraComments_${id}`) || '[]');
    
    // Add sample comments if empty
    if (savedComments.length === 0 && foundNote) {
      const sampleComments = [
        {
          id: 1,
          name: "Grandma Sarah",
          message: "Oh my goodness, this brought tears to my eyes! Aira is such a precious angel. Can't wait to see her again! 💕",
          date: "2024-02-11"
        },
        {
          id: 2,
          name: "Uncle Mike",
          message: "That smile could light up the whole world! She's absolutely beautiful. Give her a big hug from Uncle Mike! 🤗",
          date: "2024-02-11"
        },
        {
          id: 3,
          name: "Aunt Lisa",
          message: "I'm crying happy tears! Aira is so lucky to have such loving parents. These moments are so precious! ❤️",
          date: "2024-02-12"
        }
      ];
      setComments(sampleComments);
      localStorage.setItem(`babyAiraComments_${id}`, JSON.stringify(sampleComments));
    } else {
      setComments(savedComments);
    }
  }, [id]);

  const handleSubmitComment = (e) => {
    e.preventDefault();
    if (!newComment.trim() || !commenterName.trim()) {
      toast({
        title: "Please fill in all fields",
        description: "Both name and message are required to post a comment.",
        duration: 3000,
      });
      return;
    }

    const comment = {
      id: Date.now(),
      name: commenterName,
      message: newComment,
      date: new Date().toISOString().split('T')[0]
    };

    const updatedComments = [...comments, comment];
    setComments(updatedComments);
    localStorage.setItem(`babyAiraComments_${id}`, JSON.stringify(updatedComments));
    
    setNewComment('');
    setCommenterName('');
    
    toast({
      title: "💕 Comment posted!",
      description: "Thank you for sharing your love and support!",
      duration: 3000,
    });
  };

  if (!note) {
    return (
      <div className="min-h-screen py-8 px-4 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Story not found</h2>
          <Link to="/notes" className="text-violet-600 hover:text-violet-700">
            ← Back to Stories
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <Helmet>
        <title>{note.title} - Baby Aira</title>
        <meta name="description" content={note.excerpt} />
      </Helmet>

      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <Link
            to="/notes"
            className="inline-flex items-center space-x-2 text-violet-600 hover:text-violet-700 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back to Stories</span>
          </Link>
        </motion.div>

        {/* Article */}
        <motion.article
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-violet-100 mb-12"
        >
          <header className="mb-8">
            <div className="flex items-center space-x-4 mb-6">
              <div className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full p-3">
                <Heart className="h-6 w-6 text-white fill-current" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-gray-800 mb-2">{note.title}</h1>
                <div className="flex items-center space-x-4 text-gray-600">
                  <div className="flex items-center space-x-1">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(note.date).toLocaleDateString()}</span>
                  </div>
                  <span>by {note.author}</span>
                </div>
              </div>
            </div>
          </header>

          <div className="prose prose-lg max-w-none">
            <p className="text-gray-700 leading-relaxed text-lg">
              {note.content}
            </p>
          </div>
        </motion.article>

        {/* Comments Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-violet-100"
        >
          <div className="flex items-center space-x-2 mb-8">
            <MessageCircle className="h-6 w-6 text-violet-500" />
            <h2 className="text-2xl font-bold text-gray-800">
              Comments ({comments.length})
            </h2>
          </div>

          {/* Comment Form */}
          <form onSubmit={handleSubmitComment} className="mb-8 p-6 bg-violet-50 rounded-2xl border border-violet-100">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Leave a loving message</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Your name"
                value={commenterName}
                onChange={(e) => setCommenterName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <textarea
                placeholder="Share your thoughts and love..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 rounded-xl border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
              />
              <Button
                type="submit"
                className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
              >
                <Send className="h-4 w-4 mr-2" />
                Post Comment
              </Button>
            </div>
          </form>

          {/* Comments List */}
          <div className="space-y-6">
            {comments.map((comment, index) => (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="p-6 bg-white/50 rounded-2xl border border-violet-100"
              >
                <div className="flex items-start space-x-4">
                  <div className="bg-gradient-to-r from-violet-400 to-indigo-400 rounded-full p-2 text-white font-bold text-sm w-10 h-10 flex items-center justify-center">
                    {comment.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h4 className="font-semibold text-gray-800">{comment.name}</h4>
                      <span className="text-sm text-gray-500">
                        {new Date(comment.date).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-gray-700 leading-relaxed">{comment.message}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {comments.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No comments yet. Be the first to share your love!</p>
            </div>
          )}
        </motion.section>
      </div>
    </div>
  );
};

export default NoteDetail;