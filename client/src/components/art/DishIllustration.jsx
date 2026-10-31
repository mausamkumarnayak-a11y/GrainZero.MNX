import React from 'react';

export default function DishIllustration({ size = 48, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Bowl / Plate base */}
      <circle cx="32" cy="32" r="30" fill="#EAF3DE" stroke="#4cae4c" strokeWidth="2" />
      <circle cx="32" cy="32" r="23" fill="#ffffff" stroke="#cde3b6" strokeWidth="1.5" />
      
      {/* Curry / Food in bowl */}
      <circle cx="32" cy="32" r="17" fill="#F2B01E" fillOpacity="0.85" />
      
      {/* Garnish leaf & seasoning */}
      <path
        d="M32 23 C34 20, 38 21, 38 24 C38 27, 34 28, 32 28 C30 28, 26 27, 26 24 C26 21, 30 20, 32 23 Z"
        fill="#15803d"
      />
      <circle cx="28" cy="34" r="2" fill="#27500A" opacity="0.6" />
      <circle cx="35" cy="36" r="2.5" fill="#27500A" opacity="0.5" />
      <circle cx="32" cy="40" r="1.5" fill="#27500A" opacity="0.7" />
      
      {/* Gentle steam curls */}
      <path
        d="M26 12 C25 9, 28 8, 27 5"
        stroke="#4cae4c"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      <path
        d="M35 11 C34 8, 37 7, 36 4"
        stroke="#4cae4c"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
    </svg>
  );
}

