import React from 'react';
import { cn } from '@/lib/utils';

const PreviewCard = ({ children, className }) => {
  return (
    <div
      className={cn(
        'rounded-2xl p-8 shadow-appFloating flex items-center justify-center',
        'bg-[var(--app-gradient-spotlight)]',
        className,
      )}
    >
      {children}
    </div>
  );
};

export default PreviewCard;


