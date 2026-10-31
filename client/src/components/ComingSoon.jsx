import React from 'react';
import './ComingSoon.css';

export default function ComingSoon({ title, icon = '🚧' }) {
  return (
    <div className="coming-soon">
      <span className="cs-icon">{icon}</span>
      <h2 className="cs-title">{title}</h2>
      <p className="cs-sub">Coming soon — this feature is under construction.</p>
    </div>
  );
}

