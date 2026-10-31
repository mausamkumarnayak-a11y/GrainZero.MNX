import React from 'react';

export default function Plate({
  size = 28,
  skipped = false,
  className = '',
  style = {},
  title = ''
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', transition: 'all 0.3s ease', ...style }}
      aria-label={title || (skipped ? 'Skipped plate' : 'Attending plate')}
      role="img"
    >
      {skipped ? (
        // Skipped: Dashed gentle outline indicating saved/unserved meal
        <g opacity="0.45">
          <circle
            cx="16"
            cy="16"
            r="14"
            stroke="#9ca3af"
            strokeWidth="1.8"
            strokeDasharray="3 3"
            fill="none"
          />
          <circle
            cx="16"
            cy="16"
            r="9.5"
            stroke="#d1d5db"
            strokeWidth="1"
            strokeDasharray="2 2"
            fill="#f9fafb"
          />
          <path
            d="M13 19L19 13M13 13L19 19"
            stroke="#9ca3af"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </g>
      ) : (
        // Attending: Solid thali plate with katoris (bowls)
        <g>
          {/* Outer plate rim */}
          <circle
            cx="16"
            cy="16"
            r="14.5"
            fill="#EAF3DE"
            stroke="#15803d"
            strokeWidth="1.5"
          />
          {/* Inner plate well */}
          <circle
            cx="16"
            cy="16"
            r="11"
            fill="#ffffff"
            stroke="#4cae4c"
            strokeWidth="1"
          />
          {/* Katori 1 (Dal) */}
          <circle cx="11.5" cy="11.5" r="3.2" fill="#F2B01E" fillOpacity="0.85" stroke="#d97706" strokeWidth="0.8" />
          {/* Katori 2 (Sabzi) */}
          <circle cx="20.5" cy="11.5" r="3.2" fill="#15803d" fillOpacity="0.75" stroke="#166534" strokeWidth="0.8" />
          {/* Katori 3 (Raita/Curd) */}
          <circle cx="20" cy="19.5" r="3" fill="#f3f4f6" stroke="#9ca3af" strokeWidth="0.8" />
          {/* Rice / Roti in center-bottom */}
          <ellipse cx="12.5" cy="19.5" rx="3.5" ry="2.5" fill="#fef08a" stroke="#ca8a04" strokeWidth="0.8" />
        </g>
      )}
    </svg>
  );
}
