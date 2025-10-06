import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { BookOpen, Loader2 } from 'lucide-react';

const BookItem = ({ bookId }) => {
  const [book, setBook] = useState({
    name: '',
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchBookName = async () => {
      setBook(b => ({ ...b, loading: true, error: null }));
      try {
        const bookDocRef = doc(firestore, 'books', bookId);
        const bookDocSnap = await getDoc(bookDocRef);
        if (bookDocSnap.exists()) {
          setBook({ name: bookDocSnap.data().babyName || 'A Baby Book', loading: false, error: null });
        } else {
          setBook({ name: 'Book not found', loading: false, error: 'Not Found' });
        }
      } catch (error) {
        console.error("Error fetching book name: ", error);
        setBook({ name: 'Error loading book', loading: false, error: 'Failed to fetch' });
      }
    };

    fetchBookName();
  }, [bookId]);

  const renderContent = () => {
    if (book.loading) {
      return (
        <div className="flex items-center space-x-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-gray-500">Loading...</span>
        </div>
      );
    }
    
    return (
        <div>
          <h3 className="text-xl font-bold text-gray-800">{book.name}</h3>
          <p className="text-gray-600">Click to view journey</p>
        </div>
    );
  };

  return (
    <Link 
      to={`/book/${bookId}`} 
      className={`block bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-violet-100 hover:shadow-2xl transition-all duration-300 ${book.loading ? 'pointer-events-none' : ''}`}
    >
      <div className="flex items-center space-x-4">
        <BookOpen className="h-8 w-8 text-purple-500" />
        {renderContent()}
      </div>
    </Link>
  );
};

export default BookItem;
