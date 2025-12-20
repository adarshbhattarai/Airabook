import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, writeBatch, query, orderBy, arrayUnion, arrayRemove, where, limit
} from 'firebase/firestore';
import { firestore, storage, functions } from '@/lib/firebase';
import { ref as firebaseRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import {
  Trash2, PlusCircle, ChevronRight, ChevronDown, ArrowLeft, ArrowRight, UploadCloud, GripVertical, MoreVertical, ChevronLeft, Sparkles, Globe, Users, UserPlus, X, Send, Edit
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { httpsCallable } from 'firebase/functions';
import EditBookModal from '@/components/EditBookModal';
import BlockEditor from '@/components/BlockEditor';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Type } from 'lucide-react';


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

const HoverDeleteMenu = ({ onDelete, side = 'left' }) => {
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
        <div className={`absolute top-full mt-1 w-28 bg-white rounded-md shadow-2xl z-[9999] border ${side === 'right' ? 'right-0' : 'left-0'}`}>
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
const PageEditor = forwardRef(({ bookId, chapterId, page, onPageUpdate, onAddPage, onNavigate, pageIndex, totalPages, chapterTitle, draftNote, onDraftChange, onFocus }, ref) => {
  const [note, setNote] = useState(draftNote ?? page.note ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);

  // AI preview dialog state
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [aiPreviewText, setAiPreviewText] = useState('');

  const [pendingNote, setPendingNote] = useState(null);
  const [mediaToDelete, setMediaToDelete] = useState(null);

  const quillRef = useRef(null);
  const { user, appUser } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTab, setMediaPickerTab] = useState('upload');
  const [albums, setAlbums] = useState([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState(null);
  const [albumMedia, setAlbumMedia] = useState([]);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState([]);

  const mediaList = page.media || [];
  const previewItem = mediaList[previewIndex] || null;

  useEffect(() => {
    setNote(draftNote ?? page.note ?? '');
  }, [page?.id, draftNote]);

  useEffect(() => {
    const availableAlbums = appUser?.accessibleAlbums || [];
    setAlbums(availableAlbums);
    if (!selectedAlbumId && availableAlbums.length > 0) {
      setSelectedAlbumId(availableAlbums[0].id);
    } else if (availableAlbums.length === 0) {
      setSelectedAlbumId(null);
    }
  }, [appUser, selectedAlbumId]);

  useEffect(() => {
    if (!mediaPickerOpen || mediaPickerTab !== 'library' || !selectedAlbumId) {
      return;
    }

    let isMounted = true;
    const fetchAlbumMedia = async () => {
      try {
        setLoadingAlbums(true);
        setAlbumMedia([]);
        const albumRef = doc(firestore, 'albums', selectedAlbumId);
        const albumSnap = await getDoc(albumRef);
        if (!albumSnap.exists()) {
          toast({ title: 'Album not found', description: 'Please pick another album.', variant: 'destructive' });
          return;
        }

        const data = albumSnap.data();
        const images = (data.images || []).map((item) => {
          const url = typeof item === 'string' ? item : item.url;
          const storagePath = typeof item === 'string' ? null : item.storagePath;
          return {
            url: convertToEmulatorURL(url),
            storagePath,
            type: 'image',
            name: typeof item === 'string' ? (url?.split('/')?.pop() || 'Image') : (item.name || item.fileName || 'Image'),
          };
        });
        const videos = (data.videos || []).map((item) => {
          const url = typeof item === 'string' ? item : item.url;
          const storagePath = typeof item === 'string' ? null : item.storagePath;
          return {
            url: convertToEmulatorURL(url),
            storagePath,
            type: 'video',
            name: typeof item === 'string' ? (url?.split('/')?.pop() || 'Video') : (item.name || item.fileName || 'Video'),
          };
        });

        if (isMounted) {
          setAlbumMedia([...images, ...videos]);
        }
      } catch (error) {
        console.error('Failed to load album assets', error);
        toast({ title: 'Unable to load assets', description: error.message || 'Try again later.', variant: 'destructive' });
      } finally {
        if (isMounted) setLoadingAlbums(false);
      }
    };

    fetchAlbumMedia();

    return () => { isMounted = false; };
  }, [mediaPickerOpen, mediaPickerTab, selectedAlbumId, toast]);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    save: async () => {
      return handleSave();
    },
    insertAI: async (style) => {
      // Call rewrite with the provided style
      return callRewrite(style);
    },
    hasUnsavedChanges: () => {
      return draftNote != null && draftNote !== (page.note || '');
    }
  }));

  // Close style dropdown when clicking outside
  // (Removed internal style dropdown logic)

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
      onDraftChange?.(page.id, null);
      toast({ title: 'Success', description: 'Page saved.' });
    } catch (error) {
      console.error('Save error detailed:', error);
      toast({ title: 'Save Failed', description: error.message || 'Unknown save error', variant: 'destructive' });
    }
    setIsSaving(false);
  };

  const handleNoteChange = (newNote) => {
    setNote(newNote);
    onDraftChange?.(page.id, newNote);
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

    setMediaPickerOpen(false);

    // Clear the input value so selecting the same file again still triggers onChange
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    files.forEach(file => handleUpload(file));
  };

  const openFileDialog = () => {
    if (fileInputRef.current) {
      // Reset value on open to ensure re-selecting the same file works
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleUpload = (file) => {
    if (!file || !user) return;

    const mediaType = file.type.startsWith('video') ? 'video' : 'image';
    const uniqueFileName = `${Date.now()}_${file.name}`;
    // Construct path: {userId}/{bookId}/{chapterId}/{pageId}/media/{type}/{filename}
    const storagePath = `${user.uid}/${bookId}/${chapterId}/${page.id}/media/${mediaType}/${uniqueFileName}`;
    const storageRef = firebaseRef(storage, storagePath);

    // Add custom metadata for original name
    const metadata = {
      customMetadata: {
        originalName: file.name,
        bookId: bookId
      }
    };

    const uploadTask = uploadBytesResumable(storageRef, file, metadata);

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

          // Update Page document in Firestore
          const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', page.id);
          await updateDoc(pageRef, { media: arrayUnion(newMediaItem) });

          // Update local state
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

  const handleAttachFromAlbum = async (asset) => {
    const currentMediaCount = page.media?.length || 0;
    if (currentMediaCount + 1 > 5) {
      toast({
        title: 'Upload Limit Exceeded',
        description: 'You can only attach up to 5 media items per page.',
        variant: 'destructive',
      });
      return;
    }

    const alreadyAttached = (page.media || []).some((item) =>
      item.storagePath && asset.storagePath
        ? item.storagePath === asset.storagePath
        : item.url === asset.url
    );
    if (alreadyAttached) {
      toast({ title: 'Already attached', description: 'This asset is already on the page.' });
      return;
    }

    try {
      const newMediaItem = {
        url: asset.url,
        storagePath: asset.storagePath || asset.url,
        type: asset.type || 'image',
        name: asset.name || 'Asset',
        uploadedAt: new Date().toISOString(),
        albumId: selectedAlbumId, // Store albumId for untracking later
      };

      const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', page.id);
      await updateDoc(pageRef, { media: arrayUnion(newMediaItem) });

      // Track usage in album
      try {
        const trackUsage = httpsCallable(functions, 'trackMediaUsage');
        await trackUsage({
          albumId: selectedAlbumId,
          storagePath: asset.storagePath,
          bookId,
          chapterId,
          pageId: page.id
        });
      } catch (trackError) {
        console.error('Failed to track usage:', trackError);
        // Don't fail the whole operation if tracking fails
      }

      onPageUpdate((prev) => ({
        ...prev,
        media: [...(prev?.media || []), newMediaItem],
      }));

      toast({ title: 'Asset added', description: `${newMediaItem.name} attached from library.` });
    } catch (error) {
      console.error('Failed to attach asset', error);
      toast({ title: 'Attach failed', description: error.message || 'Could not attach asset.', variant: 'destructive' });
    }
  };

  const toggleAssetSelection = (asset) => {
    setSelectedAssets(prev => {
      const isSelected = prev.some(a => (a.storagePath || a.url) === (asset.storagePath || asset.url));
      if (isSelected) {
        return prev.filter(a => (a.storagePath || a.url) !== (asset.storagePath || asset.url));
      } else {
        return [...prev, asset];
      }
    });
  };

  const handleSaveSelectedAssets = async () => {
    if (selectedAssets.length === 0) return;

    const currentMediaCount = page.media?.length || 0;
    if (currentMediaCount + selectedAssets.length > 5) {
      toast({
        title: 'Upload Limit Exceeded',
        description: `You can only attach up to 5 media items per page. You have ${currentMediaCount} already.`,
        variant: 'destructive',
      });
      return;
    }

    for (const asset of selectedAssets) {
      await handleAttachFromAlbum(asset);
    }

    setSelectedAssets([]);
    setMediaPickerOpen(false);
  };

  const handleMediaDelete = (mediaItemToDelete) => {
    setMediaToDelete(mediaItemToDelete);
  };

  const confirmMediaDelete = async () => {
    if (!mediaToDelete) return;

    const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', page.id);
    try {
      await updateDoc(pageRef, { media: arrayRemove(mediaToDelete) });

      // Untrack usage if this was attached from an album
      if (mediaToDelete.albumId && mediaToDelete.storagePath) {
        try {
          const untrackUsage = httpsCallable(functions, 'untrackMediaUsage');
          await untrackUsage({
            albumId: mediaToDelete.albumId,
            storagePath: mediaToDelete.storagePath,
            bookId,
            chapterId,
            pageId: page.id
          });
        } catch (untrackError) {
          console.error('Failed to untrack usage:', untrackError);
          // Don't fail the whole operation if untracking fails
        }
      }

      onPageUpdate({
        ...page,
        media: (page.media || []).filter(m => m.storagePath !== mediaToDelete.storagePath),
      });
      toast({ title: 'Success', description: 'Media deleted.' });
    } catch {
      toast({ title: 'Deletion Error', description: 'Could not update page details.', variant: 'destructive' });
    } finally {
      setMediaToDelete(null);
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
  const callRewrite = async (styleToUse) => {
    // If we're already rewriting, ignore
    if (aiBusy) return;

    // Use passed style or default
    const style = styleToUse || 'Improve clarity';

    // We need current content from editor
    let currentContent = note;
    if (quillRef.current && quillRef.current.getHTML) {
      currentContent = await quillRef.current.getHTML();
    }

    const text = stripHtml(currentContent);
    if (!text || !text.trim()) {
      toast({ title: 'Nothing to rewrite', description: 'Please write some text first.', variant: 'warning' });
      return;
    }

    setAiBusy(true);
    try {

      const rewriteFn = httpsCallable(functions, 'rewriteNote');
      const response = await rewriteFn({
        noteText: text,
        prompt: style,
        bookId: bookId,
        chapterId: chapterId,
        pageId: page.id
      });

      const data = response.data;
      if (data.rewritten) {
        setAiPreviewText(data.rewritten);
        setAiPreviewOpen(true);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('AI Rewrite error:', error);
      toast({ title: 'Rewrite failed', description: error.message, variant: 'destructive' });
    } finally {
      setAiBusy(false);
    }
  };
  const applyRewrite = async (mode = 'replace') => {
    if (!quillRef.current) return;

    try {
      if (mode === 'replace') {
        if (quillRef.current.setHTML) {
          await quillRef.current.setHTML(aiPreviewText);
        } else {
          // Fallback
          setNote(aiPreviewText);
          handleNoteChange(aiPreviewText);
        }
        toast({ title: 'Rewrite Applied', description: 'Your note has been completely updated.' });
      } else if (mode === 'insert') {
        if (quillRef.current.insertHTML) {
          await quillRef.current.insertHTML(aiPreviewText);
          toast({ title: 'Text Inserted', description: 'AI text inserted at cursor.' });
        } else {
          toast({ title: 'Error', description: 'Insert not supported in this editor mode.', variant: 'destructive' });
        }
      }
    } catch (error) {
      console.error('Error applying rewrite:', error);
      toast({ title: 'Application Failed', description: 'Could not apply changes.', variant: 'destructive' });
    } finally {
      setAiPreviewOpen(false);
    }
  };




  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto p-8">

      <div className="flex justify-center items-center mb-6 relative">
        <div className="text-center">
          {pageIndex === 0 && chapterTitle && (
            <div className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-1">
              {chapterTitle}
            </div>
          )}
          <h2 className="text-2xl font-bold text-gray-800">
            Page {pageIndex + 1}
          </h2>
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 group">
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

      <Dialog open={mediaPickerOpen} onOpenChange={(open) => {
        setMediaPickerOpen(open);
        if (!open) setSelectedAssets([]);
      }}>
        <DialogContent className="max-w-4xl bg-white rounded-2xl shadow-2xl border border-gray-100 p-6">
          <DialogHeader>
            <DialogTitle>Add media to this page</DialogTitle>
            <DialogDescription>
              Upload from your computer or attach existing assets from your library.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 mb-4">
            <Button
              variant={mediaPickerTab === 'upload' ? 'appPrimary' : 'outline'}
              onClick={() => setMediaPickerTab('upload')}
              className="flex-1"
            >
              Upload from computer
            </Button>
            <Button
              variant={mediaPickerTab === 'library' ? 'appPrimary' : 'outline'}
              onClick={() => setMediaPickerTab('library')}
              className="flex-1"
            >
              Choose from asset registry
            </Button>
          </div>

          {mediaPickerTab === 'upload' ? (
            <div
              className="p-6 border-2 border-dashed rounded-lg bg-gray-50 text-center text-sm text-app-gray-700"
              onClick={openFileDialog}
            >
              <UploadCloud className="h-10 w-10 mx-auto mb-3 text-app-iris" />
              <p className="font-semibold">Select files to upload</p>
              <p className="text-xs text-app-gray-500">Up to 5 images or videos per page</p>
              <div className="mt-4">
                <Button variant="appPrimary" onClick={(e) => {
                  e.stopPropagation();
                  openFileDialog();
                }}>
                  Choose files
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[220px,1fr]">
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {albums.length === 0 ? (
                  <div className="text-sm text-app-gray-600 bg-app-gray-50 border border-app-gray-100 rounded-md p-3">
                    No asset albums yet. Create one from the Asset Registry page.
                  </div>
                ) : (
                  albums.map((album) => (
                    <button
                      key={album.id}
                      className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${selectedAlbumId === album.id
                        ? 'border-app-iris bg-app-iris/10 text-app-iris'
                        : 'border-app-gray-100 hover:border-app-iris/40'
                        }`}
                      onClick={() => setSelectedAlbumId(album.id)}
                    >
                      <div className="font-semibold text-sm">{album.name || 'Untitled album'}</div>
                      <div className="text-xs text-app-gray-500">{album.mediaCount || 0} assets</div>
                    </button>
                  ))
                )}
              </div>

              <div className="border border-app-gray-100 rounded-lg p-4 min-h-[260px] max-h-[400px] overflow-y-auto bg-white">
                {loadingAlbums ? (
                  <div className="flex items-center justify-center h-full text-sm text-app-gray-600">Loading assets...</div>
                ) : !selectedAlbumId ? (
                  <div className="text-sm text-app-gray-600">Select an album to view its assets.</div>
                ) : albumMedia.length === 0 ? (
                  <div className="text-sm text-app-gray-600">No assets found in this album.</div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {albumMedia.map((asset) => {
                      const isSelected = selectedAssets.some(a => (a.storagePath || a.url) === (asset.storagePath || asset.url));
                      return (
                        <button
                          key={`${asset.storagePath || asset.url}`}
                          className={`relative rounded-lg overflow-hidden border-2 group transition-all ${isSelected
                            ? 'border-app-iris bg-app-iris/10'
                            : 'border-app-gray-100 hover:border-app-iris/60'
                            }`}
                          onClick={() => toggleAssetSelection(asset)}
                        >
                          {asset.type === 'image' ? (
                            <img src={asset.url} alt={asset.name} className="h-24 w-full object-cover" />
                          ) : (
                            <video src={asset.url} className="h-24 w-full object-cover" />
                          )}
                          <div className={`absolute inset-0 transition-opacity flex items-center justify-center ${isSelected ? 'bg-app-iris/40' : 'bg-black/30 opacity-0 group-hover:opacity-100'
                            }`}>
                            {isSelected ? (
                              <div className="bg-app-iris rounded-full p-1">
                                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            ) : (
                              <span className="text-xs font-semibold text-white">Select</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action buttons for selected assets */}
              {selectedAssets.length > 0 && (
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedAssets([])}
                    size="sm"
                  >
                    Clear Selection
                  </Button>
                  <Button
                    variant="appPrimary"
                    onClick={handleSaveSelectedAssets}
                    size="sm"
                  >
                    Add ({selectedAssets.length})
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AI Rewrite Preview Dialog */}
      <Dialog open={aiPreviewOpen} onOpenChange={setAiPreviewOpen}>
        <DialogContent className="max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-100 p-6">
          <DialogHeader>
            <DialogTitle>AI Rewrite Suggestion</DialogTitle>
            <DialogDescription>
              Here is the suggested rewrite. You can apply it or discard it.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-gray-50 p-4 rounded-md text-sm text-gray-800 max-h-[60vh] overflow-y-auto whitespace-pre-wrap">
            {aiPreviewText}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setAiPreviewOpen(false)}
            >
              Discard
            </Button>
            <Button
              variant="secondary"
              onClick={() => applyRewrite('insert')}
            >
              Insert at Cursor
            </Button>
            <Button
              variant="appPrimary"
              onClick={() => applyRewrite('replace')}
            >
              Replace All
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dropzone / uploader */}
      <div
        className="mb-4 p-4 border-2 border-dashed rounded-lg flex flex-col justify-center items-center bg-gray-50 text-gray-500 hover:bg-violet-50 hover:border-violet-400 transition-colors"
        onClick={() => { setMediaPickerTab('upload'); setMediaPickerOpen(true); }}
      >
        {(!page.media || page.media.length === 0) && Object.keys(uploadProgress).length === 0 && (
          <div className="text-center pointer-events-none">
            <UploadCloud className="h-10 w-10 mx-auto mb-2" />
            <p className="font-semibold">Add media to this page</p>
            <p className="text-xs">Upload from your computer or choose from the asset registry</p>
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
            <div className="flex-grow bg-transparent overflow-hidden relative">
              <BlockEditor
                key={page.id} // Remount on page change
                ref={quillRef}
                initialContent={note || ""}
                onChange={handleNoteChange}
                onSave={handleSave}
                onFocus={() => onFocus?.(page.id)}
              /></div>
          </div>
        </div>

        {/* Focus Trigger */}
        <div
          className="absolute inset-0 -z-10"
          onClick={() => onFocus && onFocus()}
        />
      </div>

      {/* Media Preview Overlay */}
      {
        previewOpen && previewItem && (
          <div
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={closePreview}
          >
            <button
              className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
              onClick={closePreview}
            >
              <X className="h-8 w-8" />
            </button>

            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-all"
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
            >
              <ChevronLeft className="h-8 w-8" />
            </button>

            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-all"
              onClick={(e) => { e.stopPropagation(); goNext(); }}
            >
              <ChevronRight className="h-8 w-8" />
            </button>

            <div className="relative max-w-5xl w-full max-h-[85vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
              {previewItem.type === 'video' ? (
                <video src={previewItem.url} controls autoPlay className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" />
              ) : (
                <img src={previewItem.url} alt={previewItem.name} className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
              )}
              <div className="mt-4 text-white/80 text-sm font-medium">
                {previewIndex + 1} / {mediaList.length}
              </div>
            </div>
          </div>
        )
      }

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!mediaToDelete}
        onClose={() => setMediaToDelete(null)}
        onConfirm={confirmMediaDelete}
        title="Delete Media"
        description="Are you sure you want to remove this media from the page? This cannot be undone."
      />
    </div >
  );
});

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
      <div className="shrink-0 bg-card border-l border-border flex flex-col items-center w-12 transition-all duration-300">
        <div className="h-[57px] flex items-center justify-center w-full border-b border-border bg-card/80 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMinimized(false)}
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Expand AI Assistant"
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
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

      <div className="h-[57px] px-4 border-b border-border flex items-center justify-between bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-app-iris" />
          <h3 className="font-semibold text-foreground text-sm">AI Assistant</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMinimized(true)}
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          title="Minimize"
        >
          <PanelRightClose className="h-4 w-4" />
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
  console.log('BookDetail: Component Mounting');
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
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(288);
  const [isResizingLeft, setIsResizingLeft] = useState(false);

  // Resize Handler Logic
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingLeft) return;
      const newWidth = e.clientX;
      setLeftSidebarWidth(Math.max(200, Math.min(480, newWidth)));
    };
    const handleMouseUp = () => setIsResizingLeft(false);

    if (isResizingLeft) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, [isResizingLeft]);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [modalState, setModalState] = useState({ isOpen: false });
  const [pageDrafts, setPageDrafts] = useState({});
  const [pageSaveConfirmOpen, setPageSaveConfirmOpen] = useState(false);
  const [pendingPageAction, setPendingPageAction] = useState(null);
  const [editingChapterId, setEditingChapterId] = useState(null);
  const [editingChapterTitle, setEditingChapterTitle] = useState('');
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [pendingChapterEdit, setPendingChapterEdit] = useState(null);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [editBookModalOpen, setEditBookModalOpen] = useState(false);
  const [coAuthorModalOpen, setCoAuthorModalOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [coAuthorUsers, setCoAuthorUsers] = useState([]);
  const searchTimeoutRef = useRef(null);
  const { toast } = useToast();

  // ---------------------------------------------------------------------------
  // 📜 Continuous Scroll & Footer Logic
  // ---------------------------------------------------------------------------
  const pageRefs = useRef({});
  const pageContainerRefs = useRef({});
  const scrollContainerRef = useRef(null);
  const [activePageId, setActivePageId] = useState(null);
  const [footerAiStyle, setFooterAiStyle] = useState('Improve clarity');
  const [showFooterStyleDropdown, setShowFooterStyleDropdown] = useState(false);

  // Update active page on scroll
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
          const pageId = entry.target.getAttribute('data-page-id');
          if (pageId) {
            setActivePageId(pageId);
          }
        }
      });
    }, {
      root: scrollContainerRef.current,
      threshold: [0.1, 0.3, 0.5]
    });

    const currentRefs = pageContainerRefs.current;

    // Register all pages
    Object.values(currentRefs).forEach(el => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [pages]);

  // Sync activePageId with selectedPageId when user clicks sidebar
  useEffect(() => {
    if (selectedPageId) {
      // If user clicked sidebar, scroll to that page
      const el = pageContainerRefs.current[selectedPageId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActivePageId(selectedPageId);
      }
    }
  }, [selectedPageId]);

  const handleFooterSave = async () => {
    if (activePageId && pageRefs.current[activePageId]) {
      await pageRefs.current[activePageId].save();
    }
  };

  const handleFooterRewrite = async () => {
    if (activePageId && pageRefs.current[activePageId]) {
      await pageRefs.current[activePageId].insertAI(footerAiStyle);
    }
  };

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

  const handleDraftChange = useCallback((pageId, newContent) => {
    setPageDrafts(prev => {
      if (newContent === null) {
        const next = { ...prev };
        delete next[pageId];
        return next;
      }
      return { ...prev, [pageId]: newContent };
    });
  }, []);

  // Permission checks
  // Permission checks
  const isOwner = book?.ownerId === user?.uid || book?.members?.[user?.uid] === 'Owner';
  const isCoAuthor = book?.members?.[user?.uid] === 'Co-author';
  const canEdit = isOwner || isCoAuthor;
  const chapterTitle = chapters.find(c => c.id === selectedChapterId)?.title;


  console.log('👤 Auth Check:', {
    userId: user?.uid,
    bookOwnerId: book?.ownerId,
    isOwner,
    members: book?.members
  });

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

  const handleBookUpdate = (updatedBook) => {
    setBook(prev => ({ ...prev, ...updatedBook }));
  };

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
        : `Are you sure you want to permanently delete "${data.shortNote || 'Untitled Page'}"? This action cannot be undone.`,
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

  // Legacy AI functions removed. PageEditor handles AI writes internally.
  // Keeping this comment as placeholder if logic path is needed.

  const handlePageFocus = useCallback((pageId) => {
    // console.log('Focus triggered for:', pageId);
    if (pageId && activePageId !== pageId) {
      console.log('Set active page (focus):', pageId);
      setActivePageId(pageId);
    }
  }, [activePageId]);

  const handlePageNavigate = useCallback((pageId, direction) => {
    const currentIndex = pages.findIndex(p => p.id === pageId);
    if (currentIndex === -1) return;

    let targetPageId = null;
    if (direction === 'next' && currentIndex < pages.length - 1) {
      targetPageId = pages[currentIndex + 1].id;
    } else if (direction === 'prev' && currentIndex > 0) {
      targetPageId = pages[currentIndex - 1].id;
    }

    if (targetPageId) {
      // Scroll to the target page
      const el = pageContainerRefs.current[targetPageId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActivePageId(targetPageId); // Footer updates
      }
    }
  }, [pages]);

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

      toast({ title: 'New Page Added' });

    } catch (error) {
      console.error('Error creating page:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create page. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const selectedPage = selectedPageId ? pages.find(p => p.id === selectedPageId) : null;
  const selectedDraft = selectedPageId ? pageDrafts[selectedPageId] : undefined;
  const isSelectedPageDirty = !!(selectedPageId && selectedPage && selectedDraft != null && selectedDraft !== (selectedPage.note || ''));

  const onDraftChange = useCallback((pageId, nextNote) => {
    setPageDrafts(prev => {
      const next = { ...prev };
      if (nextNote == null) {
        delete next[pageId];
      } else {
        next[pageId] = nextNote;
      }
      return next;
    });
  }, []);

  const proceedPendingPageAction = useCallback(async () => {
    const action = pendingPageAction;
    setPendingPageAction(null);
    setPageSaveConfirmOpen(false);
    if (!action) return;

    if (action.type === 'select') {
      setSelectedChapterId(action.chapterId);
      setSelectedPageId(action.pageId);
      return;
    }

    if (action.type === 'addPage') {
      await handleAddPage();
    }
  }, [pendingPageAction, handleAddPage]);

  const requestSelectPage = useCallback((chapterId, pageId) => {
    if (isSelectedPageDirty && pageId !== selectedPageId) {
      setPendingPageAction({ type: 'select', chapterId, pageId });
      setPageSaveConfirmOpen(true);
      return;
    }
    setSelectedChapterId(chapterId);
    setSelectedPageId(pageId);
  }, [isSelectedPageDirty, selectedPageId]);

  const requestAddPage = useCallback(() => {
    if (isSelectedPageDirty) {
      setPendingPageAction({ type: 'addPage' });
      setPageSaveConfirmOpen(true);
      return;
    }
    handleAddPage();
  }, [isSelectedPageDirty, handleAddPage]);

  const saveSelectedDraft = useCallback(async () => {
    if (!selectedPageId || !selectedPage) return;
    const noteToSave = selectedDraft ?? selectedPage.note ?? '';
    const plain = stripHtml(noteToSave);
    const shortNote = plain.substring(0, 40) + (plain.length > 40 ? '...' : '');

    try {
      const updatePageFn = httpsCallable(functions, 'updatePage');
      await updatePageFn({
        bookId,
        chapterId: selectedChapterId,
        pageId: selectedPageId,
        note: noteToSave,
        media: selectedPage.media || [],
      });
      handlePageUpdate({ ...selectedPage, note: noteToSave, shortNote });
      onDraftChange(selectedPageId, null);
    } catch (e) {
      console.error('Failed to save page before leaving:', e);
      toast({ title: 'Error', description: 'Failed to save page.', variant: 'destructive' });
      throw e;
    }
  }, [bookId, selectedChapterId, selectedPageId, selectedPage, selectedDraft, onDraftChange, toast]);

  const handlePageLeaveSave = useCallback(async () => {
    try {
      await saveSelectedDraft();
      await proceedPendingPageAction();
    } catch (_) {
      // keep modal open on error
    }
  }, [saveSelectedDraft, proceedPendingPageAction]);

  const handlePageLeaveDiscard = useCallback(async () => {
    if (selectedPageId) onDraftChange(selectedPageId, null);
    await proceedPendingPageAction();
  }, [selectedPageId, onDraftChange, proceedPendingPageAction]);

  function handlePageUpdate(update) {
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
  }

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
    <>
      <ConfirmationModal {...modalState} onClose={closeModal} onConfirm={handleConfirmDelete} />
      <Dialog open={pageSaveConfirmOpen} onOpenChange={setPageSaveConfirmOpen}>
        <DialogContent className="w-full max-w-md p-6 bg-white rounded-2xl shadow-lg text-center">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-gray-800">Save changes?</DialogTitle>
            <DialogDescription className="mt-2 text-gray-600">
              You have unsaved changes on this page. What would you like to do?
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6 flex justify-center space-x-4">
            <Button variant="outline" onClick={() => setPageSaveConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handlePageLeaveDiscard}>Discard</Button>
            <Button onClick={handlePageLeaveSave}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
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

      <EditBookModal
        isOpen={editBookModalOpen}
        onClose={() => setEditBookModalOpen(false)}
        book={book}
        onUpdate={handleBookUpdate}
      />

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

      <DragDropContext onDragEnd={onDragEnd}>
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
              {book?.coverImageUrl && (
                <img
                  src={book.coverImageUrl}
                  alt="Cover"
                  className="h-8 w-8 rounded object-cover border border-gray-200"
                />
              )}
              <h1 className="text-lg font-semibold text-app-gray-900 truncate max-w-md" title={book?.babyName}>
                {book?.babyName}
              </h1>
              {isOwner && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditBookModalOpen(true)}
                  className="ml-2 h-6 w-6 text-app-gray-400 hover:text-app-gray-900"
                  title="Edit book details"
                >
                  <Edit className="h-3 w-3" />
                </Button>
              )}
            </div>

            {isOwner && (
              <div className="flex items-center gap-2">
                <span title="Currently Disabled, Coming Soon">
                  <Button
                    variant="appGhost"
                    disabled
                    className="flex items-center gap-2 h-8 text-xs pointer-events-none"
                  >
                    <Globe className="h-3 w-3" />
                    Publish
                  </Button>
                </span>
                <span title="Currently Disabled, Coming Soon">
                  <Button
                    variant="outline"
                    disabled
                    className="flex items-center gap-2 h-8 text-xs pointer-events-none"
                  >
                    <Users className="h-3 w-3" />
                    Co-Authors
                  </Button>
                </span>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left Sidebar: Chapters */}
            <div
              className={`${leftSidebarOpen ? '' : 'w-12 items-center'} bg-app-gray-50 border-r border-border flex flex-col shrink-0 overflow-visible relative z-20 transition-all duration-300`}
              style={leftSidebarOpen ? { width: leftSidebarWidth } : {}}
            >
              {leftSidebarOpen && (
                <div
                  className={`absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-app-iris/40 transition-colors z-30 ${isResizingLeft ? 'bg-app-iris/60' : 'bg-transparent'}`}
                  onMouseDown={(e) => { e.preventDefault(); setIsResizingLeft(true); }}
                />
              )}
              <div className="p-2 border-b border-border flex justify-between items-center bg-card/80 backdrop-blur-sm h-[57px]">
                {leftSidebarOpen ? (
                  <>
                    <span className="font-semibold text-sm pl-2">Chapters</span>
                    <Button variant="ghost" size="icon" onClick={() => setLeftSidebarOpen(false)} className="h-6 w-6">
                      <PanelLeftClose className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="icon" onClick={() => setLeftSidebarOpen(true)} className="h-6 w-6 mt-1">
                    <PanelLeftOpen className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {leftSidebarOpen && (
                <>
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

                  <div className="flex-1 overflow-y-auto overflow-x-visible p-2">
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
                                            requestSelectPage(chapter.id, pageSummary.pageId);
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

                                          {canEdit && <HoverDeleteMenu side="right" onDelete={() => openDeleteModal('page', { ...pageSummary, chapterId: chapter.id, pageIndex: index })} />}
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
                </>
              )}
            </div>

            {/* Center: Editor List */}
            <div className="flex-1 flex flex-col min-h-0 relative bg-white overflow-hidden">
              <div className="flex-1 overflow-y-auto h-full scroll-smooth" ref={scrollContainerRef}>
                <div className="min-h-full pb-32">
                  {pages.length > 0 ? (
                    pages.map((p, index) => (
                      <div
                        key={p.id}
                        ref={el => pageContainerRefs.current[p.id] = el}
                        data-page-id={p.id}
                        className="max-w-5xl mx-auto px-8"
                      >
                        {/* Page Divider (except for first page) */}
                        {index > 0 && (
                          <div className="w-full h-px bg-gray-100 my-10 flex items-center justify-center">
                            <span className="bg-white px-3 text-xs font-medium text-gray-400 uppercase tracking-widest">
                              Page {index + 1}
                            </span>
                          </div>
                        )}

                        {/* Page Header (First page only or all?) User said "page 1, 2" */}


                        <PageEditor
                          ref={el => pageRefs.current[p.id] = el}
                          bookId={bookId}
                          chapterId={selectedChapterId}
                          page={p}
                          onPageUpdate={handlePageUpdate}
                          onAddPage={handleAddPage}
                          onNavigate={(dir) => handlePageNavigate(p.id, dir)}
                          pageIndex={index}
                          totalPages={pages.length}
                          chapterTitle={chapterTitle}
                          draftNote={pageDrafts[p.id]}
                          onDraftChange={(val) => handleDraftChange(p.id, val)}
                          onFocus={handlePageFocus}
                        />
                      </div>
                    ))
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
                      {selectedChapterId && canEdit && <Button onClick={requestAddPage} className="mt-6"><PlusCircle className="h-4 w-4 mr-2" />Add Page</Button>}
                    </div>
                  )}

                  {/* Space at bottom for scrolling past last page */}
                  <div className="h-20"></div>
                </div>
              </div>

              {/* Sticky Footer */}
              {pages.length > 0 && (
                <div className="shrink-0 border-t border-gray-100 bg-white/80 backdrop-blur-md p-4 z-30">
                  <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
                    {/* Status Indicator */}
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="font-medium text-gray-800">
                        {activePageId
                          ? `Page ${pages.findIndex(p => p.id === activePageId) + 1} of ${pages.length}`
                          : 'No page selected'}
                      </span>
                      {activePageId && pageDrafts[activePageId] && (
                        <span className="text-amber-600 flex items-center gap-1 text-xs">
                          <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                          Unsaved changes
                        </span>
                      )}
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2">
                      {/* AI Style */}
                      <div className="relative flex items-center style-dropdown-container">
                        <Input
                          type="text"
                          value={footerAiStyle}
                          onChange={(e) => setFooterAiStyle(e.target.value)}
                          className="h-9 w-48 text-sm"
                          placeholder="AI Instruction..."
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowFooterStyleDropdown(!showFooterStyleDropdown)}
                          className="ml-1 h-9 px-2"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>

                        {showFooterStyleDropdown && (
                          <div className="absolute bottom-full right-0 mb-2 w-48 bg-white border rounded-md shadow-lg py-1 z-50">
                            {['Improve clarity', 'Make it concise', 'Fix grammar', 'Expand this'].map(style => (
                              <button
                                key={style}
                                onClick={() => {
                                  setFooterAiStyle(style);
                                  setShowFooterStyleDropdown(false);
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                              >
                                {style}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <Button
                        onClick={handleFooterRewrite}
                        variant="secondary"
                        size="sm"
                        disabled={!activePageId}
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Rewrite
                      </Button>

                      <Button
                        onClick={handleFooterSave}
                        variant="appSuccess"
                        size="sm"
                        className="min-w-[100px]"
                        disabled={!activePageId}
                      >
                        Save Page {activePageId ? pages.findIndex(p => p.id === activePageId) + 1 : ''}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Sidebar: Chat */}
            <ChatPanel />
          </div>
        </div>
      </DragDropContext>
    </>
  );
};

export default BookDetail;
