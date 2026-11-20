import React from 'react';
import { cn } from '@/lib/utils';
import { inputClassName } from '@/components/ui/input';

const chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

export const NativeSelect = React.forwardRef(({ className, style, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(inputClassName, 'min-w-0 appearance-none text-foreground', className, 'pr-10')}
    style={{
      backgroundImage: chevron,
      backgroundPosition: 'right 0.75rem center',
      backgroundSize: '1rem 1rem',
      backgroundRepeat: 'no-repeat',
      ...style,
    }}
    {...props}
  />
));

NativeSelect.displayName = 'NativeSelect';
