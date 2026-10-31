import React from 'react';

export default function Leaf({ size = 24, color = '#15803d', accent = '#4cae4c', className = '', style = {} }) {
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
      {/* Primary Leaf Body */}
      <path
        d="M20.5 3.5C14.5 3.5 4 8 3.5 20.5C16 20 20.5 9.5 20.5 3.5Z"
        fill={color}
      />
      {/* Leaf highlight */}
      <path
        d="M20.5 3.5C17.5 5 11 9.5 9 16C12 17.5 17 14 20.5 3.5Z"
        fill={accent}
        fillOpacity="0.45"
      />
      {/* Stem / Spine */}
      <path
        d="M3.5 20.5C7.5 16.5 13 11 20.5 3.5"
        stroke="#EAF3DE"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Veins */}
      <path
        d="M10 14L13 15.5M14 10L17 11.5"
        stroke="#EAF3DE"
        strokeWidth="1"
        strokeLinecap="round"
        strokeOpacity="0.8"
      />
    </svg>
  );
}
