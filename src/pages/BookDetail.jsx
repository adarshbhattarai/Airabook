import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
    doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, writeBatch, query, orderBy, arrayUnion, arrayRemove
} from 'firebase/firestore';
import { firestore, storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Textarea } from '@/components/ui/textarea.jsx';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import {
    Trash2, PlusCircle, ChevronRight, ChevronDown, ArrowLeft, ArrowRight, ImagePlus, GripVertical, MoreVertical, UploadCloud, X
} from 'lucide-react';

// --- UTILITY FOR FRACTIONAL INDEXING ---
const getMidpointString = (prev = '', next = '') => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    let p = 0;
    while (p < prev.length || p < next.length) {
        const prevChar = prev.charAt(p) || 'a';
        const nextChar = next.charAt(p) || 'z';
        if (prevChar !== nextChar) {
            const prevIndex = alphabet.indexOf(prevChar);
            const nextIndex = alphabet.indexOf(nextChar);
            if (nextIndex - prevIndex > 1) {
                const midIndex = Math.round((prevIndex + nextIndex) / 2);
                return prev.substring(0, p) + alphabet[midIndex];
            }
        }
        p++;
    }
    return prev + 'm';
};


// --- REUSABLE UI COMPONENTS ---

const HoverDeleteMenu = ({ onDelete }) => {
    const [isOpen, setIsOpen] = useState(false);

    const handleDeleteClick = (e) => {
        e.stopPropagation();
        onDelete();
        setIsOpen(false);
    };

    return (
        <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 data-[state=open]:bg-violet-100"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                onBlur={() => setTimeout(() => setIsOpen(false), 100)} // Delay to allow click
            >
                <MoreVertical className="h-4 w-4" />
            </Button>
            {isOpen && (
                <div className="absolute right-0 mt-1 w-28 bg-white rounded-md shadow-lg z-20 border">
                    <Button
                        variant="ghost"
                        className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700 text-sm px-2 py-1.5"
                        onClick={handleDeleteClick}
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                    </Button>
                </div>
            )}
        </div>
    );
};

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, description }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-lg text-center">
                <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
                <p className="mt-2 text-gray-600">{description}</p>
                <div className="mt-6 flex justify-center space-x-4">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button variant="destructive" onClick={onConfirm}>Confirm</Button>
                </div>
            </div>
        </div>
    );
};

