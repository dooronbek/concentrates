import { t } from '../i18n/index.js';

export default function PagePlaceholder({ title, children }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
          {t('phase.label')}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{t('common.soon')}</p>
      {children}
    </div>
  );
}
