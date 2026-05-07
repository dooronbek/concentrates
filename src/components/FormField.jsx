import { useId } from 'react';
import { cn } from '../lib/utils.js';

const inputClass =
  'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60';

export function FormField({ label, hint, error, required, children }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="block font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {children}
      {error ? (
        <span className="block text-xs text-destructive">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput({ className, error, ...rest }) {
  return (
    <input
      type="text"
      className={cn(inputClass, error && 'border-destructive', 'h-11', className)}
      {...rest}
    />
  );
}

export function NumberInput({ className, error, inputMode = 'decimal', ...rest }) {
  return (
    <input
      type="number"
      inputMode={inputMode}
      className={cn(
        inputClass,
        'h-11 tabular-nums',
        error && 'border-destructive',
        className
      )}
      {...rest}
    />
  );
}

export function TextArea({ className, error, rows = 3, ...rest }) {
  return (
    <textarea
      rows={rows}
      className={cn(inputClass, error && 'border-destructive', className)}
      {...rest}
    />
  );
}

export function SelectInput({ className, error, children, ...rest }) {
  return (
    <select
      className={cn(inputClass, 'h-11', error && 'border-destructive', className)}
      {...rest}
    >
      {children}
    </select>
  );
}

export function ColorInput({ className, ...rest }) {
  return (
    <input
      type="color"
      className={cn(
        'h-11 w-full cursor-pointer rounded-md border border-input bg-background p-1 shadow-sm',
        className
      )}
      {...rest}
    />
  );
}

export function FormActions({ children }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 pt-2">{children}</div>
  );
}

export function PrimaryButton({ className, loading, disabled, children, ...rest }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function SecondaryButton({ className, children, ...rest }) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function DestructiveButton({ className, loading, disabled, children, ...rest }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'flex h-11 items-center justify-center gap-2 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground shadow transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" opacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" />
    </svg>
  );
}

// Hook helper used by a few forms — generates a stable id and returns the
// matching `htmlFor`/`id` pair for label/control wiring.
export function useFieldIds(prefix = 'f') {
  const id = useId();
  return `${prefix}-${id}`;
}
