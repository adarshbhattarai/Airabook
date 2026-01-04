import { useRef, useState } from 'react';

export const useBookDetailState = () => {
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

  const pageRefs = useRef({});
  const pageContainerRefs = useRef({});
  const scrollContainerRef = useRef(null);
  const [activePageId, setActivePageId] = useState(null);
  const [isSavingChapter, setIsSavingChapter] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [standardPageHeightPx, setStandardPageHeightPx] = useState(0);
  const [scrollContainerWidthPx, setScrollContainerWidthPx] = useState(0);

  return {
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
  };
};
