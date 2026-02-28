import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, LogOut, User, BookOpen, Layers, FileText, Check, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { AppInput } from '@/components/ui/input';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import { firestore } from '@/lib/firebase';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { collabApi, getCallableErrorMessage } from '@/services/collabApi';
import { useToast } from '@/components/ui/use-toast';

const AppHeader = () => {
  const { user, appUser, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme } = useTheme();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState({ books: [], chapters: [], pages: [] });
  const [notificationItems, setNotificationItems] = useState([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [actingInviteId, setActingInviteId] = useState(null);
  const profileMenuRef = useRef(null);
  const searchBoxRef = useRef(null);
  const chapterCacheRef = useRef(new Map());
  const searchTimeoutRef = useRef(null);
  const searchRunRef = useRef(0);

  const userName = appUser?.displayName || user?.displayName || 'User';
  const userEmail = appUser?.email || user?.email || '';
  const avatarUrl = user?.photoURL;
  const initial = userName.charAt(0).toUpperCase();
  const isNeonTheme = theme !== 'light';
  const pendingInvitesCount = Math.max(0, Number(appUser?.notificationCounters?.pendingInvites || 0));
  const badgeLabel = pendingInvitesCount > 99 ? '99+' : String(pendingInvitesCount);

  const formatRelativeTime = (value) => {
    if (!value) return 'just now';
    const ts = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(ts)) return 'just now';
    const deltaMs = Date.now() - ts;
    const mins = Math.floor(deltaMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Close profile menu when clicking outside
  useEffect(() => {
    if (!showProfileMenu) return;
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalizeBooks = () => {
    const items = Array.isArray(appUser?.accessibleBookIds) ? appUser.accessibleBookIds : [];
    return items.map((item) => {
      if (typeof item === 'string') {
        return { bookId: item, title: 'Untitled Book' };
      }
      return {
        bookId: item.bookId,
        title: item.title || item.babyName || 'Untitled Book',
      };
    }).filter((item) => !!item.bookId);
  };

  const fetchBookChapters = async (bookId) => {
    if (!bookId) return [];
    if (chapterCacheRef.current.has(bookId)) {
      return chapterCacheRef.current.get(bookId) || [];
    }

    const chaptersRef = collection(firestore, 'books', bookId, 'chapters');
    let chapterDocs = [];

    try {
      const snapshot = await getDocs(query(chaptersRef, orderBy('order', 'asc'), limit(100)));
      chapterDocs = snapshot.docs;
    } catch (_) {
      const fallback = await getDocs(chaptersRef);
      chapterDocs = fallback.docs;
    }

    const chapters = chapterDocs.map((docItem) => {
      const data = docItem.data() || {};
      return {
        id: docItem.id,
        title: data.title || 'Untitled Chapter',
        pagesSummary: Array.isArray(data.pagesSummary) ? data.pagesSummary : [],
      };
    });

    chapterCacheRef.current.set(bookId, chapters);
    return chapters;
  };

  const executeSearch = async (rawQuery) => {
    const queryText = rawQuery.trim().toLowerCase();
    if (queryText.length < 2) {
      setSearchResults({ books: [], chapters: [], pages: [] });
      setIsSearchLoading(false);
      return;
    }

    const runId = ++searchRunRef.current;
    setIsSearchLoading(true);

    const books = normalizeBooks();
    const bookMatches = books
      .filter((book) => (book.title || '').toLowerCase().includes(queryText))
      .slice(0, 6)
      .map((book) => ({
        id: book.bookId,
        title: book.title,
      }));

    const booksToScan = books.slice(0, 25);
    const chapterAndPageResults = await Promise.all(
      booksToScan.map(async (book) => {
        const chapters = await fetchBookChapters(book.bookId);
        const chapterMatches = chapters
          .filter((chapter) => (chapter.title || '').toLowerCase().includes(queryText))
          .map((chapter) => ({
            id: chapter.id,
            title: chapter.title,
            bookId: book.bookId,
            bookTitle: book.title,
          }));
        const pageMatches = chapters.flatMap((chapter) => (
          (chapter.pagesSummary || [])
            .map((pageSummary) => ({
              pageId: pageSummary?.pageId,
              title: ((pageSummary?.pageName || '').trim() || pageSummary?.shortNote || 'Untitled Page'),
              chapterId: chapter.id,
              chapterTitle: chapter.title,
              bookId: book.bookId,
              bookTitle: book.title,
            }))
            .filter((page) => !!page.pageId && (page.title || '').toLowerCase().includes(queryText))
        ));
        return { chapterMatches, pageMatches };
      })
    );
    const chapterMatches = chapterAndPageResults.flatMap((result) => result.chapterMatches).slice(0, 8);
    const pageMatches = chapterAndPageResults.flatMap((result) => result.pageMatches).slice(0, 10);

    if (runId !== searchRunRef.current) return;
    setSearchResults({
      books: bookMatches,
      chapters: chapterMatches,
      pages: pageMatches,
    });
    setIsSearchLoading(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
    setShowProfileMenu(false);
  };

  const loadNotificationsPreview = useCallback(async () => {
    setNotificationLoading(true);
    try {
      const result = await collabApi.listNotifications({ pageSize: 15 });
      setNotificationItems(Array.isArray(result?.notifications) ? result.notifications : []);
    } catch (error) {
      toast({
        title: 'Notifications',
        description: getCallableErrorMessage(error, 'Failed to load notifications.'),
        variant: 'destructive',
      });
    } finally {
      setNotificationLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!showNotifications) return;
    loadNotificationsPreview();
  }, [showNotifications, loadNotificationsPreview]);

  const handleNotificationAction = async (inviteId, action) => {
    setActingInviteId(inviteId);
    try {
      await collabApi.respondCoAuthorInvite({ inviteId, action });
      setNotificationItems((prev) => prev.filter((item) => item.inviteId !== inviteId));
      toast({
        title: action === 'accept' ? 'Invite accepted' : 'Invite declined',
      });
    } catch (error) {
      toast({
        title: 'Action failed',
        description: getCallableErrorMessage(error, 'Could not update invitation.'),
        variant: 'destructive',
      });
    } finally {
      setActingInviteId(null);
    }
  };

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setSearchResults({ books: [], chapters: [], pages: [] });
      setIsSearchLoading(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      executeSearch(searchQuery);
    }, 250);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, appUser]);

  const openBook = (bookId) => {
    if (!bookId) return;
    setShowSearchResults(false);
    setSearchQuery('');
    navigate(`/book/${bookId}`);
  };

  const openChapter = (bookId, chapterId) => {
    if (!bookId || !chapterId) return;
    setShowSearchResults(false);
    setSearchQuery('');
    navigate(`/book/${bookId}?chapter=${encodeURIComponent(chapterId)}`);
  };

  const openPage = (bookId, chapterId, pageId) => {
    if (!bookId || !chapterId || !pageId) return;
    setShowSearchResults(false);
    setSearchQuery('');
    navigate(`/book/${bookId}?chapter=${encodeURIComponent(chapterId)}&page=${encodeURIComponent(pageId)}`);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const firstResult = searchResults.books[0]
      || searchResults.chapters[0]
      || searchResults.pages[0];
    if (!firstResult) return;
    if (searchResults.books[0]?.id === firstResult.id) {
      openBook(firstResult.id);
      return;
    }
    if (searchResults.chapters[0]?.id === firstResult.id && firstResult.bookId) {
      openChapter(firstResult.bookId, firstResult.id);
      return;
    }
    openPage(firstResult.bookId, firstResult.chapterId, firstResult.pageId);
  };

  return (
    <header
      className={cn(
        'hidden md:flex h-16 items-center justify-between px-6 shrink-0 border-b bg-card text-foreground border-border relative z-30',
        isNeonTheme && 'shadow-[0_12px_30px_rgba(16,185,129,0.12)]',
      )}
    >
      {/* Left: Empty or subtle branding */}
      <div className="w-48">
        {/* Optional: Add breadcrumbs or page title here */}
      </div>

      {/* Center: Search bar */}
      <div className="relative flex-1 max-w-2xl mx-8" ref={searchBoxRef}>
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-app-gray-600" />
          <AppInput
            type="text"
            placeholder="Search books, chapters, pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setShowSearchResults(true)}
            className="pl-10 pr-4 w-full"
          />
        </form>
        {showSearchResults && searchQuery.trim().length >= 2 && (
          <div className="absolute mt-2 w-full max-w-2xl rounded-xl border border-border bg-card shadow-appCard z-50 overflow-hidden">
            {isSearchLoading ? (
              <div className="px-4 py-3 text-sm text-app-gray-600">Searching...</div>
            ) : (searchResults.books.length === 0 && searchResults.chapters.length === 0 && searchResults.pages.length === 0) ? (
              <div className="px-4 py-3 text-sm text-app-gray-600">No results found.</div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                {searchResults.books.length > 0 && (
                  <div className="py-1">
                    <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-app-gray-500">Books</div>
                    {searchResults.books.map((book) => (
                      <button
                        key={`book-${book.id}`}
                        type="button"
                        onClick={() => openBook(book.id)}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-app-gray-100 flex items-center gap-2"
                      >
                        <BookOpen className="h-4 w-4 text-app-gray-500" />
                        <span className="truncate">{book.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.chapters.length > 0 && (
                  <div className="py-1 border-t border-border/70">
                    <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-app-gray-500">Chapters</div>
                    {searchResults.chapters.map((chapter) => (
                      <button
                        key={`chapter-${chapter.id}-${chapter.bookId}`}
                        type="button"
                        onClick={() => openChapter(chapter.bookId, chapter.id)}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-app-gray-100 flex items-center gap-2"
                      >
                        <Layers className="h-4 w-4 text-app-gray-500" />
                        <span className="truncate">{chapter.title}</span>
                        <span className="text-xs text-app-gray-500 truncate">in {chapter.bookTitle}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.pages.length > 0 && (
                  <div className="py-1 border-t border-border/70">
                    <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-app-gray-500">Pages</div>
                    {searchResults.pages.map((page) => (
                      <button
                        key={`page-${page.pageId}-${page.chapterId}-${page.bookId}`}
                        type="button"
                        onClick={() => openPage(page.bookId, page.chapterId, page.pageId)}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-app-gray-100 flex items-start gap-2"
                      >
                        <FileText className="h-4 w-4 text-app-gray-500 mt-0.5" />
                        <span className="min-w-0">
                          <span className="block truncate">{page.title}</span>
                          <span className="block text-xs text-app-gray-500 truncate">
                            in {page.chapterTitle} • {page.bookTitle}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Notifications, Settings, Profile */}
      <div className="flex items-center gap-2">
        <ThemeToggle variant="appGhost" />
        {/* Notifications */}
        {/* Notifications */}
        <div className="relative">
          <Button
            variant="appGhost"
            size="icon"
            className="h-9 w-9 relative"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell className="h-5 w-5" />
            {pendingInvitesCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] leading-[18px] px-1 text-center font-semibold">
                {badgeLabel}
              </span>
            )}
          </Button>

          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotifications(false)}
              />
              <div className="absolute right-0 mt-2 w-96 bg-card rounded-xl shadow-appCard border border-border py-3 z-50">
                <div className="px-4 pb-2 border-b border-border/70 flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-foreground">Notifications</h3>
                  <span className="text-xs text-app-gray-500">{pendingInvitesCount} pending</span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notificationLoading ? (
                    <div className="px-4 py-8 text-sm text-app-gray-500">Loading notifications...</div>
                  ) : notificationItems.length === 0 ? (
                    <div className="px-4 py-8 flex flex-col items-center justify-center text-center">
                      <div className="h-10 w-10 rounded-full bg-app-gray-50 flex items-center justify-center mb-3 text-app-gray-400">
                        <Bell className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-medium text-foreground">No notifications yet</p>
                      <p className="text-xs text-app-gray-500 mt-1">
                        We'll let you know when something important happens.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/60">
                      {notificationItems.map((item) => (
                        <div key={item.id} className="px-4 py-3 space-y-2">
                          <p className="text-sm text-foreground">
                            <span className="font-semibold">{item.ownerName || 'Book owner'}</span> invited you to co-author{' '}
                            <span className="font-semibold">{item.bookTitle || 'Untitled Book'}</span>.
                          </p>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-app-gray-500">{formatRelativeTime(item.createdAt)}</p>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs gap-1"
                                disabled={actingInviteId === item.inviteId}
                                onClick={() => handleNotificationAction(item.inviteId, 'decline')}
                              >
                                <X className="h-3 w-3" />
                                Decline
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs gap-1"
                                disabled={actingInviteId === item.inviteId}
                                onClick={() => handleNotificationAction(item.inviteId, 'accept')}
                              >
                                <Check className="h-3 w-3" />
                                Accept
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="px-4 pt-3 border-t border-border/70">
                  <Button
                    variant="outline"
                    className="w-full h-8 text-xs"
                    onClick={() => {
                      navigate('/notifications');
                      setShowNotifications(false);
                    }}
                  >
                    View all notifications
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Profile dropdown */}
        <div className="relative" ref={profileMenuRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 rounded-pill hover:bg-app-gray-100 transition-colors p-1 pr-3"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={userName}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="app-avatar-fallback h-8 w-8 rounded-full bg-app-iris text-white flex items-center justify-center text-sm font-semibold">
                {initial}
              </div>
            )}
            <span className="text-sm font-medium text-app-gray-900 hidden lg:block">
              {userName}
            </span>
          </button>

          {/* Dropdown menu */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-card rounded-xl shadow-appCard border border-border py-2 z-50">
              <div className="px-4 py-3 border-b border-border/70">
                <p className="text-sm font-semibold text-foreground">{userName}</p>
                <p className="text-xs text-app-gray-600 truncate">{userEmail}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => {
                    navigate('/settings');
                    setShowProfileMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-app-gray-900 hover:bg-app-gray-100 transition-colors"
                >
                  <User className="h-4 w-4" />
                  Profile Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;

