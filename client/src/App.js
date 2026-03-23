import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './context/AuthContext';

// Auth Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AuthCallback from './pages/AuthCallback';

// Worker Pages
import WorkerDashboard from './pages/WorkerDashboard';
import ProfilePage from './pages/ProfilePage';
import DiscoverPage from './pages/DiscoverPage';
import OpportunityDetailPage from './pages/OpportunityDetailPage';
import MyApplicationsPage from './pages/MyApplicationsPage';
import LearningPage from './pages/LearningPage';
import GenerateCVPage from './pages/GenerateCVPage';

// Employer Pages
import EmployerDashboard from './pages/EmployerDashboard';
import PostOpportunityPage from './pages/PostOpportunityPage';
import ManageOpportunitiesPage from './pages/ManageOpportunitiesPage';
import ViewApplicationsPage from './pages/ViewApplicationsPage';

// Shared Pages
import MessagesPage from './pages/MessagesPage';
import NotificationsPage from './pages/NotificationsPage';

// Admin Pages
import AdminDashboard from './pages/AdminDashboard';

// Layout
import Navbar from './components/common/Navbar';
import BottomNav from './components/common/BottomNav';
import ChatbotWidget from './components/chat/ChatbotWidget';

/**
 * Protected route wrapper with role-based access
 */
const ProtectedRoute = ({ children, roles }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
};

/**
 * Redirect authenticated users away from auth pages
 */
const PublicRoute = ({ children }) => {
  const { user } = useAuth();
  if (user) {
    if (user.role === 'admin') return <Navigate to="/admin" replace />;
    if (user.role === 'employer') return <Navigate to="/employer" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

function AppContent() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      {user && <Navbar />}
      <main className={user ? 'pb-20 md:pb-0' : ''}>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Worker Routes */}
          <Route path="/dashboard" element={<ProtectedRoute roles={['skilled_worker']}><WorkerDashboard /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/discover" element={<ProtectedRoute roles={['skilled_worker']}><DiscoverPage /></ProtectedRoute>} />
          <Route path="/opportunities/:id" element={<ProtectedRoute><OpportunityDetailPage /></ProtectedRoute>} />
          <Route path="/applications" element={<ProtectedRoute roles={['skilled_worker']}><MyApplicationsPage /></ProtectedRoute>} />
          <Route path="/learning" element={<ProtectedRoute roles={['skilled_worker']}><LearningPage /></ProtectedRoute>} />
          <Route path="/cv/generate" element={<ProtectedRoute roles={['skilled_worker']}><GenerateCVPage /></ProtectedRoute>} />

          {/* Employer Routes */}
          <Route path="/employer" element={<ProtectedRoute roles={['employer']}><EmployerDashboard /></ProtectedRoute>} />
          <Route path="/employer/post" element={<ProtectedRoute roles={['employer']}><PostOpportunityPage /></ProtectedRoute>} />
          <Route path="/employer/opportunities" element={<ProtectedRoute roles={['employer']}><ManageOpportunitiesPage /></ProtectedRoute>} />
          <Route path="/employer/applications/:opportunityId" element={<ProtectedRoute roles={['employer']}><ViewApplicationsPage /></ProtectedRoute>} />

          {/* Shared Routes */}
          <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />

          {/* Admin Routes */}
          <Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>} />

          {/* Default */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {user && user.role !== 'admin' && <BottomNav />}
      {user && <ChatbotWidget />}
      <ToastContainer position="top-right" autoClose={3000} />
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
