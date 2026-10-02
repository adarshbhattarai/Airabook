import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Globe2,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  approveAdminEnterpriseRequest,
  declineAdminEnterpriseRequest,
  getAdminEnterpriseRequest,
  getAdminEnterpriseRequests,
} from '@/services/enterpriseOnboardingService';

const PAGE_SIZE = 20;
const STATUS_FILTERS = [
  { value: '', label: 'All requests' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'CANCELLED', label: 'Cancelled' },
];
const REVIEWABLE_STATUSES = new Set(['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED']);

const STATUS_STYLES = {
  SUBMITTED: 'border-amber-200 bg-amber-50 text-amber-800',
  UNDER_REVIEW: 'border-sky-200 bg-sky-50 text-sky-800',
  VERIFIED: 'border-violet-200 bg-violet-50 text-violet-800',
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  DECLINED: 'border-rose-200 bg-rose-50 text-rose-800',
  CANCELLED: 'border-slate-200 bg-slate-100 text-slate-600',
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const formatStatus = (value) => String(value || 'UNKNOWN').replaceAll('_', ' ').toLowerCase()
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const EnterpriseApprovals = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState('SUBMITTED');
  const [page, setPage] = useState(0);
  const [result, setResult] = useState({ items: [], page: { number: 0, size: PAGE_SIZE, totalItems: 0, totalPages: 0 } });
  const [counts, setCounts] = useState({ submitted: 0, underReview: 0, verified: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [declineMode, setDeclineMode] = useState(false);
  const [action, setAction] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [queue, submitted, underReview, verified] = await Promise.all([
        getAdminEnterpriseRequests({ status: status || undefined, page, size: PAGE_SIZE, sort: 'submittedAt,desc' }),
        getAdminEnterpriseRequests({ status: 'SUBMITTED', page: 0, size: 1 }),
        getAdminEnterpriseRequests({ status: 'UNDER_REVIEW', page: 0, size: 1 }),
        getAdminEnterpriseRequests({ status: 'VERIFIED', page: 0, size: 1 }),
      ]);
      setResult(queue);
      setCounts({
        submitted: submitted?.page?.totalItems || 0,
        underReview: underReview?.page?.totalItems || 0,
        verified: verified?.page?.totalItems || 0,
      });
    } catch (loadError) {
      setError(loadError.message || 'Unable to load enterprise onboarding requests.');
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const reviewableCount = counts.submitted + counts.underReview + counts.verified;
  const pageInfo = result?.page || { number: page, size: PAGE_SIZE, totalItems: 0, totalPages: 0 };
  const requests = result?.items || [];
  const selectedStatusLabel = useMemo(
    () => STATUS_FILTERS.find((filter) => filter.value === status)?.label || 'All requests',
    [status]
  );

  const openRequest = async (request) => {
    setSelectedRequest(request);
    setDetailLoading(true);
    setDetailError('');
    setApprovalNotes('');
    setDeclineReason('');
    setDeclineMode(false);
    try {
      setSelectedRequest(await getAdminEnterpriseRequest(request.id));
    } catch (loadError) {
      setDetailError(loadError.message || 'Unable to load request details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeRequest = (open) => {
    if (action) return;
    if (!open) {
      setSelectedRequest(null);
      setDetailError('');
      setDeclineMode(false);
    }
  };

  const approve = async () => {
    if (!selectedRequest) return;
    setAction('approve');
    setDetailError('');
    try {
      await approveAdminEnterpriseRequest(selectedRequest.id, approvalNotes);
      toast({
        title: 'Enterprise request approved',
        description: `${selectedRequest.proposedAccountName} is now an active workspace.`,
        variant: 'appSuccess',
      });
      setSelectedRequest(null);
      await loadDashboard();
    } catch (actionError) {
      setDetailError(actionError.message || 'Approval failed. Please try again.');
    } finally {
      setAction('');
    }
  };

  const decline = async () => {
    if (!selectedRequest || declineReason.trim().length < 3) return;
    setAction('decline');
    setDetailError('');
    try {
      await declineAdminEnterpriseRequest(selectedRequest.id, declineReason);
      toast({
        title: 'Enterprise request declined',
        description: 'The requester can see the decision in their workspace hub.',
      });
      setSelectedRequest(null);
      await loadDashboard();
    } catch (actionError) {
      setDetailError(actionError.message || 'Decline failed. Please try again.');
    } finally {
      setAction('');
    }
  };

  const changeStatus = (nextStatus) => {
    setPage(0);
    setStatus(nextStatus);
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            <span>System administration</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-700">Enterprise onboarding</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-3xl">Enterprise requests</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Review organization details and decide which Enterprise workspaces can join Airabook.
          </p>
        </div>
        <Button onClick={loadDashboard} variant="outline" disabled={loading} className="self-start border-slate-300 bg-white sm:self-auto">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh queue
        </Button>
      </div>

      <section aria-label="Requests awaiting review" className="mt-7 grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Submitted" value={counts.submitted} icon={Clock3} tone="amber" active={status === 'SUBMITTED'} onClick={() => changeStatus('SUBMITTED')} />
        <SummaryCard label="Under review" value={counts.underReview} icon={ShieldCheck} tone="blue" active={status === 'UNDER_REVIEW'} onClick={() => changeStatus('UNDER_REVIEW')} />
        <SummaryCard label="Verified" value={counts.verified} icon={Check} tone="violet" active={status === 'VERIFIED'} onClick={() => changeStatus('VERIFIED')} />
      </section>

      <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.035)]">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Review queue</h2>
            <p className="mt-1 text-xs text-slate-500">
              {loading ? 'Updating requests…' : `${Number(pageInfo.totalItems || 0).toLocaleString()} ${selectedStatusLabel.toLowerCase()}`}
              {reviewableCount > 0 && <span className="ml-2 text-slate-400">· {reviewableCount} ready for a decision</span>}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => changeStatus(event.target.value)}
              className="h-9 min-w-40 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            >
              {STATUS_FILTERS.map((filter) => <option key={filter.value || 'all'} value={filter.value}>{filter.label}</option>)}
            </select>
          </label>
        </div>

        {error && (
          <div role="alert" className="m-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <span className="min-w-0 flex-1">{error}</span>
            <button type="button" onClick={loadDashboard} className="shrink-0 font-semibold underline underline-offset-2">Retry</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                <th className="px-5 py-3">Organization</th>
                <th className="px-5 py-3">Requester</th>
                <th className="px-5 py-3">Submitted</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-16 text-center text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading request queue</td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-16 text-center">
                  <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Building2 className="h-5 w-5" /></span>
                  <p className="mt-3 text-sm font-semibold text-slate-800">No {selectedStatusLabel.toLowerCase()} requests</p>
                  <p className="mt-1 text-xs text-slate-500">Try another status or refresh the queue.</p>
                </td></tr>
              ) : requests.map((request) => (
                <RequestRow key={request.id} request={request} onOpen={() => openRequest(request)} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-slate-500">
            {pageInfo.totalItems ? `Page ${page + 1} of ${pageInfo.totalPages} · ${pageInfo.totalItems} requests` : 'No results'}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={loading || page <= 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>
              <ChevronLeft className="mr-1 h-4 w-4" />Previous
            </Button>
            <Button variant="outline" size="sm" disabled={loading || page + 1 >= (pageInfo.totalPages || 0)} onClick={() => setPage((current) => current + 1)}>
              Next<ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      <RequestDetailDialog
        request={selectedRequest}
        loading={detailLoading}
        error={detailError}
        approvalNotes={approvalNotes}
        declineReason={declineReason}
        declineMode={declineMode}
        action={action}
        onOpenChange={closeRequest}
        onApprovalNotesChange={setApprovalNotes}
        onDeclineReasonChange={setDeclineReason}
        onDeclineModeChange={setDeclineMode}
        onApprove={approve}
        onDecline={decline}
      />
    </div>
  );
};

const SummaryCard = ({ label, value, icon: Icon, tone, active, onClick }) => {
  const tones = {
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    blue: 'bg-sky-50 text-sky-700 ring-sky-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[92px] items-center gap-4 rounded-2xl border bg-white px-4 py-4 text-left transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${active ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'}`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
      <span className="min-w-0"><span className="block text-xs font-medium text-slate-500">{label}</span><span className="mt-1 block text-2xl font-semibold tracking-tight text-slate-950">{value.toLocaleString()}</span></span>
    </button>
  );
};

const RequestRow = ({ request, onOpen }) => (
  <tr className="group transition hover:bg-slate-50/70">
    <td className="px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"><Building2 className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{request.proposedAccountName}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{request.requestedSlug}.airabook.com</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><MapPin className="h-3 w-3" />{request.country}</p>
        </div>
      </div>
    </td>
    <td className="px-5 py-4">
      <p className="text-sm font-medium text-slate-800">{request.requesterDisplayName || request.contactPersonName || 'Unknown requester'}</p>
      <p className="mt-1 max-w-[220px] truncate text-xs text-slate-500">{request.requesterEmail || request.contactEmail}</p>
    </td>
    <td className="px-5 py-4 text-xs text-slate-600">{formatDate(request.submittedAt)}</td>
    <td className="px-5 py-4"><StatusBadge status={request.status} /></td>
    <td className="px-5 py-4 text-right">
      <Button variant="outline" size="sm" onClick={onOpen} className="border-slate-300 bg-white">
        {REVIEWABLE_STATUSES.has(request.status) ? 'Review' : 'View'}<ExternalLink className="ml-2 h-3.5 w-3.5" />
      </Button>
    </td>
  </tr>
);

const StatusBadge = ({ status }) => (
  <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[status] || STATUS_STYLES.CANCELLED}`}>
    {formatStatus(status)}
  </span>
);

const RequestDetailDialog = ({
  request,
  loading,
  error,
  approvalNotes,
  declineReason,
  declineMode,
  action,
  onOpenChange,
  onApprovalNotesChange,
  onDeclineReasonChange,
  onDeclineModeChange,
  onApprove,
  onDecline,
}) => {
  const reviewable = REVIEWABLE_STATUSES.has(request?.status);
  return (
    <Dialog open={Boolean(request)} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl" overlayClassName="bg-slate-950/45 backdrop-blur-[2px]">
        {request && (
          <>
            <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Building2 className="h-5 w-5" /></span>
                  <StatusBadge status={request.status} />
                </div>
                <DialogTitle className="mt-4 text-xl tracking-tight text-slate-950 sm:text-2xl">{request.proposedAccountName}</DialogTitle>
                <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                  <span>{request.requestedSlug}.airabook.com</span>
                  {request.website && <><span aria-hidden="true">·</span><a className="inline-flex items-center gap-1 text-indigo-700 hover:underline" href={request.website} target="_blank" rel="noreferrer">Organization website<ExternalLink className="h-3 w-3" /></a></>}
                </DialogDescription>
              </DialogHeader>
            </div>

            {loading ? (
              <div className="flex items-center justify-center px-6 py-16 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading request details</div>
            ) : (
              <div className="space-y-6 px-5 py-5 sm:px-7 sm:py-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailItem icon={User} label="Requester" value={request.requesterDisplayName || 'Name not provided'} secondary={request.requesterEmail} />
                  <DetailItem icon={User} label="Organization contact" value={request.contactPersonName} secondary={request.contactEmail} />
                  <DetailItem icon={Globe2} label="Country" value={request.country} secondary={request.website} />
                  <DetailItem icon={CalendarDays} label="Submitted" value={formatDate(request.submittedAt)} secondary={request.phone ? `Phone ${request.phone}` : null} />
                </div>

                {request.businessDescription && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Organization overview</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{request.businessDescription}</p>
                  </section>
                )}

                {request.decisionReason && (
                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Decision notes</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{request.decisionReason}</p>
                  </section>
                )}

                {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

                {reviewable && (
                  <section className="border-t border-slate-200 pt-5">
                    {!declineMode ? (
                      <>
                        <label htmlFor="approval-notes" className="text-xs font-semibold text-slate-700">Approval note <span className="font-normal text-slate-400">(optional)</span></label>
                        <Textarea
                          id="approval-notes"
                          value={approvalNotes}
                          onChange={(event) => onApprovalNotesChange(event.target.value)}
                          maxLength={2000}
                          rows={3}
                          placeholder="Internal verification notes"
                          className="mt-2 resize-y border-slate-200 text-sm focus-visible:ring-indigo-500"
                        />
                        <div className="mt-4 flex flex-col-reverse justify-end gap-2 sm:flex-row">
                          <Button variant="outline" onClick={() => onDeclineModeChange(true)} disabled={Boolean(action)} className="border-rose-200 text-rose-700 hover:bg-rose-50">Decline request</Button>
                          <Button onClick={onApprove} disabled={Boolean(action)} className="bg-emerald-700 text-white hover:bg-emerald-800">
                            {action === 'approve' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                            Approve Enterprise
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div><label htmlFor="decline-reason" className="text-xs font-semibold text-slate-700">Reason for declining</label><p className="mt-1 text-xs text-slate-500">This reason will be visible to the requester.</p></div>
                          <button type="button" aria-label="Cancel decline" onClick={() => onDeclineModeChange(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
                        </div>
                        <Textarea
                          id="decline-reason"
                          value={declineReason}
                          onChange={(event) => onDeclineReasonChange(event.target.value)}
                          minLength={3}
                          maxLength={2000}
                          rows={3}
                          placeholder="Explain what could not be verified or what needs to change"
                          className="mt-3 resize-y border-slate-200 text-sm focus-visible:ring-rose-500"
                        />
                        <div className="mt-4 flex flex-col-reverse justify-end gap-2 sm:flex-row">
                          <Button variant="outline" onClick={() => onDeclineModeChange(false)} disabled={Boolean(action)}>Back</Button>
                          <Button onClick={onDecline} disabled={Boolean(action) || declineReason.trim().length < 3} className="bg-rose-700 text-white hover:bg-rose-800">
                            {action === 'decline' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                            Confirm decline
                          </Button>
                        </div>
                      </>
                    )}
                  </section>
                )}

                {!reviewable && <p className="border-t border-slate-200 pt-4 text-xs text-slate-500">This request already has a final decision and cannot be changed.</p>}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const DetailItem = ({ icon: Icon, label, value, secondary }) => (
  <div className="flex min-w-0 gap-3 rounded-xl border border-slate-200 p-3.5">
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Icon className="h-4 w-4" /></span>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-900">{value || '—'}</p>
      {secondary && <p className="mt-1 break-all text-xs leading-5 text-slate-500">{secondary}</p>}
    </div>
  </div>
);

export default EnterpriseApprovals;
