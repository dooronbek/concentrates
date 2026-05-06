import React from 'react';
import { AlertTriangle } from 'lucide-react';

// Top-level error boundary. Catches any render-time exception below it and
// shows a Russian fallback screen with a reload button instead of a white
// page. Wrapped around <App /> in main.jsx so a single screen bug never
// brings down the whole PWA.
//
// React error boundaries must be class components — there's no hook
// equivalent that captures lifecycle errors.

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface to devtools in any mode — production-tracking app, we want a
    // visible signal even after a deploy.
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const isDev = import.meta.env.DEV;
    return (
      <div className="flex min-h-full items-center justify-center bg-background px-4 py-10 text-foreground">
        <div className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-destructive/15 text-destructive">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Что-то пошло не так
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Перезагрузите страницу. Если ошибка повторится, сообщите администратору.
              </p>
            </div>
          </div>

          {isDev && this.state.error?.message && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              {String(this.state.error.message)}
            </pre>
          )}

          <button
            type="button"
            onClick={this.handleReload}
            className="flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-opacity hover:opacity-90"
          >
            Перезагрузить
          </button>
        </div>
      </div>
    );
  }
}
