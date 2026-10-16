import React from 'react';
import { cn } from '@/lib/utils';
import { inputClassName } from '@/components/ui/input';

export const NativeSelect = React.forwardRef(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(inputClassName, 'min-w-0 text-foreground', className)} {...props} />
));

NativeSelect.displayName = 'NativeSelect';
