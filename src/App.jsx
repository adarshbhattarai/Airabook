
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import Navbar from '@/components/Navbar';
import Home from '@/pages/Home';
import Media from '@/pages/Media';
import Notes from '@/pages/Notes';
import NoteDetail from '@/pages/NoteDetail';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AuthProvider } from '@/context/AuthContext';

const AppContent = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-fuchsia-50 to-blue-50">
      <Helmet>
        <title>Baby Aira - Our Little Angel's Journey</title>
        <meta name="description" content="Follow Baby Aira's precious journey through photos, videos, and heartwarming stories. A celebration of our little angel's milestones and memories." />
      </Helmet>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/media" element={<ProtectedRoute><Media /></ProtectedRoute>} />
        <Route path="/notes" element={<ProtectedRoute><Notes /></ProtectedRoute>} />
        <Route path="/notes/:id" element={<ProtectedRoute><NoteDetail /></ProtectedRoute>} />
      </Routes>
      <Toaster />
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;