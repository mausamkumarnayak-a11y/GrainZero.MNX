import React, { useMemo } from 'react';
import Grain from './art/Grain';
import Leaf from './art/Leaf';
import './AnimatedCoverBanner.css';

export default function AnimatedCoverBanner({
  coverSrc = '/grainzero-cover.png',
  alt = 'GrainZero – Zero waste, every meal',
  className = '',
  maxHeight = 280
}) {
  // Generate 20 floating grain positions and animation timings once
  const floatingGrains = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => {
      const left = ((i * 4.8 + (i % 3) * 3.2) % 94) + 3; // 3% to 97%
      const duration = 4.2 + (i % 5) * 0.9; // 4.2s to 7.8s
      const delay = (i * 0.35) % 4.5; // staggered delays
      const size = 12 + (i % 4) * 3; // 12px to 21px
      const opacity = 0.55 + (i % 3) * 0.15;
      const xOffset = ((i % 2 === 0 ? 1 : -1) * (12 + (i % 4) * 6));

      return {
        id: i,
        left: `${left}%`,
        duration: `${duration}s`,
        delay: `${delay}s`,
        size,
        opacity,
        xOffset: `${xOffset}px`
      };
    });
  }, []);

  return (
    <div className={`animated-banner-wrap ${className}`} style={{ maxHeight: `${maxHeight}px` }}>
      {/* Base cover artwork */}
      <img
        src={coverSrc}
        alt={alt}
        className="banner-base-img"
        style={{ maxHeight: `${maxHeight}px` }}
      />

      {/* Atmospheric Animated Floating Grains Overlay */}
      <div className="banner-particles-overlay" aria-hidden="true">
        {floatingGrains.map(g => (
          <div
            key={g.id}
            className="floating-grain-particle"
            style={{
              left: g.left,
              animationDuration: g.duration,
              animationDelay: g.delay,
              opacity: g.opacity,
              '--x-drift': g.xOffset
            }}
          >
            <Grain size={g.size} />
          </div>
        ))}

        {/* Slowly Rotating Dashed Leaf Ring on the Right */}
        <div className="rotating-leaf-ring-wrap">
          <svg
            className="rotating-dashed-ring"
            viewBox="0 0 160 160"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Outer dashed orbit */}
            <circle
              cx="80"
              cy="80"
              r="70"
              stroke="#4cae4c"
              strokeWidth="1.8"
              strokeDasharray="7 9"
              strokeOpacity="0.45"
            />
            {/* Inner dashed orbit */}
            <circle
              cx="80"
              cy="80"
              r="54"
              stroke="#F2B01E"
              strokeWidth="1.2"
              strokeDasharray="4 6"
              strokeOpacity="0.35"
            />
            {/* 4 Orbiting leaf nodes */}
            <g transform="translate(80, 10)">
              <Leaf size={14} color="#4cae4c" />
            </g>
            <g transform="translate(80, 150) rotate(180)">
              <Leaf size={14} color="#4cae4c" />
            </g>
            <g transform="translate(150, 80) rotate(90)">
              <Leaf size={14} color="#F2B01E" />
            </g>
            <g transform="translate(10, 80) rotate(270)">
              <Leaf size={14} color="#F2B01E" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
