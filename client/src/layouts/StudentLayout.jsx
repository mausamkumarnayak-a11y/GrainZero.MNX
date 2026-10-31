import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import './NavLayout.css';

const STUDENT_LINKS = [
  { to: '/student',        label: 'Home',   icon: '🏠', end: true },
  { to: '/student/menu',   label: 'Menu',   icon: '📋' },
  { to: '/student/rate',   label: 'Rate',   icon: '⭐' },
  { to: '/student/wallet', label: 'Wallet', icon: '🪙' },
];

export default function StudentLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  function handleLogout() {
    logout();
    navigate('/auth', { replace: true });
  }

  return (
    <div className="app-shell">
      {/* Sticky top navbar */}
      <header className="topnav">
        <div className="topnav-inner">
          <NavLink to="/student" className="nav-brand">
            <img src="/grainzero-logo.png" alt="GrainZero" className="nav-logo" />
            <span className="nav-brand-name">GrainZero</span>
          </NavLink>

          {/* Desktop navigation with animated underline */}
          <nav className="nav-links desktop-only">
            {STUDENT_LINKS.map(l => {
              const isActive = l.end
                ? location.pathname === l.to
                : location.pathname.startsWith(l.to);

              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={`nav-link ${isActive ? 'active' : ''}`}
                  style={{ position: 'relative' }}
                >
                  <span style={{ position: 'relative', zIndex: 2 }}>{l.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="student-desktop-pill"
                      className="nav-active-pill"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </NavLink>
              );
            })}
          </nav>

          <div className="nav-right">
            <span className="nav-user">👤 {user?.name}</span>
            <button className="btn btn-ghost nav-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main page content */}
      <main className="page-body">
        <div className="page-wrap">
          <Outlet />
        </div>
      </main>

      {/* Fixed bottom tab bar for mobile (< 640px) */}
      <nav className="mobile-bottom-tabs mobile-only" aria-label="Student Navigation">
        {STUDENT_LINKS.map(l => {
          const isActive = l.end
            ? location.pathname === l.to
            : location.pathname.startsWith(l.to);

          return (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={`bottom-tab-item ${isActive ? 'active' : ''}`}
            >
              <div className="bottom-tab-icon-wrap">
                <span className="bottom-tab-icon">{l.icon}</span>
                {isActive && (
                  <motion.div
                    layoutId="student-mobile-active-bg"
                    className="bottom-tab-active-indicator"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
              </div>
              <span className="bottom-tab-label">{l.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
