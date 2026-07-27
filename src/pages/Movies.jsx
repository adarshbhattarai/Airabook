import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Code2,
  Film,
  Layers3,
  Library,
  Loader2,
  PencilLine,
  PlayCircle,
  PlusCircle,
  Sparkles,
  Wand2,
} from 'lucide-react';
import AppLoader from '@/components/app/AppLoader';
import StatCard from '@/components/app/StatCard';
import PageEditor from '@/components/PageEditor';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/context/AuthContext';
import { firestore } from '@/lib/firebase';
import {
  createPageClip,
  listPageClipsForBook,
  renderPageClip,
  revisePageClip,
  streamPageClip,
} from '@/services/videoJobsService';

const STATUS_STYLES = {
  DRAFTING: 'bg-amber-50 text-amber-700 border-amber-200',
  READY_REVIEW: 'bg-sky-50 text-sky-700 border-sky-200',
  READY_RENDER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RENDERING: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
};

const stripHtml = (value = '') => String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const statusClasses = (status) => (
  `${STATUS_STYLES[status] || 'bg-app-gray-100 text-app-gray-700 border-app-gray-200'} movies-status-pill`
);

const normalizeBooks = (appUser) => {
  if (!appUser) return [];
  return (appUser.accessibleBookIds || []).map((item) => {
    if (typeof item === 'string') {
      return { bookId: item, title: 'Untitled Book', coverImage: null };
    }

    return {
      ...item,
      bookId: item.bookId,
      title: item.title || item.babyName || 'Untitled Book',
      coverImage: item.coverImage || item.coverImageUrl || null,
    };
  }).filter((item) => item.bookId);
};

const normalizeVideoErrorMessage = (message, fallback) => {
  if (!message) return fallback;
  if (/expected pattern/i.test(message) || /failed to construct 'url'/i.test(message) || /invalid url/i.test(message)) {
    return 'Movies could not reach the video service. Refresh the page and verify the Spring API URL configuration.';
  }
  return message;
};

const mergeJob = (jobs, nextJob) => {
  if (!nextJob?.jobId) return jobs;
  const existingIndex = jobs.findIndex((job) => job.jobId === nextJob.jobId);
  if (existingIndex === -1) return [nextJob, ...jobs];

  const nextJobs = [...jobs];
  nextJobs[existingIndex] = nextJob;
  return nextJobs;
};

const getPageTitle = (page = {}) => (
  page.title
  || page.pageTitle
  || page.shortNote
  || stripHtml(page.note).slice(0, 72)
  || 'Untitled page'
);

const buildPagePath = ({ bookId, chapterId, pageId }) => {
  if (!bookId) return '/books';
  const params = new URLSearchParams();
  if (chapterId) params.set('chapter', chapterId);
  if (pageId) params.set('page', pageId);
  const queryString = params.toString();
  return `/book/${bookId}${queryString ? `?${queryString}` : ''}`;
};

const summarizeJobs = (jobs = []) => {
  const latestJob = jobs[0] || null;
  return {
    clipCount: jobs.length,
    completedCount: jobs.filter((job) => job.status === 'COMPLETED').length,
    activeCount: jobs.filter((job) => ['DRAFTING', 'READY_REVIEW', 'READY_RENDER', 'RENDERING'].includes(job.status)).length,
    renderingCount: jobs.filter((job) => job.status === 'RENDERING').length,
    latestJob,
  };
};

