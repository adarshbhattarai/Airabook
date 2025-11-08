import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, collection, getDocs, writeBatch, updateDoc, getDoc } from 'firebase/firestore';
import { firestore, storage } from '@/lib/firebase';
import { ref, deleteObject } from 'firebase/storage';
import { BookOpen, Loader2, Trash2, Eye, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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

const BookItem = ({ bookId, bookTitle, coverImage, onBookDeleted }) => {
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Use provided bookTitle or fallback
  const book = {
    name: bookTitle || 'Untitled Book',
    coverImage: coverImage || null,
  };

  const deleteBookAndSubCollections = async () => {
    setIsDeleting(true);
    setShowDeleteMenu(false);
    setConfirmOpen(false);

    try {
      // Get all chapters for this book
      const chaptersRef = collection(firestore, 'books', bookId, 'chapters');
      const chaptersSnap = await getDocs(chaptersRef);
      
      const batch = writeBatch(firestore);
      const storagePathsToDelete = [];

      // Process each chapter
      for (const chapterDoc of chaptersSnap.docs) {
        const chapterId = chapterDoc.id;
        
        // Get all pages for this chapter
        const pagesRef = collection(firestore, 'books', bookId, 'chapters', chapterId, 'pages');
        const pagesSnap = await getDocs(pagesRef);
        
        // Process each page and collect media storage paths
        for (const pageDoc of pagesSnap.docs) {
          const pageData = pageDoc.data();
          if (pageData.media && pageData.media.length > 0) {
            pageData.media.forEach(mediaItem => {
              if (mediaItem.storagePath) {
                storagePathsToDelete.push(mediaItem.storagePath);
              }
            });
          }
          // Add page to batch delete
          batch.delete(pageDoc.ref);
        }
        
        // Add chapter to batch delete
        batch.delete(chapterDoc.ref);
      }

      // Delete the main book document
      const bookRef = doc(firestore, 'books', bookId);
      batch.delete(bookRef);

      // Delete the album document
      const albumRef = doc(firestore, 'albums', bookId);
      batch.delete(albumRef);

      // Commit all Firestore deletions
      await batch.commit();

      // Delete all media files from storage
      if (storagePathsToDelete.length > 0) {
        const deletePromises = storagePathsToDelete.map(storagePath => {
          const mediaRef = ref(storage, storagePath);
          return deleteObject(mediaRef).catch(error => {
            console.warn(`Failed to delete media file ${storagePath}:`, error);
          });
        });
        await Promise.all(deletePromises);
      }

      // Remove book from user's accessibleBookIds and accessibleAlbums
      if (user) {
        try {
          const userRef = doc(firestore, 'users', user.uid);
          const userDoc = await getDoc(userRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            let accessibleBookIds = userData.accessibleBookIds || [];
            let accessibleAlbums = userData.accessibleAlbums || [];

            // Remove book from accessibleBookIds (handle both old and new formats)
            accessibleBookIds = accessibleBookIds.filter(item => {
              if (typeof item === 'string') {
                return item !== bookId;
              }
              return item.bookId !== bookId;
            });

            // Remove album from accessibleAlbums
            accessibleAlbums = accessibleAlbums.filter(item => item.id !== bookId);

            await updateDoc(userRef, {
              accessibleBookIds,
              accessibleAlbums,
            });
          }
        } catch (error) {
          console.warn('Failed to update user document after book deletion:', error);
          // Don't fail the whole operation if user update fails
        }
      }

      toast({
        title: 'Book Deleted',
        description: `"${book.name}" and all its content have been permanently deleted.`,
      });

      // Notify parent component to refresh the list
      if (onBookDeleted) {
        onBookDeleted(bookId);
      }

    } catch (error) {
      console.error('Error deleting book:', error);
      toast({
        title: 'Delete Error',
        description: 'Failed to delete the book. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const renderContent = () => {
    return (
        <div className="flex-1">
          <h3 className="text-xl font-bold text-gray-800">{book.name}</h3>
          <p className="text-gray-600">Click to view journey</p>
        </div>
    );
  };

  return (
    <div className={`relative bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-violet-100 hover:shadow-2xl transition-all duration-300 ${isDeleting ? 'pointer-events-none' : ''}`}>
    <Link 
      to={`/book/${bookId}`} 
        className="flex items-center space-x-4"
      >
        {book.coverImage ? (
          <img 
            src={convertToEmulatorURL(book.coverImage)} 
            alt={book.name}
            className="h-16 w-16 object-cover rounded-lg"
            onError={(e) => {
              console.error('Failed to load cover image:', book.coverImage);
              e.target.style.display = 'none';
            }}
          />
        ) : (
        <BookOpen className="h-8 w-8 text-purple-500" />
        )}
        {renderContent()}
      </Link>

      {/* Action Icons: View, Edit, Delete */}
      {!isDeleting && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center space-x-2">
          <Link to={`/book/${bookId}/view`} title="View">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                // allow navigation
                e.stopPropagation();
              }}
            >
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Edit"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigate(`/book/${bookId}`);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
            title="Delete"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirmOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
      
      {/* Loading overlay for delete */}
      {isDeleting && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-2xl flex items-center justify-center">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-5 w-5 animate-spin text-red-500" />
            <span className="text-red-500 font-medium">Deleting book...</span>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="w-full max-w-md p-6 bg-white rounded-2xl shadow-lg text-center">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-gray-800">Delete book?</DialogTitle>
            <DialogDescription className="mt-2 text-gray-600">
              This will permanently delete "{book.name}" and all its chapters, pages, and media. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6 flex justify-center space-x-4">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteBookAndSubCollections}>Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
  );
};

export default BookItem;
