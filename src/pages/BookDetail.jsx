import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, addDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

const BookDetail = () => {
  const { bookId } = useParams();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    const fetchBookData = async () => {
      setLoading(true);
      try {
        // Fetch book metadata
        const bookRef = doc(firestore, 'books', bookId);
        const bookSnap = await getDoc(bookRef);

        if (bookSnap.exists()) {
          setBook({ id: bookSnap.id, ...bookSnap.data() });
        } else {
          toast({ title: "Error", description: "Book not found.", variant: "destructive" });
          return;
        }

        // Fetch chapters for the book
        const chaptersRef = collection(firestore, 'books', bookId, 'chapters');
        const chaptersSnap = await getDocs(chaptersRef);
        const chaptersList = chaptersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.order - b.order);
        setChapters(chaptersList);

      } catch (error) {
        console.error("Error fetching book data: ", error);
        toast({ title: "Error", description: "Failed to fetch book data.", variant: "destructive" });
      }
      setLoading(false);
    };

    fetchBookData();
  }, [bookId, toast]);

  const handleCreateChapter = async (e) => {
    e.preventDefault();
    if (!newChapterTitle.trim()) {
      toast({ title: "Error", description: "Chapter title cannot be empty.", variant: "destructive" });
      return;
    }

    try {
      const chaptersRef = collection(firestore, 'books', bookId, 'chapters');
      const newChapterDoc = await addDoc(chaptersRef, {
        title: newChapterTitle,
        order: chapters.length, // Simple ordering
        createdAt: new Date(),
      });

      setChapters([...chapters, { id: newChapterDoc.id, title: newChapterTitle, order: chapters.length }]);
      setNewChapterTitle('');
      toast({ title: "Success!", description: `Chapter "${newChapterTitle}" created.` });

    } catch (error) {
      console.error("Error creating chapter: ", error);
      toast({ title: "Error", description: "Failed to create chapter.", variant: "destructive" });
    }
  };

  if (loading) {
    return <div>Loading book...</div>;
  }

  if (!book) {
    return <div>Book not found.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-extrabold text-center text-gray-900 mb-8">
        {book.babyName}'s Journey
      </h1>

      {/* Chapter Creation Form */}
      <form onSubmit={handleCreateChapter} className="flex items-center space-x-2 mb-12 max-w-lg mx-auto">
        <Input 
          type="text"
          value={newChapterTitle}
          onChange={(e) => setNewChapterTitle(e.target.value)}
          placeholder="e.g., Month 3: First Steps"
          className="flex-grow"
        />
        <Button type="submit">Create New Chapter</Button>
      </form>

      {/* Chapters List */}
      <div className="space-y-8">
        {chapters.length > 0 ? (
          chapters.map(chapter => (
            <div key={chapter.id} className="p-6 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-violet-100">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">{chapter.title}</h2>
              {/* Content of the chapter (notes, media) will go here */}
              <div className="text-gray-500 italic">
                  <p>Content for this chapter will be displayed here.</p>
                  <div className="mt-4 flex space-x-2">
                      <Button variant="outline">Add Note</Button>
                      <Button variant="outline">Upload Media</Button>
                  </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 px-6 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-violet-100">
            <h2 className="text-xl font-semibold text-gray-700">No Chapters Yet</h2>
            <p className="mt-2 text-gray-500">Start the story by creating the first chapter above!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookDetail;
