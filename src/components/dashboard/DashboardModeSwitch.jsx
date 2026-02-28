import React from 'react';
import { MessageSquare, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

const DASHBOARD_MODES = [
  { id: 'chat', icon: MessageSquare, label: 'Chat view' },
  { id: 'talk', icon: Mic, label: 'Talk view' },
];

const DashboardModeSwitch = ({ mode = 'chat', onModeChange }) => {
  return (
    <div className="dashboard-mode-switch" role="tablist" aria-label="Dashboard view mode">
      {DASHBOARD_MODES.map((item) => {
        const Icon = item.icon;
        const isActive = mode === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={item.label}
            title={item.label}
            onClick={() => onModeChange?.(item.id)}
            className={cn(
              'dashboard-mode-btn',
              isActive && 'dashboard-mode-btn-active',
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
};

export default DashboardModeSwitch;