const PageEditor = ({ bookId, chapterId, page, onPageUpdate, onAddPage, onNavigate, pageIndex, totalPages }) => {
    const [note, setNote] = useState(page.note || '');
    const [isSaving, setIsSaving] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({});
    const { user } = useAuth();
    const { toast } = useToast();
    const fileInputRef = useRef(null);

    useEffect(() => {
        setNote(page.note || '');
    }, [page]);
    
    const handleSave = async () => {
        setIsSaving(true);
        const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', page.id);
        const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
        const shortNote = note.substring(0, 40) + (note.length > 40 ? '...' : '');

        try {
            await updateDoc(pageRef, { note });
            onPageUpdate({ ...page, note, shortNote }); // Also update shortNote in local state
            toast({ title: "Success", description: "Page saved." });
        } catch (error) {
            toast({ title: "Error", description: "Failed to save page.", variant: "destructive" });
        }
        setIsSaving(false);
    };

    const handleFileSelect = (event) => {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;
        
        const currentMediaCount = page.media?.length || 0;
        if (currentMediaCount + files.length > 5) {
            toast({ title: "Upload Limit Exceeded", description: `You can only upload up to 5 media items per page. You have ${currentMediaCount} already.`, variant: "destructive" });
            return;
        }
        
        files.forEach(file => handleUpload(file));
    };

    const handleUpload = (file) => {
        if (!file || !user) return;

        const mediaType = file.type.startsWith('video') ? 'video' : 'image';
        const uniqueFileName = `${Date.now()}_${file.name}`;
        const storagePath = `${user.uid}/${bookId}/${chapterId}/${page.id}/media/${mediaType}/${uniqueFileName}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(prev => ({...prev, [file.name]: progress}));
            },
            (error) => {
                toast({ title: "Upload Error", description: error.message, variant: "destructive" });
                setUploadProgress(prev => { const newState = {...prev}; delete newState[file.name]; return newState; });
            },
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then(async (downloadURL) => {
                    const newMediaItem = {
                        url: downloadURL,
                        storagePath: storagePath,
                        type: mediaType,
                        name: file.name,
                        uploadedAt: new Date().toISOString()
                    };
                    const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', page.id);
                    await updateDoc(pageRef, { media: arrayUnion(newMediaItem) });
                    onPageUpdate({ ...page, media: [...(page.media || []), newMediaItem] });
                    setUploadProgress(prev => { const newState = {...prev}; delete newState[file.name]; return newState; });
                    toast({ title: "Upload Success", description: `"${file.name}" has been uploaded.` });
                });
            }
        );
    };
    
    const handleMediaDelete = async (mediaItemToDelete) => {
        if (!window.confirm(`Are you sure you want to delete "${mediaItemToDelete.name}"?`)) return;

        // 1. Delete from Firebase Storage
        const storageRef = ref(storage, mediaItemToDelete.storagePath);
        try {
            await deleteObject(storageRef);
        } catch (error) {
            toast({ title: "Deletion Error", description: "Could not delete file from storage.", variant: "destructive" });
            return; // Stop if storage deletion fails
        }

        // 2. Delete from Firestore document
        const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', page.id);
        try {
            await updateDoc(pageRef, { media: arrayRemove(mediaItemToDelete) });
            onPageUpdate({ ...page, media: page.media.filter(m => m.storagePath !== mediaItemToDelete.storagePath) });
            toast({ title: "Success", description: "Media deleted." });
        } catch (error) {
            toast({ title: "Deletion Error", description: "Could not update page details.", variant: "destructive" });
        }
    };


    return (
        <div className="p-6 bg-white rounded-2xl shadow-lg border border-gray-200 flex flex-col h-full">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Page {pageIndex + 1}</h2>
             <input type="file" multiple accept="image/*,video/*" ref={fileInputRef} onChange={handleFileSelect} className="hidden"/>
            <div 
                className="mb-4 p-4 border-2 border-dashed rounded-lg flex flex-col justify-center items-center bg-gray-50 text-gray-500 cursor-pointer hover:bg-violet-50 hover:border-violet-400 transition-colors"
                onClick={() => fileInputRef.current.click()}
            >
                {(!page.media || page.media.length === 0) && Object.keys(uploadProgress).length === 0 && (
                     <div className="text-center">
                        <UploadCloud className="h-10 w-10 mx-auto mb-2"/>
                        <p className="font-semibold">Click to upload media</p>
                        <p className="text-xs">Up to 5 images or videos</p>
                    </div>
                )}
                
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 w-full">
                    {page.media?.map(media => (
                        <div key={media.storagePath} className="relative group aspect-square bg-gray-200 rounded-md overflow-hidden">
                             {media.type === 'image' ? (
                                <img src={media.url} alt={media.name} className="w-full h-full object-cover"/>
                            ) : (
                                <video src={media.url} className="w-full h-full object-cover" />
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center items-center">
                                <Button variant="destructive" size="icon" className="h-8 w-8" onClick={(e) => {e.stopPropagation(); handleMediaDelete(media);}}><Trash2 className="h-4 w-4"/></Button>
                            </div>
                        </div>
                    ))}
                    {Object.entries(uploadProgress).map(([name, progress]) => (
                        <div key={name} className="relative aspect-square bg-gray-200 rounded-md flex flex-col justify-center items-center text-xs p-1">
                           <p className="font-semibold truncate w-full text-center">{name}</p>
                           <div className="w-full bg-gray-300 rounded-full h-1.5 mt-1">
                               <div className="bg-violet-600 h-1.5 rounded-full" style={{width: `${progress}%`}}></div>
                           </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="space-y-4 flex-grow flex flex-col">
                <div className="flex-grow flex flex-col">
                    <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add notes for this page..." className="min-h-[200px] flex-grow"/>
                </div>
                <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                        <Button variant="outline" size="icon" onClick={() => onNavigate('prev')} disabled={pageIndex === 0}><ArrowLeft className="h-4 w-4"/></Button>
                        <span className="text-sm font-medium text-gray-600">Page {pageIndex + 1} of {totalPages}</span>
                        <Button variant="outline" size="icon" onClick={() => onNavigate('next')} disabled={pageIndex === totalPages - 1}><ArrowRight className="h-4 w-4"/></Button>
                    </div>
                     <div className="flex items-center space-x-2">
                        <Button variant="secondary" onClick={onAddPage}><PlusCircle className="h-4 w-4 mr-2"/>Add New Page</Button>
                        <Button onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Page'}</Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

const BookDetail = () => {
    const { bookId } = useParams();
    const { user } = useAuth();
    const [book, setBook] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [pages, setPages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newChapterTitle, setNewChapterTitle] = useState('');
    const [selectedChapterId, setSelectedChapterId] = useState(null);
    const [selectedPageId, setSelectedPageId] = useState(null);
    const [expandedChapters, setExpandedChapters] = useState(new Set());
    const [modalState, setModalState] = useState({ isOpen: false });
    const { toast } = useToast();

    const fetchChapters = useCallback(async () => {
        if (!bookId) return;
        const chaptersRef = collection(firestore, 'books', bookId, 'chapters');
        const q = query(chaptersRef, orderBy('order'));
        const chaptersSnap = await getDocs(q);
        const chaptersList = chaptersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setChapters(chaptersList);
        if (chaptersList.length > 0 && !selectedChapterId) {
            const firstChapterId = chaptersList[0].id;
            setSelectedChapterId(firstChapterId);
            setExpandedChapters(new Set([firstChapterId]));
        }
    }, [bookId, selectedChapterId]);

    const fetchPages = useCallback(async (chapterId) => {
        if (!chapterId || !bookId) return;
        const pagesRef = collection(firestore, 'books', bookId, 'chapters', chapterId, 'pages');
        const q = query(pagesRef, orderBy('order'));
        const pagesSnap = await getDocs(q);
        const pagesList = pagesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPages(pagesList);
        if (pagesList.length > 0) {
            setSelectedPageId(p => pagesList.some(pg => pg.id === p) ? p : pagesList[0].id);
        } else {
            setSelectedPageId(null);
        }
    }, [bookId]);

    useEffect(() => {
        const fetchBookData = async () => {
            if (!bookId) return;
            setLoading(true);
            const bookRef = doc(firestore, 'books', bookId);
            const bookSnap = await getDoc(bookRef);
            if (bookSnap.exists()) setBook({ id: bookSnap.id, ...bookSnap.data() });
            await fetchChapters();
            setLoading(false);
        };
        fetchBookData();
    }, [bookId, fetchChapters]);

    useEffect(() => { fetchPages(selectedChapterId) }, [selectedChapterId, fetchPages]);

    const openDeleteModal = (type, data) => {
        setModalState({
            isOpen: true,
            type,
            data,
            title: `Delete ${type}?`,
            description: type === 'chapter'
                ? `Are you sure you want to permanently delete "${data.title}" and all its pages? This action cannot be undone.`
                : `Are you sure you want to permanently delete this page? This action cannot be undone.`
        });
    };
    const closeModal = () => setModalState({ isOpen: false });

    const handleConfirmDelete = async () => {
        const { type, data } = modalState;
        if (type === 'chapter') await handleDeleteChapter(data.id);
        else if (type === 'page') await handleDeletePage(data.chapterId, data.pageId, data.pageIndex);
        closeModal();
    };

    const handleDeleteChapter = async (chapterId) => {
        // This is complex: requires deleting all pages and their media.
        // For now, we'll just delete the chapter doc. A more robust solution would use a cloud function.
        toast({ title: "Deleting Chapter...", description: "This may take a moment." });
        const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
        
        // You should also delete subcollections (pages) and their media.
        // This is best handled by a Firebase Cloud Function for atomicity and reliability.
        await deleteDoc(chapterRef);

        toast({ title: "Success", description: "Chapter has been deleted." });
        fetchChapters(); // Re-fetch all chapters
    };

    const handleDeletePage = async (chapterId, pageId, pageIndex) => {
        // 1. Get the page document to find associated media files
        const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', pageId);
        const pageSnap = await getDoc(pageRef);
        
        if (pageSnap.exists()) {
            const pageData = pageSnap.data();
            // 2. Delete all media from Storage
            if (pageData.media && pageData.media.length > 0) {
                const deletePromises = pageData.media.map(mediaItem => {
                    const mediaRef = ref(storage, mediaItem.storagePath);
                    return deleteObject(mediaRef);
                });
                try {
                    await Promise.all(deletePromises);
                    toast({ title: "Media Cleaned", description: "Associated media files deleted." });
                } catch (error) {
                    toast({ title: "Storage Error", description: "Could not delete all associated media. Please check storage.", variant: "destructive" });
                    // We can choose to continue or stop here. For now, we'll continue.
                }
            }
        }
    
        // 3. Delete the page document and update summary in a batch
        const batch = writeBatch(firestore);
        batch.delete(pageRef);
    
        const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
        const chapter = chapters.find(c => c.id === chapterId);
        if (chapter) {
            const updatedPagesSummary = chapter.pagesSummary.filter(p => p.pageId !== pageId);
            batch.update(chapterRef, { pagesSummary: updatedPagesSummary });
        }
        
        await batch.commit();
        toast({ title: "Page has been deleted" });

        // 4. Update local state to reflect the deletion
        const newPages = pages.filter(p => p.id !== pageId);
        setPages(newPages);
        
        const newChapters = chapters.map(c => c.id === chapterId ? { ...c, pagesSummary: c.pagesSummary.filter(p => p.pageId !== pageId)} : c);
        setChapters(newChapters);

        // 5. Select a new page to view
        if (newPages.length > 0) {
             const newIndex = Math.max(0, pageIndex - 1);
             setSelectedPageId(newPages[newIndex].id);
        } else {
             setSelectedPageId(null);
        }
    };
    
    const onDragEnd = async (result) => {
        // ... (existing logic is fine)
    };
    
    const handleCreateChapter = async (e) => {
        e.preventDefault();
        if (!newChapterTitle.trim() || !user) return;
        const newOrder = getMidpointString(chapters[chapters.length - 1]?.order);
        const newChapterData = { title: newChapterTitle, order: newOrder, pagesSummary: [], createdAt: new Date(), ownerId: user.uid };
        const newChapterDoc = await addDoc(collection(firestore, 'books', bookId, 'chapters'), newChapterData);
        setChapters([...chapters, { ...newChapterData, id: newChapterDoc.id }]);
        setNewChapterTitle('');
    };

    const handleAddPage = async () => {
        if (!selectedChapterId) return;
        const newOrder = getMidpointString(pages[pages.length - 1]?.order);
        const newPageData = { note: '', media: [], createdAt: new Date(), order: newOrder };
        
        const pageRef = await addDoc(collection(firestore, 'books', bookId, 'chapters', selectedChapterId, 'pages'), newPageData);
        
        const newPageSummary = { pageId: pageRef.id, shortNote: 'New Page', order: newOrder };
        const chapterRef = doc(firestore, 'books', bookId, 'chapters', selectedChapterId);
        await updateDoc(chapterRef, { pagesSummary: arrayUnion(newPageSummary) });

        const newPage = { id: pageRef.id, ...newPageData };
        setPages([...pages, newPage].sort((a,b) => a.order.localeCompare(b.order)));
        setSelectedPageId(newPage.id);
        setChapters(chapters.map(c => c.id === selectedChapterId ? { ...c, pagesSummary: [...(c.pagesSummary || []), newPageSummary].sort((a,b) => a.order.localeCompare(b.order)) } : c));
        toast({title: "New Page Added"});
    };
    
    const handlePageUpdate = (updatedPage) => {
        setPages(pages.map(p => p.id === updatedPage.id ? updatedPage : p));
        if (updatedPage.shortNote) {
             const chapter = chapters.find(c => c.id === selectedChapterId);
             if (chapter) {
                const updatedPagesSummary = chapter.pagesSummary.map(p => p.pageId === updatedPage.id ? { ...p, shortNote: updatedPage.shortNote } : p);
                setChapters(chapters.map(c => c.id === selectedChapterId ? { ...c, pagesSummary: updatedPagesSummary } : c));
             }
        }
    };

    if (loading) return <div className="flex justify-center items-center min-h-screen">Loading book...</div>;

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <ConfirmationModal {...modalState} onClose={closeModal} onConfirm={handleConfirmDelete} />
            <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
                <h1 className="text-4xl font-extrabold text-center text-gray-900 mb-8">{book?.babyName}'s Journey</h1>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" style={{ minHeight: '70vh' }}>
                    <div className="lg:col-span-1 flex flex-col space-y-6">
                        <form onSubmit={handleCreateChapter} className="flex items-center space-x-2">
                            <Input value={newChapterTitle} onChange={(e) => setNewChapterTitle(e.target.value)} placeholder="New chapter title..."/>
                            <Button type="submit" size="icon"><PlusCircle className="h-4 w-4"/></Button>
                        </form>
                        <div className="p-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border flex-grow">
                            <h2 className="text-xl font-bold text-gray-800 mb-4">Content</h2>
                            <div className="space-y-1">
                                {chapters.sort((a,b) => a.order.localeCompare(b.order)).map(chapter => (
                                    <div key={chapter.id} className="group">
                                        <div onClick={() => { setSelectedChapterId(chapter.id); setExpandedChapters(new Set([chapter.id])); }} className={`w-full text-left p-3 rounded-lg flex items-center justify-between cursor-pointer ${selectedChapterId === chapter.id ? 'bg-violet-200 text-violet-900' : 'hover:bg-violet-100'}`}>
                                            <div className="flex items-center shrink-0">
                                                 <HoverDeleteMenu onDelete={() => openDeleteModal('chapter', chapter)} />
                                                 <span className="font-medium truncate pr-2 ml-1">{chapter.title}</span>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); const newSet = new Set(expandedChapters); newSet.has(chapter.id) ? newSet.delete(chapter.id) : newSet.add(chapter.id); setExpandedChapters(newSet);}}>
                                                {expandedChapters.has(chapter.id) ? <ChevronDown className="h-5 w-5"/> : <ChevronRight className="h-5 w-5"/>}
                                            </Button>
                                        </div>
                                        {expandedChapters.has(chapter.id) && (
                                            <Droppable droppableId={chapter.id} type="PAGE">
                                                {(provided) => (
                                                    <div ref={provided.innerRef} {...provided.droppableProps} className="ml-4 pl-4 border-l-2 border-violet-200 py-1 space-y-1">
                                                        {chapter.pagesSummary?.length > 0 ? chapter.pagesSummary.map((pageSummary, index) => (
                                                            <Draggable key={pageSummary.pageId} draggableId={pageSummary.pageId} index={index}>
                                                                {(provided) => (
                                                                    <div ref={provided.innerRef} {...provided.draggableProps} className={`group w-full text-left p-2 rounded-md text-sm flex items-center justify-between cursor-pointer ${selectedPageId === pageSummary.pageId ? 'bg-violet-100 text-violet-800' : 'hover:bg-gray-100'}`}>
                                                                        <div {...provided.dragHandleProps} onClick={() => { setSelectedChapterId(chapter.id); setSelectedPageId(pageSummary.pageId);}} className="flex items-center truncate">
                                                                            <GripVertical className="h-4 w-4 mr-2 text-gray-400 shrink-0"/>
                                                                            <span className="truncate">{pageSummary.shortNote || 'Untitled Page'}</span>
                                                                        </div>
                                                                        <HoverDeleteMenu onDelete={() => openDeleteModal('page', { ...pageSummary, chapterId: chapter.id, pageIndex: index })} />
                                                                    </div>
                                                                )}
                                                            </Draggable>
                                                        )) : <div className="p-2 text-xs text-gray-500">No pages yet.</div>}
                                                        {provided.placeholder}
                                                    </div>
                                                )}
                                            </Droppable>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2">
                        {selectedPageId && pages.find(p => p.id === selectedPageId) ? (
                            <PageEditor 
                                bookId={bookId} 
                                chapterId={selectedChapterId} 
                                page={pages.find(p => p.id === selectedPageId)} 
                                onPageUpdate={handlePageUpdate} 
                                onAddPage={handleAddPage} 
                                onNavigate={(dir) => {
                                    const currentIndex = pages.findIndex(p => p.id === selectedPageId);
                                    if (dir === 'next' && currentIndex < pages.length - 1) setSelectedPageId(pages[currentIndex + 1].id);
                                    else if (dir === 'prev' && currentIndex > 0) setSelectedPageId(pages[currentIndex - 1].id);
                                }} 
                                pageIndex={pages.findIndex(p => p.id === selectedPageId)} 
                                totalPages={pages.length}
                            />
                        ) : (
                            <div className="flex flex-col justify-center items-center text-center h-full p-6 bg-white/80 rounded-2xl shadow-lg">
                                <h2 className="text-xl font-semibold text-gray-700">{selectedChapterId ? 'Select a page or create one' : 'Select a chapter'}</h2>
                                <p className="mt-2 text-gray-500 max-w-xs">{selectedChapterId ? 'Click "Add New Page" to get started.' : 'Select a chapter from the list to view its pages.'}</p>

                                {selectedChapterId && <Button onClick={handleAddPage} className="mt-4"><PlusCircle className="h-4 w-4 mr-2"/>Add Page</Button>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DragDropContext>
    );
};

export default BookDetail;
