import React, { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, Plus, RotateCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { acceptedFilesLabel, formatFileSize, getAccountFileValidationError, uploadAccountFile } from '@/services/accountFilesService';

const makeId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `file-${Date.now()}-${Math.random()}`);

const FileUploadControl = ({ accountId, scope = 'library', onChange, label = 'Add files', disabled = false, compact = false, allowRemoveReady = true }) => {
  const inputRef = useRef(null);
  const controllersRef = useRef(new Map());
  const itemsRef = useRef([]);
  const mountedRef = useRef(false);
  const [items, setItems] = useState([]);
  const update = (nextOrUpdater) => {
    const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(itemsRef.current) : nextOrUpdater;
    itemsRef.current = next;
    if (!mountedRef.current) return;
    setItems(next);
    onChange?.(next.filter((item) => item.file && item.status === 'ready').map((item) => item.file));
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current.clear();
    };
  }, []);

  const uploadFiles = async (files) => {
    const entries = files.map((file) => ({ localId: makeId(), original: file, status: 'uploading', progress: 0 }));
    update((current) => [...current, ...entries]);
    for (const entry of entries) {
      const validationError = getAccountFileValidationError(entry.original);
      if (validationError) {
        update((current) => current.map((item) => item.localId === entry.localId ? { ...item, status: 'error', error: validationError } : item));
        continue;
      }
      const controller = new AbortController();
      controllersRef.current.set(entry.localId, controller);
      try {
        const uploaded = await uploadAccountFile({
          accountId,
          file: entry.original,
          scope,
          signal: controller.signal,
          onProgress: (progress) => update((current) => current.map((item) => item.localId === entry.localId ? { ...item, progress } : item)),
        });
        controllersRef.current.delete(entry.localId);
        update((current) => current.map((item) => item.localId === entry.localId ? { ...item, file: uploaded, status: 'ready', progress: 100 } : item));
      } catch (error) {
        controllersRef.current.delete(entry.localId);
        if (error?.name === 'AbortError') {
          update((current) => current.filter((item) => item.localId !== entry.localId));
          continue;
        }
        update((current) => current.map((item) => item.localId === entry.localId ? { ...item, status: 'error', error: error?.message || 'Upload failed.' } : item));
      }
    }
  };

  const retry = async (item) => {
    const controller = new AbortController();
    controllersRef.current.set(item.localId, controller);
    update((current) => current.map((entry) => entry.localId === item.localId ? { ...entry, status: 'uploading', progress: 0, error: '' } : entry));
    try {
      const file = await uploadAccountFile({ accountId, file: item.original, scope, signal: controller.signal, onProgress: (progress) => update((current) => current.map((entry) => entry.localId === item.localId ? { ...entry, progress } : entry)) });
      controllersRef.current.delete(item.localId);
      update((current) => current.map((entry) => entry.localId === item.localId ? { ...entry, file, status: 'ready', progress: 100 } : entry));
    } catch (error) {
      controllersRef.current.delete(item.localId);
      if (error?.name === 'AbortError') { update((current) => current.filter((entry) => entry.localId !== item.localId)); return; }
      update((current) => current.map((entry) => entry.localId === item.localId ? { ...entry, status: 'error', error: error?.message || 'Upload failed.' } : entry));
    }
  };

  const remove = (localId) => { controllersRef.current.get(localId)?.abort(); update((current) => current.filter((item) => item.localId !== localId)); };

  return <div className="space-y-2">
    <input ref={inputRef} type="file" multiple accept=".pdf,.md,.markdown,.docx,application/pdf,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" aria-label="Choose files" onChange={(event) => { void uploadFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size={compact ? 'icon' : 'sm'} aria-label={label} title={label} disabled={disabled || !accountId} className="text-app-gray-600 hover:bg-app-iris/10 hover:text-app-iris">
          {compact ? <Plus className="h-4 w-4" /> : <><Paperclip className="mr-2 h-4 w-4" />{label}</>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem onSelect={() => inputRef.current?.click()} className="cursor-pointer">
          <FileText className="mr-2 h-4 w-4" /> Upload files
        </DropdownMenuItem>
        <div className="px-2 pb-2 pt-1 text-xs text-muted-foreground">{acceptedFilesLabel}</div>
      </DropdownMenuContent>
    </DropdownMenu>
    {items.length > 0 && <div className="flex flex-wrap gap-2" aria-live="polite">
      {items.map((item) => <div key={item.localId} className="min-w-0 max-w-full rounded-xl border border-app-gray-200 bg-app-gray-50 px-2.5 py-2 text-xs">
        <div className="flex items-center gap-2">
          {item.status === 'uploading' ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-app-iris" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-app-iris" />}
          <span className="max-w-48 truncate font-medium" title={item.original.name}>{item.original.name}</span>
          <span className="shrink-0 text-app-gray-500">{item.status === 'uploading' ? `${item.progress}%` : formatFileSize(item.original.size)}</span>
          {item.status === 'error' && <button type="button" aria-label={`Retry ${item.original.name}`} title="Retry upload" onClick={() => retry(item)}><RotateCw className="h-3.5 w-3.5" /></button>}
          {(item.status !== 'ready' || allowRemoveReady) && <button type="button" aria-label={`${item.status === 'uploading' ? 'Cancel' : 'Remove'} ${item.original.name}`} title={item.status === 'uploading' ? 'Cancel upload' : 'Remove attachment'} onClick={() => remove(item.localId)}><X className="h-3.5 w-3.5" /></button>}
        </div>
        {item.status === 'error' && <p className="mt-1 text-red-600">{item.error}</p>}
        {item.status === 'ready' && item.file?.documentType === 'DOCX' && <p className="mt-1 text-amber-700">Stored · processing unavailable</p>}
      </div>)}
    </div>}
  </div>;
};

export default FileUploadControl;
