import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import BookItem from '@/components/BookItem';

const Dashboard = () => {
  const { appUser, appLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deletedBooks, setDeletedBooks] = useState(new Set());

  useEffect(() => {
    // Check if user has any books (handle both old and new structure)
    const hasBooks = appUser?.accessibleBookIds && appUser.accessibleBookIds.length > 0;
    if (!appLoading && appUser && !hasBooks) {
      toast({
        title: "Welcome!",
        description: "Let's create your first baby book to get started.",
      });
      navigate('/create-book');
    }
  }, [appUser, appLoading, navigate, toast]);

  const handleBookDeleted = (bookId) => {
    setDeletedBooks(prev => new Set([...prev, bookId]));
  };

  if (appLoading || !appUser) {
    return (
        <div className="flex justify-center items-center min-h-screen">
            <p>Loading your dashboard...</p>
        </div>
    );
  }

  // Extract bookIds from accessibleBookIds (handle both old string array and new object array)
  const books = (appUser.accessibleBookIds || []).map(item => {
    if (typeof item === 'string') {
      // Old format - return minimal object
      return { bookId: item, title: 'Untitled Book', coverImage: null };
    }
    // New format - return full object
    return item;
  }).filter(book => !deletedBooks.has(book.bookId));

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-center mb-12">
            <Button onClick={() => navigate('/create-book')} className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white px-8 py-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 text-lg">
                <PlusCircle className="h-6 w-6 mr-3" />
                Create New Book
            </Button>
        </div>

        {books.length > 0 && (
            <div className="space-y-4">
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Your Books</h2>
                {books.map(book => (
                    <BookItem 
                      key={book.bookId} 
                      bookId={book.bookId}
                      bookTitle={book.title}
                      coverImage={book.coverImage}
                      onBookDeleted={handleBookDeleted}
                    />
                  ))}
            </div>
        )}

      </div>
    </div>
  );
};

export default Dashboard;
