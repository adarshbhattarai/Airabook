import React from 'react';
import { BookOpen, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

// Fixed slots keep controls aligned even when a format or permission disables an action.
export default function FileRowActions({ file, enabled, busy, failed, error, onRead, onCreateBook, onDelete }) {
  const supported = ['PDF', 'MARKDOWN'].includes(file.documentType);
  return <div>
    <div className="grid grid-cols-[100px_36px_36px] items-center gap-2">
      <div className="flex items-center gap-1">
        <label className="flex items-center gap-1.5 text-xs font-medium text-app-gray-700" title={enabled ? 'AI reading enabled; this cannot be turned off.' : supported ? 'Allow Aira to read and index this document for search.' : 'AI reading is unavailable for this format.'}>
          <Switch aria-label={`Read ${file.name}`} checked={enabled} disabled={!supported || busy || enabled} onCheckedChange={(checked) => { if (checked) onRead(); }} className="h-5 w-9 data-[state=checked]:bg-app-iris data-[state=unchecked]:bg-app-gray-300 [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4" />
          <span>Read</span>
        </label>
        {busy ? <Loader2 aria-label="Enabling AI reading" className="h-3.5 w-3.5 animate-spin" /> : failed && <button type="button" aria-label={`Retry reading ${file.name}`} title="Retry reading" onClick={onRead} className="rounded p-0.5 text-app-iris focus-visible:ring-2 focus-visible:ring-app-iris"><RefreshCw className="h-3.5 w-3.5" /></button>}
      </div>
      <Button type="button" size="icon" variant="appOutline" className="h-9 w-9" disabled={!supported} title={supported ? 'Create or add to a book' : 'Book creation is unavailable for this format'} aria-label={`Create book from ${file.name}`} onClick={onCreateBook}><BookOpen className="h-4 w-4" /></Button>
      <Button type="button" size="icon" variant="appGhost" className="h-9 w-9 text-red-600 hover:bg-red-50 hover:text-red-700" disabled={file.canDelete === false} title={file.canDelete === false ? 'You do not have permission to delete this file' : 'Delete file'} aria-label={`Delete ${file.name}`} onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
    </div>
    {error && <p role="alert" className="mt-2 break-words text-xs text-destructive">{error}</p>}
  </div>;
}
