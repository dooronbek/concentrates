import { AlertTriangle, Loader2 } from 'lucide-react';
import { t } from '../i18n/index.js';

export function PageLoading() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
      <Loader2 size={16} className="animate-spin" />
      <span>{t('common.loading')}</span>
    </div>
  );
}

export function PageError({ error }) {
  const message = typeof error === 'string' ? error : error?.message ?? t('common.error');
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div>
        <div className="font-medium">{t('common.error')}</div>
        <div className="mt-1 text-destructive/80">{message}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, description }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
      <div className="text-sm font-medium">{title}</div>
      {description && (
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      )}
    </div>
  );
}
