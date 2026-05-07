import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils.js';

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  }[size] ?? 'max-w-xl';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <div
        onClick={() => {
          if (closeOnBackdrop) onClose?.();
        }}
        aria-hidden="true"
        className="absolute inset-0 bg-black/50"
      />
      <div
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col rounded-t-xl border border-border bg-card shadow-xl sm:rounded-xl',
          sizeClass
        )}
      >
        {(title || onClose) && (
          <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              {title && (
                <h2 className="truncate text-lg font-semibold tracking-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 text-xs text-muted-foreground">{description}</p>
              )}
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-foreground/70 hover:bg-accent"
              >
                <X size={18} />
              </button>
            )}
          </header>
        )}

        <div className="flex-1 overflow-y-auto p-5">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
