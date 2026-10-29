import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Globe2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { WorkspaceNotice } from '@/components/workspace/WorkspaceUI';
import { getEnterpriseApiKey } from '@/services/apiKeyService';

const loadErrorMessage = (error) => {
  if (error.status === 404) return 'No API key is available for this workspace. Ask a System Administrator to check it.';
  if (error.status === 403) return 'You do not have permission to view this workspace’s API key.';
  if (error.status === 401) return 'Your session has expired. Sign in again to view the API key.';
  return error.message || 'Unable to load the API key. Please try again.';
};

export default function EnterpriseApiKeyDialog({ account }) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState('');
  const session = useRef(0);

  const changeOpen = (nextOpen) => {
    session.current += 1;
    setDetails(null);
    setError('');
    setCopied(false);
    setCopying(false);
    setCopyError('');
    setLoading(nextOpen);
    setOpen(nextOpen);
  };

  useEffect(() => {
    if (!open) return;
    const version = ++session.current;
    setLoading(true);
    setDetails(null);
    setError('');
    getEnterpriseApiKey(account.id)
      .then((result) => { if (session.current === version) setDetails(result); })
      .catch((loadError) => { if (session.current === version) setError(loadErrorMessage(loadError)); })
      .finally(() => { if (session.current === version) setLoading(false); });
    return () => { session.current += 1; };
  }, [open, account.id, attempt]);

  const copyKey = async () => {
    if (!details || copying) return;
    const version = session.current;
    setCopying(true);
    setCopied(false);
    setCopyError('');
    try {
      await navigator.clipboard.writeText(details.apiKey);
      if (session.current === version) setCopied(true);
    } catch {
      if (session.current === version) setCopyError('Unable to copy automatically. Select the key and copy it manually.');
    } finally {
      if (session.current === version) setCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="shrink-0 gap-2"><KeyRound aria-hidden="true" className="h-4 w-4" />Get API key</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6">
        <DialogHeader className="flex-row items-start gap-4 space-y-0 text-left">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound aria-hidden="true" className="h-5 w-5" />
          </span>
          <span className="min-w-0 pt-0.5">
            <DialogTitle className="text-lg">Workspace API key</DialogTitle>
            <DialogDescription className="mt-1 leading-5 text-muted-foreground">
              View and copy the existing key for <span className="font-medium text-foreground">{account.name}</span>.
            </DialogDescription>
          </span>
        </DialogHeader>
        {loading && <div role="status" className="my-6 flex min-h-24 items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Loading API key…</div>}
        {error && <div className="my-6 space-y-3">
          <WorkspaceNotice role="alert" tone="danger">{error}</WorkspaceNotice>
          <Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
        </div>}
        {details && <div className="my-6 space-y-5">
          <div className="space-y-2">
            <label htmlFor="enterprise-api-key" className="block text-sm font-medium">API key</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="enterprise-api-key" value={details.apiKey} readOnly autoComplete="off" spellCheck={false}
                aria-describedby="enterprise-api-key-help" className="min-w-0 flex-1 rounded-lg bg-muted/30 font-mono text-sm"
                onFocus={(event) => event.target.select()} />
              <Button type="button" variant="appPrimary" className="shrink-0 gap-2 rounded-lg sm:min-w-32" onClick={copyKey} disabled={copying}>
                {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
                {copied ? 'Copied' : copying ? 'Copying…' : 'Copy key'}
              </Button>
            </div>
            <p id="enterprise-api-key-help" className="text-xs text-muted-foreground">Select the field to copy the key manually.</p>
          </div>
          {details.defaultDomain && <div className="flex min-w-0 items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
            <Globe2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Website</p>
              <p className="break-all text-sm">{details.defaultDomain}</p>
            </div>
          </div>}
          {copied && <p role="status" className="-mt-2 flex items-center gap-1.5 text-sm text-emerald-700"><Check aria-hidden="true" className="h-4 w-4" />API key copied to clipboard.</p>}
          {copyError && <WorkspaceNotice role="alert" tone="danger">{copyError}</WorkspaceNotice>}
        </div>}
        <DialogFooter className="mt-6 items-center gap-3 border-t border-border pt-4 sm:space-x-0">
          <p className="flex flex-1 items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" />Keep this key private.</p>
          <DialogClose asChild><Button type="button" variant="outline" className="rounded-lg">Close</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
