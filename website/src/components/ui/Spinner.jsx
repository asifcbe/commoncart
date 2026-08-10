import React from 'react';
export default function Spinner({ size = 'md', className = '' }) {
  const s = { sm: 'h-4 w-4 border-2', md: 'h-7 w-7 border-2', lg: 'h-10 w-10 border-[3px]' }[size];
  return (
    <div className={`animate-spin rounded-full border-gray-200 border-t-[var(--color-primary)] ${s} ${className}`} />
  );
}
