import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Check, Clock3, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMyEnterpriseRequests } from '@/services/enterpriseOnboardingService';

const statusCopy = {
  SUBMITTED: { label: 'Submitted', title: 'Your Enterprise request was submitted', icon: Clock3, tone: 'amber' },
  UNDER_REVIEW: { label: 'Under review', title: 'Your Enterprise request is being reviewed', icon: Clock3, tone: 'amber' },
  VERIFIED: { label: 'Verified', title: 'Your Enterprise request is awaiting a decision', icon: ShieldCheck, tone: 'amber' },
  APPROVED: { label: 'Approved', title: 'Your Enterprise workspace is ready', icon: Check, tone: 'emerald' },
  DECLINED: { label: 'Declined', title: 'Your Enterprise request was declined', icon: XCircle, tone: 'rose' },
  CANCELLED: { label: 'Cancelled', title: 'Your Enterprise request was cancelled', icon: XCircle, tone: 'rose' },
};

const EnterpriseRequestPending = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [request, setRequest] = useState(location.state?.request || null);
  const [loading, setLoading] = useState(!request);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getMyEnterpriseRequests()
      .then((requests) => {
        if (!active || !requests?.length) return;
        const stateId = location.state?.request?.id;
        setRequest(requests.find((item) => String(item.id) === String(stateId)) || requests[0]);
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'Unable to refresh request status.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [location.state?.request?.id]);

  const requestStatus = request?.status;
  const state = statusCopy[requestStatus] || statusCopy.SUBMITTED;
  const Icon = state.icon;
  const isApproved = requestStatus === 'APPROVED';

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Refreshing request status…</div>;

  return (
    <div className="py-10 sm:py-12">
      <div className="mx-auto max-w-xl text-center">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-[8px] ${state.tone === 'emerald' ? 'bg-emerald-100 text-emerald-700 ring-emerald-50' : state.tone === 'rose' ? 'bg-rose-100 text-rose-700 ring-rose-50' : 'bg-amber-100 text-amber-700 ring-amber-50'} ring-8`}><Icon className="h-8 w-8" /></div>
        <p className={`mt-6 text-sm font-semibold uppercase tracking-[0.18em] ${state.tone === 'rose' ? 'text-rose-700' : state.tone === 'emerald' ? 'text-emerald-700' : 'text-amber-700'}`}>{state.label}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950">{state.title}</h2>
        <p className="mt-3 text-base leading-6 text-slate-600">{request ? <>Your request for <strong className="font-semibold text-slate-900">{request.requestedSlug}.airabook.com</strong> is {requestStatus === 'SUBMITTED' ? 'waiting for a System Administrator' : requestStatus === 'UNDER_REVIEW' ? 'being reviewed by a System Administrator' : requestStatus === 'VERIFIED' ? 'verified and awaiting a final decision' : requestStatus === 'APPROVED' ? 'approved' : requestStatus === 'DECLINED' ? 'declined' : 'cancelled'}.</> : 'Your request status is not available yet. Open the workspace hub to refresh it.'}</p>
      </div>

      {error && <div role="alert" className="mx-auto mt-6 max-w-xl rounded-[8px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <div className="mx-auto mt-8 max-w-xl rounded-[8px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="space-y-5">
        <RequestStatusStep icon={Check} title="Request submitted" description="Your organization details were received." complete />
        <RequestStatusStep icon={requestStatus === 'DECLINED' || requestStatus === 'CANCELLED' ? XCircle : isApproved ? Check : Clock3} title="System Admin review" description={request?.decisionReason || (isApproved ? 'The request was approved.' : requestStatus === 'DECLINED' ? 'The request was declined.' : requestStatus === 'CANCELLED' ? 'The request was cancelled.' : requestStatus === 'VERIFIED' ? 'Verification is complete; a final decision is pending.' : 'A System Administrator is reviewing your organization.')} complete={isApproved} active={['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED'].includes(requestStatus)} declined={requestStatus === 'DECLINED' || requestStatus === 'CANCELLED'} />
        <RequestStatusStep icon={Building2} title="Enterprise Workspace activated" description={isApproved ? 'You can open it from your workspace hub.' : 'Available after approval.'} complete={isApproved} />
      </div></div>

      <div className="mx-auto mt-6 max-w-xl rounded-[8px] border border-violet-100 bg-violet-50/70 px-4 py-3 text-center text-sm leading-5 text-slate-600"><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-violet-700" />One Personal Account is used for both personal and Enterprise access.</div>
      <div className="mt-7 flex justify-center gap-3"><Button type="button" onClick={() => navigate('/v2/workspaces')} className="rounded-[8px] bg-violet-700 text-white hover:bg-violet-800">Open workspace hub <ArrowRight className="ml-2 h-4 w-4" /></Button><Link to="/dashboard" className="inline-flex h-10 items-center justify-center rounded-[8px] border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700">Dashboard</Link></div>
    </div>
  );
};

const RequestStatusStep = ({ icon: Icon, title, description, complete = false, active = false, declined = false }) => (
  <div className="flex items-start gap-4"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] ${declined ? 'bg-rose-100 text-rose-700' : complete ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}><Icon className="h-4 w-4" /></span><div className="min-w-0 text-left"><p className={`text-base font-semibold ${declined ? 'text-rose-800' : active ? 'text-amber-800' : complete ? 'text-slate-900' : 'text-slate-500'}`}>{title}{active && <span className="ml-2 rounded-[8px] bg-amber-100 px-2 py-0.5 text-sm font-bold uppercase tracking-wider text-amber-700">Current</span>}</p><p className="mt-1 text-sm leading-5 text-slate-500">{description}</p></div></div>
);

export default EnterpriseRequestPending;
