import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Menu, X, LogOut, UserPlus, LogIn, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/context/AuthContext';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, appUser, logout } = useAuth();

  const handleDonate = () => {
    toast({
      title: "💝 Thank you for your kindness!",
      description: "🚧 This feature isn\'t implemented yet—but don\'t worry! You can request it in your next prompt! 🚀",
      duration: 5000,
    });
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
    { name: 'Notes', path: '/notes', public: false },
  ];

  const visibleNavItems = navItems.filter(item => item.public || user);
  
  const userName = appUser?.displayName || user?.displayName || 'User';
  const avatarUrl = user?.photoURL;

  return (
    <nav className="bg-white/80 backdrop-blur-md shadow-lg sticky top-0 z-50 border-b border-violet-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to={homePath} className="flex items-center space-x-2">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="flex items-center space-x-2"
            >
              <Heart className="h-8 w-8 text-violet-500 fill-current" />
              <span className="text-2xl font-bold bg-gradient-to-r from-purple-500 to-indigo-500 bg-clip-text text-transparent">
                Baby Aira
              </span>
            </motion.div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            {visibleNavItems.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                className={`px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  location.pathname === item.path
                    ? 'bg-violet-100 text-violet-700'
                    : 'text-gray-700 hover:bg-violet-50 hover:text-violet-600'
                }`}
              >
                {item.name}
              </Link>
            ))}
             <Button
                  onClick={handleDonate}
                  className="bg-gradient-to-r from-yellow-400 to-orange-400 hover:from-yellow-500 hover:to-orange-500 text-white px-4 py-2 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  💝 Donate
                </Button>
            {user ? (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={userName} className="h-8 w-8 rounded-full" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-violet-200 flex items-center justify-center">
                      <UserIcon className="h-5 w-5 text-violet-600" />
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-700">{userName}</span>
                </div>
                <Button onClick={handleLogout} variant="outline" size="sm" className="rounded-full border-violet-300 text-violet-600 hover:bg-violet-100 hover:text-violet-700">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <Button asChild variant="ghost" className="rounded-full text-violet-600 hover:bg-violet-100 hover:text-violet-700">
                  <Link to="/login"><LogIn className="h-4 w-4 mr-2" />Login</Link>
                </Button>
                <Button asChild className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200">
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
                  className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white rounded-full shadow-md"
                >
                  💝
                </Button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-gray-700 hover:text-violet-600 transition-colors"
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
            className="md:hidden py-4 border-t border-violet-100"
          >
            <div className="flex flex-col space-y-2">
              {user && (
                <div className="flex items-center space-x-3 px-3 py-2">
                   {avatarUrl ? (
                    <img src={avatarUrl} alt={userName} className="h-10 w-10 rounded-full" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-violet-200 flex items-center justify-center">
                      <UserIcon className="h-6 w-6 text-violet-600" />
                    </div>
                  )}
                  <span className="font-medium text-gray-800">{userName}</span>
                </div>
              )}
              {visibleNavItems.map((item) => (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={`px-3 py-2 rounded-lg text-base font-medium transition-all duration-200 ${
                    location.pathname === item.path
                      ? 'bg-violet-100 text-violet-700'
                      : 'text-gray-700 hover:bg-violet-50 hover:text-violet-600'
                  }`}
                >
                  {item.name}
                </Link>
              ))}
              <div className="pt-4 mt-4 border-t border-violet-200 flex flex-col space-y-2">
                {user ? (
                  <>
                    <Button onClick={() => { handleLogout(); setIsOpen(false); }} variant="outline" className="w-full justify-center rounded-lg">
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout
                    </Button>
                  </>
                ) : (
                  <>
                    <Button asChild variant="outline" className="w-full justify-center rounded-lg">
                      <Link to="/login" onClick={() => setIsOpen(false)}><LogIn className="h-4 w-4 mr-2" />Login</Link>
                    </Button>
                    <Button asChild className="w-full justify-center bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg">
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
