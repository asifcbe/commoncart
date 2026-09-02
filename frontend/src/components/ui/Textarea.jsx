import React from 'react';
import { cn } from '../../utils/cn';

const Textarea = React.forwardRef(({ className, rows = 3, ...props }, ref) => (
  <textarea
    rows={rows}
    className={cn(
      'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y',
      className
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export default Textarea;
