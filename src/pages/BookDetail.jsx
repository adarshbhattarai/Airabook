import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, writeBatch, query, orderBy, where, limit
} from 'firebase/firestore';
import { firestore, functions } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import {
  Trash2, PlusCircle, ChevronRight, ChevronDown, ArrowLeft, GripVertical, Sparkles, Globe, Users, UserPlus, X, Edit
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { httpsCallable } from 'firebase/functions';
import EditBookModal from '@/components/EditBookModal';
import PageEditor from '@/components/PageEditor';
import ChatPanel from '@/components/ChatPanel';
import GenerateChapterContent from '@/components/GenerateChapterContent';
import ChapterChatBox from '@/components/ChapterChatBox';
import HoverDeleteMenu from '@/components/ui/HoverDeleteMenu';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { usePaginationReflow } from '@/hooks/usePaginationReflow';
import { useBookDetailState } from '@/hooks/useBookDetailState';
import { PanelLeftClose, PanelLeftOpen, Type } from 'lucide-react';
import {
  getMidpointString,
  getNewOrderBetween,
  stripHtml,
  calculatePageScore,
  textToHtml,
  isLikelyHtml,
  convertToEmulatorURL
} from '@/lib/pageUtils';

// --- focusWithRetry: helper for reliable cursor placement on newly created pages ---
const focusWithRetry = async (pageRefs, pageId, position = 'start', maxAttempts = 20) => {
  console.log(`🎯 focusWithRetry called: pageId=${pageId}, position=${position}`);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const api = pageRefs.current?.[pageId];
    if (api) {
      const focusFn = position === 'end' ? api.focusAtEnd : api.focusAtStart;
      console.log(`  Attempt ${attempt + 1}: api found, calling focusFn (${position})...`);
      if (focusFn?.()) {
        console.log(`  ✅ Focus successful on page ${pageId} at ${position}`);
        return true;
      }
    } else {
      console.log(`  Attempt ${attempt + 1}: api not ready yet...`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.log(`  ❌ Focus failed after ${maxAttempts} attempts for page ${pageId}`);
  return false;
};

// PageEditor and ChatPanel are imported from separate files

// ======================
// BookDetail Component (Main Orchestrator)
// ======================
// NOTE: The large inline PageEditor and ChatPanel components have been extracted.
// PageEditor -> src/components/PageEditor/index.jsx
// ChatPanel -> src/components/ChatPanel.jsx

const BookDetail = () => {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // ---------------------------------------------------------------------------
  // ⚡ OPTIMIZATION 1: Synchronous State Initialization
  // ---------------------------------------------------------------------------
  const [book, setBook] = useState(() => location.state?.prefetchedBook || null);
  const [chapters, setChapters] = useState(() => location.state?.prefetchedChapters || []);
  const [loading, setLoading] = useState(() => !location.state?.prefetchedBook);
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
  const [chapterChatInput, setChapterChatInput] = useState('');
  const [chatPanelSeed, setChatPanelSeed] = useState(null);

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

  const {
    newChapterTitle,
    setNewChapterTitle,
    modalState,
    setModalState,
    pageDrafts,
    setPageDrafts,
    pageSaveConfirmOpen,
    setPageSaveConfirmOpen,
    pendingPageAction,
    setPendingPageAction,
    editingChapterId,
    setEditingChapterId,
    editingChapterTitle,
    setEditingChapterTitle,
    saveConfirmOpen,
    setSaveConfirmOpen,
    pendingChapterEdit,
    setPendingChapterEdit,
    publishModalOpen,
    setPublishModalOpen,
    editBookModalOpen,
    setEditBookModalOpen,
    coAuthorModalOpen,
    setCoAuthorModalOpen,
    userSearchQuery,
    setUserSearchQuery,
    searchResults,
    setSearchResults,
    isSearching,
    setIsSearching,
    coAuthorUsers,
    setCoAuthorUsers,
    searchTimeoutRef,
    pageRefs,
    pageContainerRefs,
    scrollContainerRef,
    activePageId,
    setActivePageId,
    isSavingChapter,
    setIsSavingChapter,
    isChatMinimized,
    setIsChatMinimized,
    standardPageHeightPx,
    setStandardPageHeightPx,
    scrollContainerWidthPx,
    setScrollContainerWidthPx
  } = useBookDetailState();
  const { toast } = useToast();

  // ---------------------------------------------------------------------------
  // 📜 Continuous Scroll & Footer Logic
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // 🕐 User Input Tracking for Typing Cooldown
  // ---------------------------------------------------------------------------

  // Pre-emptive creation: Create next page if current is >90% full
  const checkPreemptiveCreation = useCallback((pageId) => {
    const pageIdx = pages.findIndex(p => p.id === pageId);
    if (pageIdx < 0) return;

    // Only if it's the last page (or followed by temps we want to manage?)
    // Actually, just if next page DOES NOT exist.
    if (pages[pageIdx + 1]) return;

    const api = pageRefs.current[pageId];
    if (!api) return;

    const clientH = api.getContentClientHeight();
    const scrollH = api.getContentScrollHeight();

    if (clientH > 0 && scrollH > clientH * 0.9) {
      console.log(`[BookDetail] Pre-emptive creation for ${pageId} (Fill: ${(scrollH / clientH).toFixed(2)})`);

      const currentPage = pages[pageIdx];
      const nextOrder = getNewOrderBetween(currentPage.order, null);
      const tempId = `temp_${Date.now()}_pre`;

      const newPage = {
        id: tempId,
        order: nextOrder,
        note: '',
        media: [],
        shortNote: '',
      };

      setPages(prev => [...prev, newPage]);
      setPageDrafts(prev => ({
        ...prev,
        [tempId]: { blocks: [], updatedAt: Date.now() }
      }));
    }
  }, [pages, setPages, setPageDrafts, getNewOrderBetween]);

  const lastUserInputAtRef = useRef({});
  const handleUserInput = useCallback((pageId) => {
    lastUserInputAtRef.current[pageId] = Date.now();
    // Trigger pre-emptive check
    requestAnimationFrame(() => checkPreemptiveCreation(pageId));
  }, [checkPreemptiveCreation]);
  const getLastUserInputAt = useCallback((pageId) => {
    return lastUserInputAtRef.current[pageId] || 0;
  }, []);

  // ---------------------------------------------------------------------------
  // 📄 Page API (cursor-aware for reflow)
  // ---------------------------------------------------------------------------
  const pageApi = useMemo(() => ({
    getBlocks: (pageId) => pageRefs.current?.[pageId]?.getBlocks?.() || [],
    setBlocks: (pageId, blocks, options) => {
      const api = pageRefs.current?.[pageId];
      if (!api?.setBlocks) return Promise.resolve();
      return api.setBlocks(blocks, options);
    },
    getScrollHeight: (pageId) => pageRefs.current?.[pageId]?.getContentScrollHeight?.() || 0,
    getClientHeight: (pageId) => pageRefs.current?.[pageId]?.getContentClientHeight?.() || 0,
    // Cursor APIs
    getSelection: (pageId) => pageRefs.current?.[pageId]?.getSelection?.() || null,
    getActiveBlockId: (pageId) => pageRefs.current?.[pageId]?.getActiveBlockId?.() || null,
    isCursorInLastBlock: (pageId) => pageRefs.current?.[pageId]?.isCursorInLastBlock?.() || false,
    isCursorAtEndOfPage: (pageId) => pageRefs.current?.[pageId]?.isCursorAtEndOfPage?.() || false,
    focusBlock: (pageId, blockId, pos) => pageRefs.current?.[pageId]?.focusBlock?.(blockId, pos) || false,
    focusAtStart: (pageId) => pageRefs.current?.[pageId]?.focusAtStart?.() || false,
    focusAtEnd: (pageId) => pageRefs.current?.[pageId]?.focusAtEnd?.() || false,
    splitActiveBlockAtCursor: (pageId) => pageRefs.current?.[pageId]?.splitActiveBlockAtCursor?.() || null,
  }), []);

  const { requestReflow } = usePaginationReflow({
    layoutMode: book?.layoutMode || 'standard',
    pages,
    setPages,
    pageDrafts,
    setPageDrafts,
    chapterId: selectedChapterId,
    getNewOrderBetween,
    pageApi,
    activePageId,
    getLastUserInputAt,
    canRemoveTempPages: true,
    options: {
      maxMovesPerFrame: 1,
      maxOverflowMoves: 1,
      underfillPull: true,
      fillTargetRatio: 0.9,
      minFillRatio: 0.7,
      overflowStartPx: 0,
      overflowStopPx: 24,
      typingCooldownMs: 500,
    },
  });

  const reflowDebounceRef = useRef(null);
  const requestReflowDebounced = useCallback((pageId) => {
    if (!pageId) return;
    if (reflowDebounceRef.current) clearTimeout(reflowDebounceRef.current);
    reflowDebounceRef.current = setTimeout(() => {
      requestReflow(pageId);
    }, 200);
  }, [requestReflow]);

  const isBlocksEmpty = useCallback((blocks = []) => {
    if (!Array.isArray(blocks) || blocks.length === 0) return true;
    return blocks.every((block) => {
      if (!block) return true;
      if (block.type === 'image' || block.type === 'video') return false;
      if (Array.isArray(block.content)) {
        const text = block.content.map(part => part?.text || '').join('').trim();
        return text.length === 0;
      }
      if (typeof block.text === 'string') return block.text.trim().length === 0;
      return true;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // 🚀 Fast-Path: Handle typing at end of full page
  // ---------------------------------------------------------------------------
  const pageAlign = !leftSidebarOpen && isChatMinimized ? 'center' : 'start';

  // (Moved checkPreemptiveCreation up to fix ReferenceError)

  const handleNearOverflowAtEnd = useCallback(async (pageId) => {
    console.log(`[BookDetail] handleNearOverflowAtEnd detected for page ${pageId}`);
    const pageIdx = pages.findIndex(p => p.id === pageId);
    if (pageIdx < 0) return;

    // Check if next page exists
    let nextPage = pages[pageIdx + 1];
    if (!nextPage) {
      // Create a temp page
      const currentPage = pages[pageIdx];
      const nextOrder = pages[pageIdx + 1]?.order;
      const newOrder = getNewOrderBetween(currentPage.order, nextOrder);
      const tempId = `temp_${Date.now()}`;
      console.log(`[BookDetail] Creating new temp page: ${tempId} after ${currentPage?.id}`);
      nextPage = {
        id: tempId,
        order: newOrder,
        note: '',
        media: [],
        shortNote: '',
      };
      setPages(prev => {
        const newPages = [...prev];
        newPages.splice(pageIdx + 1, 0, nextPage);
        return newPages;
      });
      setPageDrafts(prev => ({
        ...prev,
        [tempId]: { blocks: [], updatedAt: Date.now() }
      }));
    }

    const currentPage = pages[pageIdx];
    if (currentPage?.id && !currentPage.id.startsWith('temp_')) {
      // ⚡ OPTIMIZATION: Fire and forget save to avoid blocking UI
      pageRefs.current?.[currentPage.id]?.save?.().catch(e => console.error('Background save failed:', e));
    }

    // Focus the next page at start with retry
    console.log(`📄 handleNearOverflowAtEnd: Moving cursor to next page ${nextPage.id}`);
    await focusWithRetry(pageRefs, nextPage.id, 'start');
  }, [pages, setPages, setPageDrafts, getNewOrderBetween]);

  const handleBackspaceAtStart = useCallback((pageId) => {
    const pageIdx = pages.findIndex(p => p.id === pageId);
    if (pageIdx <= 0) return false;

    const page = pages[pageIdx];
    const blocks = pageRefs.current?.[pageId]?.getBlocks?.() || pageDrafts[pageId]?.blocks || [];
    if (!isBlocksEmpty(blocks)) return false;

    const prevPage = pages[pageIdx - 1];
    if (page?.id?.startsWith('temp_')) {
      setPages(prev => prev.filter(p => p.id !== pageId));
      setPageDrafts(prev => {
        const next = { ...prev };
        delete next[pageId];
        return next;
      });
      setChapters(prev => prev.map(c => c.id === selectedChapterId ? {
        ...c,
        pagesSummary: (c.pagesSummary || []).filter(ps => ps.pageId !== pageId)
      } : c));

      if (selectedPageId === pageId && prevPage) {
        setSelectedPageId(prevPage.id);
      }
    }

    setTimeout(() => {
      if (prevPage) {
        const el = pageContainerRefs.current[prevPage.id];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        focusWithRetry(pageRefs, prevPage.id, 'end');
      }
    }, 0);

    return true;
  }, [pages, pageDrafts, selectedChapterId, selectedPageId, isBlocksEmpty]);

  const removeTempPage = useCallback((pageId) => {
    const pageIdx = pages.findIndex(p => p.id === pageId);
    if (pageIdx < 0) return;
    const prevPage = pages[pageIdx - 1] || pages[pageIdx + 1] || null;

    setPages(prev => prev.filter(p => p.id !== pageId));
    setPageDrafts(prev => {
      const next = { ...prev };
      delete next[pageId];
      return next;
    });
    setChapters(prev => prev.map(c => c.id === selectedChapterId ? {
      ...c,
      pagesSummary: (c.pagesSummary || []).filter(ps => ps.pageId !== pageId)
    } : c));

    if (selectedPageId === pageId && prevPage) {
      setSelectedPageId(prevPage.id);
    }
  }, [pages, selectedChapterId, selectedPageId]);

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
    Object.values(currentRefs).forEach(el => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [pages]);

  // Standard layout: compute viewport-based fixed page height
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const compute = () => {
      const h = el.clientHeight || 0;
      const w = el.clientWidth || 0;
      const clampedHeight = Math.max(900, Math.min(15000, h - 140));
      setStandardPageHeightPx(clampedHeight);
      setScrollContainerWidthPx(w);
    };

    compute();
    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!pages?.length) return;
    const startId = activePageId || pages[0]?.id;
    if (startId) requestReflowDebounced(startId);
  }, [standardPageHeightPx, scrollContainerWidthPx, pages, activePageId, requestReflowDebounced]);

  useEffect(() => {
    if (!pages?.length) return;
    const firstId = pages[0]?.id;
    if (firstId) requestReflowDebounced(firstId);
  }, [pages?.length, requestReflowDebounced]);

  // Sync activePageId with selectedPageId when user clicks sidebar
  useEffect(() => {
    if (selectedPageId) {
      const el = pageContainerRefs.current[selectedPageId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActivePageId(selectedPageId);
        focusWithRetry(pageRefs, selectedPageId, 'start');
      }
    }
  }, [selectedPageId]);

  const handleSaveChapter = async () => {
    if (!selectedChapterId || isSavingChapter) return;
    setIsSavingChapter(true);
    try {
      for (const page of pages) {
        await pageRefs.current?.[page.id]?.save?.();
      }
      toast({ title: 'Chapter saved', description: 'All pages have been saved.' });
    } catch (error) {
      console.error('Save chapter failed:', error);
      toast({ title: 'Save Failed', description: error.message || 'Could not save chapter.', variant: 'destructive' });
    } finally {
      setIsSavingChapter(false);
    }
  };

  const isFetchingRef = useRef(false);
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


  // Permissions end


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
    else if (type === 'page') {
      if (data.pageId?.startsWith('temp_')) {
        removeTempPage(data.pageId);
      } else {
        await handleDeletePage(data.chapterId, data.pageId, data.pageIndex);
      }
    }
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

  const handlePageNavigate = useCallback(async (pageId, direction) => {
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
      }
      // Focus using PageEditor ref with proper cursor positioning
      const focusPosition = direction === 'next' ? 'start' : 'end';
      console.log(`📄 handlePageNavigate: Moving cursor to ${direction} page ${targetPageId} at ${focusPosition}`);
      await focusWithRetry(pageRefs, targetPageId, focusPosition);
    }
  }, [pages]);

  const handleAddPage = async (saveImmediately = false, overflowContent = '') => {
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

      if (!saveImmediately) {
        const tempId = `temp_${Date.now()}`;
        const newPage = {
          id: tempId,
          chapterId: selectedChapterId,
          note: overflowContent, // Use overflow content if provided
          media: [],
          order: newOrder,
        };

        // Update local state immediately
        setPages([...pages, newPage].sort((a, b) => a.order.localeCompare(b.order)));
        setSelectedPageId(tempId);
        setPageDrafts(prev => ({
          ...prev,
          [tempId]: { blocks: [], updatedAt: Date.now() }
        }));

        // Update sidebar
        const plain = stripHtml(overflowContent);
        const newPageSummary = {
          pageId: tempId,
          shortNote: plain ? plain.substring(0, 40) + (plain.length > 40 ? '...' : '') : 'New Page (Draft)',
          order: newOrder
        };

        setChapters(chapters.map(c => c.id === selectedChapterId ? {
          ...c,
          pagesSummary: [...(c.pagesSummary || []), newPageSummary].sort((a, b) => a.order.localeCompare(b.order))
        } : c));

        toast({ title: 'New Page Added', description: overflowContent ? 'Content has been moved to the new page.' : 'This page is a draft and will be saved when you click Save.' });

        // UX: Scroll and focus on the new draft page
        setTimeout(() => {
          const el = pageContainerRefs.current[tempId];
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            pageRefs.current[tempId]?.focus?.();
          }
        }, 50);
        return;
      }

      // saveImmediately path kept for future use

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
  const isSelectedPageDirty = !!(selectedPageId && selectedPage && selectedDraft != null);

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
    if (!selectedPageId) return;

    try {
      // Prefer saving through the page editor (handles temp_ pages too).
      if (pageRefs.current?.[selectedPageId]?.save) {
        await pageRefs.current[selectedPageId].save();
        return;
      }

      // Fallback: save HTML directly if ref is unavailable
      const current = selectedPageId ? pages.find(p => p.id === selectedPageId) : null;
      if (!current) return;
      const html = await (pageRefs.current?.[selectedPageId]?.getHTML?.() ?? Promise.resolve(current.note || ''));
      const plain = stripHtml(html);
      const shortNote = plain.substring(0, 40) + (plain.length > 40 ? '...' : '');

      const updatePageFn = httpsCallable(functions, 'updatePage');
      await updatePageFn({
        bookId,
        chapterId: selectedChapterId,
        pageId: selectedPageId,
        note: html,
        media: current.media || [],
      });
      handlePageUpdate({ ...current, note: html, shortNote });
      onDraftChange(selectedPageId, null);
    } catch (e) {
      console.error('Failed to save page before leaving:', e);
      toast({ title: 'Error', description: 'Failed to save page.', variant: 'destructive' });
      throw e;
    }
  }, [bookId, selectedChapterId, selectedPageId, pages, onDraftChange, toast]);

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

  const handleReplacePageId = (oldId, newPage) => {
    setPages(prev => prev.map(p => p.id === oldId ? newPage : p));
    setChapters(prev => prev.map(c => ({
      ...c,
      pagesSummary: (c.pagesSummary || []).map(ps => ps.pageId === oldId ? { ...ps, pageId: newPage.id, shortNote: stripHtml(newPage.note || '').substring(0, 40) } : ps)
    })));
    setPageDrafts(prev => {
      const val = prev[oldId];
      const next = { ...prev };
      delete next[oldId];
      if (val !== undefined) next[newPage.id] = val;
      return next;
    });
    if (selectedPageId === oldId) setSelectedPageId(newPage.id);
  };

  // Pagination overflow/underflow is handled centrally via the reflow engine (no HTML splitting).

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
                        className={book?.layoutMode === 'standard' ? 'w-full max-w-5xl mx-auto px-6' : 'w-full pl-4 pr-6'}
                      >
                        {/* Page Divider (except for first page) */}
                        {index > 0 && book?.layoutMode !== 'standard' && (
                          <div className="w-full h-px bg-gray-100 my-10" />
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
                          draft={pageDrafts[p.id]}
                          onDraftChange={(pageId, val) => handleDraftChange(pageId, val)}
                          onBlocksChange={(pageId) => requestReflowDebounced(pageId)}
                          onRequestReflow={(pageId) => requestReflow(pageId)}
                          onNearOverflowAtEnd={handleNearOverflowAtEnd}
                          onBackspaceAtStart={handleBackspaceAtStart}
                          onUserInput={handleUserInput}
                          onFocus={handlePageFocus}
                          onReplacePageId={handleReplacePageId}
                          onRequestPageDelete={(page, pageIndex) => openDeleteModal('page', { ...page, chapterId: selectedChapterId, pageId: page.id, pageIndex })}
                          pages={pages}
                          layoutMode={book?.layoutMode}
                          pageAlign={pageAlign}
                          standardPageHeightPx={standardPageHeightPx}
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
                      {selectedChapterId && (
                        <div className="w-full max-w-3xl mt-6 text-left space-y-4">
                          <ChapterChatBox
                            inputValue={chapterChatInput}
                            onInputChange={setChapterChatInput}
                            bookId={bookId}
                            chapterId={selectedChapterId}
                            canTransfer={pages.length > 0}
                            onTransfer={(transferMessages) => {
                              setChatPanelSeed({
                                messages: transferMessages,
                                token: Date.now(),
                              });
                            }}
                          />
                          <GenerateChapterContent
                            bookId={bookId}
                            chapterId={selectedChapterId}
                            onSuggestionSelect={setChapterChatInput}
                          />
                        </div>
                      )}
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
                      <Button
                        onClick={handleSaveChapter}
                        variant="appSuccess"
                        size="sm"
                        className="min-w-[130px]"
                        disabled={!selectedChapterId || isSavingChapter}
                      >
                        Save Chapter
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Sidebar: Chat */}
            <ChatPanel
              onMinimizeChange={setIsChatMinimized}
              bookId={bookId}
              chapterId={selectedChapterId}
              incomingMessages={chatPanelSeed?.messages}
              incomingMessagesToken={chatPanelSeed?.token}
            />
          </div>
        </div>
      </DragDropContext>
    </>
  );
};

export default BookDetail;
