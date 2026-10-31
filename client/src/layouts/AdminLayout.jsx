import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './NavLayout.css';

const ADMIN_LINKS = [
  { to: '/admin',                label: 'Dashboard',    end: true },
  { to: '/admin/analytics',      label: 'Analytics'    },
  { to: '/admin/menu-manager',   label: 'Menu Manager' },
  { to: '/admin/skip-log',       label: 'Skip Log'     },
  { to: '/admin/settings',       label: 'Settings'     },
  { to: '/admin/fees',           label: 'Fees'         },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/auth', { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="topnav admin-bar">
        <div className="topnav-inner">
          <NavLink to="/admin" className="nav-brand">
            <img src="/grainzero-logo.png" alt="GrainZero" className="nav-logo" />
            <span className="nav-brand-name">GrainZero <span className="admin-badge">Admin</span></span>
          </NavLink>

          {/* Desktop links */}
          <nav className="nav-links desktop-only">
            {ADMIN_LINKS.map(l => (
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
            <span className="nav-user">🛡️ {user?.name}</span>
            <button className="btn btn-ghost nav-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>

          <button
            className="hamburger mobile-only"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>

        {menuOpen && (
          <div className="mobile-menu">
            {ADMIN_LINKS.map(l => (
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
            <div className="mobile-user">🛡️ {user?.name}</div>
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

