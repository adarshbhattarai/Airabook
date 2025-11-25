import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Menu, X, LogOut, UserPlus, LogIn, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/context/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, appUser, logout } = useAuth();
  const { theme } = useTheme();
  const isMatrix = theme === 'matrix';

  const handleDonate = () => {
    navigate('/donate');
    setIsOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
    toast({
      title: "👋 You\'ve been logged out.",
      description: "See you again soon!",
    });
  };

  const homePath = user ? '/dashboard' : '/';

  const navItems = [
    { name: 'Home', path: homePath, public: true },
    { name: 'Media', path: '/media', public: false },
    // { name: 'Notes', path: '/notes', public: false },
  ];

  const visibleNavItems = navItems.filter(item => item.public || user);

  const userName = appUser?.displayName || user?.displayName || 'User';
  const avatarUrl = user?.photoURL;
  const navClasses = cn(
    'backdrop-blur-md sticky top-0 z-50 border-b transition-colors',
    isMatrix
      ? 'bg-app-gray-100/80 border-emerald-500/30 shadow-[0_10px_30px_rgba(16,185,129,0.2)]'
      : 'bg-white/80 border-violet-100 shadow-lg',
  );

  const navLinkClass = (path) => cn(
    'px-3 py-2 rounded-full text-sm font-medium transition-all duration-200',
    isMatrix
      ? 'text-emerald-200 hover:bg-emerald-900/40 hover:text-emerald-100'
      : 'text-gray-700 hover:bg-violet-50 hover:text-violet-600',
    location.pathname === path
      ? isMatrix
        ? 'bg-emerald-900/50 text-emerald-100 border border-emerald-400/30'
        : 'bg-violet-100 text-violet-700'
      : null,
  );

  const mobileNavLinkClass = (path) => cn(
    'px-3 py-2 rounded-lg text-base font-medium transition-all duration-200',
    isMatrix
      ? 'text-emerald-200 hover:bg-emerald-900/40 hover:text-emerald-100'
      : 'text-gray-700 hover:bg-violet-50 hover:text-violet-600',
    location.pathname === path
      ? isMatrix
        ? 'bg-emerald-900/50 text-emerald-100 border border-emerald-400/30'
        : 'bg-violet-100 text-violet-700'
      : null,
  );

  return (
    <nav className={navClasses}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div onClick={() => window.location.href = homePath} className="flex items-center space-x-2 cursor-pointer">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="flex items-center space-x-2"
            >
              <Heart className={cn('h-8 w-8 fill-current', isMatrix ? 'text-emerald-400' : 'text-violet-500')} />
              <span
                className={cn(
                  'text-2xl font-bold bg-clip-text text-transparent',
                  isMatrix
                    ? 'bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-500'
                    : 'bg-gradient-to-r from-purple-500 to-indigo-500',
                )}
              >
                Airäbook
              </span>
            </motion.div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            {visibleNavItems.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                className={navLinkClass(item.path)}
              >
                {item.name}
              </Link>
            ))}
            <ThemeToggle />
            <Button
              onClick={handleDonate}
              className={cn(
                'px-4 py-2 rounded-full shadow-lg hover:shadow-xl transition-all duration-200',
                isMatrix
                  ? 'bg-gradient-to-r from-emerald-500/40 via-emerald-600/50 to-emerald-500/40 text-emerald-50 border border-emerald-400/40'
                  : 'bg-gradient-to-r from-yellow-400 to-orange-400 hover:from-yellow-500 hover:to-orange-500 text-white',
              )}
            >
              💝 Donate
            </Button>
            {user ? (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={userName} className="h-8 w-8 rounded-full" />
                  ) : (
                    <div
                      className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center',
                        isMatrix ? 'bg-emerald-500/20 text-emerald-200' : 'bg-violet-200',
                      )}
                    >
                      <UserIcon className="h-5 w-5" />
                    </div>
                  )}
                  <span className="text-sm font-medium text-foreground">{userName}</span>
                </div>
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className={cn(
                    'rounded-full',
                    isMatrix
                      ? 'border-emerald-400/50 text-emerald-200 hover:bg-emerald-900/40'
                      : 'border-violet-300 text-violet-600 hover:bg-violet-100 hover:text-violet-700',
                  )}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <Button
                  asChild
                  variant="ghost"
                  className={cn(
                    'rounded-full',
                    isMatrix ? 'text-emerald-200 hover:bg-emerald-900/40' : 'text-violet-600 hover:bg-violet-100 hover:text-violet-700',
                  )}
                >
                  <Link to="/login"><LogIn className="h-4 w-4 mr-2" />Login</Link>
                </Button>
                <Button
                  asChild
                  className={cn(
                    'rounded-full shadow-lg hover:shadow-xl transition-all duration-200',
                    isMatrix
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-emerald-50'
                      : 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white',
                  )}
                >
                  <Link to="/signup"><UserPlus className="h-4 w-4 mr-2" />Signup</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center gap-2">
            <Button
              onClick={handleDonate}
              size="sm"
              className={cn(
                'rounded-full shadow-md',
                isMatrix
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-emerald-50'
                  : 'bg-gradient-to-r from-yellow-400 to-orange-400 text-white',
              )}
            >
              💝
            </Button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className={cn(
                'transition-colors',
                isMatrix ? 'text-emerald-200 hover:text-emerald-100' : 'text-gray-700 hover:text-violet-600',
              )}
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn('md:hidden py-4 border-t', isMatrix ? 'border-emerald-500/30' : 'border-violet-100')}
          >
            <div className="flex flex-col space-y-2">
              {user && (
                <div className="flex items-center space-x-3 px-3 py-2">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={userName} className="h-10 w-10 rounded-full" />
                  ) : (
                    <div
                      className={cn(
                        'h-10 w-10 rounded-full flex items-center justify-center',
                        isMatrix ? 'bg-emerald-500/20 text-emerald-200' : 'bg-violet-200 text-violet-600',
                      )}
                    >
                      <UserIcon className="h-6 w-6" />
                    </div>
                  )}
                  <span className="font-medium text-foreground">{userName}</span>
                </div>
              )}
              <div className="px-3">
                <ThemeToggle className="w-full justify-start" />
              </div>
              {visibleNavItems.map((item) => (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={mobileNavLinkClass(item.path)}
                >
                  {item.name}
                </Link>
              ))}
              <div className={cn('pt-4 mt-4 border-t flex flex-col space-y-2', isMatrix ? 'border-emerald-500/30' : 'border-violet-200')}>
                {user ? (
                  <>
                    <Button
                      onClick={() => { handleLogout(); setIsOpen(false); }}
                      variant="outline"
                      className={cn('w-full justify-center rounded-lg', isMatrix && 'border-emerald-400/40 text-emerald-200 hover:bg-emerald-900/40')}
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout
                    </Button>
                  </>
                ) : (
                  <>
                    <Button asChild variant="outline" className={cn('w-full justify-center rounded-lg', isMatrix && 'border-emerald-400/40 text-emerald-200 hover:bg-emerald-900/40')}>
                      <Link to="/login" onClick={() => setIsOpen(false)}><LogIn className="h-4 w-4 mr-2" />Login</Link>
                    </Button>
                    <Button
                      asChild
                      className={cn(
                        'w-full justify-center rounded-lg',
                        isMatrix
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-emerald-50'
                          : 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white',
                      )}
                    >
                      <Link to="/signup" onClick={() => setIsOpen(false)}><UserPlus className="h-4 w-4 mr-2" />Signup</Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
