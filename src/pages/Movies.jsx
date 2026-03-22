import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import AppLoader from '@/components/app/AppLoader';
import {
  Clapperboard,
  Film,
  Library,
  Loader2,
  PlayCircle,
  RefreshCcw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import {
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

const statusClasses = (status) => `${STATUS_STYLES[status] || 'bg-app-gray-100 text-app-gray-700 border-app-gray-200'} movies-status-pill`;

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
  if (existingIndex === -1) {
    return [nextJob, ...jobs];
  }

  const nextJobs = [...jobs];
  nextJobs[existingIndex] = nextJob;
  return nextJobs;
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
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(requestedJobId);
  const [selectedJob, setSelectedJob] = useState(null);
  const [revisionInstruction, setRevisionInstruction] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const streamAbortRef = useRef(null);

  useEffect(() => {
    if (!books.length) return;
    if (selectedBookId && books.some((book) => book.bookId === selectedBookId)) return;
    setSelectedBookId(requestedBookId && books.some((book) => book.bookId === requestedBookId)
      ? requestedBookId
      : books[0].bookId);
  }, [books, requestedBookId, selectedBookId]);

  useEffect(() => () => {
    streamAbortRef.current?.abort();
  }, []);

  const syncSearchParams = useCallback((next = {}) => {
    const updated = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (value == null || value === '') {
        updated.delete(key);
      } else {
        updated.set(key, value);
      }
    });
    if (updated.toString() !== searchParams.toString()) {
      setSearchParams(updated, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleJobUpdate = useCallback((job) => {
    if (!job?.jobId) return;
    setJobs((prev) => mergeJob(prev, job));
    if (job.jobId === selectedJobId) {
      setSelectedJob(job);
    }
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
          if (payload?.job) {
            handleJobUpdate(payload.job);
          }
        },
      });
    } catch (streamError) {
      if (streamError?.name !== 'AbortError') {
        toast({
          title: 'Video updates paused',
          description: normalizeVideoErrorMessage(
            streamError.message,
            'Could not keep the page clip stream open.'
          ),
          variant: 'destructive',
        });
      }
    } finally {
      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null;
      }
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
    } catch (loadError) {
      setJobs([]);
      setSelectedJob(null);
      setError(normalizeVideoErrorMessage(loadError.message, 'Could not load page clip jobs for this book.'));
    } finally {
      setLoadingJobs(false);
    }
  }, [requestedJobId, requestedPageId]);

  useEffect(() => {
    if (!selectedBookId) return;
    loadJobs(selectedBookId);
  }, [selectedBookId, loadJobs]);

  useEffect(() => {
    if (!selectedJobId) {
      setSelectedJob(null);
      return;
    }
    const matchingJob = jobs.find((job) => job.jobId === selectedJobId) || null;
    setSelectedJob(matchingJob);
  }, [jobs, selectedJobId]);

  useEffect(() => {
    syncSearchParams({
      bookId: selectedBookId || '',
      chapterId: selectedJob?.chapterId || '',
      pageId: selectedJob?.pageId || '',
      jobId: selectedJobId || '',
    });
  }, [
    selectedBookId,
    selectedJob?.chapterId,
    selectedJob?.pageId,
    selectedJobId,
    syncSearchParams,
  ]);

  useEffect(() => {
    if (selectedJob?.status === 'RENDERING' && selectedBookId && selectedJobId) {
      startStream(selectedBookId, selectedJobId);
      return;
    }
    streamAbortRef.current?.abort();
  }, [selectedBookId, selectedJob?.status, selectedJobId, startStream]);

  const handleSelectBook = (bookId) => {
    setSelectedBookId(bookId);
    setSelectedJobId('');
    setSelectedJob(null);
    setRevisionInstruction('');
  };

  const handleSelectJob = (job) => {
    setSelectedJobId(job?.jobId || '');
    setSelectedJob(job || null);
    setRevisionInstruction('');
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
        description: normalizeVideoErrorMessage(
          reviseError.message,
          'Could not revise this page clip.'
        ),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRender = async () => {
    if (!selectedBookId || !selectedJobId) return;

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
        description: normalizeVideoErrorMessage(
          renderError.message,
          'Could not start rendering this page clip.'
        ),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (appLoading) {
    return <AppLoader />;
  }

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
            Create your first book, add page content, and then generate a page clip from the book workspace.
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

  const selectedBook = books.find((book) => book.bookId === selectedBookId) || null;
  const storyboardScenes = selectedJob?.storyboard?.scenes || [];
  const reviewNotes = selectedJob?.reviewNotes || [];
  const latestWarning = selectedJob?.warnings?.[0] || '';

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight text-app-gray-900">Movies</h1>
            <p className="mt-1 text-sm leading-relaxed text-app-gray-600">
              Review page clip drafts, apply visual revisions, and render final Manim videos page by page.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => loadJobs(selectedBookId)} disabled={loadingJobs}>
              {loadingJobs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Refresh jobs
            </Button>
            <Button variant="outline" onClick={() => navigate(`/book/${selectedBookId}`)} disabled={!selectedBookId}>
              Back to book
            </Button>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[260px_320px_minmax(0,1fr)]">
          <section className="space-y-4">
            <div className="movies-card rounded-2xl border border-app-gray-100 bg-white p-4 shadow-appSoft">
              <div className="flex items-center gap-2">
                <Library className="h-4 w-4 text-app-iris" />
                <h2 className="text-sm font-semibold text-app-gray-900">Your books</h2>
              </div>
              <div className="mt-4 space-y-2">
                {books.map((book) => {
                  const active = book.bookId === selectedBookId;
                  return (
                    <button
                      key={book.bookId}
                      type="button"
                      data-testid={`movies-book-card-${book.bookId}`}
                      onClick={() => handleSelectBook(book.bookId)}
                      className={[
                        'w-full rounded-2xl border px-4 py-3 text-left transition-all movies-selectable-card',
                        active
                          ? 'movies-selectable-card-active border-app-iris bg-app-iris/5 shadow-sm'
                          : 'border-app-gray-100 bg-white hover:border-app-iris/30 hover:bg-app-gray-50',
                      ].join(' ')}
                    >
                      <p className="truncate text-sm font-semibold text-app-gray-900">{book.title}</p>
                      <p className="mt-1 text-xs text-app-gray-600">
                        {book.bookId === requestedBookId && requestedPageId ? `Focused on page ${requestedPageId}` : 'Book video workspace'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="movies-card rounded-2xl border border-app-gray-100 bg-white p-4 shadow-appSoft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-app-gray-900">Page clip jobs</h2>
                  <p className="mt-1 text-xs text-app-gray-600">
                    {selectedBook ? `Recent clips for ${selectedBook.title}` : 'Select a book'}
                  </p>
                </div>
                {streaming && (
                  <span className="movies-status-pill inline-flex items-center gap-2 rounded-full border border-app-iris/20 bg-app-iris/5 px-3 py-1 text-[11px] font-medium text-app-iris">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Live
                  </span>
                )}
              </div>

              {error ? (
                <div className="movies-feedback-error mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : loadingJobs ? (
                <div className="mt-6 flex items-center justify-center py-10 text-sm text-app-gray-600">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading page clips...
                </div>
              ) : jobs.length === 0 ? (
                <div className="movies-empty-panel mt-4 rounded-2xl border border-dashed border-app-gray-200 bg-app-gray-50 px-4 py-8 text-center text-sm text-app-gray-600">
                  Use the page-level <span className="font-semibold text-app-gray-900">Create video</span> action inside a book to start the first clip.
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {jobs.map((job) => (
                    <button
                      key={job.jobId}
                      type="button"
                      data-testid={`movies-job-row-${job.jobId}`}
                      onClick={() => handleSelectJob(job)}
                      className={[
                        'w-full rounded-2xl border px-4 py-3 text-left transition-all movies-selectable-card',
                        job.jobId === selectedJobId
                          ? 'movies-selectable-card-active border-app-iris bg-app-iris/5'
                          : 'border-app-gray-100 bg-white hover:border-app-iris/20 hover:bg-app-gray-50',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-app-gray-900">
                            {job.pageSnapshot?.pageTitle || 'Untitled page clip'}
                          </p>
                          <p className="mt-1 truncate text-xs text-app-gray-600">
                            {job.summary || `Chapter ${job.chapterId} · Page ${job.pageId}`}
                          </p>
                        </div>
                        <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClasses(job.status)}`}>
                          {job.status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="movies-card rounded-2xl border border-app-gray-100 bg-white p-5 shadow-appSoft" data-testid="movies-preview-panel">
              {selectedJob ? (
                <div className="space-y-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClasses(selectedJob.status)}`}>
                          {selectedJob.status}
                        </span>
                        {selectedJob.renderReady && (
                          <span className="movies-status-pill inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                            Render-ready
                          </span>
                        )}
                      </div>
                      <h2 className="mt-3 text-2xl font-semibold text-app-gray-900">
                        {selectedJob.pageSnapshot?.pageTitle || 'Page clip'}
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-app-gray-600">
                        {selectedJob.summary || 'This page clip is ready for review.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="appPrimary"
                        onClick={handleRender}
                        disabled={submitting || selectedJob.status === 'RENDERING'}
                        data-testid="movies-render-button"
                      >
                        {submitting && selectedJob.status !== 'RENDERING'
                          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          : <PlayCircle className="mr-2 h-4 w-4" />}
                        Render clip
                      </Button>
                    </div>
                  </div>

                  {selectedJob.previewUrl ? (
                    <div className="movies-code-panel overflow-hidden rounded-[24px] border border-app-gray-100 bg-app-gray-950 p-3 shadow-inner">
                      <video
                        key={selectedJob.previewUrl}
                        src={selectedJob.previewUrl}
                        controls
                        className="aspect-video w-full rounded-[18px] bg-black"
                      />
                    </div>
                  ) : (
                    <div className="movies-empty-panel rounded-[24px] border border-dashed border-app-gray-200 bg-app-gray-50 px-6 py-10 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-app-iris/10 text-app-iris">
                        <Film className="h-6 w-6" />
                      </div>
                      <p className="mt-4 text-sm font-medium text-app-gray-900">
                        {selectedJob.status === 'RENDERING' ? 'Rendering is in progress' : 'No preview yet'}
                      </p>
                      <p className="mt-2 text-xs text-app-gray-600">
                        {selectedJob.status === 'RENDERING'
                          ? 'This panel will update as soon as the Manim render finishes.'
                          : 'Render the clip when you are satisfied with the current storyboard and review notes.'}
                      </p>
                    </div>
                  )}

                  {selectedJob.latestError && (
                    <div className="movies-feedback-error rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {selectedJob.latestError}
                    </div>
                  )}

                  {latestWarning && (
                    <div className="movies-feedback-warning rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      {latestWarning}
                    </div>
                  )}

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="movies-card-soft rounded-2xl border border-app-gray-100 bg-app-gray-50 p-4">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-app-iris" />
                        <h3 className="text-sm font-semibold text-app-gray-900">Storyboard</h3>
                      </div>
                      <div className="mt-4 space-y-3">
                        {storyboardScenes.length > 0 ? storyboardScenes.map((scene) => (
                          <div key={scene.sceneId} className="movies-card-soft rounded-2xl border border-app-gray-100 bg-white p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-app-gray-900">{scene.sceneId}</p>
                              <span className="text-[11px] font-medium text-app-gray-500">{scene.estimatedSeconds || 0}s</span>
                            </div>
                            <p className="mt-2 text-sm text-app-gray-700">{scene.purpose || scene.visualGoal}</p>
                            {scene.onScreenText && (
                              <p className="mt-2 text-xs leading-relaxed text-app-gray-600">{scene.onScreenText}</p>
                            )}
                          </div>
                        )) : (
                          <p className="text-sm text-app-gray-600">The storyboard for this page clip has not been generated yet.</p>
                        )}
                      </div>
                    </div>

                    <div className="movies-card-soft rounded-2xl border border-app-gray-100 bg-app-gray-50 p-4">
                      <div className="flex items-center gap-2">
                        <Wand2 className="h-4 w-4 text-app-iris" />
                        <h3 className="text-sm font-semibold text-app-gray-900">Revise this clip</h3>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-app-gray-600">
                        Ask for scene edits, pacing changes, simpler layouts, stronger emphasis, or a different visual tone.
                      </p>
                      <textarea
                        value={revisionInstruction}
                        onChange={(event) => setRevisionInstruction(event.target.value)}
                        placeholder="Example: Make scene 2 slower, use less on-screen text, and keep the layout centered."
                        className="movies-input mt-4 min-h-[140px] w-full rounded-2xl border border-app-gray-200 bg-white px-4 py-3 text-sm text-app-gray-900 shadow-sm outline-none transition focus:border-app-iris/50 focus:ring-2 focus:ring-app-iris/10"
                      />
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <p className="text-[11px] text-app-gray-500">
                          Revisions are applied against the current storyboard, not just the raw page text.
                        </p>
                        <Button
                          variant="outline"
                          onClick={handleRevise}
                          disabled={submitting || !revisionInstruction.trim()}
                          data-testid="movies-revision-submit"
                        >
                          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Apply revision
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="movies-card rounded-2xl border border-app-gray-100 bg-white p-4">
                      <h3 className="text-sm font-semibold text-app-gray-900">Review notes</h3>
                      <div className="mt-3 space-y-3">
                        {reviewNotes.length > 0 ? reviewNotes.map((note, index) => (
                          <div key={`${note.location || 'note'}-${index}`} className="movies-card-soft rounded-2xl border border-app-gray-100 bg-app-gray-50 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="movies-card-soft rounded-full bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-app-gray-600">
                                {note.severity || 'info'}
                              </span>
                              {note.location && (
                                <span className="text-[11px] text-app-gray-500">{note.location}</span>
                              )}
                            </div>
                            <p className="mt-2 text-sm text-app-gray-700">{note.issue || note.suggestedFix || 'No review issue captured.'}</p>
                            {note.suggestedFix && (
                              <p className="mt-2 text-xs leading-relaxed text-app-gray-600">{note.suggestedFix}</p>
                            )}
                          </div>
                        )) : (
                          <p className="text-sm text-app-gray-600">No review notes were captured for this revision.</p>
                        )}
                      </div>
                    </div>

                    <div className="movies-card rounded-2xl border border-app-gray-100 bg-white p-4">
                      <h3 className="text-sm font-semibold text-app-gray-900">Generated Manim code</h3>
                      <div className="movies-code-panel mt-3 overflow-hidden rounded-2xl border border-app-gray-100 bg-app-gray-950">
                        <pre className="max-h-[320px] overflow-auto px-4 py-4 text-xs leading-relaxed text-app-gray-100">
                          <code>{selectedJob.manimCode || '# No Manim code is available yet.'}</code>
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="movies-empty-panel rounded-[28px] border border-dashed border-app-gray-200 bg-app-gray-50 px-8 py-12 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-app-iris/10 text-app-iris">
                    <Clapperboard className="h-7 w-7" />
                  </div>
                  <h2 className="mt-4 text-xl font-semibold text-app-gray-900">Select a page clip</h2>
                  <p className="mt-2 text-sm leading-relaxed text-app-gray-600">
                    Pick a book, then open a page clip job to review the storyboard, revise it, and render the final video.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Movies;
