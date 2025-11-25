import React from 'react';
import Navbar from '@/components/Navbar';

const MarketingLayout = ({ children }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-rose-50 to-amber-50">
      <Navbar />
      <main>{children}</main>
    </div>
  );
};

export default MarketingLayout;


