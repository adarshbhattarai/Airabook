import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';

const stripHtml = (html = '') =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|br|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const isLikelyHtml = (s = '') => /<\w+[^>]*>/.test(s);

const textToHtml = (text = '') =>
  String(text)
    .split('\n')
    .map(seg => seg.trim())
    .filter(Boolean)
    .map(seg => `<p>${seg.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('');

const BookView = () => {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [pages, setPages] = useState([]);
  const [selectedChapterId, setSelectedChapterId] = useState(null);
  const [selectedPageId, setSelectedPageId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const fetchChapters = useCallback(async () => {
    if (!bookId) return;
    const chaptersRef = collection(firestore, 'books', bookId, 'chapters');
    const qy = query(chaptersRef, orderBy('order'));
    const chaptersSnap = await getDocs(qy);
    const chaptersList = chaptersSnap.docs.map(docu => ({ id: docu.id, ...docu.data() }));
    setChapters(chaptersList);
    if (chaptersList.length > 0 && !selectedChapterId) {
      const firstChapterId = chaptersList[0].id;
      setSelectedChapterId(firstChapterId);
    }
  }, [bookId, selectedChapterId]);

  const fetchPages = useCallback(async (chapterId) => {
    if (!chapterId || !bookId) return;
    const pagesRef = collection(firestore, 'books', bookId, 'chapters', chapterId, 'pages');
    const qy = query(pagesRef, orderBy('order'));
    const pagesSnap = await getDocs(qy);
    const pagesList = pagesSnap.docs.map(docu => ({ id: docu.id, ...docu.data() }));
    setPages(pagesList);
    if (pagesList.length > 0) {
      setSelectedPageId(p => pagesList.some(pg => pg.id === p) ? p : pagesList[0].id);
    } else {
      setSelectedPageId(null);
    }
  }, [bookId]);

  useEffect(() => {
    const init = async () => {
      if (!bookId) return;
      setLoading(true);
      const bookRef = doc(firestore, 'books', bookId);
      const bookSnap = await getDoc(bookRef);
      if (bookSnap.exists()) setBook({ id: bookSnap.id, ...bookSnap.data() });
      await fetchChapters();
      setLoading(false);
    };
    init();
  }, [bookId, fetchChapters]);

  useEffect(() => { fetchPages(selectedChapterId); }, [selectedChapterId, fetchPages]);

  // Media preview navigation
  const selectedPage = pages.find(p => p.id === selectedPageId) || null;
  const mediaList = selectedPage?.media || [];
  const previewItem = mediaList[previewIndex] || null;

  const openPreview = (index) => {
    if (index >= 0 && index < mediaList.length) {
      setPreviewIndex(index);
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

  // Keyboard navigation for media modal
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

  if (loading) return <div className="flex justify-center items-center min-h-[60vh] text-sm text-app-gray-600">Loading...</div>;

  const noteHtml = selectedPage?.note
    ? (isLikelyHtml(selectedPage.note) ? selectedPage.note : textToHtml(stripHtml(selectedPage.note)))
    : '<p>No content.</p>';

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Button
          variant="appGhost"
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-xs"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Books
        </Button>
      </div>
      <h1 className="text-[28px] font-semibold text-app-gray-900 text-center mb-6">
        {book?.babyName}&apos;s journey
      </h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" style={{ minHeight: '60vh' }}>
        {/* Sidebar: Chapters and Pages (read-only) */}
        <div className="lg:col-span-1 flex flex-col space-y-6">
          <div className="p-4 bg-white rounded-2xl shadow-appSoft border border-app-gray-100 flex-grow">
            <h2 className="text-sm font-semibold text-app-gray-900 mb-3">Content</h2>
            <div className="space-y-1">
              {[...chapters].sort((a, b) => a.order.localeCompare(b.order)).map(chapter => (
                <div key={chapter.id} className="group">
                  <div
                    onClick={() => { setSelectedChapterId(chapter.id); }}
                    className={`w-full text-left p-3 rounded-lg flex items-center justify-between cursor-pointer ${selectedChapterId === chapter.id ? 'bg-app-iris/10 text-app-iris' : 'hover:bg-app-gray-100'}`}
                  >
                    <span className="text-sm font-medium truncate pr-2 ml-1">{chapter.title}</span>
                  </div>
                  {selectedChapterId === chapter.id && (
                    <div className="ml-4 pl-4 border-l border-app-gray-100 py-1 space-y-1">
                      {chapter.pagesSummary?.length > 0 ? chapter.pagesSummary.map((pageSummary) => (
                        <div
                          key={pageSummary.pageId}
                          onClick={() => { setSelectedChapterId(chapter.id); setSelectedPageId(pageSummary.pageId); }}
                          className={`w-full text-left p-2 rounded-md text-xs cursor-pointer ${selectedPageId === pageSummary.pageId ? 'bg-app-iris/10 text-app-iris' : 'hover:bg-app-gray-100'}`}
                        >
                          <span className="truncate">{pageSummary.shortNote || 'Untitled Page'}</span>
                        </div>
                      )) : <div className="p-2 text-xs text-gray-500">No pages yet.</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main content: Media on top, Page note below (read-only) */}
        <div className="lg:col-span-2">
          {(() => {
            const layoutStyles = {
              a4: "aspect-[210/297] max-w-[800px] mx-auto bg-white shadow-2xl p-[5%]",
              scrapbook: "aspect-square max-w-[800px] mx-auto bg-white shadow-2xl p-[5%]",
              standard: "p-6 bg-white rounded-2xl shadow-appSoft border border-app-gray-100 flex flex-col h-full"
            };

            return (
              <div className={layoutStyles[book?.layoutMode] || layoutStyles.standard}>
                {/* Media Section - On Top */}
                {selectedPage?.media && selectedPage.media.length > 0 && (
                  <div className="mb-6">
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 w-full">
                      {selectedPage.media.map((media, idx) => (
                        <div
                          key={media.storagePath}
                          className="relative group aspect-square bg-gray-200 rounded-md overflow-hidden cursor-pointer"
                          onClick={() => openPreview(idx)}
                        >
                          {media.type === 'image' ? (
                            <img src={media.url} alt={media.name} className="w-full h-full object-cover" />
                          ) : (
                            <video src={media.url} className="w-full h-full object-cover" />
                          )}
                          <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center items-center text-white text-xs font-medium">
                            <span>Click to view</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Page Content Section - Below Media */}
                <div className="prose max-w-none flex-grow mb-6 text-app-gray-900">
                  <div dangerouslySetInnerHTML={{ __html: noteHtml }} />
                </div>

                {/* Page Navigation - At Bottom */}
                {pages.length > 0 && (
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          const currentIndex = pages.findIndex(p => p.id === selectedPageId);
                          if (currentIndex > 0) {
                            setSelectedPageId(pages[currentIndex - 1].id);
                          }
                        }}
                        disabled={pages.findIndex(p => p.id === selectedPageId) === 0}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-medium text-gray-600">
                        Page {pages.findIndex(p => p.id === selectedPageId) + 1} of {pages.length}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          const currentIndex = pages.findIndex(p => p.id === selectedPageId);
                          if (currentIndex < pages.length - 1) {
                            setSelectedPageId(pages[currentIndex + 1].id);
                          }
                        }}
                        disabled={pages.findIndex(p => p.id === selectedPageId) === pages.length - 1}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
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
    </div>
  );
};

export default BookView;


