import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { PlusCircle, Sparkles, BookOpen } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import BookCard from '@/components/BookCard';
import StatCard from '@/components/app/StatCard';

const Books = () => {
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
      <div className="flex justify-center items-center min-h-[60vh]">
        <p className="text-sm text-app-gray-600">Loading your books...</p>
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

  const totalBooks = books.length;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold text-app-gray-900 leading-tight">
              Your books
            </h1>
            <p className="mt-1 text-sm text-app-gray-600 leading-relaxed">
              Manage your stories, track your plan, and jump back into writing.
            </p>
          </div>
          <div className="flex justify-start sm:justify-end">
            <Button
              onClick={() => navigate('/create-book')}
              variant="appPrimary"
              className="inline-flex items-center gap-2 text-sm"
            >
              <PlusCircle className="h-4 w-4" />
              Create new book
            </Button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <StatCard
            label="Books"
            value={totalBooks}
            helper={totalBooks === 0 ? "Let's create your first story" : 'Books in your library'}
            icon={BookOpen}
          />
          <StatCard
            label="Stories created"
            value={totalBooks}
            helper="Free for everyone, forever"
            icon={Sparkles}
          />
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-app-gray-900">
              Library
            </h2>
            {books.length > 0 && (
              <p className="text-xs text-app-gray-600">
                Showing {books.length} {books.length === 1 ? 'book' : 'books'}
              </p>
            )}
          </div>

          {books.length === 0 ? (
            <div className="rounded-2xl border border-app-gray-100 bg-white shadow-appSoft px-6 py-8 text-center">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-app-iris/10 text-app-iris mb-3">
                <BookOpen className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-app-gray-900">
                No books yet
              </p>
              <p className="mt-1 text-xs text-app-gray-600 max-w-sm mx-auto">
                Create your first book to start capturing journeys, then come back here to manage them.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {books.map(book => (
                <BookCard
                  key={book.bookId}
                  bookId={book.bookId}
                  bookTitle={book.title}
                  coverImage={book.coverImage}
                  onBookDeleted={handleBookDeleted}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Books;
