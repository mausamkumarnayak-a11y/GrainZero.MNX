import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Auth page
import AuthPage from './pages/AuthPage';

// Student pages & layout
import StudentLayout from './layouts/StudentLayout';
import StudentHome from './pages/student/Home';
import StudentMenu from './pages/student/Menu';
import StudentRate from './pages/student/Rate';
import StudentWallet from './pages/student/Wallet';

// Admin pages & layout
import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './pages/admin/Dashboard';
import AdminAnalytics from './pages/admin/Analytics';
import AdminMenuManager from './pages/admin/MenuManager';
import AdminSkipLog from './pages/admin/SkipLog';
import AdminSettings from './pages/admin/Settings';
import AdminFees from './pages/admin/Fees';

function RootRedirect() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/auth" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />;
}

function PublicAuthRoute() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (user) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />;
  }
  return <AuthPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/auth" element={<PublicAuthRoute />} />

          {/* Student routes */}
          <Route
            path="/student"
            element={
              <ProtectedRoute role="student">
                <StudentLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<StudentHome />} />
            <Route path="menu" element={<StudentMenu />} />
            <Route path="rate" element={<StudentRate />} />
            <Route path="wallet" element={<StudentWallet />} />
          </Route>

          {/* Admin routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="menu-manager" element={<AdminMenuManager />} />
            <Route path="skip-log" element={<AdminSkipLog />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="fees" element={<AdminFees />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
