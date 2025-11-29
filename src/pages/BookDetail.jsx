import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, writeBatch, query, orderBy, arrayUnion, arrayRemove, where, limit
} from 'firebase/firestore';
import { firestore, storage, functions } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import {
  Trash2, PlusCircle, ChevronRight, ChevronDown, ArrowLeft, ArrowRight, UploadCloud, GripVertical, MoreVertical, ChevronLeft, Sparkles, Globe, Users, UserPlus, X, Send
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
const PageEditor = ({ bookId, chapterId, page, onPageUpdate, onAddPage, onNavigate, pageIndex, totalPages, clearEditor, chapterTitle }) => {
  const [note, setNote] = useState(page.note || '');
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStyle, setAiStyle] = useState('');
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);

  // AI preview dialog state
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [aiPreviewText, setAiPreviewText] = useState('');
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [pendingNote, setPendingNote] = useState(null);

  const quillRef = useRef(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  const mediaList = page.media || [];
  const previewItem = mediaList[previewIndex] || null;

  useEffect(() => {
    setNote(page.note || '');
  }, [page]);

  // Clear editor when clearEditor prop is true
  useEffect(() => {
    if (clearEditor) {
      setNote('');
    }
  }, [clearEditor]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Close style dropdown when clicking outside
  useEffect(() => {
    if (!showStyleDropdown) return;
    const handleClickOutside = (event) => {
      const target = event.target;
      if (!target.closest('.style-dropdown-container')) {
        setShowStyleDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showStyleDropdown]);

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
    const plain = stripHtml(note);
    const shortNote = plain.substring(0, 40) + (plain.length > 40 ? '...' : '');

    try {
      const updatePageFn = httpsCallable(functions, 'updatePage');
      await updatePageFn({
        bookId,
        chapterId,
        pageId: page.id,
        note,
        media: page.media || []
      });

      onPageUpdate({ ...page, note, shortNote });
      toast({ title: 'Success', description: 'Page saved.' });
    } catch (error) {
      console.error('Save error:', error);
      toast({ title: 'Error', description: 'Failed to save page.', variant: 'destructive' });
    }
    setIsSaving(false);
  };

  const autoSave = async () => {
    if (!note || note === page.note) return; // Don't save if no changes

    setIsAutoSaving(true);
    const plain = stripHtml(note);
    const shortNote = plain.substring(0, 40) + (plain.length > 40 ? '...' : '');

    try {
      const updatePageFn = httpsCallable(functions, 'updatePage');
      await updatePageFn({
        bookId,
        chapterId,
        pageId: page.id,
        note,
        media: page.media || []
      });

      onPageUpdate({ ...page, note, shortNote });
      console.log('Auto-saved page content');
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      setIsAutoSaving(false);
    }
  };

  const handleNoteChange = (newNote) => {
    setNote(newNote);

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save (2 seconds after user stops typing)
    saveTimeoutRef.current = setTimeout(() => {
      autoSave();
    }, 2000);
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
      const call = httpsCallable(functions, 'rewriteNote');
      const { data } = await call({
        note: note, // Full note content (HTML or plain text)
        noteText: stripHtml(note), // Plain text version (fallback)
        prompt: aiStyle, // User-selected preset or custom prompt (up to 25 characters)
        maxTokens: 512,
        bookId: bookId, // Book ID for context
        chapterId: chapterId, // Chapter ID for context
        pageId: page.id, // Page ID for context
      });
      // Handle both direct response and wrapped response structure
      const candidate = data?.rewritten ?? data?.result?.rewritten ?? '';
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
    const candidate = aiPreviewText || '';

    if (!editor) {
      // Fallback: update state directly
      const newNote = note + candidate;
      setPendingNote(newNote);
      return;
    }

    const range = editor.getSelection(true);
    const currentIndex = range ? range.index : editor.getLength();

    // Insert at cursor position
    if (isLikelyHtml(candidate)) {
      editor.clipboard.dangerouslyPasteHTML(currentIndex, candidate);
    } else {
      editor.insertText(currentIndex, candidate);
    }

    // Get updated content
    const updatedContent = editor.root.innerHTML;
    setPendingNote(updatedContent);
    setNote(updatedContent);
  };

  const replaceAll = () => {
    const editor = quillRef.current?.getEditor?.();
    const candidate = aiPreviewText || '';

    if (!editor) {
      // Fallback: update state directly
      setPendingNote(candidate);
      return;
    }

    // Replace all content
    const length = editor.getLength();
    editor.deleteText(0, length);

    if (isLikelyHtml(candidate)) {
      editor.clipboard.dangerouslyPasteHTML(0, candidate);
    } else {
      editor.insertText(0, candidate);
    }

    // Get updated content
    const updatedContent = editor.root.innerHTML;
    setPendingNote(updatedContent);
    setNote(updatedContent);
  };

  const handleSaveChanges = async () => {
    if (!pendingNote) return;

    setIsSaving(true);
    const plain = stripHtml(pendingNote);
    const shortNote = plain.substring(0, 40) + (plain.length > 40 ? '...' : '');

    try {
      const updatePageFn = httpsCallable(functions, 'updatePage');
      await updatePageFn({
        bookId,
        chapterId,
        pageId: page.id,
        note: pendingNote,
        media: page.media || []
      });

      // Update editor content
      const editor = quillRef.current?.getEditor?.();
      if (editor) {
        const length = editor.getLength();
        editor.deleteText(0, length);
        if (isLikelyHtml(pendingNote)) {
          editor.clipboard.dangerouslyPasteHTML(0, pendingNote);
        } else {
          editor.insertText(0, pendingNote);
        }
      }

      setNote(pendingNote);
      onPageUpdate({ ...page, note: pendingNote, shortNote });
      setPendingNote(null);
      setAiPreviewOpen(false);
      toast({ title: 'Success', description: 'Changes saved successfully.' });
    } catch (error) {
      console.error('Failed to save changes:', error);
      toast({
        title: 'Error',
        description: 'Failed to save changes. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelChanges = () => {
    // Restore original content if changes were made
    if (pendingNote) {
      const editor = quillRef.current?.getEditor?.();
      if (editor) {
        const length = editor.getLength();
        editor.deleteText(0, length);
        if (isLikelyHtml(page.note)) {
          editor.clipboard.dangerouslyPasteHTML(0, page.note || '');
        } else {
          editor.insertText(0, page.note || '');
        }
      }
      setNote(page.note || '');
    }
    setPendingNote(null);
    setAiPreviewOpen(false);
  };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-lg border border-gray-200 flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <div>
          {chapterTitle && (
            <div className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-1">
              {chapterTitle}
            </div>
          )}
          <h2 className="text-2xl font-bold text-gray-800">
            Page {pageIndex + 1}
          </h2>
        </div>
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
              onChange={handleNoteChange}
              modules={quillModules}
              formats={quillFormats}
              theme="snow"
              placeholder="Add notes for this page..."
              className="[&_.ql-container]:min-h-[200px] [&_.ql-container]:rounded-b-md [&_.ql-toolbar]:rounded-t-md"
            />
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          {/* Page navigation */}
          <div className="flex items-center space-x-2 shrink-0">
            <Button variant="outline" size="icon" onClick={() => onNavigate('prev')} disabled={pageIndex === 0}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-gray-600 whitespace-nowrap">
              Page {pageIndex + 1} of {totalPages}
            </span>
            <Button variant="outline" size="icon" onClick={() => onNavigate('next')} disabled={pageIndex === totalPages - 1}>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {/* AI controls + Save */}
          <div className="flex flex-wrap items-center gap-2">
            {isAutoSaving && (
              <span className="text-xs text-gray-500 flex items-center shrink-0">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-500 mr-1"></div>
                Auto-saving...
              </span>
            )}

            {/* AI style input + dropdown */}
            <div className="relative flex items-center style-dropdown-container min-w-0">
              <Input
                type="text"
                value={aiStyle}
                onChange={(e) => setAiStyle(e.target.value)}
                maxLength={25}
                placeholder="Custom style or choose pre"
                className="text-sm h-9 rounded-r-none border-r-0 pr-2 min-w-0 w-full max-w-[180px]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowStyleDropdown(!showStyleDropdown);
                }}
                className="h-9 rounded-l-none px-2 shrink-0"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              {showStyleDropdown && (
                <div className="absolute top-full right-0 mt-1 z-50 bg-white border rounded-md shadow-lg min-w-[200px]">
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAiStyle('Improve clarity');
                        setShowStyleDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                    >
                      Improve clarity
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAiStyle('Warm & supportive');
                        setShowStyleDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                    >
                      Warm & supportive
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAiStyle('Concise summary');
                        setShowStyleDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                    >
                      Concise summary
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAiStyle('Fix grammar only');
                        setShowStyleDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                    >
                      Fix grammar only
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Rewrite button */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={aiBusy || !stripHtml(note)?.trim() || !aiStyle?.trim()}
              onClick={callRewrite}
              className="flex items-center gap-1 shrink-0 whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4" />
              {aiBusy ? 'Rewriting...' : 'Rewrite with AI'}
            </Button>

            {/* Save button */}
            <Button onClick={handleSave} disabled={isSaving} variant="appSuccess" className="shrink-0">
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
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
      <Dialog open={aiPreviewOpen} onOpenChange={(open) => !open && handleCancelChanges()}>
        <DialogContent className="max-w-3xl bg-gradient-to-br from-violet-50 via-rose-50 to-amber-50 border-2 border-violet-200 shadow-2xl">
          {/* Header with prompt type */}
          <DialogHeader className="bg-white rounded-t-lg p-6 border-b-2 border-violet-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-full">
                <Sparkles className="h-6 w-6 text-violet-600" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-2xl font-bold text-violet-900">
                  Suggestion
                </DialogTitle>
                <DialogDescription className="text-base text-violet-700 mt-1">
                  {aiStyle || 'Custom prompt'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Suggested content */}
          <div className="p-6 bg-white/90 backdrop-blur-sm rounded-lg mx-4 my-4 max-h-[50vh] overflow-auto border border-violet-100 shadow-inner">
            <div
              className="prose prose-lg max-w-none text-gray-800"
              dangerouslySetInnerHTML={{
                __html: isLikelyHtml(aiPreviewText)
                  ? aiPreviewText
                  : textToHtml(aiPreviewText || '')
              }}
            />
          </div>

          {/* Action buttons */}
          <div className="px-6 pb-6 space-y-3">
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={insertAtCursor}
                className="bg-white hover:bg-violet-50 border-violet-300 text-violet-700 hover:text-violet-900"
              >
                Insert at cursor
              </Button>
              <Button
                variant="outline"
                onClick={replaceAll}
                className="bg-white hover:bg-rose-50 border-rose-300 text-rose-700 hover:text-rose-900"
              >
                Replace all
              </Button>
            </div>

            {pendingNote && (
              <div className="pt-3 border-t border-violet-200">
                <p className="text-sm text-center text-gray-600 mb-3">
                  Changes are ready. Save to update or cancel to discard.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    onClick={handleCancelChanges}
                    className="bg-white hover:bg-gray-50 border-gray-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveChanges}
                    disabled={isSaving}
                    className="bg-gradient-to-r from-violet-500 to-rose-500 hover:from-violet-600 hover:to-rose-600 text-white shadow-lg"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            )}

            {!pendingNote && (
              <div className="flex items-center justify-center pt-3 border-t border-violet-200">
                <Button
                  variant="outline"
                  onClick={handleCancelChanges}
                  className="bg-white hover:bg-gray-50 border-gray-300"
                >
                  Close
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// --- MAIN COMPONENT ---

const ChatPanel = () => {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I can help you plan your book, brainstorm ideas, or review your writing. What are you working on today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [panelWidth, setPanelWidth] = useState(320); // Default 320px (w-80)
  const [isResizing, setIsResizing] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userQuery = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setInput('');
    setIsLoading(true);

    try {
      const queryBookFlowFn = httpsCallable(functions, 'queryBookFlow');

      // Construct history including the new user message
      const history = [...messages, { role: 'user', content: userQuery }];

      const result = await queryBookFlowFn({ messages: history });

      const { answer, sources } = result.data;

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: answer,
        sources: sources
      }]);
    } catch (error) {
      console.error('RAG Query Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error while searching your book. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle resize drag
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      // Clamp width between 280px and 600px
      setPanelWidth(Math.max(280, Math.min(600, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  if (isMinimized) {
    return (
      <div className="shrink-0 bg-card border-l border-border flex flex-col items-center py-4 px-2 w-12">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMinimized(false)}
          className="h-8 w-8 text-app-iris hover:bg-app-iris/10"
          title="Expand AI Assistant"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="mt-4 writing-mode-vertical text-xs font-semibold text-muted-foreground transform rotate-180">
          AI Assistant
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full bg-card border-l border-border shrink-0 relative transition-all duration-200"
      style={{ width: `${panelWidth}px` }}
    >
      {/* Resize handle */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-app-iris/40 transition-colors ${isResizing ? 'bg-app-iris/60' : 'bg-transparent'}`}
        onMouseDown={handleMouseDown}
        title="Drag to resize"
      />

      <div className="p-4 border-b border-border flex items-center justify-between bg-app-gray-50/70">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-app-iris" />
          <h3 className="font-semibold text-foreground text-sm">AI Assistant</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMinimized(true)}
          className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-app-gray-100"
          title="Minimize"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user'
              ? 'bg-app-iris text-white rounded-br-none'
              : 'bg-app-gray-100 text-foreground rounded-bl-none'
              }`}>
              <p>{msg.content}</p>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/20 text-xs opacity-80">
                  <p className="font-semibold mb-1">Sources:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {msg.sources.map((source, idx) => (
                      <li key={idx}>{source.shortNote}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-app-gray-100 text-foreground rounded-2xl rounded-bl-none px-3 py-2 text-sm flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-app-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-app-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-app-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border bg-card">
        <div className="relative">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask anything..."
            className="pr-10 text-sm"
            onKeyDown={e => e.key === 'Enter' && !isLoading && handleSend()}
            disabled={isLoading}
          />
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-1 top-1 h-7 w-7 text-app-iris hover:bg-app-iris/10"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};


const BookDetail = () => {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // ---------------------------------------------------------------------------
  // ⚡ OPTIMIZATION 1: Synchronous State Initialization
  // Initialize state directly from location.state so we don't show loading screen
  // ---------------------------------------------------------------------------
  const [book, setBook] = useState(() => location.state?.prefetchedBook || null);
  const [chapters, setChapters] = useState(() => location.state?.prefetchedChapters || []);

  // Only show loading if we don't have the book data yet
  const [loading, setLoading] = useState(() => !location.state?.prefetchedBook);

  // Derived state for initial selection
  const [selectedChapterId, setSelectedChapterId] = useState(() => {
    if (location.state?.prefetchedChapters?.length > 0) {
      return location.state.prefetchedChapters[0].id;
    }
    return null;
  });

  const [expandedChapters, setExpandedChapters] = useState(() => {
    if (location.state?.prefetchedChapters?.length > 0) {
      return new Set([location.state.prefetchedChapters[0].id]);
    }
    return new Set();
  });

  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState(null);

  // UI States
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [modalState, setModalState] = useState({ isOpen: false });
  const [clearEditor, setClearEditor] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState(null);
  const [editingChapterTitle, setEditingChapterTitle] = useState('');
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [pendingChapterEdit, setPendingChapterEdit] = useState(null);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [coAuthorModalOpen, setCoAuthorModalOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [coAuthorUsers, setCoAuthorUsers] = useState([]);
  const searchTimeoutRef = useRef(null);
  const { toast } = useToast();

  // Refs
  const isFetchingRef = useRef(false);
  // Track if we've done the initial page load for the selected chapter
  const loadedChaptersRef = useRef(new Set());

  // ---------------------------------------------------------------------------
  // ⚡ OPTIMIZATION 2: Smart Fetching Logic
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // If we already have the book (from prefetch), DO NOT fetch from Firestore.
    if (book && chapters.length > 0 && location.state?.skipFetch) {
      console.log('⚡ Using prefetched data. Skipping network request.');

      // Clear the location state so a refresh DOES fetch fresh data
      // We use replaceState to modify history without navigating
      window.history.replaceState({}, document.title);
      return;
    }

    // If we are here, it means we entered via URL directly (no prefetch), so we fetch.
    if (isFetchingRef.current) return; // Prevent duplicate fetches

    const fetchBookData = async () => {
      if (!bookId) return;
      isFetchingRef.current = true;
      setLoading(true);
      console.log('🔄 Fetching book data from Firestore for:', bookId);

      try {
        // Fetch book and chapters in parallel
        const [bookSnap, chaptersSnap] = await Promise.all([
          getDoc(doc(firestore, 'books', bookId)),
          getDocs(query(collection(firestore, 'books', bookId, 'chapters'), orderBy('order')))
        ]);

        if (bookSnap.exists()) {
          setBook({ id: bookSnap.id, ...bookSnap.data() });
        } else {
          console.error('❌ Book not found');
          toast({ title: 'Error', description: 'Book not found', variant: 'destructive' });
        }

        const chaptersList = chaptersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setChapters(chaptersList);

        // Logic to auto-select first chapter if none selected
        if (chaptersList.length > 0 && !selectedChapterId) {
          const firstId = chaptersList[0].id;
          setSelectedChapterId(firstId);
          setExpandedChapters(new Set([firstId]));
        }
      } catch (err) {
        console.error('Error fetching book:', err);
        toast({ title: 'Error', description: 'Failed to load book', variant: 'destructive' });
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    };

    fetchBookData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]); // Remove dependencies that cause re-runs

  // ---------------------------------------------------------------------------
  // ⚡ OPTIMIZATION 3: Lazy Load Pages (On Chapter Selection)
  // ---------------------------------------------------------------------------
  const fetchPages = useCallback(async (chapterId) => {
    if (!chapterId || !bookId) return;
    console.log(`📄 Lazy loading pages for chapter: ${chapterId}`);

    try {
      const pagesRef = collection(firestore, 'books', bookId, 'chapters', chapterId, 'pages');
      const qy = query(pagesRef, orderBy('order'));
      const pagesSnap = await getDocs(qy);
      const pagesList = pagesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      setPages(pagesList);

      // Auto-select first page if none selected
      if (pagesList.length > 0) {
        setSelectedPageId(p => pagesList.some(pg => pg.id === p) ? p : pagesList[0].id);
      } else {
        setSelectedPageId(null);
      }

      // Mark as loaded
      loadedChaptersRef.current.add(chapterId);
    } catch (error) {
      console.error('Error fetching pages:', error);
    }
  }, [bookId]);

  // Trigger page fetch when chapter selection changes
  useEffect(() => {
    if (selectedChapterId) {
      fetchPages(selectedChapterId);
    }
  }, [selectedChapterId, fetchPages]);

  // Deprecated old fetchers (keeping names to avoid breaking other refs if any, but making them no-ops or aliased)
  // We don't need separate fetchChapters anymore as it's handled in main effect
  const fetchChapters = useCallback(async () => {
    if (!bookId) return;
    const chaptersRef = collection(firestore, 'books', bookId, 'chapters');
    const qy = query(chaptersRef, orderBy('order'));
    const chaptersSnap = await getDocs(qy);
    const chaptersList = chaptersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setChapters(chaptersList);
  }, [bookId]);

  // Permission checks
  const isOwner = book?.ownerId === user?.uid;
  const isCoAuthor = book?.members?.[user?.uid] === 'Co-author';
  const canEdit = isOwner || isCoAuthor;

  // User search function
  const searchUsers = useCallback(async (searchTerm) => {
    if (!searchTerm || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const searchLower = searchTerm.toLowerCase();
      const usersRef = collection(firestore, 'users');
      let results = [];

      // Check if search term looks like an email
      if (searchTerm.includes('@')) {
        // Search by email
        const emailQuery = query(
          usersRef,
          where('email', '==', searchTerm.toLowerCase()),
          limit(1)
        );
        const emailSnapshot = await getDocs(emailQuery);
        results = emailSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } else {
        // Search by displayNameLower
        // Note: Firestore requires a composite index for orderBy + where
        // If index doesn't exist, catch error and try without orderBy
        try {
          const q = query(
            usersRef,
            orderBy('displayNameLower'),
            where('displayNameLower', '>=', searchLower),
            where('displayNameLower', '<=', searchLower + '\uf8ff'),
            limit(10)
          );
          const snapshot = await getDocs(q);
          results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (indexError) {
          // If index doesn't exist, fetch all and filter client-side (less efficient but works)
          console.warn('Firestore index not found, fetching all users:', indexError);
          const allUsersSnapshot = await getDocs(usersRef);
          results = allUsersSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(u => {
              const nameLower = (u.displayNameLower || '').toLowerCase();
              return nameLower.includes(searchLower);
            })
            .slice(0, 10);
        }
      }

      // Filter results
      results = results.filter(u => {
        // Filter out current user
        if (u.id === user?.uid) return false;
        // Filter out already added co-authors
        if (book?.members?.[u.id]) return false;
        return true;
      });

      setSearchResults(results);
    } catch (error) {
      console.error('Error searching users:', error);
      toast({
        title: 'Search Error',
        description: 'Failed to search users. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  }, [user, book, toast]);

  // Debounced user search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (userSearchQuery && coAuthorModalOpen) {
      searchTimeoutRef.current = setTimeout(() => {
        searchUsers(userSearchQuery);
      }, 500);
    } else {
      setSearchResults([]);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [userSearchQuery, coAuthorModalOpen, searchUsers]);

  // Handle publish/unpublish
  const handlePublishToggle = async () => {
    if (!isOwner) return;

    try {
      const bookRef = doc(firestore, 'books', bookId);
      await updateDoc(bookRef, {
        isPublic: !book.isPublic,
        updatedAt: new Date(),
      });

      setBook(prev => ({ ...prev, isPublic: !prev.isPublic }));
      toast({
        title: book.isPublic ? 'Book Unpublished' : 'Book Published',
        description: book.isPublic
          ? 'Your book is now private.'
          : 'Your book is now public. Anyone with the link can view it.',
      });
      setPublishModalOpen(false);
    } catch (error) {
      console.error('Error updating book visibility:', error);
      toast({
        title: 'Error',
        description: 'Failed to update book visibility. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle invite co-author
  const handleInviteCoAuthor = async (userToInvite) => {
    if (!isOwner) return;

    try {
      const inviteCoAuthorFn = httpsCallable(functions, 'inviteCoAuthor');
      await inviteCoAuthorFn({
        bookId,
        uid: userToInvite.id,
        email: userToInvite.email,
        username: userToInvite.displayName,
      });

      toast({
        title: 'Invitation Sent',
        description: `${userToInvite.displayName} has been invited as a co-author.`,
      });

      // Refresh book data
      const bookRef = doc(firestore, 'books', bookId);
      const bookSnap = await getDoc(bookRef);
      if (bookSnap.exists()) {
        setBook({ id: bookSnap.id, ...bookSnap.data() });
      }

      // Clear search
      setUserSearchQuery('');
      setSearchResults([]);
    } catch (error) {
      console.error('Error inviting co-author:', error);
      toast({
        title: 'Invitation Failed',
        description: error.message || 'Failed to send invitation. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle remove co-author
  const handleRemoveCoAuthor = async (userId) => {
    if (!isOwner) return;

    try {
      const bookRef = doc(firestore, 'books', bookId);
      const updatedMembers = { ...book.members };
      delete updatedMembers[userId];

      await updateDoc(bookRef, {
        members: updatedMembers,
        updatedAt: new Date(),
      });

      setBook(prev => ({ ...prev, members: updatedMembers }));
      toast({
        title: 'Co-Author Removed',
        description: 'The co-author has been removed from this book.',
      });
    } catch (error) {
      console.error('Error removing co-author:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove co-author. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Get co-authors list (excluding owner)
  const coAuthors = book?.members
    ? Object.entries(book.members)
      .filter(([uid, role]) => uid !== book.ownerId && role === 'Co-author')
      .map(([uid]) => uid)
    : [];

  // Fetch co-author user details
  useEffect(() => {
    const fetchCoAuthorDetails = async () => {
      if (coAuthors.length === 0) {
        setCoAuthorUsers([]);
        return;
      }

      try {
        const userPromises = coAuthors.map(async (uid) => {
          const userRef = doc(firestore, 'users', uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            return { id: uid, ...userSnap.data() };
          }
          return { id: uid, displayName: 'Unknown User', email: '' };
        });
        const users = await Promise.all(userPromises);
        setCoAuthorUsers(users);
      } catch (error) {
        console.error('Error fetching co-author details:', error);
      }
    };

    if (coAuthorModalOpen) {
      fetchCoAuthorDetails();
    }
  }, [coAuthors, coAuthorModalOpen]);

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
    if (!isOwner) {
      toast({
        title: 'Permission Denied',
        description: 'Only the book owner can delete chapters.',
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Deleting Chapter...', description: 'This may take a moment.' });
    const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
    await deleteDoc(chapterRef);
    toast({ title: 'Success', description: 'Chapter has been deleted.' });
    fetchChapters();
  };

  const handleDeletePage = async (chapterId, pageId, pageIndex) => {
    const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', pageId);

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
      const toChapterRef = doc(firestore, 'books', bookId, 'chapters', toChapterId);

      batch.update(fromChapterRef, { pagesSummary: chaptersMap.get(fromChapterId).pagesSummary });
      batch.update(toChapterRef, { pagesSummary: toList });
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
    if (!canEdit) {
      toast({
        title: 'Permission Denied',
        description: 'You do not have permission to create chapters.',
        variant: 'destructive',
      });
      return;
    }
    if (!newChapterTitle.trim() || !user) return;
    const newOrder = getMidpointString(chapters[chapters.length - 1]?.order);
    const newChapterData = { title: newChapterTitle, order: newOrder, pagesSummary: [], createdAt: new Date(), ownerId: user.uid };
    const newChapterDoc = await addDoc(collection(firestore, 'books', bookId, 'chapters'), newChapterData);
    setChapters([...chapters, { ...newChapterData, id: newChapterDoc.id }]);
    setNewChapterTitle('');
  };

  const handleAddPage = async () => {
    if (!canEdit) {
      toast({
        title: 'Permission Denied',
        description: 'You do not have permission to add pages.',
        variant: 'destructive',
      });
      return;
    }
    if (!selectedChapterId) return;

    // Clear the editor form content first
    setClearEditor(true);

    try {
      const newOrder = getMidpointString(pages[pages.length - 1]?.order);

      // Call Cloud Function to create NEW page with embeddings
      const createPageFn = httpsCallable(functions, 'createPage');
      const result = await createPageFn({
        bookId,
        chapterId: selectedChapterId,
        note: '',
        media: [],
        order: newOrder,
      });

      const newPage = result.data.page;

      // Update local state
      setPages([...pages, newPage].sort((a, b) => a.order.localeCompare(b.order)));
      setSelectedPageId(newPage.id);

      // Update chapters with new page summary
      const plain = stripHtml(newPage.note || '');
      const newPageSummary = {
        pageId: newPage.id,
        shortNote: plain ? plain.substring(0, 40) + (plain.length > 40 ? '...' : '') : 'New Page',
        order: newOrder
      };

      setChapters(chapters.map(c => c.id === selectedChapterId ? {
        ...c,
        pagesSummary: [...(c.pagesSummary || []), newPageSummary].sort((a, b) => a.order.localeCompare(b.order))
      } : c));

      setClearEditor(false);
      toast({ title: 'New Page Added' });

    } catch (error) {
      console.error('Error creating page:', error);
      setClearEditor(false);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create page. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handlePageUpdate = async (update) => {
    setPages(prevPages => {
      // Figure out the current page being edited
      const current = prevPages.find(p => p.id === selectedPageId);
      if (!current) return prevPages;

      const updatedPage = (typeof update === 'function') ? update(current) : update;

      // Update pages array
      const nextPages = prevPages.map(p => p.id === updatedPage.id ? updatedPage : p);

      // If shortNote provided, reflect it in the chapter sidebar (Optimistic Update)
      // The backend (updatePage) handles the actual Firestore update for pagesSummary
      if (updatedPage.shortNote) {
        setChapters(prevChapters => prevChapters.map(c => {
          if (c.id !== selectedChapterId) return c;

          const updatedPagesSummary = (c.pagesSummary || []).map(ps =>
            ps.pageId === updatedPage.id ? { ...ps, shortNote: updatedPage.shortNote } : ps
          );

          return { ...c, pagesSummary: updatedPagesSummary };
        }));
      }

      return nextPages;
    });
  };

  // ---------- Chapter Title Editing ----------
  const handleStartEditChapter = (chapter) => {
    if (!canEdit) {
      toast({
        title: 'Permission Denied',
        description: 'You do not have permission to edit chapters.',
        variant: 'destructive',
      });
      return;
    }

    if (editingChapterId && editingChapterId !== chapter.id) {
      // There's an unsaved edit in another chapter
      setPendingChapterEdit({ chapterId: chapter.id, originalTitle: chapter.title });
      setSaveConfirmOpen(true);
      return;
    }
    setEditingChapterId(chapter.id);
    setEditingChapterTitle(chapter.title);
  };

  const handleSaveChapterTitle = async (chapterId) => {
    const trimmedTitle = editingChapterTitle.trim();
    if (!trimmedTitle) {
      toast({
        title: 'Error',
        description: 'Chapter title cannot be empty.',
        variant: 'destructive'
      });
      return;
    }

    if (trimmedTitle === chapters.find(c => c.id === chapterId)?.title) {
      // No changes, just exit edit mode
      setEditingChapterId(null);
      setEditingChapterTitle('');
      return;
    }

    try {
      const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
      await updateDoc(chapterRef, { title: trimmedTitle });

      setChapters(chapters.map(c =>
        c.id === chapterId ? { ...c, title: trimmedTitle } : c
      ));

      setEditingChapterId(null);
      setEditingChapterTitle('');
      toast({ title: 'Chapter updated', description: 'Chapter title has been saved.' });
    } catch (error) {
      console.error('Failed to update chapter title:', error);
      toast({
        title: 'Update Error',
        description: 'Failed to update chapter title. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleCancelChapterEdit = () => {
    setEditingChapterId(null);
    setEditingChapterTitle('');
    setPendingChapterEdit(null);
  };

  const handleChapterTitleBlur = () => {
    if (editingChapterId) {
      const chapter = chapters.find(c => c.id === editingChapterId);
      const hasChanges = editingChapterTitle.trim() !== chapter?.title;

      if (hasChanges) {
        setSaveConfirmOpen(true);
      } else {
        handleCancelChapterEdit();
      }
    }
  };

  const handleSaveConfirm = async () => {
    if (pendingChapterEdit) {
      // User wants to edit another chapter, save current first
      await handleSaveChapterTitle(editingChapterId);
      setEditingChapterId(pendingChapterEdit.chapterId);
      setEditingChapterTitle(pendingChapterEdit.originalTitle);
      setPendingChapterEdit(null);
      setSaveConfirmOpen(false);
    } else {
      // User wants to save current edit
      await handleSaveChapterTitle(editingChapterId);
      setSaveConfirmOpen(false);
    }
  };

  const handleDiscardChanges = () => {
    if (pendingChapterEdit) {
      // Switch to the new chapter without saving
      handleCancelChapterEdit();
      setEditingChapterId(pendingChapterEdit.chapterId);
      setEditingChapterTitle(pendingChapterEdit.originalTitle);
      setPendingChapterEdit(null);
    } else {
      // Just discard current edit
      handleCancelChapterEdit();
    }
    setSaveConfirmOpen(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header Skeleton */}
        <div className="shrink-0 py-3 px-4 border-b border-gray-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
            <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Skeleton */}
          <div className="w-72 bg-gray-50 border-r border-gray-200 flex flex-col">
            <div className="p-3 border-b border-gray-200 bg-white">
              <div className="h-8 bg-gray-200 rounded animate-pulse" />
            </div>
            <div className="flex-1 p-2 space-y-2">
              <div className="h-10 bg-gray-200 rounded animate-pulse" />
              <div className="h-10 bg-gray-200 rounded animate-pulse" />
              <div className="h-10 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>

          {/* Main Content Skeleton */}
          <div className="flex-1 overflow-hidden bg-white">
            <div className="max-w-4xl mx-auto p-8 space-y-4">
              <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
              <div className="h-64 bg-gray-200 rounded animate-pulse" />
              <div className="h-32 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>

          {/* Chat Panel Skeleton */}
          <div className="w-80 bg-white border-l border-gray-200" />
        </div>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <ConfirmationModal {...modalState} onClose={closeModal} onConfirm={handleConfirmDelete} />
      <Dialog open={saveConfirmOpen} onOpenChange={setSaveConfirmOpen}>
        <DialogContent className="w-full max-w-md p-6 bg-white rounded-2xl shadow-lg text-center">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-gray-800">Save changes?</DialogTitle>
            <DialogDescription className="mt-2 text-gray-600">
              You have unsaved changes to this chapter title. What would you like to do?
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6 flex justify-center space-x-4">
            <Button variant="outline" onClick={() => setSaveConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDiscardChanges}>Discard</Button>
            <Button onClick={handleSaveConfirm}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Publish Confirmation Modal */}
      <Dialog open={publishModalOpen} onOpenChange={setPublishModalOpen}>
        <DialogContent className="w-full max-w-md p-6 bg-white rounded-2xl shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-gray-800">
              {book?.isPublic ? 'Unpublish this book?' : 'Make this book public?'}
            </DialogTitle>
            <DialogDescription className="mt-2 text-gray-600">
              {book?.isPublic
                ? 'Your book will become private. Only you and co-authors will be able to access it.'
                : 'Making this book public means anyone with the link can view it. Your content will be visible to the public.'}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6 flex justify-center space-x-4">
            <Button variant="outline" onClick={() => setPublishModalOpen(false)}>Cancel</Button>
            <Button onClick={handlePublishToggle}>
              {book?.isPublic ? 'Unpublish' : 'Publish'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Co-Author Invitation Modal */}
      <Dialog open={coAuthorModalOpen} onOpenChange={setCoAuthorModalOpen}>
        <DialogContent className="w-full max-w-lg p-6 bg-white rounded-2xl shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-gray-800">Manage Co-Authors</DialogTitle>
            <DialogDescription className="mt-2 text-gray-600">
              Invite users to collaborate on this book. Co-authors can edit pages but cannot delete chapters.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-4">
            {/* Search Input */}
            <div>
              <Input
                placeholder="Search by username or email..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full"
              />
              {isSearching && (
                <p className="text-sm text-gray-500 mt-2">Searching...</p>
              )}
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="border rounded-lg p-2 max-h-48 overflow-y-auto">
                {searchResults.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-2 hover:bg-gray-50 rounded"
                  >
                    <div>
                      <p className="font-medium text-gray-800">{user.displayName || 'Unknown User'}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleInviteCoAuthor(user)}
                      className="flex items-center gap-1"
                    >
                      <UserPlus className="h-4 w-4" />
                      Invite
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Current Co-Authors */}
            {coAuthorUsers.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-800 mb-2">Current Co-Authors</h3>
                <div className="space-y-2">
                  {coAuthorUsers.map((coAuthorUser) => (
                    <div
                      key={coAuthorUser.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded"
                    >
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-gray-500" />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{coAuthorUser.displayName || 'Unknown User'}</p>
                          <p className="text-xs text-gray-500">{coAuthorUser.email}</p>
                        </div>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Co-author</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveCoAuthor(coAuthorUser.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {coAuthorUsers.length === 0 && searchResults.length === 0 && userSearchQuery.length < 2 && (
              <p className="text-sm text-gray-500 text-center py-4">
                No co-authors yet. Search for users above to invite them.
              </p>
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <Button variant="outline" onClick={() => setCoAuthorModalOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="shrink-0 py-3 px-4 border-b border-border bg-card flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <Button
              variant="appGhost"
              onClick={() => navigate('/books')}
              className="flex items-center gap-2 text-xs"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <h1 className="text-lg font-semibold text-app-gray-900 truncate max-w-md" title={book?.babyName}>
              {book?.babyName}
            </h1>
          </div>

          {isOwner && (
            <div className="flex items-center gap-2">
              <Button
                variant={book?.isPublic ? 'appPrimary' : 'appGhost'}
                onClick={() => setPublishModalOpen(true)}
                className="flex items-center gap-2 h-8 text-xs"
              >
                <Globe className="h-3 w-3" />
                {book?.isPublic ? 'Unpublish' : 'Publish'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setCoAuthorModalOpen(true)}
                className="flex items-center gap-2 h-8 text-xs"
              >
                <Users className="h-3 w-3" />
                Co-Authors
              </Button>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar: Chapters */}
          <div className="w-72 bg-app-gray-50 border-r border-border flex flex-col shrink-0">
            <div className="p-3 border-b border-border bg-card/80 backdrop-blur-sm">
              <form onSubmit={handleCreateChapter} className="flex items-center space-x-2">
                <Input
                  value={newChapterTitle}
                  onChange={(e) => setNewChapterTitle(e.target.value)}
                  placeholder="New chapter..."
                  disabled={!canEdit}
                  className="h-8 text-sm"
                />
                <Button type="submit" size="icon" disabled={!canEdit} className="h-8 w-8">
                  <PlusCircle className="h-4 w-4" />
                </Button>
              </form>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              <div className="space-y-1">
                {[...chapters].sort((a, b) => a.order.localeCompare(b.order)).map(chapter => (
                  <div key={chapter.id} className="group">
                    <div
                      onClick={(e) => {
                        if (editingChapterId === chapter.id) return;
                        if (editingChapterId && editingChapterId !== chapter.id) {
                          const chapterTitle = chapters.find(c => c.id === chapter.id)?.title || '';
                          setPendingChapterEdit({ chapterId: chapter.id, originalTitle: chapterTitle });
                          setSaveConfirmOpen(true);
                          return;
                        }
                        setSelectedChapterId(chapter.id);
                        setExpandedChapters(new Set([chapter.id]));
                      }}
                      className={`w-full text-left p-2 rounded-lg flex items-center justify-between ${editingChapterId === chapter.id ? '' : 'cursor-pointer'} ${selectedChapterId === chapter.id ? 'bg-app-iris/10 text-app-iris font-medium' : 'hover:bg-app-gray-100 text-foreground'}`}
                    >
                      <div className="flex items-center flex-1 min-w-0 mr-2">
                        {isOwner && <HoverDeleteMenu onDelete={() => openDeleteModal('chapter', chapter)} />}
                        {editingChapterId === chapter.id ? (
                          <input
                            value={editingChapterTitle}
                            onChange={(e) => setEditingChapterTitle(e.target.value)}
                            onBlur={handleChapterTitleBlur}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveChapterTitle(chapter.id);
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                handleCancelChapterEdit();
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 ml-1 px-2 py-1 border border-border rounded text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                            autoFocus
                          />
                        ) : (
                          <span
                            className="truncate pr-2 ml-1 text-sm"
                            title={chapter.title}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              handleStartEditChapter(chapter);
                            }}
                          >
                            {chapter.title}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          const s = new Set(expandedChapters);
                          s.has(chapter.id) ? s.delete(chapter.id) : s.add(chapter.id);
                          setExpandedChapters(s);
                        }}
                      >
                        {expandedChapters.has(chapter.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </div>
                    {expandedChapters.has(chapter.id) && (
                      <Droppable droppableId={chapter.id} type="PAGE">
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className="ml-3 pl-3 border-l border-border py-1 space-y-0.5">
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
                                    className={`group w-full text-left p-1.5 rounded-md text-sm flex items-center justify-between cursor-pointer ${selectedPageId === pageSummary.pageId ? 'bg-app-iris/10 text-app-iris font-medium' : 'hover:bg-app-gray-50 text-app-gray-600'}`}
                                  >
                                    <div className="flex items-center truncate">
                                      <span
                                        {...provided2.dragHandleProps}
                                        className="mr-2 text-app-gray-300 hover:text-foreground shrink-0 cursor-grab active:cursor-grabbing"
                                      >
                                        <GripVertical className="h-3 w-3" />
                                      </span>
                                      <span className="truncate text-xs">{pageSummary.shortNote || 'Untitled Page'}</span>
                                    </div>

                                    {canEdit && <HoverDeleteMenu onDelete={() => openDeleteModal('page', { ...pageSummary, chapterId: chapter.id, pageIndex: index })} />}
                                  </div>
                                )}
                              </Draggable>
                            )) : <div className="p-2 text-xs text-muted-foreground italic">No pages</div>}
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

          {/* Center: Editor */}
          <div className="flex-1 overflow-y-auto bg-card relative">
            <div className="max-w-4xl mx-auto min-h-full p-8">
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
                  clearEditor={clearEditor}
                  chapterTitle={chapters.find(c => c.id === selectedChapterId)?.title}
                />
              ) : (
                <div className="flex flex-col justify-center items-center text-center h-full p-6">
                  <div className="bg-app-gray-50 rounded-full p-6 mb-4">
                    <Sparkles className="h-8 w-8 text-app-iris" />
                  </div>
                  {selectedChapterId && (
                    <h3 className="text-lg font-medium text-app-iris mb-1">
                      {chapters.find(c => c.id === selectedChapterId)?.title}
                    </h3>
                  )}
                  <h2 className="text-xl font-semibold text-gray-800">{selectedChapterId ? 'Ready to write?' : 'Select a chapter'}</h2>
                  <p className="mt-2 text-gray-500 max-w-xs">{selectedChapterId ? 'Select a page or create a new one to start writing.' : 'Create a new chapter to get started.'}</p>
                  {selectedChapterId && canEdit && <Button onClick={handleAddPage} className="mt-6"><PlusCircle className="h-4 w-4 mr-2" />Add Page</Button>}
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar: Chat */}
          <ChatPanel />
        </div>
      </div>
    </DragDropContext>
  );
};

export default BookDetail;
