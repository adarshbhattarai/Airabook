import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import MarketingLayout from '@/layouts/MarketingLayout';
import AppShell from '@/layouts/AppShell';
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import ForgotPassword from '@/pages/ForgotPassword';
import Dashboard from '@/pages/Dashboard';
import Books from '@/pages/Books';
import Media from '@/pages/Media';
import Notes from '@/pages/Notes';
import CreateBook from '@/pages/CreateBook';
import Donate from '@/pages/Donate';
import DonateSuccess from '@/pages/DonateSuccess';
import BookDetail from '@/pages/BookDetail';
import BookView from '@/pages/BookView';
import AlbumDetail from '@/pages/AlbumDetail';
import ErrorPage from '@/pages/ErrorPage';
import ProfileSettings from '@/pages/ProfileSettings';

// A wrapper to protect routes that require authentication
const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-8 h-8 border-4 border-app-iris/30 border-t-app-iris rounded-full animate-spin"></div>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" />;
};

const ThemedAppShell = ({ children }) => (
  <ThemeProvider>
    <AppShell>
      {children}
    </AppShell>
  </ThemeProvider>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <main>
          <Routes>
            {/* Public / marketing routes */}
            <Route path="/" element={<MarketingLayout><Home /></MarketingLayout>} />
            <Route path="/signup" element={<MarketingLayout><Signup /></MarketingLayout>} />
            <Route path="/login" element={<MarketingLayout><Login /></MarketingLayout>} />
            <Route path="/forgot-password" element={<MarketingLayout><ForgotPassword /></MarketingLayout>} />

            {/* Authenticated app routes */}
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <ThemedAppShell>
                    <Dashboard />
                  </ThemedAppShell>
                </PrivateRoute>
              }
            />
            <Route
              path="/books"
              element={
                <PrivateRoute>
                  <ThemedAppShell>
                    <Books />
                  </ThemedAppShell>
                </PrivateRoute>
              }
            />
            <Route
              path="/media"
              element={
                <PrivateRoute>
                  <ThemedAppShell>
                    <Media />
                  </ThemedAppShell>
                </PrivateRoute>
              }
            />
            <Route
              path="/media/album/:bookId"
              element={
                <PrivateRoute>
                  <ThemedAppShell>
                    <AlbumDetail />
                  </ThemedAppShell>
                </PrivateRoute>
              }
            />
            <Route
              path="/notes"
              element={
                <PrivateRoute>
                  <ThemedAppShell>
                    <Notes />
                  </ThemedAppShell>
                </PrivateRoute>
              }
            />
            <Route
              path="/create-book"
              element={
                <PrivateRoute>
                  <ThemedAppShell>
                    <CreateBook />
                  </ThemedAppShell>
                </PrivateRoute>
              }
            />
            <Route
              path="/book/:bookId"
              element={
                <PrivateRoute>
                  <ThemedAppShell>
                    <BookDetail />
                  </ThemedAppShell>
                </PrivateRoute>
              }
            />
            <Route
              path="/book/:bookId/view"
              element={
                <PrivateRoute>
                  <ThemedAppShell>
                    <BookView />
                  </ThemedAppShell>
                </PrivateRoute>
              }
            />
            <Route
              path="/donate"
              element={
                <PrivateRoute>
                  <ThemedAppShell>
                    <Donate />
                  </ThemedAppShell>
                </PrivateRoute>
              }
            />
            <Route
              path="/donate/success"
              element={
                <PrivateRoute>
                  <ThemedAppShell>
                    <DonateSuccess />
                  </ThemedAppShell>
                </PrivateRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <PrivateRoute>
                  <ThemedAppShell>
                    <ProfileSettings />
                  </ThemedAppShell>
                </PrivateRoute>
              }
            />
            <Route path="/error" element={<ErrorPage />} />
            <Route path="*" element={<Navigate to="/error" replace />} />
          </Routes>
        </main>
        <Toaster />
      </Router>
    </AuthProvider>
  );
}

export default App;
