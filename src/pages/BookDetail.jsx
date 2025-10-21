import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, writeBatch, query, orderBy, arrayUnion, arrayRemove
} from 'firebase/firestore';
import { firestore, storage, functions } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import {
  Trash2, PlusCircle, ChevronRight, ChevronDown, ArrowLeft, ArrowRight, UploadCloud, GripVertical, MoreVertical, ChevronLeft, Sparkles
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { httpsCallable } from 'firebase/functions';

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
const getNewOrderBetween = (prevOrder = '', nextOrder = '') =>
  getMidpointString(prevOrder, nextOrder);

// --- helper to strip HTML for shortNote ---
const stripHtml = (html = '') =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|br|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Turn plain text into simple HTML paragraphs for preview fallback
const textToHtml = (text = '') =>
  String(text)
    .split('\n')
    .map(seg => seg.trim())
    .filter(Boolean)
    .map(seg => `<p>${seg.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('');

// Heuristic: does a string look like HTML?
const isLikelyHtml = (s = '') => /<\w+[^>]*>/.test(s);

// --- ReactQuill toolbar / formats ---
const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    ['link', 'blockquote', 'code-block'],
    [{ color: [] }, { background: [] }],
    ['clean'],
  ],
};
const quillFormats = [
  'header',
  'bold', 'italic', 'underline', 'strike',
  'list', 'bullet',
  'align',
  'link', 'blockquote', 'code-block',
  'color', 'background',
];

// --- REUSABLE UI COMPONENTS ---

const HoverDeleteMenu = ({ onDelete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const onDocMouseDown = (e) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [isOpen]);

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    onDelete();
    setIsOpen(false);
  };

  return (
    <div ref={rootRef} className="relative opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 data-[state=open]:bg-violet-100"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((v) => !v);
        }}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-28 bg-white rounded-md shadow-lg z-20 border">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700 text-sm px-2 py-1.5"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
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

// ======================
// PageEditor (UPDATED)
// ======================
const PageEditor = ({ bookId, chapterId, page, onPageUpdate, onAddPage, onNavigate, pageIndex, totalPages }) => {
  const [note, setNote] = useState(page.note || '');
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStyle, setAiStyle] = useState('Improve clarity');

  // AI preview dialog state
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [aiPreviewText, setAiPreviewText] = useState('');

  const quillRef = useRef(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const mediaList = page.media || [];
  const previewItem = mediaList[previewIndex] || null;

  useEffect(() => {
    setNote(page.note || '');
  }, [page]);

  // keyboard arrows for media modal
  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'Escape') closePreview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewOpen, mediaList.length]);

  const handleSave = async () => {
    setIsSaving(true);
    const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', page.id);
    const plain = stripHtml(note);
    const shortNote = plain.substring(0, 40) + (plain.length > 40 ? '...' : '');
    try {
      await updateDoc(pageRef, { note });
      onPageUpdate({ ...page, note, shortNote });
      toast({ title: 'Success', description: 'Page saved.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to save page.', variant: 'destructive' });
    }
    setIsSaving(false);
  };

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const currentMediaCount = page.media?.length || 0;
    if (currentMediaCount + files.length > 5) {
      toast({
        title: 'Upload Limit Exceeded',
        description: `You can only upload up to 5 media items per page. You have ${currentMediaCount} already.`,
        variant: 'destructive',
      });
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
        setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
      },
      (error) => {
        toast({ title: 'Upload Error', description: error.message, variant: 'destructive' });
        setUploadProgress(prev => {
          const next = { ...prev };
          delete next[file.name];
          return next;
        });
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then(async (downloadURL) => {
          const newMediaItem = {
            url: downloadURL,
            storagePath,
            type: mediaType,
            name: file.name,
            uploadedAt: new Date().toISOString(),
          };
          const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', page.id);
          await updateDoc(pageRef, { media: arrayUnion(newMediaItem) });
          
          onPageUpdate(prev => ({
            ...prev,
            media: [...(prev?.media || []), newMediaItem],
          }));
          
          setUploadProgress(prev => {
            const next = { ...prev };
            delete next[file.name];
            return next;
          });
          toast({ title: 'Upload Success', description: `"${file.name}" has been uploaded.` });
        });
      }
    );
  };

  const handleMediaDelete = async (mediaItemToDelete) => {
    if (!window.confirm(`Are you sure you want to delete "${mediaItemToDelete.name}"?`)) return;

    const storageRefItem = ref(storage, mediaItemToDelete.storagePath);
    try {
      await deleteObject(storageRefItem);
    } catch {
      toast({ title: 'Deletion Error', description: 'Could not delete file from storage.', variant: 'destructive' });
      return;
    }

    const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', page.id);
    try {
      await updateDoc(pageRef, { media: arrayRemove(mediaItemToDelete) });
      onPageUpdate({
        ...page,
        media: (page.media || []).filter(m => m.storagePath !== mediaItemToDelete.storagePath),
      });
      toast({ title: 'Success', description: 'Media deleted.' });
    } catch {
      toast({ title: 'Deletion Error', description: 'Could not update page details.', variant: 'destructive' });
    }
  };

  const openPreview = (mediaOrIndex) => {
    const idx = typeof mediaOrIndex === 'number'
      ? mediaOrIndex
      : mediaList.findIndex(m => m.storagePath === mediaOrIndex.storagePath);
    if (idx >= 0) {
      setPreviewIndex(idx);
      setPreviewOpen(true);
    }
  };

  const closePreview = () => setPreviewOpen(false);
  const goPrev = () => {
    if (mediaList.length === 0) return;
    setPreviewIndex((i) => (i - 1 + mediaList.length) % mediaList.length);
  };
  const goNext = () => {
    if (mediaList.length === 0) return;
    setPreviewIndex((i) => (i + 1) % mediaList.length);
  };

  // --- AI: callable + preview modal ---
  const callRewrite = async () => {
    setAiBusy(true);
    try {
      const call = httpsCallable(functions, 'rewriteNote'); // name must match your deployed callable
      const { data } = await call({
        text: stripHtml(note), // or send raw HTML if you prefer
        style: aiStyle,
        maxTokens: 512,
      });
      const candidate = data?.rewritten ?? '';
      if (!candidate) {
        toast({ title: 'No rewrite returned', description: 'Try again.', variant: 'destructive' });
        return;
      }
      setAiPreviewText(candidate);
      setAiPreviewOpen(true);
    } catch (e) {
      toast({ title: 'AI error', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setAiBusy(false);
    }
  };

  const insertAtCursor = () => {
    const editor = quillRef.current?.getEditor?.();
    if (!editor) return;

    const candidate = aiPreviewText || '';
    const range = editor.getSelection(true) || { index: editor.getLength(), length: 0 };

    // Insert at selection
    editor.setSelection(range.index, range.length);
    if (isLikelyHtml(candidate)) {
      editor.clipboard.dangerouslyPasteHTML(range.index, candidate);
    } else {
      editor.insertText(range.index, candidate);
    }
    editor.setSelection(range.index + (isLikelyHtml(candidate) ? 0 : candidate.length), 0);
    setAiPreviewOpen(false);
  };

  const replaceAll = () => {
    const editor = quillRef.current?.getEditor?.();
    const candidate = aiPreviewText || '';

    if (!editor) {
      setNote(candidate);
      setAiPreviewOpen(false);
      return;
    }

    editor.setSelection(0, editor.getLength());
    editor.deleteText(0, editor.getLength());

    if (isLikelyHtml(candidate)) {
      editor.clipboard.dangerouslyPasteHTML(0, candidate);
    } else {
      editor.insertText(0, candidate);
    }
    editor.setSelection(editor.getLength(), 0);
    setAiPreviewOpen(false);
  };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-lg border border-gray-200 flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800">
          Page {pageIndex + 1}
        </h2>
        <div className="relative group">
          <Button
            variant="secondary"
            size="icon"
            onClick={onAddPage}
            className="h-8 w-8 rounded-full"
            title="Add New Page"
          >
            <PlusCircle className="h-4 w-4" />
          </Button>
          <div
            className="absolute left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-gray-800 text-white text-xs rounded-md
                    opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0
                    transition-all duration-200 whitespace-nowrap"
          >
            Add new page
          </div>
        </div>
      </div>

      {/* Hidden file input for uploader */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Dropzone / uploader */}
      <div
        className="mb-4 p-4 border-2 border-dashed rounded-lg flex flex-col justify-center items-center bg-gray-50 text-gray-500 hover:bg-violet-50 hover:border-violet-400 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        {(!page.media || page.media.length === 0) && Object.keys(uploadProgress).length === 0 && (
          <div className="text-center pointer-events-none">
            <UploadCloud className="h-10 w-10 mx-auto mb-2" />
            <p className="font-semibold">Click to upload media</p>
            <p className="text-xs">Up to 5 images or videos</p>
          </div>
        )}

        {/* Media grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 w-full">
          {(page.media || []).map((media, idx) => (
            <div
              key={media.storagePath}
              className="relative group aspect-square bg-gray-200 rounded-md overflow-hidden"
              onClick={(e) => {
                e.stopPropagation();
                openPreview(idx);
              }}
            >
              {media.type === 'image' ? (
                <img src={media.url} alt={media.name} className="w-full h-full object-cover cursor-zoom-in" />
              ) : (
                <video src={media.url} className="w-full h-full object-cover cursor-pointer" />
              )}

              <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center items-center text-white text-xs font-medium">
                <span>Click to view</span>
              </div>

              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-6 w-6"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMediaDelete(media);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}

          {/* Upload progress tiles */}
          {Object.entries(uploadProgress).map(([name, progress]) => (
            <div
              key={name}
              className="relative aspect-square bg-gray-200 rounded-md flex flex-col justify-center items-center text-xs p-1"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-semibold truncate w-full text-center">{name}</p>
              <div className="w-full bg-gray-300 rounded-full h-1.5 mt-1">
                <div className="bg-violet-600 h-1.5 rounded-full" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Notes + controls */}
      <div className="space-y-4 flex-grow flex flex-col">
        <div className="flex-grow flex flex-col">
          <div className="flex items-center justify-between mb-1"></div>

          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <div className="flex-grow">
            <ReactQuill
              ref={quillRef}
              value={note}
              onChange={setNote}
              modules={quillModules}
              formats={quillFormats}
              theme="snow"
              placeholder="Add notes for this page..."
              className="[&_.ql-container]:min-h-[200px] [&_.ql-container]:rounded-b-md [&_.ql-toolbar]:rounded-t-md"
            />
          </div>
        </div>
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="icon" onClick={() => onNavigate('prev')} disabled={pageIndex === 0}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-gray-600">
              Page {pageIndex + 1} of {totalPages}
            </span>
            <Button variant="outline" size="icon" onClick={() => onNavigate('next')} disabled={pageIndex === totalPages - 1}>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center gap-2">
              <select
                value={aiStyle}
                onChange={(e) => setAiStyle(e.target.value)}
                className="text-sm border rounded-md px-2 py-1"
              >
                <option>Improve clarity</option>
                <option>Warm & supportive</option>
                <option>Concise summary</option>
                <option>Fix grammar only</option>
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={aiBusy || !stripHtml(note)?.trim()}
                onClick={callRewrite}
                className="flex items-center gap-1"
              >
                <Sparkles className="h-4 w-4" />
                {aiBusy ? 'Rewriting...' : 'Rewrite with AI'}
              </Button>
            </div>
            <Button onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>
          </div>
        </div>
      </div>

      {/* Media Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={(open) => (open ? setPreviewOpen(true) : closePreview())}>
        <DialogContent className="relative max-w-4xl p-0 overflow-hidden bg-transparent border-0 shadow-none">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-lg font-semibold text-gray-200 truncate">
              {previewItem?.name || 'Preview'}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-400 truncate">
              {previewItem?.type}
            </DialogDescription>
          </DialogHeader>

          <div
            className="relative flex justify-center items-center p-4 group transition-all"
            style={{ maxHeight: '80vh' }}
          >
            {previewItem?.type === 'image' ? (
              <img
                src={previewItem.url}
                alt={previewItem.name}
                className="object-contain max-h-[75vh] w-auto rounded-md"
              />
            ) : previewItem ? (
              <video
                src={previewItem.url}
                controls
                className="object-contain max-h-[75vh] w-auto rounded-md"
              />
            ) : null}

            {mediaList.length > 1 && (
              <>
                <button
                  onClick={goPrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 flex items-center justify-center 
                       rounded-full bg-white/60 hover:bg-white/90 transition-all shadow-md backdrop-blur-md 
                       opacity-0 group-hover:opacity-100"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-5 w-5 text-gray-800" />
                </button>
                <button
                  onClick={goNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 flex items-center justify-center 
                       rounded-full bg-white/60 hover:bg-white/90 transition-all shadow-md backdrop-blur-md 
                       opacity-0 group-hover:opacity-100"
                  aria-label="Next"
                >
                  <ChevronRight className="h-5 w-5 text-gray-800" />
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Preview Modal */}
      <Dialog open={aiPreviewOpen} onOpenChange={(open) => setAiPreviewOpen(open)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>AI suggestion ({aiStyle})</DialogTitle>
            <DialogDescription>Review the suggested rewrite. Insert at cursor or replace the entire note.</DialogDescription>
          </DialogHeader>

          <div className="mt-2 max-h-[50vh] overflow-auto rounded-md border p-3 bg-white prose prose-sm">
            <div
              dangerouslySetInnerHTML={{
                __html: isLikelyHtml(aiPreviewText)
                  ? aiPreviewText
                  : textToHtml(aiPreviewText || '')
              }}
            />
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setAiPreviewOpen(false)}>Cancel</Button>
            <Button variant="secondary" onClick={insertAtCursor}>Insert at cursor</Button>
            <Button variant="default" onClick={replaceAll}>Replace all</Button>
          </div>
        </DialogContent>
      </Dialog>
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
    const qy = query(chaptersRef, orderBy('order'));
    const chaptersSnap = await getDocs(qy);
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
    const qy = query(pagesRef, orderBy('order'));
    const pagesSnap = await getDocs(qy);
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

  useEffect(() => { fetchPages(selectedChapterId); }, [selectedChapterId, fetchPages]);

  const openDeleteModal = (type, data) => {
    setModalState({
      isOpen: true,
      type,
      data,
      title: `Delete ${type}?`,
      description: type === 'chapter'
        ? `Are you sure you want to permanently delete "${data.title}" and all its pages? This action cannot be undone.`
        : `Are you sure you want to permanently delete this page? This action cannot be undone.`,
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
    toast({ title: 'Deleting Chapter...', description: 'This may take a moment.' });
    const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
    await deleteDoc(chapterRef);
    toast({ title: 'Success', description: 'Chapter has been deleted.' });
    fetchChapters();
  };

  const handleDeletePage = async (chapterId, pageId, pageIndex) => {
    const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', pageId);
    const pageSnap = await getDoc(pageRef);

    if (pageSnap.exists()) {
      const pageData = pageSnap.data();
      if (pageData.media && pageData.media.length > 0) {
        const deletePromises = pageData.media.map(mediaItem => {
          const mediaRef = ref(storage, mediaItem.storagePath);
          return deleteObject(mediaRef);
        });
        try {
          await Promise.all(deletePromises);
          toast({ title: 'Media Cleaned', description: 'Associated media files deleted.' });
        } catch {
          toast({ title: 'Storage Error', description: 'Could not delete all associated media. Please check storage.', variant: 'destructive' });
        }
      }
    }

    const batch = writeBatch(firestore);
    batch.delete(pageRef);

    const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
    const chapter = chapters.find(c => c.id === chapterId);
    if (chapter) {
      const updatedPagesSummary = chapter.pagesSummary.filter(p => p.pageId !== pageId);
      batch.update(chapterRef, { pagesSummary: updatedPagesSummary });
    }

    await batch.commit();
    toast({ title: 'Page has been deleted' });

    const newPages = pages.filter(p => p.id !== pageId);
    setPages(newPages);

    const newChapters = chapters.map(c => c.id === chapterId ? { ...c, pagesSummary: c.pagesSummary.filter(p => p.pageId !== pageId) } : c);
    setChapters(newChapters);

    if (newPages.length > 0) {
      const newIndex = Math.max(0, pageIndex - 1);
      setSelectedPageId(newPages[newIndex].id);
    } else {
      setSelectedPageId(null);
    }
  };

  // ---------- DnD: reorder + cross-chapter move ----------
  const onDragEnd = async (result) => {
    const { destination, source, draggableId, type } = result;
    if (!destination || type !== 'PAGE') return;

    const fromChapterId = source.droppableId;
    const toChapterId = destination.droppableId;

    if (fromChapterId === toChapterId && destination.index === source.index) return;

    const chaptersMap = new Map(chapters.map(c => [c.id, { ...c, pagesSummary: [...(c.pagesSummary || [])] }]));

    const fromList = chaptersMap.get(fromChapterId)?.pagesSummary || [];
    const dragged = fromList[source.index];
    if (!dragged) return;

    fromList.splice(source.index, 1);

    const toList = chaptersMap.get(toChapterId)?.pagesSummary || [];
    toList.splice(destination.index, 0, dragged);

    const prev = toList[destination.index - 1]?.order || '';
    const next = toList[destination.index + 1]?.order || '';
    const newOrder = getNewOrderBetween(prev, next);
    toList[destination.index] = { ...dragged, order: newOrder };

    const batch = writeBatch(firestore);

    if (fromChapterId === toChapterId) {
      const pageRef = doc(firestore, 'books', bookId, 'chapters', toChapterId, 'pages', draggableId);
      batch.update(pageRef, { order: newOrder });

      const destChapterRef = doc(firestore, 'books', bookId, 'chapters', toChapterId);
      batch.update(destChapterRef, { pagesSummary: toList });
    } else {
      const oldRef = doc(firestore, 'books', bookId, 'chapters', fromChapterId, 'pages', draggableId);
      const oldSnap = await getDoc(oldRef);
      if (!oldSnap.exists()) return;

      const data = oldSnap.data();
      const newRef = doc(firestore, 'books', bookId, 'chapters', toChapterId, 'pages', draggableId);

      batch.set(newRef, { ...data, order: newOrder });
      batch.delete(oldRef);

      const fromChapterRef = doc(firestore, 'books', bookId, 'chapters', fromChapterId);
      const toChapterRef   = doc(firestore, 'books', bookId, 'chapters', toChapterId);

      batch.update(fromChapterRef, { pagesSummary: chaptersMap.get(fromChapterId).pagesSummary });
      batch.update(toChapterRef,   { pagesSummary: toList });
    }

    await batch.commit();

    setChapters(chapters.map(c =>
      c.id === fromChapterId ? chaptersMap.get(fromChapterId)
      : c.id === toChapterId ? chaptersMap.get(toChapterId)
      : c
    ));

    if (fromChapterId === toChapterId) {
      if (selectedChapterId === toChapterId) {
        setPages(prev =>
          prev.map(p => p.id === draggableId ? { ...p, order: newOrder } : p)
             .sort((a, b) => a.order.localeCompare(b.order))
        );
      }
    } else {
      if (selectedChapterId === fromChapterId) {
        setPages(prev => prev.filter(p => p.id !== draggableId));
      }
      if (selectedChapterId === toChapterId) {
        await fetchPages(toChapterId);
      }
    }
  };
  // -------------------------------------------------------

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

    const plain = stripHtml(newPageData.note || '');
    const newPageSummary = { pageId: pageRef.id, shortNote: plain ? plain.substring(0, 40) + (plain.length > 40 ? '...' : '') : 'New Page', order: newOrder };
    const chapterRef = doc(firestore, 'books', bookId, 'chapters', selectedChapterId);
    await updateDoc(chapterRef, { pagesSummary: arrayUnion(newPageSummary) });

    const newPage = { id: pageRef.id, ...newPageData };
    setPages([...pages, newPage].sort((a, b) => a.order.localeCompare(b.order)));
    setSelectedPageId(newPage.id);
    setChapters(chapters.map(c => c.id === selectedChapterId ? {
      ...c,
      pagesSummary: [...(c.pagesSummary || []), newPageSummary].sort((a, b) => a.order.localeCompare(b.order))
    } : c));
    toast({ title: 'New Page Added' });
  };

  const handlePageUpdate = (update) => {
    setPages(prevPages => {
      // Figure out the current page being edited
      const current = prevPages.find(p => p.id === selectedPageId);
      if (!current) return prevPages;
  
      const updatedPage = (typeof update === 'function') ? update(current) : update;
  
      // Update pages array
      const nextPages = prevPages.map(p => p.id === updatedPage.id ? updatedPage : p);
  
      // If shortNote provided, reflect it in the chapter sidebar
      if (updatedPage.shortNote) {
        const chapter = chapters.find(c => c.id === selectedChapterId);
        if (chapter) {
          const updatedPagesSummary = chapter.pagesSummary.map(ps =>
            ps.pageId === updatedPage.id ? { ...ps, shortNote: updatedPage.shortNote } : ps
          );
          setChapters(chapters.map(c =>
            c.id === selectedChapterId ? { ...c, pagesSummary: updatedPagesSummary } : c
          ));
        }
      }
  
      return nextPages;
    });
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
              <Input value={newChapterTitle} onChange={(e) => setNewChapterTitle(e.target.value)} placeholder="New chapter title..." />
              <Button type="submit" size="icon"><PlusCircle className="h-4 w-4" /></Button>
            </form>
            <div className="p-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border flex-grow">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Content</h2>
              <div className="space-y-1">
                {[...chapters].sort((a, b) => a.order.localeCompare(b.order)).map(chapter => (
                  <div key={chapter.id} className="group">
                    <div
                      onClick={() => { setSelectedChapterId(chapter.id); setExpandedChapters(new Set([chapter.id])); }}
                      className={`w-full text-left p-3 rounded-lg flex items-center justify-between cursor-pointer ${selectedChapterId === chapter.id ? 'bg-violet-200 text-violet-900' : 'hover:bg-violet-100'}`}
                    >
                      <div className="flex items-center shrink-0">
                        <HoverDeleteMenu onDelete={() => openDeleteModal('chapter', chapter)} />
                        <span className="font-medium truncate pr-2 ml-1">{chapter.title}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                           e.stopPropagation();
                          const s = new Set(expandedChapters);
                          s.has(chapter.id) ? s.delete(chapter.id) : s.add(chapter.id);
                          setExpandedChapters(s);
                        }}
                      >
                        {expandedChapters.has(chapter.id) ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      </Button>
                    </div>
                    {expandedChapters.has(chapter.id) && (
                      <Droppable droppableId={chapter.id} type="PAGE">
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className="ml-4 pl-4 border-l-2 border-violet-200 py-1 space-y-1">
                            {chapter.pagesSummary?.length > 0 ? chapter.pagesSummary.map((pageSummary, index) => (
                              <Draggable key={pageSummary.pageId} draggableId={pageSummary.pageId} index={index}>
                                {(provided2) => (
                                  <div
                                    ref={provided2.innerRef}
                                    {...provided2.draggableProps}
                                    onClick={() => {
                                      setSelectedChapterId(chapter.id);
                                      setSelectedPageId(pageSummary.pageId);
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    className={`group w-full text-left p-2 rounded-md text-sm flex items-center justify-between cursor-pointer ${selectedPageId === pageSummary.pageId ? 'bg-violet-100 text-violet-800' : 'hover:bg-gray-100'}`}
                                  >
                                    <div className="flex items-center truncate">
                                      <span
                                        {...provided2.dragHandleProps}
                                        className="mr-2 text-gray-400 shrink-0 cursor-grab active:cursor-grabbing"
                                      >
                                        <GripVertical className="h-4 w-4" />
                                      </span>
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
                {selectedChapterId && <Button onClick={handleAddPage} className="mt-4"><PlusCircle className="h-4 w-4 mr-2" />Add Page</Button>}
              </div>
            )}
          </div>
        </div>
      </div>
    </DragDropContext>
  );
};

export default BookDetail;
