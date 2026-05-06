import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { FlaskRound, Loader2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { t } from '../i18n/index.js';
import { isMockMode } from '../api/db.js';

export default function Login() {
  const { ready, isAuthenticated, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (!ready) {
    return (
      <div className="flex min-h-full items-center justify-center text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    const from = location.state?.from || '/';
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!password || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(password);
      const from = location.state?.from || '/';
      navigate(from, { replace: true });
    } catch (err) {
      const msg =
        err?.status === 401 ? t('auth.wrongPassword') : err?.message ?? t('common.error');
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-10">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8"
        noValidate
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FlaskRound size={24} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t('app.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('app.subtitle')}</p>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-medium">
            {t('auth.password')}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            inputMode="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="block w-full rounded-md border border-input bg-background px-3 py-3 text-base shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 sm:text-sm"
            required
          />
          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!password || submitting}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting && <Loader2 size={16} className="animate-spin" />}
          {submitting ? t('common.loading') : t('auth.signIn')}
        </button>

        {isMockMode() && (
          <p className="text-center text-xs text-muted-foreground">
            {t('auth.mockHint')}
          </p>
        )}
      </form>
    </div>
  );
}
