import React from 'react';
import Navbar from '@/components/Navbar';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

const MarketingLayout = ({ children }) => {
  const { theme } = useTheme();
  const isMatrix = theme === 'matrix';

  return (
    <div
      className={cn('min-h-screen transition-colors', isMatrix ? 'text-emerald-200' : 'text-foreground')}
      style={{ background: 'var(--app-gradient-spotlight)' }}
    >
      <Navbar />
      <main>{children}</main>
    </div>
  );
};

export default MarketingLayout;


