import React, { useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Check, ChevronDown, ChevronRight, FileText, FolderOpen, Navigation, Pin } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const WritingContextPicker = ({ context, chapters, bookTitle }) => {
  const { selection, setSelection, scope, chapterId, pageId, label, pageOptions } = context;
  const [view, setView] = useState('root');
  const [pageChapter, setPageChapter] = useState(null);
  const [loadingPages, setLoadingPages] = useState(false);
  const [pageError, setPageError] = useState(false);
  const pageLoadRef = useRef(0);
  const menuRef = useRef(null);
  const Icon = scope === 'book' ? BookOpen : scope === 'chapter' ? FolderOpen : FileText;
  const marker = (active) => active ? <Check className="ml-auto h-3.5 w-3.5 shrink-0" /> : null;
  const show = (event, nextView) => {
    event.preventDefault();
    setView(nextView);
    requestAnimationFrame(() => menuRef.current?.querySelector('[role="menuitem"]')?.focus());
  };
  const showPages = async (event, chapter) => {
    const requestId = ++pageLoadRef.current;
    setPageChapter(chapter);
    show(event, 'pages');
    setLoadingPages(true);
    setPageError(false);
    try { await context.loadPageOptions(chapter.id); }
    catch (_) { if (requestId === pageLoadRef.current) setPageError(true); }
    finally { if (requestId === pageLoadRef.current) setLoadingPages(false); }
  };

  return <DropdownMenu onOpenChange={() => { setView('root'); setPageChapter(null); pageLoadRef.current += 1; setLoadingPages(false); setPageError(false); }}>
    <DropdownMenuTrigger asChild>
      <button type="button" className="book-assistant-context-picker" data-testid="assistant-context-picker" aria-label={`Writing context: ${label}`} title={`${label} · ${selection.mode === 'follow' ? 'Following editor' : 'Pinned context'}`}>
        <Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{label}</span>
        {selection.mode !== 'follow' && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent ref={menuRef} align="start" collisionPadding={12} className="assistant-context-menu w-64 max-h-80 overflow-y-auto">
      {view === 'root' ? <>
        <DropdownMenuLabel className="text-xs text-muted-foreground">Use as writing context</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setSelection({ mode: 'follow' })}><Navigation className="mr-2 h-3.5 w-3.5" />Follow editor{marker(selection.mode === 'follow')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setSelection({ mode: 'book' })} title={bookTitle}><BookOpen className="mr-2 h-3.5 w-3.5" />Entire book{marker(selection.mode === 'book')}</DropdownMenuItem>
        <DropdownMenuItem disabled={!chapters.length} onSelect={(event) => show(event, 'chapters')}><FolderOpen className="mr-2 h-3.5 w-3.5" />Choose chapter<ChevronRight className="ml-auto h-3.5 w-3.5" /></DropdownMenuItem>
        <DropdownMenuItem disabled={!chapters.length} onSelect={(event) => show(event, 'pageChapters')}><FileText className="mr-2 h-3.5 w-3.5" />Choose page<ChevronRight className="ml-auto h-3.5 w-3.5" /></DropdownMenuItem>
      </> : <>
        <DropdownMenuItem onSelect={(event) => show(event, view === 'pages' ? 'pageChapters' : 'root')}><ArrowLeft className="mr-2 h-3.5 w-3.5" />Back</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="truncate text-xs text-muted-foreground">{view === 'chapters' ? 'Choose a chapter' : view === 'pageChapters' ? 'Pages in a chapter' : pageChapter?.title}</DropdownMenuLabel>
        {view === 'chapters' && chapters.map((chapter) => <DropdownMenuItem key={chapter.id} onSelect={() => setSelection({ mode: 'chapter', chapterId: chapter.id })} aria-label={`Use chapter ${chapter.title}`}><span className="truncate">{chapter.title}</span>{marker(selection.mode === 'chapter' && chapterId === chapter.id)}</DropdownMenuItem>)}
        {view === 'pageChapters' && chapters.map((chapter) => <DropdownMenuItem key={chapter.id} aria-label={`Pages in ${chapter.title}`} onSelect={(event) => showPages(event, chapter)}><span className="truncate">{chapter.title}</span><ChevronRight className="ml-auto h-3.5 w-3.5" /></DropdownMenuItem>)}
        {view === 'pages' && loadingPages && <p role="status" className="px-2 py-3 text-xs text-muted-foreground">Loading pages…</p>}
        {view === 'pages' && pageError && <><p role="alert" className="px-2 py-2 text-xs text-destructive">Couldn’t load pages.</p><DropdownMenuItem onSelect={(event) => showPages(event, pageChapter)}>Try again</DropdownMenuItem></>}
        {view === 'pages' && !loadingPages && !pageError && pageChapter && !pageOptions(pageChapter).length && <p className="px-2 py-3 text-xs text-muted-foreground">No pages in this chapter yet.</p>}
        {view === 'pages' && !loadingPages && !pageError && pageChapter && pageOptions(pageChapter).map((page) => {
          const id = page.pageId || page.id;
          const isNewDraft = String(id).startsWith('temp_');
          return <DropdownMenuItem key={id} disabled={isNewDraft} title={isNewDraft ? 'Save this page to pin it' : undefined} aria-label={`Use page ${page.pageName || 'Untitled page'}`} onSelect={() => setSelection({ mode: 'page', chapterId: pageChapter.id, pageId: id })}><span className="truncate">{page.pageName || page.shortNote || 'Untitled page'}</span>{marker(selection.mode === 'page' && pageId === id)}</DropdownMenuItem>;
        })}
      </>}
    </DropdownMenuContent>
  </DropdownMenu>;
};

export default WritingContextPicker;
