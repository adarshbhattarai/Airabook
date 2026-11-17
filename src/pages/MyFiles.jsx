import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, FileText, FolderOpen, Loader2, RefreshCw, Search, Trash2 } from 'lucide-react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import ReactMarkdown from 'react-markdown';
import FileRowActions from '@/components/files/FileRowActions';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import FileUploadControl from '@/components/files/FileUploadControl';
import { useToast } from '@/components/ui/use-toast';
import { deleteAccountFile, executeAccountFile, formatFileSize, getAccountFileContent, listAccountFilesPage, vectorizeAccountFile } from '@/services/accountFilesService';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'conversation', label: 'Conversations' },
  { id: 'page', label: 'Books/pages' },
];
const PAGE_SIZES = [10, 25, 50, 100];

const formatDate = (value) => {
  if (!value) return 'Recently uploaded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently uploaded' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

const getFileLocation = (file) => {
  const locations = new Set();
  const referenceTypes = (file.references || []).map((reference) => String(reference.type || reference.referenceType || reference.scope || '').toLowerCase());
  if (file.scope === 'conversation' || file.conversationId || referenceTypes.includes('conversation')) locations.add('Conversation');
  if (file.scope === 'page' || file.scope === 'book' || file.bookId || file.pageId || referenceTypes.some((type) => type === 'page' || type === 'book')) locations.add('Book/page');
  if (locations.size === 0) locations.add('My files');
  return [...locations].join(' · ');
};

const vectorStatus = (file) => String(file.vectorization?.status || 'NOT_STARTED').toUpperCase();
const vectorEnabled = (file) => file.vectorization?.enabled === true || !['NOT_STARTED', 'OFF'].includes(vectorStatus(file));
const ACTIVE_VECTOR_STATUSES = ['QUEUED', 'PENDING', 'EXTRACTING', 'INDEXING', 'PROCESSING'];
const getProcessingStatus = (file) => {
  const status = vectorStatus(file);
  if (status === 'READY' || status === 'COMPLETED') return 'Ready for AI search';
  if (ACTIVE_VECTOR_STATUSES.includes(status)) return 'Preparing for AI search';
  if (status === 'FAILED') return 'AI reading failed · retry available';
  if (file.documentType === 'DOCX' || file.mimeType.includes('wordprocessingml')) return 'Stored · processing unavailable';
  return 'Stored · not processed';
};

const MARKDOWN_COMPONENTS = {
  h1: ({ children }) => <h1 className="mb-4 mt-7 text-2xl font-semibold text-foreground">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-3 mt-6 text-xl font-semibold text-foreground">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-5 text-lg font-semibold text-foreground">{children}</h3>,
  p: ({ children }) => <p className="mb-4 whitespace-pre-wrap leading-7 text-foreground">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 list-disc space-y-1 pl-6 text-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1 pl-6 text-foreground">{children}</ol>,
  li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
  blockquote: ({ children }) => <blockquote className="mb-4 border-l-4 border-app-iris/50 pl-4 text-muted-foreground">{children}</blockquote>,
  pre: ({ children }) => <pre className="mb-4 overflow-x-auto rounded-lg bg-muted p-4 text-sm text-foreground">{children}</pre>,
  code: ({ children, className }) => <code className={`${className || ''} rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground`}>{children}</code>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-app-iris underline underline-offset-2">{children}</a>,
  hr: () => <hr className="my-6 border-app-gray-200" />,
  img: ({ alt }) => <span className="text-sm italic text-muted-foreground">[Image preview unavailable{alt ? `: ${alt}` : ''}]</span>,
};

const SortableHeader = ({ label, sortKey, sortBy, direction, onSort, className = '' }) => {
  const active = sortBy === sortKey;
  const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  const ariaSort = active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none';
  return <TableHead aria-sort={ariaSort} className={className}>
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={active ? `Sort by ${label}, ${direction === 'asc' ? 'ascending' : 'descending'}` : `Sort by ${label}`}
      className="inline-flex items-center gap-1.5 rounded-sm text-left hover:text-app-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-iris"
    >
      {label}<Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </button>
  </TableHead>;
};

const MyFiles = () => {
  const { user, appUser } = useAuth();
  const workspace = useWorkspace();
  const accountId = workspace?.account?.id || workspace?.personalAccount?.id || '';
  const { toast } = useToast();
  const [files, setFiles] = useState([]);
  const [filter, setFilter] = useState('all');
  const [documentType, setDocumentType] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [minSizeMb, setMinSizeMb] = useState('');
  const [maxSizeMb, setMaxSizeMb] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState('createdAt');
  const [direction, setDirection] = useState('desc');
  const [pageInfo, setPageInfo] = useState({ page: 0, size: 25, totalItems: 0, totalPages: 0, hasNext: false, hasPrevious: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [executeFile, setExecuteFile] = useState(null);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [destinationType, setDestinationType] = useState('NEW_BOOK');
  const [newBookTitle, setNewBookTitle] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [translateToEnglish, setTranslateToEnglish] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [chapters, setChapters] = useState([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [chaptersError, setChaptersError] = useState('');
  const [chapterAttempt, setChapterAttempt] = useState(0);
  const [vectorizingIds, setVectorizingIds] = useState([]);
  const [vectorErrors, setVectorErrors] = useState({});
  const vectorRequests = useRef(new Map());
  useEffect(() => {
    setExecuteFile(null);
    setVectorizingIds([]);
    setVectorErrors({});
    return () => {
      vectorRequests.current.forEach((controller) => controller.abort());
      vectorRequests.current.clear();
    };
  }, [accountId]);
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState('');
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const requestId = useRef(0);

  const accessibleBooks = useMemo(() => {
    const seen = new Set();
    return (appUser?.accessibleBookIds || []).map((item) => {
      if (typeof item === 'string') return { bookId: item, title: 'Untitled book' };
      return {
        ...item,
        bookId: String(item?.bookId || item?.id || ''),
        title: String(item?.title || item?.babyName || 'Untitled book'),
      };
    }).filter((book) => {
      if (!book.bookId || seen.has(book.bookId)) return false;
      if (book.accountId && String(book.accountId) !== String(accountId)) return false;
      seen.add(book.bookId);
      return true;
    }).sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }));
  }, [appUser?.accessibleBookIds, accountId]);

  useEffect(() => {
    let cancelled = false;
    setSelectedChapterId('');
    setChapters([]);
    setChaptersError('');
    if (!executeFile || destinationType !== 'EXISTING_BOOK' || !selectedBookId) {
      setChaptersLoading(false);
      return undefined;
    }
    setChaptersLoading(true);
    getDocs(query(collection(firestore, 'books', selectedBookId, 'chapters'), orderBy('order')))
      .then((snapshot) => {
        if (!cancelled) setChapters(snapshot.docs.map((item) => ({ id: item.id, title: item.data().title || 'Untitled chapter' })));
      })
      .catch(() => { if (!cancelled) setChaptersError('Could not load chapters. Try again.'); })
      .finally(() => { if (!cancelled) setChaptersLoading(false); });
    return () => { cancelled = true; };
  }, [executeFile?.id, selectedBookId, destinationType, chapterAttempt]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextSearch = searchInput.trim();
      if (nextSearch !== search) {
        setSearch(nextSearch);
        setPage(0);
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput, search]);

  useEffect(() => {
    if (!previewFile) return undefined;
    const controller = new AbortController();
    let objectUrl = '';
    setPreviewUrl('');
    setPreviewText('');
    setPreviewError('');
    setPreviewLoading(true);
    getAccountFileContent({ accountId, fileId: previewFile.id, signal: controller.signal })
      .then(async (blob) => {
        if (previewFile.documentType === 'PDF') {
          if (blob.type && !blob.type.toLowerCase().includes('application/pdf')) {
            throw new Error('The server returned a file type that does not match this PDF.');
          }
          objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          setPreviewUrl(objectUrl);
        } else {
          const text = await blob.text();
          if (controller.signal.aborted) return;
          setPreviewText(text);
        }
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setPreviewError(err?.message || 'Could not open this document.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accountId, previewFile?.id, previewFile?.documentType, previewAttempt]);

  const minSizeBytes = minSizeMb === '' ? undefined : Math.round(Number(minSizeMb) * 1024 * 1024);
  const maxSizeBytes = maxSizeMb === '' ? undefined : Math.round(Number(maxSizeMb) * 1024 * 1024);
  const invalidSizeRange = (minSizeMb !== '' && (!Number.isFinite(Number(minSizeMb)) || Number(minSizeMb) < 0))
    || (maxSizeMb !== '' && (!Number.isFinite(Number(maxSizeMb)) || Number(maxSizeMb) < 0))
    || (minSizeMb !== '' && maxSizeMb !== '' && Number(minSizeMb) > Number(maxSizeMb));

  const load = useCallback(async (requestedPage = page) => {
    const currentRequestId = ++requestId.current;
    if (!accountId) {
      setFiles([]);
      setPageInfo({ page: 0, size: pageSize, totalItems: 0, totalPages: 0, hasNext: false, hasPrevious: false });
      setLoading(false);
      return;
    }
    if (invalidSizeRange) {
      setFiles([]);
      setPageInfo({ page: 0, size: pageSize, totalItems: 0, totalPages: 0, hasNext: false, hasPrevious: false });
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await listAccountFilesPage({
        accountId,
        page: requestedPage,
        size: pageSize,
        sortBy,
        direction,
        documentType: documentType || undefined,
        location: filter,
        minSizeBytes,
        maxSizeBytes,
        q: search || undefined,
      });
      if (currentRequestId !== requestId.current) return;
      if (result.totalItems > 0 && requestedPage >= result.totalPages) {
        setPage(Math.max(0, result.totalPages - 1));
        return;
      }
      setFiles(result.items);
      setPageInfo(result);
    } catch (err) {
      if (currentRequestId !== requestId.current) return;
      setError(err?.message || 'Could not load your files.');
    } finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }, [accountId, page, pageSize, sortBy, direction, documentType, filter, minSizeBytes, maxSizeBytes, search, invalidSizeRange]);

  useEffect(() => { void load(); }, [load]);

  const changeFilter = (nextFilter) => {
    setFilter(nextFilter);
    setPage(0);
  };

  const changeSort = (nextSortBy) => {
    setPage(0);
    if (sortBy === nextSortBy) {
      setDirection((current) => current === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(nextSortBy);
      setDirection(nextSortBy === 'createdAt' ? 'desc' : 'asc');
    }
  };

  const startExecute = (file) => {
    setExecuteFile(file);
    setDestinationType('NEW_BOOK');
    setSourceLanguage('en');
    setTranslateToEnglish(false);
    setNewBookTitle(file.name.replace(/\.[^.]+$/, '').trim());
    setSelectedBookId(accessibleBooks[0]?.bookId || '');
    setExecuteError('');
  };

  const startVectorize = async (file) => {
    if (vectorRequests.current.has(file.id)) return;
    const controller = new AbortController();
    vectorRequests.current.set(file.id, controller);
    setVectorizingIds((ids) => [...ids, file.id]);
    setVectorErrors((errors) => ({ ...errors, [file.id]: '' }));
    try {
      const result = await vectorizeAccountFile({ accountId, fileId: file.id, signal: controller.signal });
      if (controller.signal.aborted) return;
      const data = result?.data || result;
      const vectorization = { ...(data?.vectorization || { status: data?.status || 'QUEUED' }), enabled: true };
      setFiles((items) => items.map((item) => item.id === file.id ? { ...item, vectorization } : item));
      toast({ title: 'AI reading requested', description: 'Check the processing status with Refresh. Book content is created separately.' });
    } catch (err) {
      if (controller.signal.aborted) return;
      setVectorErrors((errors) => ({ ...errors, [file.id]: [404, 405, 501].includes(err?.status)
        ? 'AI reading is not available on the backend yet.' : err?.message || 'Could not enable AI reading. Try again.' }));
    } finally {
      if (!controller.signal.aborted) {
        vectorRequests.current.delete(file.id);
        setVectorizingIds((ids) => ids.filter((id) => id !== file.id));
      }
    }
  };

  const closePreview = () => {
    setPreviewFile(null);
    setPreviewText('');
    setPreviewError('');
  };

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccountFile({ accountId, fileId: fileToDelete.id });
      if (previewFile?.id === fileToDelete.id) closePreview();
      toast({
        title: 'File deleted',
        description: `“${fileToDelete.name}” was permanently deleted from My files and its linked locations.`,
      });
      setFileToDelete(null);
      if (files.length === 1 && page > 0) setPage((current) => Math.max(0, current - 1));
      else await load();
    } catch (err) {
      if (err?.status === 503 && /pending cleanup/i.test(err?.message || '')) {
        if (previewFile?.id === fileToDelete.id) closePreview();
        setFileToDelete(null);
        toast({
          title: 'File removed from My files',
          description: 'Storage cleanup is still finishing. The file is hidden while the backend retries cleanup.',
        });
        await load();
      } else {
        setDeleteError(err?.message || 'Could not delete this file.');
      }
    } finally {
      setDeleting(false);
    }
  };

  const submitExecute = async (event) => {
    event.preventDefault();
    if (!executeFile) return;
    const destination = destinationType === 'NEW_BOOK'
      ? { type: 'NEW_BOOK', title: newBookTitle.trim() }
      : { type: 'EXISTING_BOOK', bookId: selectedBookId, placement: selectedChapterId ? 'EXISTING_CHAPTER' : 'NEW_CHAPTER', ...(selectedChapterId ? { chapterId: selectedChapterId } : {}) };
    if (destinationType === 'NEW_BOOK' && !destination.title) {
      setExecuteError('Enter a title for the new book.');
      return;
    }
    if (destinationType !== 'NEW_BOOK' && !accessibleBooks.some((book) => book.bookId === destination.bookId)) {
      setExecuteError('Choose a book to add this document to.');
      return;
    }

    if (destinationType === 'EXISTING_BOOK' && chaptersLoading) return;
    if (destinationType === 'EXISTING_BOOK' && selectedChapterId && !chapters.some((chapter) => chapter.id === selectedChapterId)) {
      setExecuteError('Choose a chapter from the selected book.');
      return;
    }
    setExecuting(true);
    setExecuteError('');
    try {
      const result = await executeAccountFile({ accountId, fileId: executeFile.id, documentType: executeFile.documentType, destination, translation: { enabled: translateToEnglish, sourceLanguage, targetLanguage: translateToEnglish ? 'en' : null } });
      const execution = result?.execution || result?.data?.execution || result?.data || result;
      const executionId = execution?.executionId || execution?.id;
      toast({
        title: 'Document processing started',
        description: executionId ? `The job was queued (${executionId}).` : 'The document was queued for book processing.',
      });
      setExecuteFile(null);
    } catch (err) {
      setExecuteError([404, 405, 501].includes(err?.status) ? 'Book creation is not available on the backend yet.' : err?.message || 'Could not start document processing.');
    } finally {
      setExecuting(false);
    }
  };

  const hasActiveFilters = filter !== 'all' || !!documentType || !!search || minSizeMb !== '' || maxSizeMb !== '';
  const totalItems = pageInfo.totalItems || 0;
  const firstItem = totalItems === 0 ? 0 : pageInfo.page * pageInfo.size + 1;
  const lastItem = Math.min((pageInfo.page + 1) * pageInfo.size, totalItems);

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold text-app-gray-900">My files</h1><p className="mt-1 text-sm text-app-gray-600">Files you upload stay here so you can attach them to conversations and pages.</p></div>
      <FileUploadControl accountId={accountId} scope="library" label="Upload files" onChange={(uploads) => { if (uploads.some((file) => file.id)) { setPage(0); void load(0); } }} />
    </div>

    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter files">
        {FILTERS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => changeFilter(item.id)} className={`rounded-full px-3 py-1.5 text-sm ${filter === item.id ? 'bg-app-iris text-white' : 'bg-app-gray-100 text-app-gray-600 hover:bg-app-gray-200'}`}>{item.label}</button>)}
      </div>
      <Button type="button" variant="appOutline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
    </div>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_160px_135px_135px]">
      <label className="block text-xs font-medium text-app-gray-600">
        Search files
        <span className="relative mt-1 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-gray-400" aria-hidden="true" />
          <input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search by filename" className="h-10 w-full rounded-lg border border-app-gray-200 bg-white pl-9 pr-3 text-sm text-app-gray-800 placeholder:text-app-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-iris" />
        </span>
      </label>
      <label className="block text-xs font-medium text-app-gray-600">
        File type
        <select value={documentType} onChange={(event) => { setDocumentType(event.target.value); setPage(0); }} className="mt-1 h-10 w-full rounded-lg border border-app-gray-200 bg-white px-3 text-sm text-app-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-iris">
          <option value="">All types</option>
          <option value="PDF">PDF</option>
          <option value="MARKDOWN">Markdown</option>
          <option value="DOCX">Word (.docx)</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-app-gray-600">
        Min size (MB)
        <input type="number" min="0" step="0.1" value={minSizeMb} onChange={(event) => { setMinSizeMb(event.target.value); setPage(0); }} placeholder="Any" className="mt-1 h-10 w-full rounded-lg border border-app-gray-200 bg-white px-3 text-sm text-app-gray-800 placeholder:text-app-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-iris" />
      </label>
      <label className="block text-xs font-medium text-app-gray-600">
        Max size (MB)
        <input type="number" min="0" step="0.1" value={maxSizeMb} onChange={(event) => { setMaxSizeMb(event.target.value); setPage(0); }} placeholder="Any" className="mt-1 h-10 w-full rounded-lg border border-app-gray-200 bg-white px-3 text-sm text-app-gray-800 placeholder:text-app-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-iris" />
      </label>
    </div>
    {invalidSizeRange && <p role="alert" className="-mt-3 mb-4 text-sm text-red-600">Enter a valid size range. The minimum cannot be greater than the maximum.</p>}

    {loading ? <div role="status" className="flex items-center justify-center rounded-2xl border border-app-gray-200 bg-white p-12 text-sm text-app-gray-600"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading files…</div>
      : error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}<Button type="button" size="sm" variant="appOutline" className="ml-3" onClick={() => void load()}>Try again</Button></div>
        : totalItems === 0 ? <div className="rounded-2xl border border-dashed border-app-gray-300 bg-app-gray-50 p-12 text-center"><FolderOpen className="mx-auto h-10 w-10 text-app-gray-400" /><h2 className="mt-3 font-semibold text-app-gray-800">{hasActiveFilters ? 'No files match these filters' : 'No files yet'}</h2><p className="mt-1 text-sm text-app-gray-600">{hasActiveFilters ? 'Try changing or clearing a filter.' : 'Upload a PDF, Markdown file, or Word document to get started.'}</p></div>
          : <div className="overflow-hidden rounded-2xl border border-app-gray-200 bg-white shadow-appSoft">
            <Table className="min-w-[1180px] table-fixed text-left">
              <caption className="sr-only">Uploaded files and their metadata</caption>
              <colgroup>
                <col className="w-[260px]" /><col className="w-[100px]" /><col className="w-[100px]" />
                <col className="w-[145px]" /><col className="w-[140px]" /><col className="w-[210px]" /><col className="w-[220px]" />
              </colgroup>
              <TableHeader className="bg-app-gray-50">
                <TableRow className="border-app-gray-200 hover:bg-transparent">
                  <SortableHeader label="File" sortKey="name" sortBy={sortBy} direction={direction} onSort={changeSort} className="px-5 text-xs font-semibold uppercase tracking-wide text-app-gray-500" />
                  <SortableHeader label="Type" sortKey="documentType" sortBy={sortBy} direction={direction} onSort={changeSort} className="text-xs font-semibold uppercase tracking-wide text-app-gray-500" />
                  <SortableHeader label="Size" sortKey="sizeBytes" sortBy={sortBy} direction={direction} onSort={changeSort} className="text-xs font-semibold uppercase tracking-wide text-app-gray-500" />
                  <SortableHeader label="Uploaded" sortKey="createdAt" sortBy={sortBy} direction={direction} onSort={changeSort} className="text-xs font-semibold uppercase tracking-wide text-app-gray-500" />
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-app-gray-500">Location</TableHead>
                  <TableHead className="px-5 text-xs font-semibold uppercase tracking-wide text-app-gray-500">Processing</TableHead>
                  <TableHead className="sticky right-0 z-20 border-l border-app-gray-200 bg-app-gray-50 px-3 text-xs font-semibold uppercase tracking-wide text-app-gray-500 shadow-[-8px_0_12px_-10px_rgba(0,0,0,0.3)]"><span className="sr-only">File actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-app-gray-100">
                {files.map((file) => <TableRow key={file.id} className="border-app-gray-100 hover:bg-app-gray-50/70">
                  <TableCell className="max-w-0 px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="shrink-0 rounded-lg bg-app-iris/10 p-2 text-app-iris"><FileText className="h-4 w-4" aria-hidden="true" /></div>
                      <button type="button" onClick={() => setPreviewFile(file)} title={`Read ${file.name}`} aria-label={`Open ${file.documentType || 'document'} ${file.name}`} className="truncate rounded-sm text-left font-medium text-app-gray-900 hover:text-app-iris hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-iris">{file.name}</button>
                    </div>
                  </TableCell>
                  <TableCell className="overflow-hidden text-ellipsis whitespace-nowrap text-app-gray-600">{file.documentType || file.mimeType || 'File'}</TableCell>
                  <TableCell className="whitespace-nowrap text-app-gray-600">{formatFileSize(file.sizeBytes) || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-app-gray-600">{formatDate(file.createdAt)}</TableCell>
                  <TableCell className="overflow-hidden text-ellipsis whitespace-nowrap text-app-gray-600" title={getFileLocation(file)}>{getFileLocation(file)}</TableCell>
                  <TableCell className="px-5 py-4">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${file.documentType === 'DOCX' || file.mimeType.includes('wordprocessingml') ? 'bg-amber-50 text-amber-800' : 'bg-app-gray-100 text-app-gray-600'}`}>
                      {getProcessingStatus(file)}
                    </span>
                  </TableCell>
                  <TableCell className="sticky right-0 z-10 border-l border-app-gray-200 bg-card px-3 py-4 shadow-[-8px_0_12px_-10px_rgba(0,0,0,0.3)]" data-testid="file-actions">
                    <FileRowActions file={file} enabled={vectorEnabled(file)} busy={vectorizingIds.includes(file.id)} failed={vectorStatus(file) === 'FAILED'} error={vectorErrors[file.id]}
                      onRead={() => void startVectorize(file)} onCreateBook={() => startExecute(file)} onDelete={() => { setFileToDelete(file); setDeleteError(''); }} />
                  </TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-app-gray-100 px-4 py-3">
              <p className="text-sm text-app-gray-600">Showing {firstItem}–{lastItem} of {totalItems}</p>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="my-files-page-size" className="text-sm text-app-gray-600">Rows</label>
                <select id="my-files-page-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} className="h-9 rounded-md border border-app-gray-200 bg-white px-2 text-sm text-app-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-iris">
                  {PAGE_SIZES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <Button type="button" variant="appOutline" size="sm" disabled={!pageInfo.hasPrevious || loading} onClick={() => setPage((current) => Math.max(0, current - 1))} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /><span className="sr-only">Previous page</span></Button>
                <span className="min-w-[88px] text-center text-sm text-app-gray-600">Page {pageInfo.totalPages === 0 ? 0 : pageInfo.page + 1} of {pageInfo.totalPages}</span>
                <Button type="button" variant="appOutline" size="sm" disabled={!pageInfo.hasNext || loading} onClick={() => setPage((current) => current + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /><span className="sr-only">Next page</span></Button>
              </div>
            </div>
          </div>}
    <Dialog open={!!previewFile} onOpenChange={(open) => { if (!open) closePreview(); }}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] max-w-6xl flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-4 text-foreground shadow-appCard sm:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="truncate">{previewFile?.name || 'PDF preview'}</DialogTitle>
          <DialogDescription>{previewFile?.documentType === 'DOCX' ? 'Word text preview · layout may differ' : `${previewFile?.documentType || 'Document'} preview`} · {formatFileSize(previewFile?.sizeBytes)}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-app-gray-100">
          {previewLoading && <div role="status" className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Opening document…</div>}
          {!previewLoading && previewError && <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><p className="text-sm text-red-600">{previewError}</p><Button type="button" variant="outline" onClick={() => setPreviewAttempt((current) => current + 1)}>Try again</Button></div>}
          {!previewLoading && previewFile?.documentType === 'PDF' && previewUrl && <iframe title={`PDF preview: ${previewFile?.name || 'document'}`} src={previewUrl} className="h-full w-full bg-white" />}
          {!previewLoading && previewFile?.documentType === 'MARKDOWN' && <div className="h-full overflow-y-auto bg-background p-5 sm:p-8"><article className="mx-auto max-w-3xl"><ReactMarkdown components={MARKDOWN_COMPONENTS}>{previewText}</ReactMarkdown></article></div>}
          {!previewLoading && previewFile?.documentType === 'DOCX' && <div className="h-full overflow-y-auto bg-background p-5 sm:p-8"><article className="mx-auto max-w-3xl whitespace-pre-wrap break-words text-base leading-7 text-foreground">{previewText || 'This Word document contains no readable text.'}</article></div>}
        </div>
        <div className="flex shrink-0 justify-end"><Button type="button" variant="outline" onClick={closePreview}>Close preview</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={!!fileToDelete} onOpenChange={(open) => { if (!open && !deleting) { setFileToDelete(null); setDeleteError(''); } }}>
      <DialogContent className="max-w-lg rounded-2xl border border-border bg-card p-6 text-foreground shadow-appCard">
        <DialogHeader>
          <DialogTitle>Delete this file permanently?</DialogTitle>
          <DialogDescription className="break-words">
            Delete “{fileToDelete?.name}” from My files and remove its links from conversations and pages. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {deleteError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}
        <DialogFooter className="mt-5 gap-2">
          <Button type="button" variant="outline" disabled={deleting} onClick={() => { setFileToDelete(null); setDeleteError(''); }}>Cancel</Button>
          <Button type="button" variant="destructive" disabled={deleting || !fileToDelete} onClick={() => void confirmDeleteFile()}>
            {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting…</> : <><Trash2 className="mr-2 h-4 w-4" />Delete file</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={!!executeFile} onOpenChange={(open) => { if (!open && !executing) { setExecuteFile(null); setExecuteError(''); } }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-6 text-foreground shadow-appCard">
        <DialogHeader>
          <DialogTitle>Create or add to a book</DialogTitle>
          <DialogDescription className="break-words">Process “{executeFile?.name}” and turn its contents into book pages. The original file stays in My files.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submitExecute} className="mt-3 space-y-4">
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-foreground">Where should the content go?</legend>
            <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${destinationType === 'NEW_BOOK' ? 'border-app-iris bg-app-iris/5' : 'border-border hover:bg-muted/40'}`}>
              <input type="radio" name="pdf-destination" disabled={executing} value="NEW_BOOK" checked={destinationType === 'NEW_BOOK'} onChange={() => setDestinationType('NEW_BOOK')} className="mt-1 accent-app-iris" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">Create a new book</span><span className="mt-0.5 block text-xs text-muted-foreground">Create a book using this document.</span></span>
            </label>
            <label className={`flex gap-3 rounded-xl border p-3 transition-colors ${accessibleBooks.length ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${destinationType === 'EXISTING_BOOK' ? 'border-app-iris bg-app-iris/5' : 'border-border hover:bg-muted/40'}`}>
              <input type="radio" name="pdf-destination" value="EXISTING_BOOK" checked={destinationType === 'EXISTING_BOOK'} onChange={() => setDestinationType('EXISTING_BOOK')} disabled={executing || !accessibleBooks.length} className="mt-1 accent-app-iris" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">Add to an existing book</span><span className="mt-0.5 block text-xs text-muted-foreground">Choose a book and chapter for the new pages.</span></span>
            </label>
          </fieldset>

          {destinationType === 'NEW_BOOK'
            ? <label className="block text-sm font-medium text-foreground">New book title<input autoFocus disabled={executing} value={newBookTitle} onChange={(event) => setNewBookTitle(event.target.value)} maxLength={120} placeholder="Book title" className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-iris" /></label>
            : <label className="block text-sm font-medium text-foreground">Select a book<select value={selectedBookId} onChange={(event) => setSelectedBookId(event.target.value)} disabled={executing || !accessibleBooks.length} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-iris"><option value="">Choose a book</option>{accessibleBooks.map((book) => <option key={book.bookId} value={book.bookId}>{book.title}</option>)}</select>{!accessibleBooks.length && <span className="mt-1 block text-xs text-muted-foreground">No books are available in this workspace.</span>}</label>}

          {destinationType === 'EXISTING_BOOK' && <div className="space-y-3">
            <label className="block text-sm font-medium">Select a chapter<select value={selectedChapterId} onChange={(event) => setSelectedChapterId(event.target.value)} disabled={executing || chaptersLoading || !selectedBookId || !!chaptersError} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-iris"><option value="">{chaptersLoading ? 'Loading chapters…' : 'Create a new chapter'}</option>{chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label>
            {!chaptersLoading && !chaptersError && !chapters.length && selectedBookId && <p className="text-xs text-muted-foreground">This book has no chapters yet. A new chapter will be created.</p>}
            {chaptersError && <p role="alert" className="text-sm text-destructive">{chaptersError} <button type="button" onClick={() => setChapterAttempt((attempt) => attempt + 1)} className="underline">Retry</button></p>}
          </div>}
          <fieldset className="space-y-3 rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-semibold text-foreground">Language</legend>
            <label className="block text-sm font-medium text-foreground">Original language<select value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)} disabled={executing} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-iris"><option value="en">English</option><option value="ne">Nepali</option></select></label>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="translate-to-english" className="text-sm font-medium text-foreground">Translate to English</label>
              <Switch id="translate-to-english" checked={translateToEnglish} onCheckedChange={setTranslateToEnglish} disabled={executing} aria-describedby="translation-description" className="data-[state=checked]:bg-app-iris data-[state=unchecked]:bg-app-gray-300" />
            </div>
            <p id="translation-description" className="text-xs text-muted-foreground">{translateToEnglish ? 'Create the new pages in English.' : 'Keep the new pages in the original language.'}</p>
          </fieldset>
          {executeError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{executeError}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={executing} onClick={() => setExecuteFile(null)}>Cancel</Button>
            <Button type="submit" variant="appPrimary" disabled={executing || !executeFile || (destinationType !== 'NEW_BOOK' && !selectedBookId) || (destinationType === 'EXISTING_BOOK' && (chaptersLoading || !!chaptersError))}>
              {executing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting…</> : 'Generate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <span className="sr-only">Signed in as {user?.displayName || user?.email || 'user'}</span>
  </main>;
};

export default MyFiles;
