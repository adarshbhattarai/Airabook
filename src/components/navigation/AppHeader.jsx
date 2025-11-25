import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, LogOut, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { AppInput } from '@/components/ui/input';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

const AppHeader = () => {
  const { user, appUser, logout } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const profileMenuRef = useRef(null);

  const userName = appUser?.displayName || user?.displayName || 'User';
  const userEmail = appUser?.email || user?.email || '';
  const avatarUrl = user?.photoURL;
  const initial = userName.charAt(0).toUpperCase();
  const isNeonTheme = theme !== 'light';

  // Close profile menu when clicking outside
  useEffect(() => {
    if (!showProfileMenu) return;
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
    setShowProfileMenu(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    // TODO: Implement search functionality
    console.log('Search query:', searchQuery);
  };

  return (
    <header
      className={cn(
        'hidden md:flex h-16 items-center justify-between px-6 shrink-0 border-b bg-card text-foreground border-border',
        isNeonTheme && 'shadow-[0_12px_30px_rgba(16,185,129,0.12)]',
      )}
    >
      {/* Left: Empty or subtle branding */}
      <div className="w-48">
        {/* Optional: Add breadcrumbs or page title here */}
      </div>

      {/* Center: Search bar */}
      <div className="flex-1 max-w-2xl mx-8">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-app-gray-600" />
          <AppInput
            type="text"
            placeholder="Search books, chapters, notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 w-full"
          />
        </form>
      </div>

      {/* Right: Notifications, Settings, Profile */}
      <div className="flex items-center gap-2">
        <ThemeToggle variant="appGhost" />
        {/* Notifications */}
        {/* Notifications */}
        <div className="relative">
          <Button
            variant="appGhost"
            size="icon"
            className="h-9 w-9 relative"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell className="h-5 w-5" />
          </Button>

          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotifications(false)}
              />
              <div className="absolute right-0 mt-2 w-80 bg-card rounded-xl shadow-appCard border border-border py-4 z-50">
                <div className="px-4 pb-2 border-b border-border/70">
                  <h3 className="font-semibold text-foreground">Notifications</h3>
                </div>
                <div className="px-4 py-8 flex flex-col items-center justify-center text-center">
                  <div className="h-10 w-10 rounded-full bg-app-gray-50 flex items-center justify-center mb-3 text-app-gray-400">
                    <Bell className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No notifications yet</p>
                  <p className="text-xs text-app-gray-500 mt-1">
                    We'll let you know when something important happens.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Profile dropdown */}
        <div className="relative" ref={profileMenuRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 rounded-pill hover:bg-app-gray-100 transition-colors p-1 pr-3"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={userName}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-app-iris text-white flex items-center justify-center text-sm font-semibold">
                {initial}
              </div>
            )}
            <span className="text-sm font-medium text-app-gray-900 hidden lg:block">
              {userName}
            </span>
          </button>

          {/* Dropdown menu */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-card rounded-xl shadow-appCard border border-border py-2 z-50">
              <div className="px-4 py-3 border-b border-border/70">
                <p className="text-sm font-semibold text-foreground">{userName}</p>
                <p className="text-xs text-app-gray-600 truncate">{userEmail}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => {
                    navigate('/settings');
                    setShowProfileMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-app-gray-900 hover:bg-app-gray-100 transition-colors"
                >
                  <User className="h-4 w-4" />
                  Profile Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;

