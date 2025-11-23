import React from 'react';
import { Menu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const MobileTopBar = ({ onMenuClick }) => {
  const { user, appUser } = useAuth();

  const displayName = appUser?.displayName || user?.displayName || 'You';

  return (
    <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-app-gray-100 bg-white/80 backdrop-blur-sm">
      <button
        type="button"
        onClick={onMenuClick}
        className="inline-flex items-center justify-center rounded-xl border border-app-gray-300 bg-white text-app-gray-900 h-9 w-9 shadow-appSoft"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2">
        <div className="flex flex-col items-end">
          <span className="text-xs font-medium text-app-gray-600">Airäbook</span>
          <span className="text-sm font-semibold text-app-gray-900">{displayName}</span>
        </div>
        <div className="h-8 w-8 rounded-full bg-app-mint text-app-navy flex items-center justify-center text-xs font-semibold">
          {displayName.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
};

export default MobileTopBar;


