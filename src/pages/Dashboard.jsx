import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { PlusCircle, BookOpen, LogOut } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const Dashboard = () => {
  const { appUser, appLoading, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!appLoading && appUser && (!appUser.accessibleBookIds || appUser.accessibleBookIds.length === 0)) {
      toast({
        title: "Welcome!",
        description: "Let's create your first baby book to get started.",
      });
      navigate('/create-book');
    }
  }, [appUser, appLoading, navigate, toast]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/'); // Redirect to the public home page after logout
    } catch (error) {
      toast({ title: "Error", description: "Failed to log out.", variant: "destructive" });
    }
  };

  if (appLoading || !appUser) {
    return (
        <div className="flex justify-center items-center min-h-screen">
            <p>Loading your dashboard...</p>
        </div>
    );
  }

  // This view will only be shown to users who have at least one book.
  // New users are redirected from the useEffect hook.
  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-12">
            <div>
                <h1 className="text-4xl font-extrabold text-gray-900">
                    Welcome, {appUser.displayName}!
                </h1>
                <p className="mt-2 text-xl text-gray-600">Your Family Dashboard</p>
            </div>
            <Button variant="outline" onClick={handleLogout}><LogOut className="mr-2 h-4 w-4"/> Logout</Button>
        </div>

        <div className="flex justify-center mb-12">
            <Button onClick={() => navigate('/create-book')} className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white px-8 py-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 text-lg">
                <PlusCircle className="h-6 w-6 mr-3" />
                Create New Book
            </Button>
        </div>

        {appUser.accessibleBookIds && appUser.accessibleBookIds.length > 0 && (
            <div className="space-y-4">
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Your Books</h2>
                {appUser.accessibleBookIds.map(bookId => (
                  <Link to={`/book/${bookId}`} key={bookId} className="block bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-violet-100 hover:shadow-2xl transition-all duration-300">
                     <div className="flex items-center space-x-4">
                        <BookOpen className="h-8 w-8 text-purple-500" />
                        <div>
                          {/* In a real app, you'd fetch the book name here */}
                          <h3 className="text-xl font-bold text-gray-800">A Baby Book</h3>
                          <p className="text-gray-600">Click to view journey</p>
                        </div>
                     </div>
                  </Link>
                ))}
            </div>
        )}

      </div>
    </div>
  );
};

export default Dashboard;
