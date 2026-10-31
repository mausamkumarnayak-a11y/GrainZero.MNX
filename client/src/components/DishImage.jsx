import React, { useState } from 'react';
import DishIllustration from './art/DishIllustration';

export default function DishImage({ src, alt = 'Dish', size = 48, className = '' }) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return <DishIllustration size={size} className={className} />;
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setHasError(true)}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        border: '1.5px solid #EAF3DE'
      }}
      className={className}
    />
  );
}
