import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Loader2 } from 'lucide-react';
import { getMyEnterpriseRequests } from '@/services/enterpriseOnboardingService';

const requestStatusCopy = {
  SUBMITTED: 'awaiting System Admin review',
  UNDER_REVIEW: 'under review',
  VERIFIED: 'verified and awaiting a decision',
  APPROVED: 'approved',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
};

const EnterpriseOnboardingNotice = () => {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getMyEnterpriseRequests()
      .then((requests) => {
        if (active) setRequest(requests?.[0] || null);
      })
      .catch((error) => {
        console.warn('Unable to load Enterprise onboarding status:', error?.message || error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading) {
    return <div className="absolute left-4 top-4 z-10 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-500 shadow-sm"><Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />Checking Enterprise request status</div>;
  }
  if (!request) return null;

  return (
    <div className="absolute left-4 top-4 z-10 max-w-[min(24rem,calc(100vw-8rem))] rounded-xl border border-violet-200 bg-white/95 px-3 py-2.5 shadow-sm backdrop-blur">
      <div className="flex items-start gap-2.5">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-900">{request.proposedAccountName}: {requestStatusCopy[request.status] || 'status available'}</p>
          <Link to="/v2/workspaces" className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline">
            View request status<ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default EnterpriseOnboardingNotice;
