import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { WorkspaceBadge, WorkspaceNotice } from '@/components/workspace/WorkspaceUI';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Check, Clock3, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMyEnterpriseRequests } from '@/services/enterpriseOnboardingService';

const statusCopy = {
  SUBMITTED: { label: 'Submitted', title: 'Your Enterprise request was submitted', icon: Clock3 },
  UNDER_REVIEW: { label: 'Under review', title: 'Your Enterprise request is being reviewed', icon: Clock3 },
  VERIFIED: { label: 'Verified', title: 'Your Enterprise request is awaiting a decision', icon: ShieldCheck },
  APPROVED: { label: 'Approved', title: 'Your Enterprise workspace is ready', icon: Check },
  DECLINED: { label: 'Declined', title: 'Your Enterprise request was declined', icon: XCircle },
  CANCELLED: { label: 'Cancelled', title: 'Your Enterprise request was cancelled', icon: XCircle },
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

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Refreshing request status…</div>;

  return (
    <div className="px-4 py-10 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-8 w-8" /></div>
        <WorkspaceBadge status={requestStatus || "SUBMITTED"} className="mt-6">{state.label}</WorkspaceBadge>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground">{state.title}</h2>
        <p className="mt-3 text-base leading-6 text-muted-foreground">{request ? <>Your request for <strong className="font-semibold text-foreground">{request.requestedSlug}.airabook.com</strong> is {requestStatus === 'SUBMITTED' ? 'waiting for a System Administrator' : requestStatus === 'UNDER_REVIEW' ? 'being reviewed by a System Administrator' : requestStatus === 'VERIFIED' ? 'verified and awaiting a final decision' : requestStatus === 'APPROVED' ? 'approved' : requestStatus === 'DECLINED' ? 'declined' : 'cancelled'}.</> : 'Your request status is not available yet. Open the workspace hub to refresh it.'}</p>
      </div>

      {error && <WorkspaceNotice role="alert" tone="danger" className="mx-auto mt-6 max-w-xl">{error}</WorkspaceNotice>}
      <Card className="mx-auto mt-8 max-w-xl p-5 sm:p-6"><div className="space-y-5">
        <RequestStatusStep icon={Check} title="Request submitted" description="Your organization details were received." complete />
        <RequestStatusStep icon={requestStatus === 'DECLINED' || requestStatus === 'CANCELLED' ? XCircle : isApproved ? Check : Clock3} title="System Admin review" description={request?.decisionReason || (isApproved ? 'The request was approved.' : requestStatus === 'DECLINED' ? 'The request was declined.' : requestStatus === 'CANCELLED' ? 'The request was cancelled.' : requestStatus === 'VERIFIED' ? 'Verification is complete; a final decision is pending.' : 'A System Administrator is reviewing your organization.')} complete={isApproved} active={['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED'].includes(requestStatus)} declined={requestStatus === 'DECLINED' || requestStatus === 'CANCELLED'} />
        <RequestStatusStep icon={Building2} title="Enterprise Workspace activated" description={isApproved ? 'You can open it from your workspace hub.' : 'Available after approval.'} complete={isApproved} />
      </div></Card>

      <div className="mx-auto mt-6 max-w-xl rounded-xl border border-border bg-primary/10 px-4 py-3 text-center text-sm leading-5 text-muted-foreground"><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-primary" />One Personal Account is used for both personal and Enterprise access.</div>
      <div className="mt-7 flex flex-wrap justify-center gap-3"><Button type="button" onClick={() => navigate('/v2/workspaces')} variant="appPrimary">Open workspace hub <ArrowRight className="ml-2 h-4 w-4" /></Button><Button asChild variant="outline"><Link to="/dashboard">Dashboard</Link></Button></div>
    </div>
  );
};

const RequestStatusStep = ({ icon: Icon, title, description, complete = false, active = false, declined = false }) => (
  <div className="flex items-start gap-4">
    <span data-tone={declined ? 'danger' : complete ? 'success' : active ? 'warning' : 'neutral'} className="workspace-tone workspace-badge flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"><Icon className="h-4 w-4" /></span>
    <div className="min-w-0 text-left">
      <p className="text-base font-semibold text-foreground">{title}{active && <WorkspaceBadge tone="warning" className="ml-2">Current</WorkspaceBadge>}</p>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
    </div>
  </div>
);

export default EnterpriseRequestPending;
