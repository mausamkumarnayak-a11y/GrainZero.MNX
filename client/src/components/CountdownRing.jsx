import React from 'react';

export default function CountdownRing({ secondsLeft, cutoffTime }) {
  const isExpired = !secondsLeft || secondsLeft <= 0;
  
  // Color thresholds
  let strokeColor = '#15803d'; // primary green
  let badgeBg = '#EAF3DE';
  let badgeText = '#27500A';

  if (!isExpired) {
    if (secondsLeft <= 300) {
      strokeColor = '#ef4444'; // Red under 5m
      badgeBg = '#fee2e2';
      badgeText = '#991b1b';
    } else if (secondsLeft <= 900) {
      strokeColor = '#F2B01E'; // Amber under 15m
      badgeBg = '#fef3c7';
      badgeText = '#92400e';
    }
  }

  // Format countdown string
  function formatTime(sec) {
    if (!sec || sec <= 0) return '00:00';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins.toString().padStart(2, '0')}m`;
    }
    return `${mins.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  }

  // Ring dimensions
  const size = 52;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Progress fraction based on 1 hour or remaining seconds
  const maxRef = Math.max(3600, secondsLeft || 0);
  const progress = isExpired ? 0 : Math.max(0, Math.min(1, secondsLeft / maxRef));
  const dashoffset = circumference * (1 - progress);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg
          width={size}
          height={size}
          style={{ transform: 'rotate(-90deg)' }}
          aria-hidden="true"
        >
          {/* Background circle track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e2e8f0"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Animated active stroke */}
          {!isExpired && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={dashoffset}
              strokeLinecap="round"
              fill="none"
              style={{
                transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease'
              }}
            />
          )}
        </svg>

        {/* Center icon */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.05rem'
          }}
        >
          {isExpired ? '🔒' : secondsLeft <= 300 ? '⚡' : '⏳'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          Cutoff {cutoffTime || '—'}
        </span>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            background: badgeBg,
            color: badgeText,
            padding: '0.15rem 0.55rem',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: 700,
            marginTop: '2px',
            width: 'fit-content'
          }}
        >
          {isExpired ? 'Cutoff Passed' : `Closes in ${formatTime(secondsLeft)}`}
        </div>
      </div>
    </div>
  );
}
