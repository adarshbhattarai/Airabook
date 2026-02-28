import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  doc, getDoc, collection, getDocs, deleteDoc, updateDoc, writeBatch, query, orderBy, where, limit, onSnapshot
} from 'firebase/firestore';
import { firestore, functions } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import {
  Trash2, PlusCircle, ChevronRight, ChevronDown, ArrowLeft, GripVertical, Sparkles, Globe, Users, UserPlus, X, Edit, Eye, Loader2
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
import PhotoPlannerDialog from '@/components/planner/PhotoPlannerDialog';
import VoiceAssistantButton from '@/components/VoiceAssistantButton';
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
import { pageTemplates } from '@/constants/pageTemplates';
import { collabApi, getCallableErrorMessage } from '@/services/collabApi';

// react-beautiful-dnd is not fully StrictMode-safe in React 18 dev.
// This delays droppable mounting to avoid registry invariant errors.
const StrictModeDroppable = ({ children, ...props }) => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEnabled(true));
    return () => {
      cancelAnimationFrame(id);
      setEnabled(false);
    };
  }, []);

  if (!enabled) return null;
  return <Droppable {...props}>{children}</Droppable>;
};

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
  const COAUTHOR_SLOT_LIMIT = 5;
  const { bookId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, appUser, resendVerificationEmail } = useAuth();

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
  const [photoPlannerOpen, setPhotoPlannerOpen] = useState(false);
  const [photoPlannerSeed, setPhotoPlannerSeed] = useState(null);
  const plannerSeedHandledRef = useRef(false);
  const isForcedReadRoute = location.pathname.endsWith('/view');
  const [viewMode, setViewMode] = useState(() => (isForcedReadRoute ? 'pages' : 'chapter')); // 'chapter' or 'pages'
  const focusedChapterIdFromQuery = useMemo(() => {
    const value = new URLSearchParams(location.search).get('chapter');
    return value || null;
  }, [location.search]);
  const focusedPageIdFromQuery = useMemo(() => {
    const value = new URLSearchParams(location.search).get('page');
    return value || null;
  }, [location.search]);
  const [pageTurnAnimatingId, setPageTurnAnimatingId] = useState(null);
  const lastActivePageIndexRef = useRef(-1);
  const pageTurnTimeoutRef = useRef(null);
  const [editingPageId, setEditingPageId] = useState(null);
  const [editingPageName, setEditingPageName] = useState('');
  const [isSavingPageName, setIsSavingPageName] = useState(false);
  const [isAddingPage, setIsAddingPage] = useState(false);
  const isAddingPageRef = useRef(false);
  const [isCreatingChapter, setIsCreatingChapter] = useState(false);
  const isCreatingChapterRef = useRef(false);
  const showGlobalPagesFooter = false;
  const isReadOnlyPagesMode = isForcedReadRoute && viewMode === 'pages';

  // UI States
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(288);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const isDraggingPageRef = useRef(false);
  const [isChapterSwitching, setIsChapterSwitching] = useState(false);

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
  const [pendingInvites, setPendingInvites] = useState([]);
  const [inviteCanManageMedia, setInviteCanManageMedia] = useState(false);
  const [inviteCanInviteCoAuthors, setInviteCanInviteCoAuthors] = useState(false);
  const [permissionSavingUid, setPermissionSavingUid] = useState('');
  const [isSendingVerificationEmail, setIsSendingVerificationEmail] = useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);
  const wasCoAuthorModalOpenRef = useRef(false);

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

  useEffect(() => {
    setViewMode(isForcedReadRoute ? 'pages' : 'chapter');
  }, [isForcedReadRoute]);

  useEffect(() => {
    if (plannerSeedHandledRef.current) return;
    const seededPlanner = location.state?.plannerSeed;
    if (seededPlanner?.open) {
      setPhotoPlannerSeed(seededPlanner);
      setPhotoPlannerOpen(true);
      plannerSeedHandledRef.current = true;
    }
  }, [location.state]);

  const openPhotoPlanner = useCallback((seed = {}) => {
    setPhotoPlannerSeed({
      source: seed?.source || 'book_assistant',
      ...seed,
    });
    setPhotoPlannerOpen(true);
  }, []);

  const handlePhotoPlannerOpenChange = useCallback((open) => {
    setPhotoPlannerOpen(open);
    if (!open) {
      setPhotoPlannerSeed(null);
    }
  }, []);

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
        const container = scrollContainerRef.current;
        const target = pageContainerRefs.current[prevPage.id];
        if (container && target) {
          const left = target.offsetLeft - container.offsetLeft;
          container.scrollTo({ left, behavior: 'smooth' });
        }
        focusWithRetry(pageRefs, prevPage.id, 'end');
      }
    }, 0);

    return true;
  }, [pages, pageDrafts, selectedChapterId, selectedPageId, isBlocksEmpty, scrollContainerRef]);

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

  const scrollToPageHorizontally = useCallback((pageId, behavior = 'smooth') => {
    if (!pageId) return false;
    const container = scrollContainerRef.current;
    const target = pageContainerRefs.current[pageId];
    if (!container || !target) return false;
    if (isReadOnlyPagesMode) {
      const top = target.offsetTop - container.offsetTop;
      container.scrollTo({ top, behavior });
      return true;
    }
    const left = target.offsetLeft - container.offsetLeft;
    container.scrollTo({ left, behavior });
    return true;
  }, [isReadOnlyPagesMode, scrollContainerRef]);

  const handlePagesWheel = useCallback((event) => {
    if (viewMode !== 'pages') return;
    const container = scrollContainerRef.current;
    if (!container) return;
    if (container.scrollWidth <= container.clientWidth) return;
    const shouldScrollHorizontally = Math.abs(event.deltaX) > 0 || event.shiftKey;
    if (!shouldScrollHorizontally) return;
    const delta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
    if (!delta) return;
    container.scrollLeft += delta;
    event.preventDefault();
  }, [viewMode, scrollContainerRef]);

  // Update active page on scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const containerRect = container.getBoundingClientRect();
      const visible = entries
        .filter((entry) => entry.isIntersecting && entry.intersectionRatio > 0.15)
        .map((entry) => {
          const pageId = entry.target.getAttribute('data-page-id');
          const deltaPrimary = isReadOnlyPagesMode
            ? Math.abs(entry.boundingClientRect.top - containerRect.top)
            : Math.abs(entry.boundingClientRect.left - containerRect.left);
          return { entry, pageId, deltaPrimary };
        })
        .filter((item) => !!item.pageId);

      if (!visible.length) return;
      visible.sort((a, b) => {
        if (b.entry.intersectionRatio !== a.entry.intersectionRatio) {
          return b.entry.intersectionRatio - a.entry.intersectionRatio;
        }
        return a.deltaPrimary - b.deltaPrimary;
      });
      setActivePageId(visible[0].pageId);
    }, {
      root: container,
      threshold: [0.15, 0.3, 0.5, 0.7]
    });

    const currentRefs = pageContainerRefs.current;
    Object.values(currentRefs).forEach(el => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [isReadOnlyPagesMode, pages, scrollContainerRef]);

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
      if (scrollToPageHorizontally(selectedPageId, 'smooth')) {
        setActivePageId(selectedPageId);
        focusWithRetry(pageRefs, selectedPageId, 'start');
      }
    }
  }, [selectedPageId, scrollToPageHorizontally]);

  useEffect(() => {
    lastActivePageIndexRef.current = -1;
    setPageTurnAnimatingId(null);
    setEditingPageId(null);
    setEditingPageName('');
    setIsSavingPageName(false);
  }, [selectedChapterId]);

  useEffect(() => {
    const isBabyTemplate = book?.templateType === 'babyJournalPage';
    if (!isBabyTemplate || !activePageId || !pages.length) return;

    const currentIndex = pages.findIndex((p) => p.id === activePageId);
    if (currentIndex < 0) return;

    const previousIndex = lastActivePageIndexRef.current;
    if (previousIndex >= 0 && currentIndex > previousIndex) {
      setPageTurnAnimatingId(activePageId);
      if (pageTurnTimeoutRef.current) {
        clearTimeout(pageTurnTimeoutRef.current);
      }
      pageTurnTimeoutRef.current = setTimeout(() => {
        setPageTurnAnimatingId(null);
      }, 650);
    }

    lastActivePageIndexRef.current = currentIndex;
  }, [activePageId, pages, book?.templateType]);

  useEffect(() => {
    return () => {
      if (pageTurnTimeoutRef.current) {
        clearTimeout(pageTurnTimeoutRef.current);
      }
    };
  }, []);

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
      return pagesList;
    } catch (error) {
      console.error('Error fetching pages:', error);
      return [];
    }
  }, [bookId]);

  // Trigger page fetch when chapter selection changes
  useEffect(() => {
    if (selectedChapterId) {
      fetchPages(selectedChapterId);
    }
  }, [selectedChapterId, fetchPages]);

  useEffect(() => {
    if (!focusedChapterIdFromQuery || chapters.length === 0) return;
    const chapterExists = chapters.some((chapter) => chapter.id === focusedChapterIdFromQuery);
    if (!chapterExists) return;

    setExpandedChapters((prev) => {
      const next = new Set(prev);
      next.add(focusedChapterIdFromQuery);
      return next;
    });
    setSelectedChapterId(focusedChapterIdFromQuery);
    if (!isForcedReadRoute && !focusedPageIdFromQuery) {
      setViewMode('chapter');
    }
  }, [focusedChapterIdFromQuery, focusedPageIdFromQuery, chapters, isForcedReadRoute]);

  useEffect(() => {
    if (!focusedPageIdFromQuery) return;
    const pageExists = pages.some((page) => page.id === focusedPageIdFromQuery);
    if (!pageExists) return;
    setSelectedPageId(focusedPageIdFromQuery);
    if (!isForcedReadRoute) {
      setViewMode('pages');
    }
  }, [focusedPageIdFromQuery, pages, isForcedReadRoute]);

  // Real-time listener for pages (automatically updates when new pages are created)
  useEffect(() => {
    if (!selectedChapterId || !bookId) return;

    console.log('🔔 Setting up real-time listener for pages in chapter:', selectedChapterId);

    const pagesRef = collection(firestore, 'books', bookId, 'chapters', selectedChapterId, 'pages');
    const qy = query(pagesRef, orderBy('order'));

    const unsubscribe = onSnapshot(qy, (snapshot) => {
      console.log('📄 Pages snapshot update received:', snapshot.docs.length, 'pages');
      const pagesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      setPages(pagesList);
      setChapters((prevChapters) => prevChapters.map((chapter) => {
        if (chapter.id !== selectedChapterId) return chapter;
        return {
          ...chapter,
          pagesSummary: pagesList
            .map((p) => ({
              pageId: p.id,
              pageName: p.pageName || '',
              shortNote: p.shortNote || stripHtml(p.note || '').substring(0, 40) || 'Untitled Page',
              order: p.order
            }))
            .sort((a, b) => {
              const left = a.order == null ? '' : String(a.order);
              const right = b.order == null ? '' : String(b.order);
              return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
            })
        };
      }));

      // Auto-select first page if none selected
      if (pagesList.length > 0) {
        setSelectedPageId(p => pagesList.some(pg => pg.id === p) ? p : pagesList[0].id);
      } else {
        setSelectedPageId(null);
      }
    }, (error) => {
      console.error('❌ Error in pages snapshot listener:', error);
    });

    // Cleanup listener on unmount or chapter change
    return () => {
      console.log('🔕 Cleaning up pages listener for chapter:', selectedChapterId);
      unsubscribe();
    };
  }, [selectedChapterId, bookId]);

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
  const memberPermissions = book?.memberPermissions?.[user?.uid] || {};
  const collaborationPermissions = isOwner
    ? {
      canManageMedia: true,
      canInviteCoAuthors: true,
      canManagePendingInvites: true,
      canRemoveCoAuthors: true,
    }
    : {
      canManageMedia: !!memberPermissions.canManageMedia,
      canInviteCoAuthors: !!memberPermissions.canInviteCoAuthors,
      canManagePendingInvites: !!memberPermissions.canManagePendingInvites,
      canRemoveCoAuthors: !!memberPermissions.canRemoveCoAuthors,
    };
  const canOpenCoAuthorModal = isOwner
    || collaborationPermissions.canInviteCoAuthors
    || collaborationPermissions.canManagePendingInvites
    || collaborationPermissions.canRemoveCoAuthors;
  const compareOrder = useCallback((a, b) => {
    const left = a == null ? '' : String(a);
    const right = b == null ? '' : String(b);
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
  }, []);
  const upsertPageById = useCallback((pageCollection = [], pageToUpsert) => {
    if (!pageToUpsert?.id) return [...pageCollection].sort((a, b) => compareOrder(a.order, b.order));
    const existingIndex = pageCollection.findIndex((pageItem) => pageItem.id === pageToUpsert.id);
    const nextPages = existingIndex >= 0
      ? pageCollection.map((pageItem) => (pageItem.id === pageToUpsert.id ? { ...pageItem, ...pageToUpsert } : pageItem))
      : [...pageCollection, pageToUpsert];
    return nextPages.sort((a, b) => compareOrder(a.order, b.order));
  }, [compareOrder]);
  const upsertPageSummaryById = useCallback((pageSummaryCollection = [], pageSummaryToUpsert) => {
    if (!pageSummaryToUpsert?.pageId) return [...pageSummaryCollection].sort((a, b) => compareOrder(a.order, b.order));
    const existingIndex = pageSummaryCollection.findIndex((summaryItem) => summaryItem.pageId === pageSummaryToUpsert.pageId);
    const nextSummary = existingIndex >= 0
      ? pageSummaryCollection.map((summaryItem) => (
        summaryItem.pageId === pageSummaryToUpsert.pageId
          ? { ...summaryItem, ...pageSummaryToUpsert }
          : summaryItem
      ))
      : [...pageSummaryCollection, pageSummaryToUpsert];
    return nextSummary.sort((a, b) => compareOrder(a.order, b.order));
  }, [compareOrder]);
  const getSidebarPagesForChapter = useCallback((chapterId, chapterCollection = chapters, pageCollection = pages, selectedId = selectedChapterId) => {
    const chapter = chapterCollection.find((c) => c.id === chapterId);
    const chapterSummary = chapter?.pagesSummary || [];

    // For the selected chapter, trust the live pages state but reuse summary text fallback.
    if (chapterId === selectedId) {
      const fallbackTitleById = new Map(chapterSummary.map((item) => [item.pageId, item.shortNote]));
      const fallbackNameById = new Map(chapterSummary.map((item) => [item.pageId, item.pageName || '']));
      return [...pageCollection]
        .map((p) => {
          const draftTitle = (pageDrafts?.[p.id]?.templateContent?.title || '').trim();
          const savedTemplateTitle = (p?.content?.title || '').trim();
          const syncedTemplateTitle = draftTitle || savedTemplateTitle;
          const isBabyTemplatePage = p?.type === 'babyJournalPage';
          const fallbackName = p.pageName ?? fallbackNameById.get(p.id) ?? '';
          const fallbackShort = p.shortNote || fallbackTitleById.get(p.id) || stripHtml(p.note || '').substring(0, 40) || 'Untitled Page';

          const pageName = isBabyTemplatePage && syncedTemplateTitle ? syncedTemplateTitle : fallbackName;
          const shortNote = isBabyTemplatePage && syncedTemplateTitle ? syncedTemplateTitle : fallbackShort;

          return {
            pageId: p.id,
            pageName,
            shortNote,
            order: p.order
          };
        })
        .sort((x, y) => compareOrder(x.order, y.order));
    }

    return [...chapterSummary].sort((x, y) => compareOrder(x.order, y.order));
  }, [chapters, pages, pageDrafts, selectedChapterId, compareOrder]);
  const orderedChapters = useMemo(
    () => [...chapters].sort((a, b) => compareOrder(a.order, b.order)),
    [chapters, compareOrder]
  );
  const currentChapterIndex = useMemo(
    () => orderedChapters.findIndex((c) => c.id === selectedChapterId),
    [orderedChapters, selectedChapterId]
  );
  const nextChapter = useMemo(
    () => (currentChapterIndex >= 0 ? orderedChapters[currentChapterIndex + 1] || null : null),
    [orderedChapters, currentChapterIndex]
  );
  const nextChapterLabel = nextChapter ? `Continue to ${nextChapter.title}` : '';
  const isAtChapterEnd = useMemo(() => {
    if (viewMode !== 'pages' || pages.length === 0) return false;
    const currentId = activePageId || selectedPageId;
    return !!currentId && currentId === pages[pages.length - 1]?.id;
  }, [viewMode, pages, activePageId, selectedPageId]);
  const chapterTitle = chapters.find(c => c.id === selectedChapterId)?.title;
  const accessibleAlbums = useMemo(() => {
    if (!Array.isArray(appUser?.accessibleAlbums)) return [];
    return appUser.accessibleAlbums
      .map((album) => {
        if (!album) return null;
        if (typeof album === 'string') {
          return { id: album, name: 'Untitled album', mediaCount: 0 };
        }
        return {
          id: album.id,
          name: album.name || 'Untitled album',
          mediaCount: album.mediaCount || 0,
          ...album,
        };
      })
      .filter((album) => !!album?.id);
  }, [appUser?.accessibleAlbums]);


  // Permissions end


  // User search function
  const searchUsers = useCallback(async (searchTerm) => {
    if (!searchTerm || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const result = await collabApi.searchUsers(searchTerm);
      setSearchResults(result.results || []);
    } catch (error) {
      console.error('Error searching users:', error);
      toast({
        title: 'Search Error',
        description: getCallableErrorMessage(error, 'Failed to search users. Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  }, [setSearchResults, setIsSearching, toast]);

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

  const refreshBookData = useCallback(async () => {
    if (!bookId) return;
    const bookRef = doc(firestore, 'books', bookId);
    const bookSnap = await getDoc(bookRef);
    if (bookSnap.exists()) {
      setBook({ id: bookSnap.id, ...bookSnap.data() });
    }
  }, [bookId]);

  const loadPendingInvites = useCallback(async () => {
    if (!bookId || !canOpenCoAuthorModal || !collaborationPermissions.canManagePendingInvites || !user?.emailVerified) {
      setPendingInvites([]);
      return;
    }

    try {
      const result = await collabApi.listPendingCoAuthorInvites({ bookId, pageSize: 50 });
      setPendingInvites(Array.isArray(result?.invites) ? result.invites : []);
    } catch (error) {
      // Do not interrupt invite flow with non-critical pending invite list errors.
      console.warn('Pending invites list could not be loaded:', error);
      setPendingInvites([]);
    }
  }, [
    bookId,
    canOpenCoAuthorModal,
    collaborationPermissions.canManagePendingInvites,
    user?.emailVerified,
  ]);

  const handleSendVerificationEmail = async () => {
    setIsSendingVerificationEmail(true);
    try {
      await resendVerificationEmail();
      setVerificationEmailSent(true);
      toast({
        title: 'Verification email sent',
        description: 'Please check your inbox and spam folder.',
      });
    } catch (error) {
      toast({
        title: 'Could not send verification email',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingVerificationEmail(false);
    }
  };

  // Handle invite co-author
  const handleInviteCoAuthor = async (userToInvite) => {
    if (!canOpenCoAuthorModal || !collaborationPermissions.canInviteCoAuthors) return;
    if (coAuthorSlotsFull) {
      toast({
        title: 'Co-author limit reached',
        description: `This book allows up to ${COAUTHOR_SLOT_LIMIT} total co-author slots (active + pending invites).`,
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await collabApi.inviteCoAuthor({
        bookId,
        uid: userToInvite.id,
        canManageMedia: inviteCanManageMedia,
        canInviteCoAuthors: isOwner && inviteCanInviteCoAuthors,
      });

      toast({
        title: 'Invitation Sent',
        description: result?.status === 'resent'
          ? `${userToInvite.displayName} invitation was resent.`
          : `${userToInvite.displayName} has been invited as a co-author.`,
      });

      // Clear search
      setUserSearchQuery('');
      setSearchResults([]);
      await loadPendingInvites();
    } catch (error) {
      console.error('Error inviting co-author:', error);
      toast({
        title: 'Invitation Failed',
        description: getCallableErrorMessage(error, 'Failed to send invitation. Please try again.'),
        variant: 'destructive',
      });
    }
  };

  // Handle remove co-author
  const handleRemoveCoAuthor = async (userId) => {
    if (!canOpenCoAuthorModal || !collaborationPermissions.canRemoveCoAuthors) return;

    try {
      await collabApi.removeCoAuthor({ bookId, coAuthorUid: userId });
      await refreshBookData();
      await loadPendingInvites();
      toast({
        title: 'Co-Author Removed',
        description: 'The co-author has been removed from this book.',
      });
    } catch (error) {
      console.error('Error removing co-author:', error);
      toast({
        title: 'Error',
        description: getCallableErrorMessage(error, 'Failed to remove co-author. Please try again.'),
        variant: 'destructive',
      });
    }
  };

  const handleCoAuthorPermissionToggle = async (targetUid, field, nextValue) => {
    if (!isOwner || !targetUid || !field) return;
    const current = {
      canManageMedia: !!book?.memberPermissions?.[targetUid]?.canManageMedia,
      canInviteCoAuthors: !!book?.memberPermissions?.[targetUid]?.canInviteCoAuthors,
      canManagePendingInvites: !!book?.memberPermissions?.[targetUid]?.canManagePendingInvites,
      canRemoveCoAuthors: !!book?.memberPermissions?.[targetUid]?.canRemoveCoAuthors,
    };
    const nextPermissions = { ...current, [field]: !!nextValue };

    setPermissionSavingUid(targetUid);
    try {
      const result = await collabApi.setCoAuthorPermissions({
        bookId,
        targetUid,
        permissions: nextPermissions,
      });
      const appliedPermissions = result?.permissions || nextPermissions;
      setBook((prev) => ({
        ...prev,
        memberPermissions: {
          ...(prev?.memberPermissions || {}),
          [targetUid]: appliedPermissions,
        },
      }));
      toast({ title: 'Permissions updated' });
    } catch (error) {
      toast({
        title: 'Permissions update failed',
        description: getCallableErrorMessage(error, 'Could not update co-author permissions.'),
        variant: 'destructive',
      });
    } finally {
      setPermissionSavingUid('');
    }
  };

  // Get co-authors list (excluding owner)
  const coAuthors = useMemo(() => (
    book?.members
      ? Object.entries(book.members)
        .filter(([uid, role]) => uid !== book.ownerId && role === 'Co-author')
        .map(([uid]) => uid)
      : []
  ), [book?.members, book?.ownerId]);
  const pendingInviteCountForLimit = collaborationPermissions.canManagePendingInvites ? pendingInvites.length : 0;
  const coAuthorSlotsUsed = coAuthors.length + pendingInviteCountForLimit;
  const coAuthorSlotsFull = coAuthorSlotsUsed >= COAUTHOR_SLOT_LIMIT;
  const canInviteCoAuthors = collaborationPermissions.canInviteCoAuthors && !!user?.emailVerified;
  const disableCoAuthorActions = !canInviteCoAuthors || coAuthorSlotsFull;
  const getSearchResultAccessState = useCallback((targetUid) => {
    if (!targetUid) return 'inviteable';
    if (targetUid === book?.ownerId || book?.members?.[targetUid] === 'Owner') return 'owner';
    if (book?.members?.[targetUid] === 'Co-author') return 'coauthor';
    if (targetUid === user?.uid) return 'self';
    return 'inviteable';
  }, [book?.members, book?.ownerId, user?.uid]);

  const handleBookUpdate = (updatedBook) => {
    setBook(prev => ({ ...prev, ...updatedBook }));
  };

  const handleEnsurePlannerChapter = useCallback(async ({ title }) => {
    if (!bookId) throw new Error('Book is required.');
    const normalizedTitle = (title || '').trim();
    if (!normalizedTitle) throw new Error('Chapter title is required.');
    if (isCreatingChapterRef.current) {
      throw new Error('Chapter creation already in progress.');
    }

    const existingChapter = chapters.find((chapter) =>
      (chapter?.title || '').trim().toLowerCase() === normalizedTitle.toLowerCase()
    );
    if (existingChapter?.id) {
      return existingChapter.id;
    }

    isCreatingChapterRef.current = true;
    setIsCreatingChapter(true);
    try {
      const newOrder = getMidpointString(chapters[chapters.length - 1]?.order);
      const addChapterFn = httpsCallable(functions, 'addChapter');
      const result = await addChapterFn({
        bookId,
        title: normalizedTitle,
        order: newOrder,
      });
      const chapterId = result?.data?.chapterId;
      if (!chapterId) {
        throw new Error('Chapter creation failed.');
      }
      const createdChapter = {
        id: chapterId,
        title: result?.data?.title || normalizedTitle,
        order: result?.data?.order || newOrder,
        pagesSummary: [],
        createdAt: new Date(),
        ownerId: user?.uid || null,
      };

      setChapters((prev) => [...prev, createdChapter].sort((a, b) => compareOrder(a.order, b.order)));
      setExpandedChapters((prev) => {
        const next = new Set(prev);
        next.add(createdChapter.id);
        return next;
      });
      setSelectedChapterId(createdChapter.id);

      toast({
        title: 'Chapter created',
        description: `"${normalizedTitle}" is ready for media planning.`,
      });

      return createdChapter.id;
    } finally {
      isCreatingChapterRef.current = false;
      setIsCreatingChapter(false);
    }
  }, [bookId, chapters, compareOrder, user?.uid, toast]);

  const handlePlannerApplied = useCallback(async ({ resolvedTarget }) => {
    const targetScope = resolvedTarget?.scope;
    const targetChapterId = resolvedTarget?.chapterId;
    const routeToChapters = () => {
      if (!isForcedReadRoute) {
        setViewMode('chapter');
      }
      handlePhotoPlannerOpenChange(false);
    };

    await fetchChapters();

    if (targetScope === 'chapter' && targetChapterId) {
      setExpandedChapters((prev) => {
        const next = new Set(prev);
        next.add(targetChapterId);
        return next;
      });
      setSelectedChapterId(targetChapterId);
      await fetchPages(targetChapterId);
      routeToChapters();
      return;
    }

    if (selectedChapterId) {
      await fetchPages(selectedChapterId);
    }
    routeToChapters();
  }, [fetchChapters, fetchPages, handlePhotoPlannerOpenChange, isForcedReadRoute, selectedChapterId]);

  // Fetch co-author user details while modal is open.
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

    if (!coAuthorModalOpen) return;
    fetchCoAuthorDetails();
  }, [coAuthors, coAuthorModalOpen]);

  // Initialize co-author modal state once per open to avoid resetting form controls.
  useEffect(() => {
    if (!coAuthorModalOpen) {
      wasCoAuthorModalOpenRef.current = false;
      setVerificationEmailSent(false);
      setIsSendingVerificationEmail(false);
      return;
    }

    if (wasCoAuthorModalOpenRef.current) return;
    wasCoAuthorModalOpenRef.current = true;

    setInviteCanManageMedia(false);
    setInviteCanInviteCoAuthors(false);
    refreshBookData();

    if (user?.emailVerified && collaborationPermissions.canManagePendingInvites) {
      loadPendingInvites();
    }
  }, [
    coAuthorModalOpen,
    loadPendingInvites,
    refreshBookData,
    collaborationPermissions.canManagePendingInvites,
    user?.emailVerified,
  ]);

  const openDeleteModal = (type, data) => {
    const displayPageTitle = (data?.pageName || '').trim() || data?.shortNote || 'Untitled Page';
    setModalState({
      isOpen: true,
      type,
      data,
      title: `Delete ${type}?`,
      description: type === 'chapter'
        ? `Are you sure you want to permanently delete "${data.title}" and all its pages? This action cannot be undone.`
        : `Are you sure you want to permanently delete "${displayPageTitle}"? This action cannot be undone.`,
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
    if (!isOwner || isForcedReadRoute) {
      toast({
        title: 'Permission Denied',
        description: 'Only the book owner can delete chapters in edit mode.',
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
    if (isForcedReadRoute) {
      toast({
        title: 'Permission Denied',
        description: 'Pages can only be deleted in edit mode.',
        variant: 'destructive',
      });
      return;
    }

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
    if (isForcedReadRoute) return;
    const { destination, source, draggableId, type } = result;
    if (!destination || type !== 'PAGE') return;

    const fromChapterId = source.droppableId;
    const toChapterId = destination.droppableId;

    if (fromChapterId === toChapterId && destination.index === source.index) return;

    const chaptersMap = new Map(chapters.map(c => [c.id, {
      ...c,
      pagesSummary: getSidebarPagesForChapter(c.id, chapters, pages, selectedChapterId)
    }]));

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
            .sort((a, b) => compareOrder(a.order, b.order))
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
    if (!canEdit || isForcedReadRoute) {
      toast({
        title: 'Permission Denied',
        description: 'You do not have permission to create chapters in read mode.',
        variant: 'destructive',
      });
      return;
    }
    if (!newChapterTitle.trim() || !user) return;
    if (isCreatingChapterRef.current) return;
    const normalizedTitle = newChapterTitle.trim();
    isCreatingChapterRef.current = true;
    setIsCreatingChapter(true);
    try {
      const newOrder = getMidpointString(chapters[chapters.length - 1]?.order);
      const addChapterFn = httpsCallable(functions, 'addChapter');
      const result = await addChapterFn({
        bookId,
        title: normalizedTitle,
        order: newOrder,
      });

      const chapterId = result?.data?.chapterId;
      if (!chapterId) {
        throw new Error('Chapter creation failed.');
      }

      const createdChapter = {
        id: chapterId,
        title: result?.data?.title || normalizedTitle,
        order: result?.data?.order || newOrder,
        pagesSummary: [],
        createdAt: new Date(),
        ownerId: user.uid
      };

      setChapters(prev => [...prev, createdChapter].sort((a, b) => compareOrder(a.order, b.order)));
      setExpandedChapters(prev => {
        const next = new Set(prev);
        next.add(chapterId);
        return next;
      });
      setSelectedChapterId(chapterId);
      setNewChapterTitle('');
      toast({ title: 'Chapter created' });
    } catch (error) {
      console.error('Failed to create chapter:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to create chapter.',
        variant: 'destructive',
      });
    } finally {
      isCreatingChapterRef.current = false;
      setIsCreatingChapter(false);
    }
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
      scrollToPageHorizontally(targetPageId, 'smooth');
      // Focus using PageEditor ref with proper cursor positioning
      const focusPosition = direction === 'next' ? 'start' : 'end';
      console.log(`📄 handlePageNavigate: Moving cursor to ${direction} page ${targetPageId} at ${focusPosition}`);
      await focusWithRetry(pageRefs, targetPageId, focusPosition);
    }
  }, [pages, scrollToPageHorizontally]);

  const getLocalTodayDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTemplateDefaultContent = (templateType) => {
    if (!templateType) return null;
    const template = pageTemplates[templateType];
    if (!template?.defaults) return null;
    const defaults = { ...template.defaults };
    if (Object.prototype.hasOwnProperty.call(defaults, 'date') && !defaults.date) {
      defaults.date = getLocalTodayDate();
    }
    return defaults;
  };

  const handleAddPage = async (saveImmediately = true, overflowContent = '', insertAfterPageId = null) => {
    if (!canEdit || isForcedReadRoute) {
      toast({
        title: 'Permission Denied',
        description: 'You do not have permission to add pages in read mode.',
        variant: 'destructive',
      });
      return;
    }
    if (!selectedChapterId) return;
    if (isAddingPageRef.current) return;
    isAddingPageRef.current = true;
    setIsAddingPage(true);

    try {
      const orderedPages = [...pages].sort((a, b) => compareOrder(a.order, b.order));
      const insertAfterIndex = insertAfterPageId
        ? orderedPages.findIndex((pageItem) => pageItem.id === insertAfterPageId)
        : -1;
      const isInsertAfterKnownPage = insertAfterIndex >= 0;

      let newOrder;
      if (isInsertAfterKnownPage) {
        const beforeOrder = orderedPages[insertAfterIndex]?.order;
        const afterOrder = orderedPages[insertAfterIndex + 1]?.order;
        newOrder = getNewOrderBetween(beforeOrder, afterOrder);
      } else {
        newOrder = getMidpointString(orderedPages[orderedPages.length - 1]?.order);
      }

      const anchorPage = isInsertAfterKnownPage ? orderedPages[insertAfterIndex] : null;
      const templateType = book?.templateType || anchorPage?.type || orderedPages[orderedPages.length - 1]?.type || null;
      const template = templateType ? pageTemplates[templateType] : null;
      const templateContent = getTemplateDefaultContent(templateType);
      const noteToSave = template ? '' : overflowContent;
      const plain = stripHtml(overflowContent);
      const templateShortNote = (templateContent?.title || '').trim() || 'Untitled Page';
      const shortNote = template
        ? templateShortNote
        : (plain ? plain.substring(0, 40) + (plain.length > 40 ? '...' : '') : 'Untitled Page');

      if (!saveImmediately) {
        const tempId = `temp_${Date.now()}`;
        const newPage = {
          id: tempId,
          chapterId: selectedChapterId,
          note: noteToSave,
          media: [],
          order: newOrder,
          ...(template ? {
            type: template.type,
            templateVersion: template.templateVersion,
            content: templateContent,
            theme: template.theme,
          } : {}),
        };

        // Update local state immediately
        setPages((prev) => upsertPageById(prev, newPage));
        setViewMode('pages');
        setSelectedPageId(tempId);
        setPageDrafts(prev => ({
          ...prev,
          [tempId]: template
            ? { templateContent: templateContent || {}, updatedAt: Date.now() }
            : { blocks: [], updatedAt: Date.now() }
        }));

        // Update sidebar
        const newPageSummary = {
          pageId: tempId,
          pageName: '',
          shortNote,
          order: newOrder
        };

        setChapters((prev) => prev.map((chapterItem) => (
          chapterItem.id === selectedChapterId
            ? {
              ...chapterItem,
              pagesSummary: upsertPageSummaryById(chapterItem.pagesSummary || [], newPageSummary)
            }
            : chapterItem
        )));

        toast({ title: 'New Page Added', description: overflowContent ? 'Content has been moved to the new page.' : 'A new page has been added.' });

        // UX: Scroll and focus on the new draft page
        setTimeout(() => {
          if (scrollToPageHorizontally(tempId, 'smooth')) {
            pageRefs.current[tempId]?.focus?.();
          }
        }, 50);
        return;
      }

      const createPageFn = httpsCallable(functions, 'createPage');
      const result = await createPageFn({
        bookId,
        chapterId: selectedChapterId,
        note: noteToSave,
        media: [],
        order: newOrder,
        ...(template ? {
          type: template.type,
          templateVersion: template.templateVersion,
          content: templateContent,
          theme: template.theme,
          pageName: (templateContent?.title || '').trim(),
        } : {}),
      });

      const persistedPage = result?.data?.page;
      if (!persistedPage?.id) {
        throw new Error('Page was created but no page ID was returned.');
      }

      const createdPage = {
        id: persistedPage.id,
        chapterId: selectedChapterId,
        note: persistedPage.note ?? noteToSave,
        media: Array.isArray(persistedPage.media) ? persistedPage.media : [],
        order: persistedPage.order || newOrder,
        pageName: persistedPage.pageName || '',
        shortNote,
        ...(template ? {
          type: persistedPage.type || template.type,
          templateVersion: persistedPage.templateVersion || template.templateVersion,
          content: persistedPage.content || templateContent,
          theme: persistedPage.theme || template.theme,
        } : {}),
      };

      setPages((prev) => upsertPageById(prev, createdPage));
      setChapters((prev) => prev.map((chapterItem) => (
        chapterItem.id === selectedChapterId
          ? {
            ...chapterItem,
            pagesSummary: upsertPageSummaryById(chapterItem.pagesSummary || [], {
              pageId: createdPage.id,
              pageName: createdPage.pageName || '',
              shortNote,
              order: createdPage.order,
            })
          }
          : chapterItem
      )));

      setViewMode('pages');
      setSelectedPageId(createdPage.id);
      toast({ title: 'New Page Added', description: overflowContent ? 'Content has been moved to the new page.' : 'Page created and saved.' });
      setTimeout(() => {
        scrollToPageHorizontally(createdPage.id, 'smooth');
        focusWithRetry(pageRefs, createdPage.id, 'start');
      }, 60);

    } catch (error) {
      console.error('Error creating page:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create page. Please try again.',
        variant: 'destructive'
      });
    } finally {
      isAddingPageRef.current = false;
      setIsAddingPage(false);
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

  const saveSelectedDraft = useCallback(async () => {
    if (!selectedPageId) return;

    try {
      // Prefer saving through the page editor (handles temp_ pages too).
      if (pageRefs.current?.[selectedPageId]?.save) {
        const saved = await pageRefs.current[selectedPageId].save({ silent: true });
        if (saved === false) {
          throw new Error('Page save failed');
        }
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

  const requestSelectPage = useCallback(async (chapterId, pageId) => {
    if (chapterId === selectedChapterId && pageId === selectedPageId) {
      return;
    }
    if (isSelectedPageDirty) {
      try {
        await saveSelectedDraft();
      } catch (_) {
        return;
      }
    }
    setSelectedChapterId(chapterId);
    setSelectedPageId(pageId);
  }, [isSelectedPageDirty, saveSelectedDraft, selectedChapterId, selectedPageId]);

  const requestAddPage = useCallback(async () => {
    if (isSelectedPageDirty) {
      try {
        await saveSelectedDraft();
      } catch (_) {
        return;
      }
    }
    await handleAddPage(true);
  }, [isSelectedPageDirty, saveSelectedDraft, handleAddPage]);

  const requestAddPageAfter = useCallback(async (pageId) => {
    if (!pageId) return;
    if (isSelectedPageDirty) {
      try {
        await saveSelectedDraft();
      } catch (_) {
        return;
      }
    }
    await handleAddPage(true, '', pageId);
  }, [isSelectedPageDirty, saveSelectedDraft, handleAddPage]);

  const handleGoToNextChapter = useCallback(async () => {
    if (!nextChapter || isChapterSwitching) return;

    if (isSelectedPageDirty) {
      try {
        await saveSelectedDraft();
      } catch (_) {
        return;
      }
    }

    setIsChapterSwitching(true);
    try {
      setExpandedChapters(new Set([nextChapter.id]));
      setViewMode('pages');
      setSelectedChapterId(nextChapter.id);
      setSelectedPageId(null);

      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      }

      const nextPages = await fetchPages(nextChapter.id);
      if (nextPages?.length > 0) {
        const firstPageId = nextPages[0].id;
        setSelectedPageId(firstPageId);
        setTimeout(() => {
          scrollToPageHorizontally(firstPageId, 'smooth');
        }, 60);
      }
    } finally {
      setIsChapterSwitching(false);
    }
  }, [
    nextChapter,
    isChapterSwitching,
    isSelectedPageDirty,
    saveSelectedDraft,
    fetchPages,
    scrollToPageHorizontally
  ]);

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
      if (updatedPage.shortNote || updatedPage.pageName !== undefined) {
        setChapters(prevChapters => prevChapters.map(c => {
          if (c.id !== selectedChapterId) return c;

          const updatedPagesSummary = (c.pagesSummary || []).map(ps =>
            ps.pageId === updatedPage.id
              ? {
                ...ps,
                ...(updatedPage.shortNote ? { shortNote: updatedPage.shortNote } : {}),
                ...(updatedPage.pageName !== undefined ? { pageName: updatedPage.pageName } : {})
              }
              : ps
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
      pagesSummary: (c.pagesSummary || []).map(ps => ps.pageId === oldId ? {
        ...ps,
        pageId: newPage.id,
        pageName: newPage.pageName || '',
        shortNote: stripHtml(newPage.note || '').substring(0, 40)
      } : ps)
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
    if (!canEdit || isForcedReadRoute) {
      toast({
        title: 'Permission Denied',
        description: 'You do not have permission to edit chapters in read mode.',
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
    if (isForcedReadRoute) {
      toast({
        title: 'Permission Denied',
        description: 'Chapter titles can only be changed in edit mode.',
        variant: 'destructive'
      });
      return;
    }

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

  const handleStartEditPageName = (pageSummary) => {
    if (!canEdit || isForcedReadRoute) return;
    setEditingPageId(pageSummary.pageId);
    setEditingPageName(pageSummary.pageName || '');
  };

  const handleCancelEditPageName = () => {
    setEditingPageId(null);
    setEditingPageName('');
    setIsSavingPageName(false);
  };

  const handleSavePageName = async (chapterId, pageSummary) => {
    if (!editingPageId || editingPageId !== pageSummary.pageId || isSavingPageName) return;
    const nextPageName = editingPageName.trim();
    const currentPageName = (pageSummary.pageName || '').trim();

    if (nextPageName === currentPageName) {
      handleCancelEditPageName();
      return;
    }

    setIsSavingPageName(true);
    try {
      const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', pageSummary.pageId);
      const chapter = chapters.find((c) => c.id === chapterId);
      const updatedPagesSummary = (chapter?.pagesSummary || []).map((ps) => (
        ps.pageId === pageSummary.pageId ? { ...ps, pageName: nextPageName } : ps
      ));
      const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);

      await Promise.all([
        updateDoc(pageRef, {
          pageName: nextPageName,
          updatedAt: new Date(),
        }),
        updateDoc(chapterRef, {
          pagesSummary: updatedPagesSummary,
          updatedAt: new Date(),
        })
      ]);

      setPages((prev) => prev.map((p) => (
        p.id === pageSummary.pageId ? { ...p, pageName: nextPageName } : p
      )));
      setChapters((prev) => prev.map((chapterItem) => {
        if (chapterItem.id !== chapterId) return chapterItem;
        return {
          ...chapterItem,
          pagesSummary: (chapterItem.pagesSummary || []).map((ps) => (
            ps.pageId === pageSummary.pageId ? { ...ps, pageName: nextPageName } : ps
          ))
        };
      }));
      toast({ title: 'Page name updated' });
      handleCancelEditPageName();
    } catch (error) {
      console.error('Failed to update page name:', error);
      toast({
        title: 'Update Error',
        description: 'Failed to update page name. Please try again.',
        variant: 'destructive'
      });
      setIsSavingPageName(false);
    }
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
        onOpenPhotoPlanner={openPhotoPlanner}
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
            {!user?.emailVerified && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 space-y-2">
                <p>Verify your email before inviting collaborators.</p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200"
                    onClick={handleSendVerificationEmail}
                    disabled={isSendingVerificationEmail || verificationEmailSent}
                  >
                    {verificationEmailSent ? 'Sent' : (isSendingVerificationEmail ? 'Sending...' : 'Send verification email')}
                  </Button>
                  {verificationEmailSent && (
                    <p className="text-xs text-amber-800">
                      Sent. Check your inbox and spam folder.
                    </p>
                  )}
                </div>
              </div>
            )}

            {coAuthorSlotsFull && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Co-author limit reached. This book allows up to {COAUTHOR_SLOT_LIMIT} total co-author slots (active + pending invites).
              </div>
            )}

            {/* Search Input */}
            <div className="space-y-2">
              <Input
                placeholder="Search by username or email..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full"
                disabled={disableCoAuthorActions}
              />
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Invite permissions</p>
                <div className="flex items-center gap-4">
                  <label className="text-xs flex items-center gap-2 text-foreground">
                    <input
                      type="checkbox"
                      checked={inviteCanManageMedia}
                      onChange={(e) => setInviteCanManageMedia(e.target.checked)}
                      disabled={disableCoAuthorActions}
                    />
                    Can manage media
                  </label>
                  {isOwner && (
                    <label className="text-xs flex items-center gap-2 text-foreground">
                        <input
                          type="checkbox"
                          checked={inviteCanInviteCoAuthors}
                          onChange={(e) => setInviteCanInviteCoAuthors(e.target.checked)}
                          disabled={disableCoAuthorActions}
                        />
                      Can invite co-authors
                    </label>
                  )}
                </div>
              </div>
              {isSearching && (
                <p className="text-sm text-gray-500 mt-2">Searching...</p>
              )}
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="border rounded-lg p-2 max-h-48 overflow-y-auto">
                {searchResults.map((searchUser) => {
                  const accessState = getSearchResultAccessState(searchUser.id);
                  const isOwnerResult = accessState === 'owner';
                  const isCoAuthorResult = accessState === 'coauthor';
                  const isSelfResult = accessState === 'self';
                  const isAlreadyInBook = isOwnerResult || isCoAuthorResult || isSelfResult;
                  const inviteDisabledForResult = disableCoAuthorActions || isAlreadyInBook;
                  const buttonLabel = isOwnerResult
                    ? 'Owner'
                    : isCoAuthorResult
                      ? 'Co-author'
                      : isSelfResult
                        ? 'You'
                        : 'Invite';

                  return (
                    <div
                      key={searchUser.id}
                      className="flex items-center justify-between p-2 hover:bg-gray-50 rounded"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {searchUser.photoURL ? (
                          <img
                            src={searchUser.photoURL}
                            alt={searchUser.displayName || 'User'}
                            className="h-9 w-9 rounded-full object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-app-iris/15 text-app-iris flex items-center justify-center text-xs font-semibold shrink-0 border border-border">
                            {(searchUser.displayName || searchUser.email || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-800 truncate">{searchUser.displayName || 'Unknown User'}</p>
                            {isOwnerResult && (
                              <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Owner</span>
                            )}
                            {isCoAuthorResult && (
                              <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Already co-author</span>
                            )}
                            {isSelfResult && (
                              <span className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">Your account</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 truncate">{searchUser.email}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleInviteCoAuthor(searchUser)}
                        className="flex items-center gap-1"
                        disabled={inviteDisabledForResult}
                      >
                        <UserPlus className="h-4 w-4" />
                        {buttonLabel}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Current Co-Authors */}
            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-800 mb-2">Current Co-Authors</h3>
              {coAuthorUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No co-authors yet. Search for users above to invite them.
                </p>
              ) : (
                <div className="space-y-2">
                  {coAuthorUsers.map((coAuthorUser) => {
                    const permissions = {
                      canManageMedia: !!book?.memberPermissions?.[coAuthorUser.id]?.canManageMedia,
                      canInviteCoAuthors: !!book?.memberPermissions?.[coAuthorUser.id]?.canInviteCoAuthors,
                      canManagePendingInvites: !!book?.memberPermissions?.[coAuthorUser.id]?.canManagePendingInvites,
                      canRemoveCoAuthors: !!book?.memberPermissions?.[coAuthorUser.id]?.canRemoveCoAuthors,
                    };
                    const isSavingPermissions = permissionSavingUid === coAuthorUser.id;
                    return (
                      <div
                        key={coAuthorUser.id}
                        className="p-2 bg-gray-50 rounded border border-border/70 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-gray-500" />
                            <div>
                              <p className="text-sm font-medium text-gray-800">{coAuthorUser.displayName || 'Unknown User'}</p>
                              <p className="text-xs text-gray-500">{coAuthorUser.email}</p>
                            </div>
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Co-author</span>
                          </div>
                          {collaborationPermissions.canRemoveCoAuthors && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveCoAuthor(coAuthorUser.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        {isOwner && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {[
                              ['canManageMedia', 'Manage media'],
                              ['canInviteCoAuthors', 'Invite co-authors'],
                              ['canManagePendingInvites', 'Manage pending invites'],
                              ['canRemoveCoAuthors', 'Remove co-authors'],
                            ].map(([field, label]) => (
                              <label key={field} className="flex items-center gap-2 text-foreground">
                                <input
                                  type="checkbox"
                                  checked={permissions[field]}
                                  disabled={isSavingPermissions}
                                  onChange={(e) => handleCoAuthorPermissionToggle(coAuthorUser.id, field, e.target.checked)}
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button variant="outline" onClick={() => setCoAuthorModalOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <DragDropContext
        onDragStart={() => {
          isDraggingPageRef.current = true;
        }}
        onDragEnd={async (result) => {
          try {
            await onDragEnd(result);
          } finally {
            // Let click handlers settle before re-enabling row click behavior.
            requestAnimationFrame(() => {
              isDraggingPageRef.current = false;
            });
          }
        }}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="shrink-0 py-3 px-4 border-b border-border bg-card flex items-center justify-between z-10">
            <div className="min-w-0 flex items-center gap-3">
              <Button
                variant="appGhost"
                onClick={() => navigate('/books')}
                className="asset-header-btn asset-top-action-btn inline-flex items-center gap-2 h-8 rounded-pill px-4 text-xs font-semibold"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to books
              </Button>
              {(book?.coverImageUrl || book?.coverImage) && (
                <img
                  src={convertToEmulatorURL(book.coverImageUrl || book.coverImage)}
                  alt="Cover"
                  className="h-8 w-8 rounded object-cover border border-gray-200"
                />
              )}
              <h1 className="text-lg font-semibold text-app-gray-900 truncate max-w-md" title={book?.babyName}>
                {book?.babyName}
              </h1>
              {isOwner && !isForcedReadRoute && (
                <Button
                  variant="appGhost"
                  onClick={() => setEditBookModalOpen(true)}
                  className="asset-header-btn asset-top-action-btn inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill p-0 text-xs font-semibold"
                  title="Edit book details"
                  aria-label="Edit book details"
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {!isForcedReadRoute && canEdit && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigate(`/book/${bookId}/view`)}
                  className="flex items-center gap-2 h-8 text-xs"
                >
                  <Eye className="h-3 w-3" />
                  Preview
                </Button>
                <VoiceAssistantButton
                  bookId={bookId}
                  chapterId={selectedChapterId}
                  pageId={selectedPageId}
                />
                {canOpenCoAuthorModal && (
                  <>
                    {isOwner && (
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
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setCoAuthorModalOpen(true)}
                      disabled={disableCoAuthorActions}
                      title={!canInviteCoAuthors
                        ? 'You do not have permission to add co-authors.'
                        : (coAuthorSlotsFull
                          ? `Co-author limit reached (${COAUTHOR_SLOT_LIMIT} total slots).`
                          : undefined)}
                      className="flex items-center gap-2 h-8 text-xs"
                    >
                      <Users className="h-3 w-3" />
                      Co-Authors
                    </Button>
                  </>
                )}
              </div>
            )}
            {isForcedReadRoute && canEdit && (
              <div className="flex items-center gap-2">
                <VoiceAssistantButton
                  bookId={bookId}
                  chapterId={selectedChapterId}
                  pageId={selectedPageId}
                  className="h-10 rounded-xl px-5 text-sm font-semibold"
                />
                <Button
                  variant="outline"
                  onClick={() => navigate(`/book/${bookId}`)}
                  className="flex items-center gap-2 h-10 rounded-xl px-5 text-sm font-semibold"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
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
                  {!isForcedReadRoute && (
                    <div className="p-3 border-b border-border bg-card/80 backdrop-blur-sm">
                      <form onSubmit={handleCreateChapter} className="flex items-center space-x-2">
                        <Input
                          value={newChapterTitle}
                          onChange={(e) => setNewChapterTitle(e.target.value)}
                          placeholder="New chapter..."
                          disabled={!canEdit}
                          className="h-8 text-sm"
                        />
                        <Button
                          type="submit"
                          size="icon"
                          disabled={!canEdit || isCreatingChapter}
                          className="chapter-create-btn h-8 w-8 rounded-pill"
                        >
                          <PlusCircle className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto overflow-x-visible p-2">
                    <div className="space-y-1">
                      {[...chapters].sort((a, b) => compareOrder(a.order, b.order)).map(chapter => (
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
                              if (isForcedReadRoute) {
                                setViewMode('pages');
                              } else {
                                setViewMode('chapter');
                                setSelectedPageId(null);
                              }
                              setExpandedChapters(new Set([chapter.id]));
                            }}
                            className={`chapter-sidebar-row w-full text-left p-2 rounded-lg flex items-center justify-between ${editingChapterId === chapter.id ? '' : 'cursor-pointer'} ${selectedChapterId === chapter.id && viewMode === 'chapter' ? 'bg-app-iris/10 text-app-iris font-medium chapter-sidebar-row-active' : 'text-foreground'}`}
                          >
                            <div className="flex items-center flex-1 min-w-0 mr-2">
                              {isOwner && !isForcedReadRoute && <HoverDeleteMenu onDelete={() => openDeleteModal('chapter', chapter)} />}
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
                                    if (isForcedReadRoute) return;
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
                            <StrictModeDroppable droppableId={chapter.id} type="PAGE" isDropDisabled={isForcedReadRoute || !canEdit}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.droppableProps}
                                  className={`ml-2 mt-1 rounded-lg border py-1.5 transition-colors ${
                                    snapshot.isDraggingOver ? 'border-app-iris/50 bg-app-iris/5' : 'border-transparent bg-transparent'
                                  }`}
                                >
                                  {(() => {
                                    const chapterPages = getSidebarPagesForChapter(chapter.id);

                                    return chapterPages.length > 0 ? chapterPages.map((pageSummary, index) => (
                                      <Draggable
                                        key={pageSummary.pageId}
                                        draggableId={pageSummary.pageId}
                                        index={index}
                                        isDragDisabled={isForcedReadRoute || !canEdit}
                                      >
                                        {(provided2, snapshot2) => (
                                          <div
                                            ref={provided2.innerRef}
                                            {...provided2.draggableProps}
                                            {...provided2.dragHandleProps}
                                            onClick={() => {
                                              if (isDraggingPageRef.current) return;
                                              if (editingPageId === pageSummary.pageId) return;
                                              // Switch to pages view mode
                                              setViewMode('pages');
                                              requestSelectPage(chapter.id, pageSummary.pageId);
                                            }}
                                            role="button"
                                            tabIndex={0}
                                            className={`chapter-page-row group w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center justify-between transition-all cursor-pointer ${
                                              snapshot2.isDragging
                                                ? 'chapter-page-row-dragging bg-white border border-app-iris/30 shadow-md'
                                              : selectedPageId === pageSummary.pageId && viewMode === 'pages'
                                                  ? 'chapter-page-row-active bg-app-iris/10 text-app-iris border border-app-iris/20'
                                                  : 'text-app-gray-700 border border-transparent'
                                            }`}
                                            style={{
                                              ...provided2.draggableProps.style,
                                              cursor: isForcedReadRoute || !canEdit ? 'pointer' : (snapshot2.isDragging ? 'grabbing' : 'grab')
                                            }}
                                          >
                                            <div className="flex items-center min-w-0">
                                              <span className="chapter-page-index-badge mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded bg-app-gray-100 px-1.5 text-[10px] font-semibold text-app-gray-500">
                                                {index + 1}
                                              </span>
                                              {!isForcedReadRoute && canEdit && (
                                                <span
                                                  className="chapter-page-drag-handle mr-2 rounded p-1 text-app-gray-300 hover:bg-app-gray-100 hover:text-foreground shrink-0"
                                                  title="Drag page"
                                                >
                                                  <GripVertical className="h-3 w-3" />
                                                </span>
                                              )}
                                              {editingPageId === pageSummary.pageId ? (
                                                <input
                                                  value={editingPageName}
                                                  onChange={(e) => setEditingPageName(e.target.value)}
                                                  onBlur={() => handleSavePageName(chapter.id, pageSummary)}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                      e.preventDefault();
                                                      handleSavePageName(chapter.id, pageSummary);
                                                    }
                                                    if (e.key === 'Escape') {
                                                      e.preventDefault();
                                                      handleCancelEditPageName();
                                                    }
                                                  }}
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="h-6 w-44 max-w-full rounded border border-border px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                                                  placeholder="Page name"
                                                  autoFocus
                                                />
                                              ) : (
                                                <span
                                                  className="truncate text-xs"
                                                  onDoubleClick={(e) => {
                                                    if (isForcedReadRoute || !canEdit) return;
                                                    e.stopPropagation();
                                                    handleStartEditPageName(pageSummary);
                                                  }}
                                                  title={(pageSummary.pageName || '').trim() || pageSummary.shortNote || 'Untitled Page'}
                                                >
                                                  {(pageSummary.pageName || '').trim() || pageSummary.shortNote || 'Untitled Page'}
                                                </span>
                                              )}
                                            </div>

                                            {canEdit && !isForcedReadRoute && (
                                              <div className="ml-2 flex items-center">
                                                {chapter.id === selectedChapterId && (
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                                                    title="Insert page below"
                                                    aria-label="Insert page below"
                                                    disabled={isAddingPage}
                                                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      requestAddPageAfter(pageSummary.pageId);
                                                    }}
                                                  >
                                                    <PlusCircle className="h-3.5 w-3.5" />
                                                  </Button>
                                                )}
                                                <HoverDeleteMenu side="right" onDelete={() => openDeleteModal('page', { ...pageSummary, chapterId: chapter.id, pageIndex: index })} />
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </Draggable>
                                    )) : <div className="px-2 py-1.5 text-xs text-muted-foreground italic">No pages</div>;
                                  })()}
                                  {provided.placeholder}
                                </div>
                              )}
                            </StrictModeDroppable>
                          )}
                        </div>
                      ))}

                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Center: Editor List */}
            <div className="flex-1 flex flex-col min-h-0 relative bg-card overflow-hidden matrix-surface">
              <div
                className={`flex-1 h-full scroll-smooth ${isReadOnlyPagesMode ? 'overflow-y-auto overflow-x-hidden' : 'overflow-x-auto overflow-y-auto'} ${viewMode === 'pages' && !isReadOnlyPagesMode ? 'snap-x snap-mandatory' : ''}`}
                ref={scrollContainerRef}
                onWheel={handlePagesWheel}
              >
                <div className={`${viewMode === 'pages'
                  ? (isReadOnlyPagesMode
                    ? 'min-h-full flex flex-col items-stretch gap-8 px-0 pb-8'
                    : 'min-h-full flex flex-row items-start gap-0 px-0 pb-8')
                  : 'min-h-full pb-32'}`}
                >
                  {selectedChapterId ? (
                    <>
                      {viewMode === 'chapter' ? (
                        /* Chapter View: Show AI Assistant */
                        <div className="flex flex-col justify-center items-center text-center h-full p-6">
                          <div className="bg-app-gray-50 rounded-full p-6 mb-4">
                            <Sparkles className="h-8 w-8 text-app-iris" />
                          </div>
                          <h3 className="text-lg font-medium text-app-iris mb-1">
                            {chapters.find(c => c.id === selectedChapterId)?.title}
                          </h3>
                          <h2 className="text-xl font-semibold text-gray-800">Ready to write?</h2>
                          <p className="mt-2 text-gray-500 max-w-xs">Use the AI assistant below to add content or create pages manually.</p>

                          {/* Show "Go to Pages" button if pages exist */}
                          {pages.length > 0 && (
                            <Button
                              onClick={() => {
                                setViewMode('pages');
                                setSelectedPageId(pages[0].id);
                              }}
                              variant="outline"
                              className="mt-4"
                            >
                              <Type className="h-4 w-4 mr-2" />
                              View Pages ({pages.length})
                            </Button>
                          )}

                          {canEdit && (
                            <Button onClick={requestAddPage} className="mt-2" disabled={isAddingPage}>
                              <PlusCircle className="h-4 w-4 mr-2" />
                              Add Page Manually
                            </Button>
                          )}

                          {/* AI Assistant Box */}
                          <div className="w-full max-w-3xl mt-8 text-left space-y-4">
                            <ChapterChatBox
                              inputValue={chapterChatInput}
                              onInputChange={setChapterChatInput}
                              bookId={bookId}
                              chapterId={selectedChapterId}
                              onOpenPhotoPlanner={openPhotoPlanner}
                              canTransfer={pages.length > 0}
                              onTransfer={(transferMessages) => {
                                setChatPanelSeed({
                                  messages: transferMessages,
                                  token: Date.now(),
                                });
                              }}
                              onPageCreated={(pageData) => {
                                console.log('🔄 Refreshing pages after page creation:', pageData);
                                // Refresh pages for the current chapter
                                fetchPages(selectedChapterId);
                              }}
                            />
                            <GenerateChapterContent
                              bookId={bookId}
                              chapterId={selectedChapterId}
                              onSuggestionSelect={setChapterChatInput}
                            />
                          </div>
                        </div>
                      ) : (
                        /* Pages View: Show all pages */
                        pages.length > 0 ? (
                          <>
                            {pages.map((p, index) => (
                              <div
                                key={p.id}
                                ref={el => pageContainerRefs.current[p.id] = el}
                                data-page-id={p.id}
                                className={`${book?.layoutMode === 'standard'
                                  ? (isReadOnlyPagesMode ? 'w-full px-0' : 'w-full min-w-full shrink-0 px-0 snap-start snap-always')
                                  : (isReadOnlyPagesMode ? 'w-full px-0' : 'w-full min-w-full shrink-0 px-0 snap-start snap-always')
                                } ${book?.templateType === 'babyJournalPage' && !isReadOnlyPagesMode && pageTurnAnimatingId === p.id ? 'baby-page-turn-enter' : ''}`}
                              >
                                {/* Page Divider (except for first page) */}
                                {index > 0 && book?.layoutMode !== 'standard' && (
                                  <div className="w-full h-px bg-gray-100 my-10" />
                                )}

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
                                  readOnly={isForcedReadRoute || !canEdit}
                                />
                              </div>
                            ))}
                          </>
                        ) : (
                          <div className="flex flex-col justify-center items-center text-center h-full p-6">
                            <p className="text-gray-500">No pages in this chapter yet.</p>
                          </div>
                        )
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col justify-center items-center text-center h-full p-6">
                      <div className="bg-app-gray-50 rounded-full p-6 mb-4">
                        <Sparkles className="h-8 w-8 text-app-iris" />
                      </div>
                      <h2 className="text-xl font-semibold text-gray-800">Select a chapter</h2>
                      <p className="mt-2 text-gray-500 max-w-xs">Create a new chapter to get started.</p>
                    </div>
                  )}

                  {/* Space at bottom for scrolling past last page */}
                  <div className={viewMode === 'pages' ? (isReadOnlyPagesMode ? 'h-8' : 'w-0 shrink-0') : 'h-20'}></div>
                </div>
              </div>
              {viewMode === 'pages' && isAtChapterEnd && nextChapter && (
                <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
                  <Button
                    variant="appPrimary"
                    onClick={handleGoToNextChapter}
                    disabled={isChapterSwitching}
                    className="continue-next-chapter-btn pointer-events-auto h-11 min-w-[220px] rounded-full px-6 text-base font-semibold tracking-tight"
                  >
                    {isChapterSwitching ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading next chapter...
                      </>
                    ) : (
                      nextChapterLabel
                    )}
                  </Button>
                </div>
              )}
              {isChapterSwitching && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                  <div className="inline-flex items-center rounded-full border border-app-iris/20 bg-card px-4 py-2 text-sm font-medium text-app-iris shadow-md matrix-surface-soft">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading chapter...
                  </div>
                </div>
              )}

              {/* Sticky Footer - Only show in pages mode */}
              {showGlobalPagesFooter && pages.length > 0 && viewMode === 'pages' && (
                <div className="shrink-0 border-t border-border bg-card/80 backdrop-blur-md p-4 z-30">
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
                        onClick={async () => {
                          if (activePageId && pageRefs.current[activePageId]?.save) {
                            await pageRefs.current[activePageId].save();
                          }
                        }}
                        variant="appPrimary"
                        size="sm"
                        disabled={!activePageId}
                        className="min-w-[100px]"
                      >
                        Save Page
                      </Button>
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
            {!isForcedReadRoute && (
              <ChatPanel
                onMinimizeChange={setIsChatMinimized}
                bookId={bookId}
                chapterId={selectedChapterId}
                incomingMessages={chatPanelSeed?.messages}
                incomingMessagesToken={chatPanelSeed?.token}
                onOpenPhotoPlanner={openPhotoPlanner}
              />
            )}
          </div>
        </div>
      </DragDropContext>
      <PhotoPlannerDialog
        isOpen={photoPlannerOpen}
        onOpenChange={handlePhotoPlannerOpenChange}
        bookId={bookId}
        chapters={chapters}
        defaultChapterId={selectedChapterId || chapters[0]?.id}
        accessibleAlbums={accessibleAlbums}
        isBabyJournal={book?.templateType === 'babyJournalPage'}
        source={photoPlannerSeed?.source || 'book_assistant'}
        seed={photoPlannerSeed || {}}
        onEnsureChapter={canEdit ? handleEnsurePlannerChapter : undefined}
        onApplied={handlePlannerApplied}
      />
      <style>{`
        .baby-page-turn-enter {
          animation: babyPageTurnEnter 620ms cubic-bezier(0.2, 0.8, 0.2, 1);
          transform-origin: right center;
          perspective: 1400px;
        }

        @keyframes babyPageTurnEnter {
          0% {
            transform: rotateY(16deg) scale(0.985);
            opacity: 0.92;
            filter: saturate(0.95);
          }
          55% {
            transform: rotateY(-6deg) scale(1.002);
            opacity: 0.98;
          }
          100% {
            transform: rotateY(0deg) scale(1);
            opacity: 1;
            filter: saturate(1);
          }
        }
      `}</style>
    </>
  );
};

export default BookDetail;
