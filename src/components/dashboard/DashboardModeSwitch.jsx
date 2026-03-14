import React from 'react';
import { MessageSquare, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

const DASHBOARD_MODES = [
  { id: 'chat', icon: MessageSquare, label: 'Chat view' },
  { id: 'talk', icon: Mic, label: 'Talk view' },
];

const DashboardModeSwitch = ({ mode = 'chat', onModeChange, lockedModes = {} }) => {
  return (
    <div className="dashboard-mode-switch" role="tablist" aria-label="Dashboard view mode">
      {DASHBOARD_MODES.map((item) => {
        const Icon = item.icon;
        const isActive = mode === item.id;
        const lockedReason = lockedModes?.[item.id] || '';
        return (
          <span
            key={item.id}
            className="inline-flex"
            title={lockedReason || item.label}
          >
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={lockedReason || item.label}
              aria-disabled={Boolean(lockedReason)}
              disabled={Boolean(lockedReason)}
              onClick={() => onModeChange?.(item.id)}
              className={cn(
                'dashboard-mode-btn',
                isActive && 'dashboard-mode-btn-active',
                lockedReason && 'dashboard-mode-btn-disabled',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          </span>
        );
      })}
    </div>
  );
};

export default DashboardModeSwitch;
