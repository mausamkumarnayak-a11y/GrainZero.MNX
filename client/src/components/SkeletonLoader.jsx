import React from 'react';
import './SkeletonLoader.css';

export default function SkeletonLoader({ type = 'card', count = 3, height = 140 }) {
  return (
    <div className={`skeleton-container skeleton-${type}`} aria-busy="true" aria-label="Loading content">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="skeleton-item shimmer"
          style={{ height: typeof height === 'number' ? `${height}px` : height }}
        >
          <div className="skeleton-line line-title" />
          <div className="skeleton-line line-short" />
          <div className="skeleton-line line-long" />
        </div>
      ))}
    </div>
  );
}

