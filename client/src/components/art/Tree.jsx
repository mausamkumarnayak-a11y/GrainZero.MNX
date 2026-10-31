import React from 'react';

/**
 * A Tree component whose leaves grow based on the kg of food waste saved.
 * Each ~15 kg saved sprouts an additional vibrant leaf on the branches.
 */
export default function Tree({ savedKg = 0, size = 120, className = '', style = {} }) {
  // Compute number of leaves (between 3 and 16)
  const maxLeaves = 16;
  const count = Math.min(maxLeaves, Math.max(3, Math.round(savedKg / 15)));

  // Fixed positions for leaves on the tree canopy
  const leafPositions = [
    { cx: 60, cy: 30, r: 12, rotate: 0 },
    { cx: 45, cy: 42, r: 10, rotate: -25 },
    { cx: 75, cy: 42, r: 10, rotate: 25 },
    { cx: 35, cy: 58, r: 11, rotate: -45 },
    { cx: 85, cy: 58, r: 11, rotate: 45 },
    { cx: 58, cy: 52, r: 13, rotate: 5 },
    { cx: 48, cy: 70, r: 9, rotate: -30 },
    { cx: 72, cy: 70, r: 9, rotate: 30 },
    { cx: 28, cy: 75, r: 8, rotate: -60 },
    { cx: 92, cy: 75, r: 8, rotate: 60 },
    { cx: 60, cy: 68, r: 11, rotate: 0 },
    { cx: 40, cy: 85, r: 8, rotate: -40 },
    { cx: 80, cy: 85, r: 8, rotate: 40 },
    { cx: 60, cy: 45, r: 8, rotate: 15 },
    { cx: 50, cy: 58, r: 7, rotate: -10 },
    { cx: 70, cy: 58, r: 7, rotate: 10 }
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
      aria-label={`Eco-Tree representing ${savedKg} kg food saved`}
      role="img"
    >
      {/* Soil mound */}
      <ellipse cx="60" cy="112" rx="34" ry="6" fill="#EAF3DE" stroke="#4cae4c" strokeWidth="1" />
      <ellipse cx="60" cy="111" rx="22" ry="3" fill="#15803d" fillOpacity="0.15" />

      {/* Trunk and Main Branches */}
      <path
        d="M57 110L57 82C57 78 52 74 46 70M63 110L63 82C63 77 69 72 75 68M60 82L60 52"
        stroke="#78350F"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M60 62L48 50M60 56L72 46M60 48L54 38"
        stroke="#92400E"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Dynamic Leaves */}
      {leafPositions.slice(0, count).map((pos, idx) => {
        // Alternate primary green and lighter accent green
        const isAccent = idx % 3 === 0;
        const color = isAccent ? '#4cae4c' : '#15803d';

        return (
          <g
            key={idx}
            transform={`rotate(${pos.rotate} ${pos.cx} ${pos.cy})`}
            style={{
              transformOrigin: `${pos.cx}px ${pos.cy}px`,
              transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            <path
              d={`M${pos.cx} ${pos.cy - pos.r}C${pos.cx - pos.r * 0.9} ${pos.cy - pos.r * 0.4} ${pos.cx - pos.r * 0.9} ${pos.cy + pos.r * 0.4} ${pos.cx} ${pos.cy + pos.r}C${pos.cx + pos.r * 0.9} ${pos.cy + pos.r * 0.4} ${pos.cx + pos.r * 0.9} ${pos.cy - pos.r * 0.4} ${pos.cx} ${pos.cy - pos.r}Z`}
              fill={color}
              stroke="#EAF3DE"
              strokeWidth="0.8"
            />
            {/* Small golden fruit/grain budding on high-saving trees */}
            {idx % 4 === 1 && (
              <circle cx={pos.cx + 2} cy={pos.cy + 2} r="2.2" fill="#F2B01E" stroke="#b45309" strokeWidth="0.5" />
            )}
          </g>
        );
      })}
    </svg>
  );
}
