import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, collection, getDocs, writeBatch, updateDoc, getDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { BookOpen, Loader2, Trash2, Eye, Pencil, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.jsx";

/**
 * Convert storage URL to emulator format if running in emulator mode
 */
const convertToEmulatorURL = (url) => {
    if (!url) return url;

    const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true';

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

const BookCard = ({ bookId, bookTitle, coverImage, onBookDeleted }) => {
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

    const initial = (book.name.charAt(0) || 'A').toUpperCase();

    const deleteBookAndSubCollections = async () => {
        setIsDeleting(true);
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

            // Commit all Firestore deletions
            await batch.commit();

            // Remove book from user's accessibleBookIds (keep albums/media intact)
            if (user) {
                try {
                    const userRef = doc(firestore, 'users', user.uid);
                    const userDoc = await getDoc(userRef);

                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        let accessibleBookIds = userData.accessibleBookIds || [];

                        // Remove book from accessibleBookIds (handle both old and new formats)
                        accessibleBookIds = accessibleBookIds.filter(item => {
                            if (typeof item === 'string') {
                                return item !== bookId;
                            }
                            return item.bookId !== bookId;
                        });

                        await updateDoc(userRef, {
                            accessibleBookIds,
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

    return (
        <>
            <div className={`group relative bg-white/70 backdrop-blur rounded-2xl shadow-appSoft border border-white/50 p-4 transition-all duration-300 hover:shadow-appCard hover:-translate-y-1 overflow-hidden matrix-surface ${isDeleting ? 'pointer-events-none opacity-50' : ''}`}>

                {/* Vibrant gradient background layers (like Preview) */}
                <div className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity duration-500 pointer-events-none">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-200 via-pink-200 to-transparent rounded-full blur-3xl transform translate-x-10 -translate-y-10" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-blue-200 via-violet-200 to-transparent rounded-full blur-3xl transform -translate-x-10 translate-y-10" />
                </div>

                {/* Content layer */}
                <div className="relative z-10 flex flex-col h-full">

                    {/* Header: Title & Menu */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="book-card-initial h-8 w-8 shrink-0 rounded-xl bg-app-mint text-app-navy flex items-center justify-center text-sm font-semibold shadow-sm">
                                {initial}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <h3 className="text-sm font-semibold text-app-gray-900 truncate pr-2" title={book.name}>
                                    {book.name}
                                </h3>
                                <span className="text-[10px] text-app-gray-500">
                                    Airäbook
                                </span>
                            </div>
                        </div>

                        {/* Dropdown Menu for Actions */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 text-app-gray-400 hover:text-app-gray-900">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => navigate(`/book/${bookId}/view`)} className="cursor-pointer">
                                    <Eye className="mr-2 h-4 w-4" />
                                    <span>View</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/book/${bookId}`)} className="cursor-pointer">
                                    <Pencil className="mr-2 h-4 w-4" />
                                    <span>Edit</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="book-delete-item text-red-600 focus:text-red-600 focus:bg-red-50 focus:font-medium cursor-pointer"
                                    onClick={() => setConfirmOpen(true)}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    <span>Delete</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    {/* Cover Image Area */}
                    <Link to={`/book/${bookId}/view`} className="block flex-1 relative group/image">
                        <div className="aspect-[3/4] w-full rounded-xl bg-gradient-to-br from-purple-50 via-white to-blue-50 border border-white/60 shadow-inner overflow-hidden relative matrix-surface-soft">
                            {book.coverImage ? (
                                <img
                                    src={convertToEmulatorURL(book.coverImage)}
                                    alt={book.name}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover/image:scale-105"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                    }}
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-app-iris/20">
                                    <BookOpen className="h-12 w-12" />
                                </div>
                            )}

                            {/* Hover Overlay */}
                            <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover/image:opacity-100">
                                <div className="book-open-cta bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm text-xs font-medium text-app-gray-900 transform translate-y-2 group-hover/image:translate-y-0 transition-transform duration-300">
                                    Open Book
                                </div>
                            </div>
                        </div>
                    </Link>

                </div>

                {/* Loading overlay for delete */}
                {isDeleting && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="flex items-center space-x-2">
                            <Loader2 className="h-5 w-5 animate-spin text-red-500" />
                            <span className="text-red-500 font-medium">Deleting...</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Confirmation Dialog */}
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="w-full max-w-md p-6 bg-white rounded-2xl shadow-lg text-center">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold text-gray-800">Delete book?</DialogTitle>
                        <DialogDescription className="mt-2 text-gray-600">
                            This will permanently delete "{book.name}" and all its chapters, pages, and media references. The media files will remain in your Assets Registry. To permanently delete the files and free up storage space, please remove them from the Assets Registry.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-6 flex justify-center space-x-4">
                        <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={deleteBookAndSubCollections}>Confirm</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default BookCard;
