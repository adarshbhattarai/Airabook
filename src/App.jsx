import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import Navbar from '@/components/Navbar';
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import ForgotPassword from '@/pages/ForgotPassword';
import Dashboard from '@/pages/Dashboard';
import Media from '@/pages/Media';
import Notes from '@/pages/Notes';
import CreateBook from '@/pages/CreateBook';
import Donate from '@/pages/Donate';
import DonateSuccess from '@/pages/DonateSuccess';
import BookDetail from '@/pages/BookDetail';
import BookView from '@/pages/BookView';
import AlbumDetail from '@/pages/AlbumDetail';

// A wrapper to protect routes that require authentication
const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>; // Or a spinner
  }

  return user ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gradient-to-br from-violet-50 via-rose-50 to-amber-50">
          <Navbar />
          <main>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/donate" element={<Donate />} />
              <Route path="/donate/success" element={<DonateSuccess />} />

              {/* Private Routes */}
              <Route 
                path="/dashboard"
                element={<PrivateRoute><Dashboard /></PrivateRoute>}
              />
              <Route 
                path="/media" 
                element={<PrivateRoute><Media /></PrivateRoute>}
              />
              <Route 
                path="/media/album/:bookId" 
                element={<PrivateRoute><AlbumDetail /></PrivateRoute>}
              />
              {/* <Route 
                path="/notes" 
                element={<PrivateRoute><Notes /></PrivateRoute>}
              /> */}
              <Route 
                path="/create-book" 
                element={<PrivateRoute><CreateBook /></PrivateRoute>}
              />
              <Route 
                path="/book/:bookId" 
                element={<PrivateRoute><BookDetail /></PrivateRoute>}
              />
              <Route 
                path="/book/:bookId/view" 
                element={<PrivateRoute><BookView /></PrivateRoute>}
              />
            </Routes>
          </main>
        </div>
        <Toaster />
      </Router>
    </AuthProvider>
  );
}

export default App;
