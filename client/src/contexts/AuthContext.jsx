import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(null);
  const [ready, setReady] = useState(false); // true once we've checked localStorage

  // On mount: rehydrate from localStorage
  useEffect(() => {
    const token    = localStorage.getItem('gz_token');
    const stored   = localStorage.getItem('gz_user');
    if (token && stored) {
      try { setUser(JSON.parse(stored)); } catch { /* ignore */ }
    }
    setReady(true);
  }, []);

  const login = useCallback((token, userData) => {
    localStorage.setItem('gz_token', token);
    localStorage.setItem('gz_user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('gz_token');
    localStorage.removeItem('gz_user');
    setUser(null);
  }, []);

  // Verify token is still valid on tab focus
  useEffect(() => {
    const check = async () => {
      const token = localStorage.getItem('gz_token');
      if (!token) return;
      try {
        const { data } = await api.get('/auth/me');
        setUser(data);
        localStorage.setItem('gz_user', JSON.stringify(data));
      } catch {
        logout();
      }
    };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

