import React from 'react';
import { cn } from '@/lib/utils';

const InfoCard = ({ children, className }) => {
  return (
    <div className={cn('bg-white rounded-2xl shadow-appSoft border border-app-gray-100 p-8 matrix-surface', className)}>
      {children}
    </div>
  );
};

export default InfoCard;


