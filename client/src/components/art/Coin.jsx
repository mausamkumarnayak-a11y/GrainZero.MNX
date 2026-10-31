import React from 'react';

export default function Coin({ size = 24, className = '', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
      aria-hidden="true"
    >
      {/* Outer coin rim with gradient-like amber */}
      <circle cx="12" cy="12" r="10.5" fill="#F2B01E" stroke="#B45309" strokeWidth="1" />
      {/* Inner stamped rim */}
      <circle cx="12" cy="12" r="8.5" fill="#FBBF24" stroke="#D97706" strokeWidth="0.8" strokeDasharray="1.5 1.5" />
      {/* Rupee Symbol ₹ */}
      <path
        d="M8.5 7H15.5M8.5 9.5H14M11.5 9.5C13.5 9.5 14.5 10.5 14.5 12C14.5 13.5 13.5 14.5 11.5 14.5H9.5L14 18.5"
        stroke="#78350F"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Highlight reflection */}
      <path
        d="M6.5 7.5C8 5.5 11 5 13.5 5.5"
        stroke="#FEF3C7"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
