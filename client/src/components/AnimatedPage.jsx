import React from 'react';
import { motion } from 'framer-motion';

export default function AnimatedPage({ children, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
      className={`animated-page-wrapper ${className}`}
    >
      {children}
    </motion.div>
  );
}

