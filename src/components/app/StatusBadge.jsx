import React from 'react';
import { cn } from '@/lib/utils';

const VARIANT_STYLES = {
  mint: 'bg-app-mint/10 text-app-mint',
  iris: 'bg-app-iris/10 text-app-iris',
  gray: 'bg-app-gray-100 text-app-gray-600',
};

const StatusBadge = ({ children, variant = 'gray', className }) => {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-3 py-1 text-xs font-medium',
        VARIANT_STYLES[variant] || VARIANT_STYLES.gray,
        className,
      )}
    >
      {children}
    </span>
  );
};

export default StatusBadge;


