import { cn } from '../lib/utils.js';

const variants = {
  neutral: 'bg-secondary text-secondary-foreground',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
  outline: 'border border-border bg-transparent text-muted-foreground',
};

export default function Badge({ variant = 'neutral', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        variants[variant] ?? variants.neutral,
        className
      )}
    >
      {children}
    </span>
  );
}
