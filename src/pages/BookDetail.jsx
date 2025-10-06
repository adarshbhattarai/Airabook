import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Textarea } from '@/components/ui/textarea.jsx';
import { Trash2, BookOpen, PlusCircle } from 'lucide-react';

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, description }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-lg border border-gray-200 text-center">
                <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
                <p className="mt-2 text-gray-600">{description}</p>
                <div className="mt-6 flex justify-center space-x-4">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="destructive" onClick={onConfirm}>
                        Confirm Delete
                    </Button>
                </div>
            </div>
        </div>
    );
};

const ChapterEditor = ({ bookId, chapter, onChapterUpdate }) => {
    const [notes, setNotes] = useState(chapter.notes || '');
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setNotes(chapter.notes || '');
    }, [chapter]);

    const handleSave = async () => {
        setIsSaving(true);
        const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapter.id);
        try {
            await updateDoc(chapterRef, { notes });
            onChapterUpdate({ ...chapter, notes });
            toast({ title: "Success", description: "Notes saved." });
        } catch (error) {
            console.error("Error saving notes: ", error);
            toast({ title: "Error", description: "Failed to save notes.", variant: "destructive" });
        }
        setIsSaving(false);
    };

    return (
        <div className="p-6 bg-white rounded-2xl shadow-lg border border-gray-200">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800">{chapter.title}</h2>
            </div>
            
            <div className="space-y-4">
                <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add your notes for this chapter..."
                        className="min-h-[200px]"
                    />
                </div>
                <div>
                    <label htmlFor="custom-description" className="block text-sm font-medium text-gray-700 mb-1">Custom Description</label>
                    <Input id="custom-description" placeholder="Add a custom description..." />
                </div>
                <div>
                    <label htmlFor="custom-note" className="block text-sm font-medium text-gray-700 mb-1">Custom Note</label>
                    <Input id="custom-note" placeholder="Add a custom note..." />
                </div>

                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Notes'}
                    </Button>
                </div>
            </div>
        </div>
    );
};


const BookDetail = () => {
  const { bookId } = useParams();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [chapterToDelete, setChapterToDelete] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchBookData = async () => {
      setLoading(true);
      try {
        const bookRef = doc(firestore, 'books', bookId);
        const bookSnap = await getDoc(bookRef);

        if (bookSnap.exists()) {
          setBook({ id: bookSnap.id, ...bookSnap.data() });
        } else {
          toast({ title: "Error", description: "Book not found.", variant: "destructive" });
          return;
        }

        const chaptersRef = collection(firestore, 'books', bookId, 'chapters');
        const chaptersSnap = await getDocs(chaptersRef);
        const chaptersList = chaptersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.order - b.order);
        setChapters(chaptersList);
        
        if (chaptersList.length > 0) {
            setSelectedChapterId(chaptersList[0].id);
        }

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
        order: chapters.length,
        createdAt: new Date(),
        notes: '',
      });

      const newChapter = { id: newChapterDoc.id, title: newChapterTitle, order: chapters.length, notes: '' };
      setChapters([...chapters, newChapter]);
      setSelectedChapterId(newChapter.id);
      setNewChapterTitle('');
      toast({ title: "Success!", description: `Chapter "${newChapterTitle}" created.` });

    } catch (error) {
      console.error("Error creating chapter: ", error);
      toast({ title: "Error", description: "Failed to create chapter.", variant: "destructive" });
    }
  };

  const handleChapterUpdate = (updatedChapter) => {
      setChapters(chapters.map(c => c.id === updatedChapter.id ? updatedChapter : c));
  };
  
  const handleDeleteClick = (e, chapter) => {
      e.stopPropagation();
      setChapterToDelete(chapter);
      setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
      if (chapterToDelete) {
          handleChapterDelete(chapterToDelete.id);
          setChapterToDelete(null);
      }
      setIsDeleteModalOpen(false);
  };

  const handleChapterDelete = async (chapterId) => {
      try {
          const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
          await deleteDoc(chapterRef);

          const updatedChapters = chapters.filter(c => c.id !== chapterId);
          setChapters(updatedChapters);
          
          if (selectedChapterId === chapterId) {
              setSelectedChapterId(updatedChapters.length > 0 ? updatedChapters[0].id : null);
          }

          toast({ title: "Success", description: "Chapter deleted." });
      } catch (error) {
          console.error("Error deleting chapter: ", error);
          toast({ title: "Error", description: "Failed to delete chapter.", variant: "destructive" });
      }
  };
  
  const selectedChapter = chapters.find(c => c.id === selectedChapterId);

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading book...</div>;
  }

  if (!book) {
    return <div className="flex justify-center items-center min-h-screen">Book not found.</div>;
  }

  return (
    <>
      <ConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleConfirmDelete}
          title={`Delete "${chapterToDelete?.title}"?`}
          description="This action cannot be undone. All content within this chapter will be permanently lost."
      />
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-extrabold text-center text-gray-900 mb-8">
          {book.babyName}'s Journey
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 flex flex-col space-y-6">
              <form onSubmit={handleCreateChapter} className="flex items-center space-x-2">
                  <Input 
                  type="text"
                  value={newChapterTitle}
                  onChange={(e) => setNewChapterTitle(e.target.value)}
                  placeholder="New chapter title..."
                  className="flex-grow"
                  />
                  <Button type="submit" size="icon"><PlusCircle className="h-4 w-4"/></Button>
              </form>

              <div className="p-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-violet-100 flex-grow">
                  <h2 className="text-xl font-bold text-gray-800 mb-4">Chapters</h2>
                  <div className="space-y-2">
                      {chapters.length > 0 ? (
                          chapters.map(chapter => (
                              <div 
                                  key={chapter.id} 
                                  onClick={() => setSelectedChapterId(chapter.id)}
                                  className={`w-full text-left p-3 rounded-lg transition-colors flex items-center justify-between cursor-pointer ${selectedChapterId === chapter.id ? 'bg-violet-200 text-violet-900' : 'hover:bg-violet-100'}`}
                              >
                                  <span className="font-medium">{chapter.title}</span>
                                  {selectedChapterId === chapter.id && (
                                      <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          onClick={(e) => handleDeleteClick(e, chapter)}
                                          className="hover:bg-red-200"
                                      >
                                          <Trash2 className="h-5 w-5 text-red-500" />
                                      </Button>
                                  )}
                              </div>
                          ))
                      ) : (
                          <p className="text-gray-500 text-sm p-3">No chapters yet. Create one above to get started!</p>
                      )}
                  </div>
              </div>
          </div>

          <div className="lg:col-span-2">
              {selectedChapter ? (
                  <ChapterEditor 
                      bookId={bookId} 
                      chapter={selectedChapter} 
                      onChapterUpdate={handleChapterUpdate}
                  />
              ) : (
                  <div className="flex flex-col justify-center items-center text-center h-full p-6 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-violet-100">
                      <BookOpen className="h-16 w-16 text-gray-400 mb-4"/>
                      <h2 className="text-xl font-semibold text-gray-700">Select a chapter</h2>
                      <p className="mt-2 text-gray-500 max-w-xs">Select a chapter from the list on the left to view or edit its content. If there are no chapters, create one to begin.</p>
                  </div>
              )}
          </div>
        </div>
      </div>
    </>
  );
};

export default BookDetail;
