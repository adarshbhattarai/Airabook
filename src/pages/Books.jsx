import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { PlusCircle, Sparkles, BookOpen } from 'lucide-react';
import BookCard from '@/components/BookCard';
import StatCard from '@/components/app/StatCard';
import AppLoader from '@/components/app/AppLoader';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';

const Books = () => {
  const { appUser, appLoading } = useAuth();
  const navigate = useNavigate();
  const [deletedBooks, setDeletedBooks] = useState(new Set());
  const [bookAccessRoleById, setBookAccessRoleById] = useState({});

  console.log('📚 Books Page Render:', {
    appLoading,
    hasAppUser: !!appUser,
    accessibleBookIds: appUser?.accessibleBookIds
  });

  // Extract bookIds from accessibleBookIds (handle both old string array and new object array)
  const books = useMemo(() => {
    if (appLoading || !appUser) return [];
    return (appUser.accessibleBookIds || []).map(item => {
      if (typeof item === 'string') {
        // Old format - return minimal object
        return { bookId: item, title: 'Untitled Book', coverImage: null, coverImageUrl: null };
      }
      // Normalize old/new object shapes
      return {
        ...item,
        title: item.title || item.babyName || 'Untitled Book',
        coverImage: item.coverImage || item.coverImageUrl || null,
      };
    }).filter(book => !deletedBooks.has(book.bookId));
  }, [appLoading, appUser, deletedBooks]);

  const getRoleFromBookItem = useCallback((bookItem) => {
    if (!bookItem) return null;
    if (bookItem.ownerId) {
      return bookItem.ownerId === appUser?.uid ? 'owned' : 'coauthored';
    }
    if (typeof bookItem.isOwner === 'boolean') {
      return bookItem.isOwner ? 'owned' : 'coauthored';
    }
    if (typeof bookItem.role === 'string') {
      const role = bookItem.role.toLowerCase();
      if (role.includes('owner')) return 'owned';
      if (role.includes('co')) return 'coauthored';
    }
    if (bookItem.members && appUser?.uid && bookItem.members[appUser.uid]) {
      return bookItem.members[appUser.uid] === 'Owner' ? 'owned' : 'coauthored';
    }
    return null;
  }, [appUser?.uid]);

  useEffect(() => {
    let cancelled = false;

    const classifyBooksByAccess = async () => {
      if (!appUser?.uid || books.length === 0) {
        setBookAccessRoleById({});
        return;
      }

      const entries = await Promise.all(books.map(async (bookItem) => {
        const roleFromItem = getRoleFromBookItem(bookItem);
        if (roleFromItem) {
          return [bookItem.bookId, roleFromItem];
        }

        try {
          const snap = await getDoc(doc(firestore, 'books', bookItem.bookId));
          if (!snap.exists()) {
            return [bookItem.bookId, 'owned'];
          }
          const data = snap.data() || {};
          const ownerId = data.ownerId || Object.entries(data.members || {}).find(([, role]) => role === 'Owner')?.[0] || null;
          return [bookItem.bookId, ownerId === appUser.uid ? 'owned' : 'coauthored'];
        } catch (error) {
          console.warn('Could not classify book access role:', bookItem.bookId, error);
          return [bookItem.bookId, 'owned'];
        }
      }));

      if (cancelled) return;
      setBookAccessRoleById(Object.fromEntries(entries));
    };

    classifyBooksByAccess();
    return () => {
      cancelled = true;
    };
  }, [appUser?.uid, books, getRoleFromBookItem]);

  const getBookRole = useCallback((bookItem) => {
    const roleFromItem = getRoleFromBookItem(bookItem);
    if (roleFromItem) return roleFromItem;
    return bookAccessRoleById[bookItem.bookId] || 'owned';
  }, [bookAccessRoleById, getRoleFromBookItem]);

  const ownedBooks = useMemo(
    () => books.filter((bookItem) => getBookRole(bookItem) === 'owned'),
    [books, getBookRole],
  );
  const coAuthoredBooks = useMemo(
    () => books.filter((bookItem) => getBookRole(bookItem) === 'coauthored'),
    [books, getBookRole],
  );

  const totalBooks = books.length;
  const ownedCount = ownedBooks.length;
  const coAuthoredCount = coAuthoredBooks.length;
  const currentPlanLabel = appUser?.billing?.planLabel || 'Free Explorer';

  // Redirect to create-book if user has no books
  useEffect(() => {
    if (!appLoading && appUser && books.length === 0) {
      navigate('/create-book', { replace: true });
    }
  }, [appLoading, appUser, books.length, navigate]);

  const handleBookDeleted = (bookId) => {
    setDeletedBooks(prev => new Set([...prev, bookId]));
  };

  // Show loader while app is loading
  if (appLoading || !appUser) {
    return <AppLoader />;
  }

  // If redirecting, don't render the empty state to avoid flash
  if (!appLoading && appUser && books.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <p className="text-sm text-app-gray-600">Redirecting to create your first book...</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold text-app-gray-900 leading-tight">
              Your books
            </h1>
            <p className="mt-1 text-sm text-app-gray-600 leading-relaxed">
              Manage your library and continue writing where you left off.
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
            helper={totalBooks === 0 ? 'Create your first book' : `${ownedCount} owned · ${coAuthoredCount} co-authored`}
            icon={BookOpen}
          />
          <StatCard
            label="Current plan"
            value={currentPlanLabel}
            helper={totalBooks === 0 ? 'You can create unlimited books' : 'Book access active'}
            icon={Sparkles}
          />
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-app-gray-900">Library</h2>
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
            <div className="space-y-8">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-app-gray-900">My Books</h3>
                  <p className="text-xs text-app-gray-600">{ownedCount} total</p>
                </div>
                {ownedBooks.length === 0 ? (
                  <p className="text-sm text-app-gray-600 rounded-xl border border-app-gray-100 bg-white px-4 py-3">
                    You have not created any books yet.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto pb-2">
                      <div className="flex gap-5 pr-2">
                        {ownedBooks.slice(0, 10).map((book) => (
                          <div key={book.bookId} className="w-[300px] min-w-[300px] shrink-0">
                            <BookCard
                              bookId={book.bookId}
                              bookTitle={book.title}
                              coverImage={book.coverImage || book.coverImageUrl}
                              onBookDeleted={handleBookDeleted}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    {ownedBooks.length > 10 && (
                      <p className="text-xs text-app-gray-600">Showing first 10 books in this section.</p>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-app-gray-900">Shared with me</h3>
                  <p className="text-xs text-app-gray-600">{coAuthoredCount} total</p>
                </div>
                {coAuthoredBooks.length === 0 ? (
                  <p className="text-sm text-app-gray-600 rounded-xl border border-app-gray-100 bg-white px-4 py-3">
                    No co-authored books yet.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto pb-2">
                      <div className="flex gap-5 pr-2">
                        {coAuthoredBooks.slice(0, 10).map((book) => (
                          <div key={book.bookId} className="w-[300px] min-w-[300px] shrink-0">
                            <BookCard
                              bookId={book.bookId}
                              bookTitle={book.title}
                              coverImage={book.coverImage || book.coverImageUrl}
                              onBookDeleted={handleBookDeleted}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    {coAuthoredBooks.length > 10 && (
                      <p className="text-xs text-app-gray-600">Showing first 10 books in this section.</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Books;
