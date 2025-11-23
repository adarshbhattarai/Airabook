import React from 'react';
import { cn } from '@/lib/utils';

const StatCard = ({ label, value, helper, icon: Icon, trend, className }) => {
  return (
    <div
      className={cn(
        'bg-white rounded-2xl border border-app-gray-100 shadow-appSoft p-4 flex items-center justify-between gap-4',
        className,
      )}
    >
      <div className="space-y-1">
        <p className="text-xs font-semibold text-app-gray-600 uppercase tracking-wide">
          {label}
        </p>
        <p className="text-[22px] font-semibold text-app-gray-900 leading-tight">
          {value}
        </p>
        {helper && (
          <p className="text-xs text-app-gray-600">
            {helper}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-2">
        {Icon && (
          <div className="h-9 w-9 rounded-xl bg-app-iris/10 text-app-iris flex items-center justify-center">
            <Icon className="h-4 w-4" />
          </div>
        )}
        {trend && (
          <span className="text-xs font-medium text-app-mint">
            {trend}
          </span>
        )}
      </div>
    </div>
  );
};

export default StatCard;


