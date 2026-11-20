import React, { useState } from 'react';
import { Check, Clapperboard, FileText, Link2, Loader2, MoreHorizontal, Plus, Ruler, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { WRITING_GUIDE_TARGETS } from '@/hooks/useWritingPreferences';

export default function WritingPageHeader({
  page, chapterId, chapterTitle, pageIndex, totalPages, stats, hasDraft, readOnly,
  isSaving, onSave, onNewPage, onDelete, canCreateVideo, creatingVideoJob, onCreateVideo,
  aiBusy, aiStyle, onAiStyleChange, onRewrite, lengthGuideTarget, onLengthGuideTargetChange,
  onPageNameChange,
}) {
  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const { toast } = useToast();
  const isDraft = page.id.startsWith('temp_') || hasDraft;
  const overGuide = lengthGuideTarget > 0 && stats.words > lengthGuideTarget;
  const copyPageLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('chapter', chapterId);
      url.searchParams.set('page', page.id);
      await navigator.clipboard.writeText(url.toString());
      toast({ title: 'Page link copied', description: 'People with access to this book can open the page.' });
    } catch (_) {
      toast({ title: 'Could not copy link', description: 'Copy the page address from your browser.', variant: 'destructive' });
    }
  };

  return (
    <>
      <div className="writing-page-toolbar" role="toolbar" aria-label={`Page ${pageIndex + 1} actions`}>
        <div className="writing-page-context">
          <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{chapterTitle || 'Notes'}</span>
          <span className="shrink-0 opacity-50" aria-hidden="true">/</span>
          <span className="shrink-0">Page {pageIndex + 1} of {totalPages}</span>
        </div>
        <div className="writing-page-actions">
          {!readOnly && (
            <>
              <span className="writing-save-status" role="status" data-testid="writing-save-status">
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : !isDraft ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                {isSaving ? 'Saving…' : isDraft ? 'Unsaved' : 'Saved'}
              </span>
              {onNewPage && (
                <Button variant="ghost" size="sm" className="writing-toolbar-btn writing-icon-action" aria-label="New page" title="New page" onClick={onNewPage} disabled={isSaving || creatingVideoJob}>
                  <Plus className="mr-1 h-4 w-4" /><span className="writing-action-label">New page</span>
                </Button>
              )}
              <Button variant="appPrimary" size="sm" className="editor-save-btn writing-toolbar-btn min-w-[72px]" onClick={onSave} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="writing-toolbar-btn w-9 px-0" aria-label="More page options" title="More page options">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="writing-page-menu w-56 rounded-xl p-1.5">
              <DropdownMenuLabel>Page options</DropdownMenuLabel>
              <DropdownMenuItem onSelect={copyPageLink} disabled={page.id.startsWith('temp_')}>
                <Link2 className="mr-2 h-4 w-4" />Copy page link
              </DropdownMenuItem>
              {!readOnly && (
                <>
                  <DropdownMenuItem onSelect={() => setAiToolsOpen(true)} disabled={aiBusy}>
                    <Sparkles className="mr-2 h-4 w-4" />Rewrite page
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger><Ruler className="mr-2 h-4 w-4" />Length guide</DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="writing-page-menu rounded-xl p-1.5">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Suggested length · optional</DropdownMenuLabel>
                        <DropdownMenuRadioGroup value={String(lengthGuideTarget)} onValueChange={onLengthGuideTargetChange}>
                          {WRITING_GUIDE_TARGETS.map((target) => (
                            <DropdownMenuRadioItem key={target} value={String(target)}>
                              {target ? `${target.toLocaleString()} words` : 'Off'}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                  {canCreateVideo && (
                    <DropdownMenuItem data-testid="book-detail-create-video" onSelect={onCreateVideo} disabled={creatingVideoJob || isSaving}>
                      {creatingVideoJob ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clapperboard className="mr-2 h-4 w-4" />}Generate Clip
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600 focus:bg-red-50 focus:text-red-700" onSelect={onDelete} disabled={isSaving}>
                    <Trash2 className="mr-2 h-4 w-4" />Delete page
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="writing-page-heading">
        {readOnly ? (
          <h2>{page.pageName || 'Untitled page'}</h2>
        ) : (
          <input
            className="writing-page-title-input"
            type="text"
            aria-label="Page name"
            placeholder="Untitled page"
            value={page.pageName || ''}
            maxLength={120}
            onChange={(event) => onPageNameChange?.(event.target.value)}
          />
        )}
        <div className="writing-page-metadata" data-testid="writing-page-stats">
          <span>{stats.words.toLocaleString()} {stats.words === 1 ? 'word' : 'words'}</span>
          {stats.readingMinutes > 0 && <span>{stats.readingMinutes} min read</span>}
          {!readOnly && lengthGuideTarget > 0 && <span>{lengthGuideTarget.toLocaleString()} words suggested</span>}
        </div>
        {!readOnly && overGuide && (
          <p className="writing-length-hint" data-testid="writing-length-hint">Long entry — keep writing, or start a new page when the topic changes.</p>
        )}
      </div>

      <Dialog open={aiToolsOpen} onOpenChange={setAiToolsOpen}>
        <DialogContent className="writing-ai-dialog max-w-lg space-y-5 rounded-2xl border p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle>Refine your writing</DialogTitle>
            <DialogDescription>Choose an instruction for this page. You can review the rewrite before applying it.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setAiToolsOpen(false); onRewrite(aiStyle); }}>
            <div className="flex flex-wrap gap-2">
              {['Improve clarity', 'Make it concise', 'Fix grammar', 'Expand this'].map((style) => (
                <Button key={style} type="button" variant={aiStyle === style ? 'appOutline' : 'outline'} size="sm" className="h-8 rounded-lg px-3 text-xs" onClick={() => onAiStyleChange(style)}>{style}</Button>
              ))}
            </div>
            <label className="block space-y-2 text-sm font-medium">
              <span>Writing instruction</span>
              <Input value={aiStyle} onChange={(event) => onAiStyleChange(event.target.value)} placeholder="How would you like to improve this page?" className="editor-ai-input rounded-xl" />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAiToolsOpen(false)}>Cancel</Button>
              <Button type="submit" variant="appPrimary" disabled={aiBusy || !aiStyle.trim()}><Sparkles className="mr-2 h-4 w-4" />Rewrite</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