const formatDate = (value) => {
  if (!value) return 'No updates yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Updated recently';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const Movies = () => {
  const { appUser, appLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const books = useMemo(() => normalizeBooks(appUser), [appUser]);
  const requestedBookId = searchParams.get('bookId') || '';
  const requestedChapterId = searchParams.get('chapterId') || '';
  const requestedPageId = searchParams.get('pageId') || '';
  const requestedJobId = searchParams.get('jobId') || '';

  const [selectedBookId, setSelectedBookId] = useState(requestedBookId);
  const [selectedChapterId, setSelectedChapterId] = useState(requestedChapterId);
  const [selectedPageId, setSelectedPageId] = useState(requestedPageId);
  const [selectedJobId, setSelectedJobId] = useState(requestedJobId);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [bookStructure, setBookStructure] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingStructure, setLoadingStructure] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [structureError, setStructureError] = useState('');
  const [movieSummaries, setMovieSummaries] = useState({});
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createBookId, setCreateBookId] = useState('');
  const [moviePrompt, setMoviePrompt] = useState('');
  const [revisionInstruction, setRevisionInstruction] = useState('');
  const [codeDraft, setCodeDraft] = useState('');
  const [activeEditorTab, setActiveEditorTab] = useState('movie');
  const streamAbortRef = useRef(null);
  const pageStripRef = useRef(null);

  const selectedBook = books.find((book) => book.bookId === selectedBookId) || null;
  const jobByPageId = useMemo(() => {
    const map = new Map();
    jobs.forEach((job) => {
      if (job?.pageId && !map.has(job.pageId)) map.set(job.pageId, job);
    });
    return map;
  }, [jobs]);

  const pages = useMemo(
    () => bookStructure.flatMap((chapter) => chapter.pages.map((page) => ({ ...page, chapter }))),
    [bookStructure],
  );
  const selectedPage = pages.find((page) => page.id === selectedPageId) || null;
  const storyboardScenes = selectedJob?.storyboard?.scenes || [];
  const reviewNotes = selectedJob?.reviewNotes || [];
  const latestWarning = selectedJob?.warnings?.[0] || '';
  const backendManimCode = selectedJob?.manimCode || '# No Manim code is available yet.';
  const codeDirty = !!selectedJob && codeDraft !== backendManimCode;
  const movieWorkspaceTitle = stripHtml(selectedPage?.title)
    || stripHtml(selectedBook?.title)
    || 'Movie workspace';
  const aggregateSummary = useMemo(() => {
    const summaries = Object.values(movieSummaries);
    return summaries.reduce((acc, summary) => ({
      clipCount: acc.clipCount + (summary.clipCount || 0),
      activeCount: acc.activeCount + (summary.activeCount || 0),
      renderingCount: acc.renderingCount + (summary.renderingCount || 0),
    }), { clipCount: 0, activeCount: 0, renderingCount: 0 });
  }, [movieSummaries]);
  useEffect(() => {
    if (!requestedBookId) {
      setSelectedBookId('');
      setSelectedChapterId('');
      setSelectedPageId('');
      setSelectedJobId('');
      setSelectedJob(null);
      return;
    }
    if (books.length && !books.some((book) => book.bookId === requestedBookId)) return;
    setSelectedBookId(requestedBookId);
    setSelectedChapterId(requestedChapterId);
    setSelectedPageId(requestedPageId);
    setSelectedJobId(requestedJobId);
  }, [books, requestedBookId, requestedChapterId, requestedJobId, requestedPageId]);

  useEffect(() => () => {
    streamAbortRef.current?.abort();
  }, []);

  const handleJobUpdate = useCallback((job) => {
    if (!job?.jobId) return;
    setJobs((prev) => mergeJob(prev, job));
    if (job.jobId === selectedJobId) setSelectedJob(job);
  }, [selectedJobId]);

  const startStream = useCallback(async (bookId, jobId) => {
    if (!bookId || !jobId) return;
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setStreaming(true);

    try {
      await streamPageClip({
        bookId,
        jobId,
        signal: controller.signal,
        onEvent: (_type, payload) => {
          if (payload?.job) handleJobUpdate(payload.job);
        },
      });
    } catch (streamError) {
      if (streamError?.name !== 'AbortError') {
        toast({
          title: 'Video updates paused',
          description: normalizeVideoErrorMessage(streamError.message, 'Could not keep the page clip stream open.'),
          variant: 'destructive',
        });
      }
    } finally {
      if (streamAbortRef.current === controller) streamAbortRef.current = null;
      setStreaming(false);
    }
  }, [handleJobUpdate, toast]);

  const loadJobs = useCallback(async (bookId) => {
    if (!bookId) {
      setJobs([]);
      setSelectedJob(null);
      return;
    }

    setLoadingJobs(true);
    setError('');
    try {
      const nextJobs = await listPageClipsForBook(bookId);
      setJobs(nextJobs);

      const preferredJob = nextJobs.find((job) => job.jobId === requestedJobId)
        || nextJobs.find((job) => requestedPageId && job.pageId === requestedPageId)
        || nextJobs[0]
        || null;

      setSelectedJobId(preferredJob?.jobId || '');
      setSelectedJob(preferredJob);
      if (preferredJob) {
        setSelectedChapterId(preferredJob.chapterId || requestedChapterId || '');
        setSelectedPageId(preferredJob.pageId || requestedPageId || '');
      }
    } catch (loadError) {
      setJobs([]);
      setSelectedJob(null);
      setError(normalizeVideoErrorMessage(loadError.message, 'Could not load page clip jobs for this book.'));
    } finally {
      setLoadingJobs(false);
    }
  }, [requestedChapterId, requestedJobId, requestedPageId]);

  const loadMovieSummaries = useCallback(async () => {
    if (!books.length) {
      setMovieSummaries({});
      return;
    }

    setLoadingSummaries(true);
    try {
      const entries = await Promise.all(books.map(async (book) => {
        try {
          const bookJobs = await listPageClipsForBook(book.bookId);
          return [book.bookId, summarizeJobs(bookJobs)];
        } catch (summaryError) {
          console.warn('Could not load movie summary:', book.bookId, summaryError);
          return [book.bookId, summarizeJobs([])];
        }
      }));
      setMovieSummaries(Object.fromEntries(entries));
    } finally {
      setLoadingSummaries(false);
    }
  }, [books]);

  const loadBookStructure = useCallback(async (bookId) => {
    if (!bookId) {
      setBookStructure([]);
      return;
    }

    setLoadingStructure(true);
    setStructureError('');
    try {
      const chaptersSnap = await getDocs(query(collection(firestore, 'books', bookId, 'chapters'), orderBy('order')));
      const chapters = await Promise.all(chaptersSnap.docs.map(async (chapterDoc, index) => {
        const chapterData = chapterDoc.data() || {};
        const pagesSnap = await getDocs(query(
          collection(firestore, 'books', bookId, 'chapters', chapterDoc.id, 'pages'),
          orderBy('order'),
        ));

        return {
          id: chapterDoc.id,
          title: chapterData.title || chapterData.name || `Chapter ${index + 1}`,
          order: chapterData.order ?? index,
          pages: pagesSnap.docs.map((pageDoc, pageIndex) => {
            const pageData = pageDoc.data() || {};
            return {
              id: pageDoc.id,
              chapterId: chapterDoc.id,
              order: pageData.order ?? pageIndex,
              title: getPageTitle(pageData),
              shortNote: pageData.shortNote || '',
              note: pageData.note || '',
              pageName: pageData.pageName || '',
              type: pageData.type || '',
              content: pageData.content || null,
              media: Array.isArray(pageData.media) ? pageData.media : [],
              embeddedMedia: Array.isArray(pageData.embeddedMedia) ? pageData.embeddedMedia : [],
            };
          }),
        };
      }));

      setBookStructure(chapters);
    } catch (loadError) {
      setBookStructure([]);
      setStructureError(loadError.message || 'Could not load pages for this book.');
    } finally {
      setLoadingStructure(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedBookId) {
      setJobs([]);
      setBookStructure([]);
      return;
    }
    loadJobs(selectedBookId);
    loadBookStructure(selectedBookId);
  }, [selectedBookId, loadBookStructure, loadJobs]);

  useEffect(() => {
    loadMovieSummaries();
  }, [loadMovieSummaries]);

  useEffect(() => {
    if (!bookStructure.length) return;
    const hasSelectedPage = selectedPageId
      && bookStructure.some((chapter) => chapter.pages.some((page) => page.id === selectedPageId));
    if (hasSelectedPage) return;
    if (bookStructure[0]?.pages[0]) {
      setSelectedChapterId(bookStructure[0].id);
      setSelectedPageId(bookStructure[0].pages[0].id);
    }
  }, [bookStructure, selectedPageId]);

  useEffect(() => {
    if (!selectedJobId) {
      setSelectedJob(null);
      return;
    }
    const matchingJob = jobs.find((job) => job.jobId === selectedJobId) || null;
    setSelectedJob(matchingJob);
  }, [jobs, selectedJobId]);

  useEffect(() => {
    if (!selectedJob) {
      setCodeDraft('');
      return;
    }
    setCodeDraft(selectedJob.manimCode || '# No Manim code is available yet.');
  }, [selectedJob?.jobId, selectedJob?.manimCode]);

  useEffect(() => {
    if (selectedJob?.previewUrl) {
      setActiveEditorTab('movie');
    }
  }, [selectedJob?.jobId, selectedJob?.previewUrl]);

  useEffect(() => {
    if (selectedJob?.status === 'RENDERING' && selectedBookId && selectedJobId) {
      startStream(selectedBookId, selectedJobId);
      return;
    }
    streamAbortRef.current?.abort();
  }, [selectedBookId, selectedJob?.status, selectedJobId, startStream]);

  const handleSelectPage = (chapterId, pageId) => {
    const pageJob = jobByPageId.get(pageId) || null;
    setSelectedChapterId(chapterId);
    setSelectedPageId(pageId);
    setSelectedJobId(pageJob?.jobId || '');
    setSelectedJob(pageJob);
    setRevisionInstruction('');
    setActiveEditorTab(pageJob?.previewUrl ? 'movie' : 'prompt');
    setSearchParams({
      bookId: selectedBookId,
      chapterId,
      pageId,
      ...(pageJob?.jobId ? { jobId: pageJob.jobId } : {}),
    }, { replace: true });
  };

  const openMovieWorkspace = (bookId) => {
    if (!bookId) return;
    setSearchParams({ bookId }, { replace: false });
  };

  const handleOpenCreateModal = () => {
    setCreateBookId(selectedBookId || books[0]?.bookId || '');
    setCreateModalOpen(true);
  };

  const handleCreateMovie = () => {
    if (!createBookId) return;
    setCreateModalOpen(false);
    openMovieWorkspace(createBookId);
  };

  const handleBackToLibrary = () => {
    setSearchParams({}, { replace: false });
  };

  const scrollPageStrip = (direction) => {
    const node = pageStripRef.current;
    if (!node) return;
    const amount = Math.max(280, Math.floor(node.clientWidth * 0.72));
    node.scrollBy({ left: direction * amount, behavior: 'smooth' });
  };

  const handleCreateClip = async () => {
    if (!selectedBookId || !selectedChapterId || !selectedPageId) {
      toast({
        title: 'Select a page first',
        description: 'A page clip needs a book, chapter, and page before it can be generated.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const fallbackInstruction = selectedPage
        ? `Create a silent page clip for "${selectedPage.title}".`
        : 'Create a silent page clip for this page.';
      const createdJob = await createPageClip({
        bookId: selectedBookId,
        chapterId: selectedChapterId,
        pageId: selectedPageId,
        threadId: `movies-${selectedBookId}-${selectedChapterId}-${selectedPageId}`,
        instruction: revisionInstruction.trim() || moviePrompt.trim() || fallbackInstruction,
      });
      handleJobUpdate(createdJob);
      setSelectedJobId(createdJob.jobId);
      setSelectedJob(createdJob);
      setRevisionInstruction('');
      setActiveEditorTab('prompt');
      setSearchParams({
        bookId: selectedBookId,
        chapterId: selectedChapterId,
        pageId: selectedPageId,
        jobId: createdJob.jobId,
      }, { replace: true });
      toast({
        title: 'Page clip created',
        description: 'The new clip draft is ready for review and render.',
      });
    } catch (createError) {
      toast({
        title: 'Could not create page clip',
        description: normalizeVideoErrorMessage(createError.message, 'The page video workflow could not start right now.'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevise = async () => {
    if (!selectedBookId || !selectedJobId || !revisionInstruction.trim()) return;

    setSubmitting(true);
    try {
      const revisedJob = await revisePageClip({
        bookId: selectedBookId,
        jobId: selectedJobId,
        instruction: revisionInstruction.trim(),
      });
      handleJobUpdate(revisedJob);
      setSelectedJobId(revisedJob.jobId);
      setRevisionInstruction('');
      toast({
        title: 'Clip revised',
        description: 'The storyboard and Manim draft were updated for this page.',
      });
    } catch (reviseError) {
      toast({
        title: 'Revision failed',
        description: normalizeVideoErrorMessage(reviseError.message, 'Could not revise this page clip.'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRender = async () => {
    if (!selectedBookId || !selectedJobId || codeDirty) return;

    setSubmitting(true);
    try {
      const renderingJob = await renderPageClip({
        bookId: selectedBookId,
        jobId: selectedJobId,
        quality: 'medium',
      });
      handleJobUpdate(renderingJob);
      toast({
        title: 'Render started',
        description: 'The Manim runner is building the latest page clip now.',
      });
      startStream(selectedBookId, selectedJobId);
    } catch (renderError) {
      toast({
        title: 'Render failed',
        description: normalizeVideoErrorMessage(renderError.message, 'Could not start rendering this page clip.'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (appLoading) return <AppLoader />;

  if (!books.length) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div
          className="movies-card mx-auto max-w-3xl rounded-[28px] border border-app-gray-200 bg-white px-8 py-12 text-center shadow-appSoft"
          data-testid="movies-empty-state"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-app-iris/10 text-app-iris">
            <Clapperboard className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold text-app-gray-900">Movies will appear when you have a book</h1>
          <p className="mt-3 text-sm leading-relaxed text-app-gray-600">
            Create your first book, add page content, and then generate page clips from the Movies workspace.
          </p>
          <div className="mt-6 flex justify-center">
            <Button variant="appPrimary" onClick={() => navigate('/create-book')}>
              Create your first book
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedBookId) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl space-y-8" data-testid="movies-landing-shell">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold leading-tight text-app-gray-900">Movies</h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-app-gray-600">
                Create book movies, review page clips, and continue rendering where you left off.
              </p>
            </div>
            <Button
              variant="appPrimary"
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-2 text-sm"
              data-testid="movies-create-new"
            >
              <PlusCircle className="h-4 w-4" />
              Create new movie
            </Button>
          </header>

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Movie workspaces" value={books.length} helper="One workspace per book" icon={Library} />
            <StatCard label="Generated clips" value={aggregateSummary.clipCount} helper={loadingSummaries ? 'Loading clip counts' : 'Across all movies'} icon={Film} />
            <StatCard label="Active renders" value={aggregateSummary.activeCount} helper={aggregateSummary.renderingCount ? `${aggregateSummary.renderingCount} rendering now` : 'No clips rendering'} icon={Sparkles} />
          </div>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-app-gray-900">Movie library</h2>
              <p className="text-xs text-app-gray-600">Showing {books.length} {books.length === 1 ? 'movie' : 'movies'}</p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {books.map((book) => {
                const summary = movieSummaries[book.bookId] || summarizeJobs([]);
                const latestJob = summary.latestJob;
                return (
                  <button
                    key={book.bookId}
                    type="button"
                    data-testid={`movies-book-card-${book.bookId}`}
                    onClick={() => openMovieWorkspace(book.bookId)}
                    className="movies-card movies-selectable-card overflow-hidden rounded-2xl border border-app-gray-100 bg-white text-left shadow-appSoft transition-all hover:border-app-iris/30 hover:shadow-appCard"
                  >
                    <div className="relative aspect-[16/9] bg-app-gray-100">
                      {book.coverImage ? (
                        <img src={book.coverImage} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-app-iris">
                          <Clapperboard className="h-12 w-12" />
                        </div>
                      )}
                      <span className="matrix-surface-soft absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-app-iris/20 bg-app-gray-50/90 px-2.5 py-1 text-[11px] font-semibold text-app-iris shadow-sm backdrop-blur-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-app-iris" />
                        Movie workspace
                      </span>
                    </div>
                    <div className="space-y-3 p-4">
                      <div>
                        <h3 className="truncate text-base font-semibold text-app-gray-900">{book.title}</h3>
                        <p className="mt-1 text-xs text-app-gray-600">
                          {summary.clipCount} clip{summary.clipCount === 1 ? '' : 's'} · {summary.completedCount} rendered
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        {latestJob ? (
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClasses(latestJob.status)}`}>
                            {latestJob.status}
                          </span>
                        ) : (
                          <span className="movies-status-pill inline-flex rounded-full border border-app-gray-200 bg-app-gray-50 px-2.5 py-1 text-[11px] font-medium text-app-gray-600">
                            Ready to create
                          </span>
                        )}
                        <span className="text-xs text-app-gray-600">{formatDate(latestJob?.updatedAt || latestJob?.createdAt)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent className="max-w-2xl rounded-2xl bg-white p-6 shadow-xl" data-testid="movies-create-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold text-app-gray-900">
                <Clapperboard className="h-5 w-5 text-app-iris" />
                Create new movie
              </DialogTitle>
              <DialogDescription className="text-sm text-app-gray-600">
                Choose the book that should become a movie workspace. Clips are created page by page.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-5 space-y-5">
              <div className="grid gap-2 sm:grid-cols-2">
                {books.map((book) => (
                  <button
                    key={book.bookId}
                    type="button"
                    onClick={() => setCreateBookId(book.bookId)}
                    className={[
                      'movies-selectable-card rounded-2xl border px-4 py-3 text-left transition-all',
                      createBookId === book.bookId
                        ? 'movies-selectable-card-active border-app-iris bg-app-iris/5'
                        : 'border-app-gray-100 bg-white hover:border-app-iris/20 hover:bg-app-gray-50',
                    ].join(' ')}
                  >
                    <p className="truncate text-sm font-semibold text-app-gray-900">{book.title}</p>
                    <p className="mt-1 text-xs text-app-gray-600">Book movie workspace</p>
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="movies-create-prompt">Movie prompt</Label>
                <Textarea
                  id="movies-create-prompt"
                  value={moviePrompt}
                  onChange={(event) => setMoviePrompt(event.target.value)}
                  placeholder="Example: Use calm pacing, simple diagrams, and minimal on-screen text."
                  className="movies-input min-h-[120px]"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
              <Button variant="appPrimary" onClick={handleCreateMovie} disabled={!createBookId}>
                Open movie workspace
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1400px] space-y-5" data-testid="movies-workspace-shell">
        <section className="movies-card rounded-2xl border border-app-gray-100 bg-white p-5 shadow-appSoft" data-testid="movies-preview-panel">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {selectedJob ? (
                  <span data-testid="movies-job-status" className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClasses(selectedJob.status)}`}>
                    {selectedJob.status}
                  </span>
                ) : (
                  <span className="movies-status-pill inline-flex rounded-full border border-app-gray-200 bg-app-gray-50 px-2.5 py-1 text-[11px] font-medium text-app-gray-600">
                    Page planning
                  </span>
                )}
                {streaming ? (
                  <span className="movies-status-pill inline-flex items-center gap-2 rounded-full border border-app-iris/20 bg-app-iris/5 px-3 py-1 text-[11px] font-medium text-app-iris">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Live
                  </span>
                ) : null}
                {selectedJob?.renderReady ? (
                  <span className="movies-status-pill inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                    Render-ready
                  </span>
                ) : null}
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-app-gray-900">
                {movieWorkspaceTitle}
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleBackToLibrary}>All movies</Button>
            </div>
          </div>

          {error ? <div className="movies-feedback-error mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          {selectedJob?.latestError ? <div className="movies-feedback-error mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{selectedJob.latestError}</div> : null}
          {latestWarning ? <div className="movies-feedback-warning mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{latestWarning}</div> : null}

          <div className="mt-5 flex w-full rounded-2xl border border-app-gray-100 bg-app-gray-50 p-1" data-testid="movies-editor-tabs">
            {[
              { id: 'movie', label: 'Movie', icon: Film },
              { id: 'prompt', label: 'Prompt', icon: Wand2 },
              { id: 'page', label: 'Page', icon: BookOpen },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeEditorTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`movies-tab-${tab.id}`}
                  onClick={() => setActiveEditorTab(tab.id)}
                  className={[
                    'inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
                    active ? 'bg-white text-app-iris shadow-sm' : 'text-app-gray-600 hover:text-app-gray-900',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeEditorTab === 'movie' ? (
            <div className="mt-5">
              {selectedJob?.previewUrl ? (
                <div className="movies-code-panel overflow-hidden rounded-[24px] border border-app-gray-100 bg-app-gray-950 p-3 shadow-inner">
                  <video key={selectedJob.previewUrl} src={selectedJob.previewUrl} data-testid="movies-video-preview" controls className="aspect-video w-full rounded-[18px] bg-black" />
                </div>
              ) : (
                <div className="movies-empty-panel rounded-[24px] border border-dashed border-app-gray-200 bg-app-gray-50 px-6 py-16 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-app-iris/10 text-app-iris">
                    {selectedJob?.status === 'RENDERING' ? <Loader2 className="h-6 w-6 animate-spin" /> : <Film className="h-6 w-6" />}
                  </div>
                  <p className="mt-4 text-sm font-medium text-app-gray-900">{selectedJob?.status === 'RENDERING' ? 'Rendering is in progress' : 'No preview yet'}</p>
                  <p className="mt-2 text-xs text-app-gray-600">
                    {selectedJob ? 'Render the backend-saved Manim draft to produce the video preview.' : 'Open Prompt to generate the first clip for this page.'}
                  </p>
                </div>
              )}
            </div>
          ) : activeEditorTab === 'prompt' ? (
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="movies-card-soft rounded-2xl border border-app-gray-100 bg-app-gray-50 p-4">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-app-iris" />
                  <h2 className="text-sm font-semibold text-app-gray-900">Prompt and generate</h2>
                </div>
                <div className="mt-4 space-y-2">
                  <Label htmlFor="movies-movie-prompt">Movie prompt</Label>
                  <Textarea id="movies-movie-prompt" value={moviePrompt} onChange={(event) => setMoviePrompt(event.target.value)} placeholder="Overall style, pacing, colors, or explanation tone for this book movie." className="movies-input min-h-[110px] resize-none" />
                </div>
                <div className="mt-4 space-y-2">
                  <Label htmlFor="movies-page-prompt">{selectedJob ? 'Revision prompt' : 'Page clip prompt'}</Label>
                  <Textarea id="movies-page-prompt" value={revisionInstruction} onChange={(event) => setRevisionInstruction(event.target.value)} placeholder="Example: Make this page feel like a clean math explainer with fewer words on screen." className="movies-input min-h-[150px] resize-none" data-testid="movies-revision-input" />
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  {selectedJob ? (
                    <Button variant="outline" onClick={handleRevise} disabled={submitting || !revisionInstruction.trim()} data-testid="movies-revision-submit" className="flex-1">
                      {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                      Apply revision
                    </Button>
                  ) : (
                    <Button variant="appPrimary" onClick={handleCreateClip} disabled={submitting || !selectedBookId || !selectedChapterId || !selectedPageId} data-testid="movies-generate-page-clip" className="flex-1">
                      {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clapperboard className="mr-2 h-4 w-4" />}
                      Generate page clip
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => navigate(buildPagePath({ bookId: selectedBookId, chapterId: selectedChapterId, pageId: selectedPageId }))} disabled={!selectedBookId}>
                    Open page in book
                  </Button>
                </div>
              </div>

              <div className="movies-card-soft rounded-2xl border border-app-gray-100 bg-app-gray-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Code2 className="h-4 w-4 text-app-iris" />
                      <h3 className="text-sm font-semibold text-app-gray-900">Editable Manim code</h3>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-app-gray-600">Edits are local until backend save-code support is active.</p>
                  </div>
                  <Button variant="appPrimary" onClick={handleRender} disabled={submitting || !selectedJobId || selectedJob?.status === 'RENDERING' || codeDirty} data-testid="movies-render-button" className="shrink-0">
                    {submitting && selectedJob?.status !== 'RENDERING' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                    Render clip
                  </Button>
                </div>
                {codeDirty ? <div className="movies-feedback-warning mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">Save-code support is planned but not active yet. Revert local edits or revise by prompt before rendering.</div> : null}
                <textarea value={codeDraft || backendManimCode} onChange={(event) => setCodeDraft(event.target.value)} disabled={!selectedJob} spellCheck={false} className="movies-code-block movies-input movies-code-panel mt-3 min-h-[360px] w-full resize-y rounded-2xl border px-5 py-5 outline-none transition focus:border-app-iris/50 focus:ring-2 focus:ring-app-iris/10 disabled:opacity-70" />
              </div>
            </div>
          ) : (
            <div className="mt-5">
              {selectedPage ? (
                <div className="overflow-hidden rounded-[24px] border border-app-gray-100 bg-app-gray-50 p-4">
                  <PageEditor
                    bookId={selectedBookId}
                    chapterId={selectedChapterId}
                    page={selectedPage}
                    pageIndex={0}
                    totalPages={1}
                    pages={[selectedPage]}
                    chapterTitle={selectedPage?.chapter?.title || ''}
                    layoutMode="standard"
                    standardPageHeightPx={720}
                    readOnly
                    canUploadMedia={false}
                    canCreateVideo={false}
                  />
                </div>
              ) : (
                <div className="movies-empty-panel rounded-[24px] border border-dashed border-app-gray-200 bg-app-gray-50 px-6 py-16 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-app-iris/10 text-app-iris">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-app-gray-900">No page selected</p>
                  <p className="mt-2 text-xs text-app-gray-600">
                    Choose a page from the strip below to preview it here.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="movies-card-soft rounded-2xl border border-app-gray-100 bg-app-gray-50 p-4">
            <div className="flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-app-iris" />
              <h3 className="text-sm font-semibold text-app-gray-900">Storyboard</h3>
            </div>
            <div className="mt-4 space-y-3">
              {storyboardScenes.length > 0 ? storyboardScenes.map((scene, index) => (
                <div key={scene.sceneId || index} className="movies-card-soft rounded-2xl border border-app-gray-100 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-app-gray-900">{scene.sceneId || `Scene ${index + 1}`}</p>
                    <span className="text-[11px] font-medium text-app-gray-500">{scene.estimatedSeconds || 0}s</span>
                  </div>
                  <p className="mt-2 text-sm text-app-gray-700">{scene.purpose || scene.visualGoal || 'Scene plan'}</p>
                </div>
              )) : <p className="text-sm text-app-gray-600">The storyboard for this page clip has not been generated yet.</p>}
            </div>
          </div>

          <div className="movies-card-soft rounded-2xl border border-app-gray-100 bg-app-gray-50 p-4">
            <div className="flex items-center gap-2">
              <PencilLine className="h-4 w-4 text-app-iris" />
              <h3 className="text-sm font-semibold text-app-gray-900">Review notes</h3>
            </div>
            <div className="mt-4 space-y-2">
              {reviewNotes.length > 0 ? reviewNotes.slice(0, 4).map((note, index) => (
                <div key={`${note.location || 'note'}-${index}`} className="rounded-2xl border border-app-gray-100 bg-white px-3 py-3">
                  <p className="text-sm text-app-gray-700">{note.issue || note.suggestedFix || 'No review issue captured.'}</p>
                </div>
              )) : <p className="text-sm text-app-gray-600">Render-safety review notes will appear after code generation.</p>}
            </div>
          </div>
        </section>

        <section className="movies-card rounded-2xl border border-app-gray-100 bg-white p-4 shadow-appSoft" data-testid="movies-page-strip">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-app-iris" />
              <h2 className="text-sm font-semibold text-app-gray-900">Book pages</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => scrollPageStrip(-1)} aria-label="Scroll pages left" data-testid="movies-pages-left">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => scrollPageStrip(1)} aria-label="Scroll pages right" data-testid="movies-pages-right">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {structureError ? <div className="movies-feedback-error mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{structureError}</div> : null}
          <div ref={pageStripRef} className="mt-4 flex gap-3 overflow-x-auto pb-2">
            {bookStructure.flatMap((chapter) => chapter.pages.map((page, pageIndex) => {
              const pageJob = jobByPageId.get(page.id);
              const active = page.id === selectedPageId;
              return (
                <button
                  key={`${chapter.id}-${page.id}`}
                  type="button"
                  onClick={() => handleSelectPage(chapter.id, page.id)}
                  className={[
                    'movies-selectable-card min-w-[220px] rounded-2xl border px-4 py-3 text-left transition-all',
                    active ? 'movies-selectable-card-active border-app-iris bg-app-iris/5' : 'border-app-gray-100 bg-white hover:border-app-iris/20 hover:bg-app-gray-50',
                  ].join(' ')}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-app-gray-600">{chapter.title}</p>
                  <p className="mt-2 truncate text-sm font-semibold text-app-gray-900">{page.title || `Page ${pageIndex + 1}`}</p>
                  <p className="mt-1 text-xs text-app-gray-600">{pageJob ? 'Clip draft available' : 'No clip yet'}</p>
                  {pageJob ? <span className={`mt-3 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClasses(pageJob.status)}`}>{pageJob.status}</span> : null}
                </button>
              );
            }))}
            {bookStructure.length === 0 && !loadingStructure ? (
              <div className="movies-empty-panel min-w-full rounded-2xl border border-dashed border-app-gray-200 bg-app-gray-50 px-4 py-8 text-center text-sm text-app-gray-600">
                No saved pages were found for this book.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Movies;
