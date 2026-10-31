import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Wraps a route so only logged-in users with `role` can access it.
 * If not authenticated → /auth
 * If wrong role → correct area
 */
export default function ProtectedRoute({ role, children }) {
  const { user, ready } = useAuth();

  if (!ready) return null; // Still rehydrating from localStorage

  if (!user) return <Navigate to="/auth" replace />;

  if (user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />;
  }

  return children;
}

