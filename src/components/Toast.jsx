import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils.js';

const ToastContext = createContext(null);

const KIND_STYLES = {
  success: {
    container: 'border-success/30 bg-success/10 text-success',
    Icon: CheckCircle2,
  },
  error: {
    container: 'border-destructive/30 bg-destructive/10 text-destructive',
    Icon: AlertTriangle,
  },
  info: {
    container: 'border-border bg-card text-foreground',
    Icon: Info,
  },
};

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    ({ kind = 'info', message, durationMs = 4000 }) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      if (durationMs > 0) {
        setTimeout(() => dismiss(id), durationMs);
      }
      return id;
    },
    [dismiss]
  );

  const value = { push, dismiss };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 py-4 sm:items-end sm:px-6"
      >
        {toasts.map((t) => {
          const { container, Icon } = KIND_STYLES[t.kind] ?? KIND_STYLES.info;
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-card px-3 py-2 text-sm shadow-md',
                container
              )}
            >
              <Icon size={16} className="mt-0.5 shrink-0" />
              <div className="flex-1">{t.message}</div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Закрыть"
                className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-current/60 hover:bg-current/10"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

// Convenience wrapper around an async operation: push a success toast on
// resolve, an error toast on reject. Returns the original promise so callers
// can still await/chain.
export function useAsyncToast() {
  const { push } = useToast();
  return useCallback(
    async (promise, { success, error: errorTemplate } = {}) => {
      try {
        const result = await promise;
        if (success) push({ kind: 'success', message: success });
        return result;
      } catch (err) {
        const msg =
          typeof errorTemplate === 'function'
            ? errorTemplate(err)
            : errorTemplate || err?.message || 'Ошибка';
        push({ kind: 'error', message: msg });
        throw err;
      }
    },
    [push]
  );
}

// Avoid unused-import warning if a screen doesn't use the hook directly.
export { ToastContext };
