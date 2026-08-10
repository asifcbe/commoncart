import React from 'react';
import { cn } from '../../utils/cn';

export default function Spinner({ className, size = 'default' }) {
  const sizes = { sm: 'h-4 w-4', default: 'h-6 w-6', lg: 'h-8 w-8' };
  return (
    <div
      className={cn(
        'animate-spin rounded-full border-2 border-gray-200 border-t-primary',
        sizes[size],
        className
      )}
    />
  );
}
