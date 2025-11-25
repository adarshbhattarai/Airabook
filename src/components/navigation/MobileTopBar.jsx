import React, { useEffect, useRef, useState } from 'react';
import { Menu, LogOut, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

const profileMenuItems = [
  {
    label: 'Profile Settings',
    icon: User,
    action: 'settings',
  },
  {
    label: 'Log out',
    icon: LogOut,
    action: 'logout',
  },
];

const MobileTopBar = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const { user, appUser, logout } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);

  const displayName = appUser?.displayName || user?.displayName || 'You';

  useEffect(() => {
    if (!showProfileMenu) return;

    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  const handleMenuAction = async (action) => {
    if (action === 'settings') {
      navigate('/settings');
    }

    if (action === 'logout') {
      await logout();
      navigate('/');
    }

    setShowProfileMenu(false);
  };

  return (
    <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card/90 backdrop-blur-sm text-foreground">
      <button
        type="button"
        onClick={onMenuClick}
        className="inline-flex items-center justify-center rounded-xl border border-border bg-background text-foreground h-9 w-9 shadow-appSoft"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="relative flex items-center gap-2" ref={profileMenuRef}>
        <div className="flex flex-col items-end">
          <span className="text-xs font-medium text-muted-foreground">Airäbook</span>
          <span className="text-sm font-semibold text-foreground">{displayName}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowProfileMenu((prev) => !prev)}
          className="relative h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold border border-border/70 hover:border-primary/60 transition-colors"
          aria-label="Open profile menu"
        >
          {displayName.charAt(0).toUpperCase()}
        </button>

        {showProfileMenu && (
          <div
            className="absolute right-0 top-full mt-2 w-52 bg-card border border-border rounded-xl shadow-appCard text-left py-2 z-50"
            role="menu"
          >
            <div className="px-4 py-3 border-b border-border/70">
              <p className="text-sm font-semibold text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{appUser?.email || user?.email || ''}</p>
            </div>

            <div className="py-1">
              {profileMenuItems.map(({ label, icon: Icon, action }) => (
                <button
                  key={action}
                  onClick={() => handleMenuAction(action)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors',
                    action === 'logout' && 'text-destructive hover:text-destructive hover:bg-destructive/10',
                  )}
                  role="menuitem"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default MobileTopBar;


