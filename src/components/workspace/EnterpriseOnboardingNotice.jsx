import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Trash2 } from 'lucide-react';

const requestStatusCopy = {
  SUBMITTED: 'awaiting System Admin review',
  UNDER_REVIEW: 'under review',
  VERIFIED: 'verified and awaiting a decision',
  APPROVED: 'approved',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
};

const EnterpriseOnboardingNotice = ({ request, onNavigate, onDismiss }) => {
  if (!request) return null;

  return (
    <div className="group border-b border-border/70 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">{request.proposedAccountName}: {requestStatusCopy[request.status] || 'status available'}</p>
          <Link onClick={onNavigate} to="/v2/workspaces" className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
            View request status<ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <button
          type="button"
          aria-label="Delete enterprise request notification"
          onClick={onDismiss}
          className="shrink-0 rounded p-1 text-muted-foreground transition-opacity hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default EnterpriseOnboardingNotice;
