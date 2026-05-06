import { useSearchParams } from 'react-router-dom';
import { t } from '../i18n/index.js';
import PagePlaceholder from '../components/PagePlaceholder.jsx';

export default function Production() {
  // Phase 1 placeholder. The Dashboard's quick-actions navigate here with
  // ?type=&flavor= so the wizard (Phase 4) can pick them up.
  const [params] = useSearchParams();
  const type = params.get('type');
  const flavor = params.get('flavor');

  return (
    <PagePlaceholder title={t('production.title')}>
      {type && (
        <div className="mt-4 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          {t('production.requestedSelection')}:{' '}
          <span className="font-mono text-foreground">{type}</span>
          {flavor && (
            <>
              {' × '}
              <span className="font-mono text-foreground">{flavor}</span>
            </>
          )}
        </div>
      )}
    </PagePlaceholder>
  );
}
