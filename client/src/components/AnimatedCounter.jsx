import React, { useEffect, useState, useRef } from 'react';

export default function AnimatedCounter({ value, duration = 800, prefix = '', suffix = '', decimals = 0 }) {
  const [displayValue, setDisplayValue] = useState(value);
  const startValRef = useRef(value);
  const targetValRef = useRef(value);

  useEffect(() => {
    targetValRef.current = value;
    const startVal = displayValue;
    startValRef.current = startVal;
    const diff = value - startVal;
    if (diff === 0) return;

    let startTime = null;
    let animId = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startVal + diff * ease;
      setDisplayValue(current);

      if (progress < 1) {
        animId = requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
      }
    }

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [value, duration]);

  return (
    <span>
      {prefix}
      {displayValue.toFixed(decimals)}
      {suffix}
    </span>
  );
}
