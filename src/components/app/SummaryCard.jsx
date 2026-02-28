import React from 'react';
import { cn } from '@/lib/utils';

const SummaryRow = ({ label, value }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-xs font-semibold text-app-gray-600 uppercase tracking-wide">
      {label}
    </span>
    <span className="text-sm text-app-gray-900">{value}</span>
  </div>
);

const SummaryCard = ({ title, rows = [], className }) => {
  return (
    <div
      className={cn(
        'mt-6 bg-white rounded-2xl border border-app-gray-100 shadow-appSoft p-5 space-y-4 matrix-surface',
        className,
      )}
    >
      <div>
        <h3 className="text-sm font-semibold text-app-gray-900">{title}</h3>
        <p className="mt-1 text-xs text-app-gray-600">
          A quick overview of what we&apos;ll prepare for you.
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <SummaryRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
    </div>
  );
};

export default SummaryCard;


