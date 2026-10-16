import React from 'react';
import { cn } from '@/lib/utils';

// Match the existing InfoCard and StatCard surfaces.
export const cardClassName = 'min-w-0 rounded-2xl border border-border bg-card text-card-foreground shadow-appSoft matrix-surface';

export const Card = React.forwardRef(({ as: Component = 'div', className, ...props }, ref) => (
  <Component ref={ref} className={cn(cardClassName, className)} {...props} />
));

Card.displayName = 'Card';
