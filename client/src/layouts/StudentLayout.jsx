import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './NavLayout.css';

const STUDENT_LINKS = [
  { to: '/student',        label: 'Home',   end: true },
  { to: '/student/menu',   label: 'Menu'  },
  { to: '/student/rate',   label: 'Rate'  },
  { to: '/student/wallet', label: 'Wallet'},
];

export default function StudentLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/auth', { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="topnav">
        <div className="topnav-inner">
          <NavLink to="/student" className="nav-brand">
            <img src="/grainzero-logo.png" alt="GrainZero" className="nav-logo" />
            <span className="nav-brand-name">GrainZero</span>
          </NavLink>

          {/* Desktop links */}
          <nav className="nav-links desktop-only">
            {STUDENT_LINKS.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="nav-right desktop-only">
            <span className="nav-user">👤 {user?.name}</span>
            <button className="btn btn-ghost nav-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>

          {/* Hamburger (mobile) */}
          <button
            className="hamburger mobile-only"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="mobile-menu">
            {STUDENT_LINKS.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => 'mobile-link' + (isActive ? ' active' : '')}
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </NavLink>
            ))}
            <div className="mobile-user">👤 {user?.name}</div>
            <button className="btn btn-ghost mobile-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
      </header>

      <main className="page-body">
        <div className="page-wrap">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

