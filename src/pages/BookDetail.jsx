
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
    doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, writeBatch, query, orderBy
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Textarea } from '@/components/ui/textarea.jsx';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import {
    Trash2, PlusCircle, ChevronRight, ChevronDown, ArrowLeft, ArrowRight, ImagePlus, GripVertical, MoreVertical
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
    const { toast } = useToast();

    useEffect(() => {
        setNote(page.note || '');
    }, [page]);

    const handleSave = async () => {
        setIsSaving(true);
        const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', page.id);
        const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
        const shortNote = note.substring(0, 40) + (note.length > 40 ? '...' : '');

        try {
            const batch = writeBatch(firestore);
            batch.update(pageRef, { note });

            const chapterSnap = await getDoc(chapterRef);
            if (chapterSnap.exists()) {
                const pagesSummary = chapterSnap.data().pagesSummary?.map(p =>
                    p.pageId === page.id ? { ...p, shortNote } : p
                ) || [];
                batch.update(chapterRef, { pagesSummary });
            }
            await batch.commit();
            onPageUpdate({ ...page, note, shortNote });
            toast({ title: "Success", description: "Page saved." });
        } catch (error) {
            toast({ title: "Error", description: "Failed to save page.", variant: "destructive" });
        }
        setIsSaving(false);
    };

    return (
        <div className="p-6 bg-white rounded-2xl shadow-lg border border-gray-200 flex flex-col h-full">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Page {pageIndex + 1}</h2>
            <div className="mb-4 p-4 border-2 border-dashed rounded-lg h-48 flex flex-col justify-center items-center bg-gray-50 text-gray-500">
                {page.mediaUrl ? (
                    <img src={page.mediaUrl} alt="Page media" className="max-h-full max-w-full object-contain rounded"/>
                ) : (
                    <><ImagePlus className="h-10 w-10 mb-2"/><Button variant="outline" size="sm">Upload Media</Button></>
                )}
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
        if (!chapterId) return;
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
        else if (type === 'page') await handleDeletePage(data.chapterId, data.pageId);
    };

    const handleDeleteChapter = async (chapterId) => {
        const batch = writeBatch(firestore);
        const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
        const pagesRef = collection(firestore, 'books', bookId, 'chapters', chapterId, 'pages');
        const pagesSnap = await getDocs(pagesRef);
        pagesSnap.forEach(pageDoc => batch.delete(pageDoc.ref));
        batch.delete(chapterRef);
        await batch.commit();

        toast({ title: "Success", description: "Chapter and all its pages have been deleted." });
        const newChapters = chapters.filter(c => c.id !== chapterId);
        setChapters(newChapters);
        if (selectedChapterId === chapterId) {
            setSelectedChapterId(newChapters[0]?.id || null);
        }
        closeModal();
    };

    const handleDeletePage = async (chapterId, pageId) => {
        const batch = writeBatch(firestore);
        const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', pageId);
        const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
        const chapter = chapters.find(c => c.id === chapterId);
        const updatedPagesSummary = chapter.pagesSummary.filter(p => p.pageId !== pageId);
        
        batch.delete(pageRef);
        batch.update(chapterRef, { pagesSummary: updatedPagesSummary });
        await batch.commit();

        toast({ title: "Success", description: "Page deleted." });
        setChapters(chapters.map(c => c.id === chapterId ? { ...c, pagesSummary: updatedPagesSummary } : c));
        if (selectedChapterId === chapterId) {
            setPages(pages.filter(p => p.id !== pageId));
        }
        closeModal();
    };
    
    const onDragEnd = async (result) => {
        const { destination, source, draggableId } = result;
        if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) return;

        const chapterId = source.droppableId;
        const chapter = chapters.find(c => c.id === chapterId);
        if (!chapter) return;

        let summary = Array.from(chapter.pagesSummary);
        const [movedItem] = summary.splice(source.index, 1);
        summary.splice(destination.index, 0, movedItem);

        const newOrder = getMidpointString(summary[destination.index - 1]?.order, summary[destination.index + 1]?.order);
        summary[destination.index] = { ...movedItem, order: newOrder };

        const batch = writeBatch(firestore);
        batch.update(doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', draggableId), { order: newOrder });
        batch.update(doc(firestore, 'books', bookId, 'chapters', chapterId), { pagesSummary: summary });
        await batch.commit();

        setChapters(chapters.map(c => c.id === chapterId ? { ...c, pagesSummary: summary } : c));
        if (chapterId === selectedChapterId) fetchPages(chapterId);
        toast({ title: "Success", description: "Page order updated." });
    };
    
    // Other handlers (create chapter, add page, etc.) remain largely the same.
    const handleCreateChapter = async (e) => {
        e.preventDefault();
        if (!newChapterTitle.trim()) return;
        const newOrder = getMidpointString(chapters[chapters.length - 1]?.order);
        const newChapterData = { title: newChapterTitle, order: newOrder, pagesSummary: [], createdAt: new Date() };
        const newChapterDoc = await addDoc(collection(firestore, 'books', bookId, 'chapters'), newChapterData);
        setChapters([...chapters, { ...newChapterData, id: newChapterDoc.id }]);
        setNewChapterTitle('');
    };

    const handleAddPage = async () => {
        if (!selectedChapterId) return;
        const newOrder = getMidpointString(pages[pages.length - 1]?.order);
        const newPageData = { note: 'New Page', mediaUrl: null, createdAt: new Date(), order: newOrder };
        const shortNote = newPageData.note.substring(0, 40);

        const batch = writeBatch(firestore);
        const pageRef = doc(collection(firestore, 'books', bookId, 'chapters', selectedChapterId, 'pages'));
        batch.set(pageRef, newPageData);

        const chapterRef = doc(firestore, 'books', bookId, 'chapters', selectedChapterId);
        const newPageSummary = { pageId: pageRef.id, shortNote, order: newOrder };
        const chapter = chapters.find(c => c.id === selectedChapterId);
        const updatedPagesSummary = [...(chapter.pagesSummary || []), newPageSummary].sort((a,b) => a.order.localeCompare(b.order));
        batch.update(chapterRef, { pagesSummary: updatedPagesSummary });
        
        await batch.commit();
        
        const newPage = { id: pageRef.id, ...newPageData };
        setPages([...pages, newPage]);
        setSelectedPageId(newPage.id);
        setChapters(chapters.map(c => c.id === selectedChapterId ? { ...c, pagesSummary: updatedPagesSummary } : c));
    };
    
    const handlePageUpdate = (updatedPage) => {
        setPages(pages.map(p => p.id === updatedPage.id ? updatedPage : p));
        const chapter = chapters.find(c => c.id === selectedChapterId);
        const updatedPagesSummary = chapter.pagesSummary.map(p => p.pageId === updatedPage.id ? { ...p, shortNote: updatedPage.shortNote } : p);
        setChapters(chapters.map(c => c.id === selectedChapterId ? { ...c, pagesSummary: updatedPagesSummary } : c));
    };

    // --- RENDER LOGIC ---
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
                                {chapters.map(chapter => (
                                    <div key={chapter.id} className="group">
                                        <div onClick={() => setSelectedChapterId(chapter.id)} className={`w-full text-left p-3 rounded-lg flex items-center justify-between cursor-pointer ${selectedChapterId === chapter.id ? 'bg-violet-200 text-violet-900' : 'hover:bg-violet-100'}`}>
                                            <span className="font-medium truncate pr-2">{chapter.title}</span>
                                            <div className="flex items-center shrink-0">
                                                 <HoverDeleteMenu onDelete={() => openDeleteModal('chapter', chapter)} />
                                                 <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); const newSet = new Set(expandedChapters); newSet.has(chapter.id) ? newSet.delete(chapter.id) : newSet.add(chapter.id); setExpandedChapters(newSet);}}>
                                                    {expandedChapters.has(chapter.id) ? <ChevronDown className="h-5 w-5"/> : <ChevronRight className="h-5 w-5"/>}
                                                </Button>
                                            </div>
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
                                                                        <HoverDeleteMenu onDelete={() => openDeleteModal('page', { ...pageSummary, chapterId: chapter.id })} />
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
                            <PageEditor bookId={bookId} chapterId={selectedChapterId} page={pages.find(p => p.id === selectedPageId)} onPageUpdate={handlePageUpdate} onAddPage={handleAddPage} onNavigate={(dir) => {
                                const currentIndex = pages.findIndex(p => p.id === selectedPageId);
                                if (dir === 'next' && currentIndex < pages.length - 1) setSelectedPageId(pages[currentIndex + 1].id);
                                else if (dir === 'prev' && currentIndex > 0) setSelectedPageId(pages[currentIndex - 1].id);
                            }} pageIndex={pages.findIndex(p => p.id === selectedPageId)} totalPages={pages.length}/>
                        ) : (
                            <div className="flex flex-col justify-center items-center text-center h-full p-6 bg-white/80 rounded-2xl shadow-lg">
                                <h2 className="text-xl font-semibold text-gray-700">{selectedChapterId ? 'No pages in this chapter' : 'Select a chapter'}</h2>
                                <p className="mt-2 text-gray-500 max-w-xs">{selectedChapterId ? 'Click "Add New Page" to get started.' : 'Select a chapter from the list to view its pages.'}</p>
                                {selectedChapterId && <Button onClick={handleAddPage} className="mt-4"><PlusCircle className="h-4 w-4 mr-2"/>Add First Page</Button>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DragDropContext>
    );
};

export default BookDetail;
