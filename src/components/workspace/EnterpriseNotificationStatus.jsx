import React, { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getEnterpriseNotificationSummary, getEnterpriseDeadLetters, retryEnterpriseNotification } from '@/services/enterpriseOnboardingService';

export default function EnterpriseNotificationStatus() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [failures, setFailures] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [queue, failed] = await Promise.all([getEnterpriseNotificationSummary(), getEnterpriseDeadLetters()]);
      setSummary(queue);
      setFailures(failed);
    } catch (failure) {
      setError(failure.message || 'Unable to load notification delivery status.');
    } finally {
      setBusy(false);
    }
  }, []);

  const retry = async (id) => {
    setBusy(true);
    setError('');
    try {
      await retryEnterpriseNotification(id);
      await refresh();
    } catch (failure) {
      setError(failure.message || 'Unable to retry notification.');
      setBusy(false);
    }
  };

  return <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5">
    <button type="button" aria-expanded={open} className="text-sm font-semibold text-slate-900" onClick={() => {
      const next = !open;
      setOpen(next);
      if (next) refresh();
    }}>Notification delivery {open ? '−' : '+'}</button>
    {open && <div className="mt-4 space-y-3">
      {summary && <p className="text-sm text-slate-600">
        {summary.emailEnabled ? 'Email delivery is enabled.' : 'Email delivery is not enabled.'}
        {' '}{summary.pending} queued · {summary.retry} retrying · {summary.deadLetter} need attention
      </p>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>{busy ? 'Updating…' : 'Refresh delivery status'}</Button>
      {failures.map((notification) => <div key={notification.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
        <div><p className="font-medium">{notification.eventType.replaceAll('_', ' ').toLowerCase()}</p>
          <p className="mt-1 text-xs text-slate-500">Reference {notification.id} · {notification.attempts} attempts</p></div>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => retry(notification.id)}>Retry email</Button>
      </div>)}
    </div>}
  </section>;
}
