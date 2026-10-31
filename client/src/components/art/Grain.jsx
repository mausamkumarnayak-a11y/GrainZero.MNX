import React from 'react';

export default function Grain({ size = 24, color = '#F2B01E', className = '', style = {} }) {
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
      {/* Golden wheat/rice grain */}
      <path
        d="M12 2C7 5 5 11 8 17C9.5 19.5 12 22 12 22C12 22 14.5 19.5 16 17C19 11 17 5 12 2Z"
        fill={color}
      />
      {/* Central spine */}
      <path
        d="M12 3V20"
        stroke="#D97706"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* Small husk accent */}
      <path
        d="M12 7C10.5 8 9.5 10 9 12"
        stroke="#FEF3C7"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M12 12C13.5 13 14.5 15 15 17"
        stroke="#B45309"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
