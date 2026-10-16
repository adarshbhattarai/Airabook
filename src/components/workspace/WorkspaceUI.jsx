import React from 'react';
import { cn } from '@/lib/utils';
import './workspace.css';

const statusTones = {
  ACTIVE: 'success', APPROVED: 'success', ACCEPTED: 'success', PASSED: 'success',
  SUBMITTED: 'warning', PENDING: 'warning', SUSPENDED: 'warning',
  UNDER_REVIEW: 'info', VERIFIED: 'info',
  DECLINED: 'danger', REVOKED: 'danger', FAILED: 'danger',
  CANCELLED: 'neutral', REMOVED: 'neutral',
};

export const WorkspaceBadge = ({ status, tone, className, children, ...props }) => (
  <span data-tone={tone || statusTones[status] || 'neutral'}
    className={cn('workspace-tone workspace-badge inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold', className)} {...props}>
    {children || String(status || 'Unknown').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}
  </span>
);

export const WorkspaceNotice = ({ as: Component = 'div', tone = 'info', className, ...props }) => (
  <Component data-tone={tone}
    className={cn('workspace-tone workspace-notice rounded-xl border px-4 py-3 text-sm leading-6', className)} {...props} />
);
