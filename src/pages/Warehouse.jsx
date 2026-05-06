import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n/index.js';
import { getIngredients, getSettings } from '../api/db.js';
import { expiryStatus, stockStatus } from '../lib/status.js';
import { formatAmount, formatAmountUnit, formatDate, formatRelativeDay } from '../lib/format.js';
import { plural, FORMS } from '../lib/pluralize.js';
import PageHeader from '../components/PageHeader.jsx';
import Badge from '../components/Badge.jsx';
import { EmptyState, PageError, PageLoading } from '../components/StateView.jsx';

export default function Warehouse() {
  const [data, setData] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getIngredients(), getSettings()])
      .then(([ingredients, settings]) => {
        if (!cancelled) setData({ status: 'ready', ingredients, settings });
      })
      .catch((err) => {
        if (!cancelled) setData({ status: 'error', error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => {
    if (data.status !== 'ready') return [];
    return [...data.ingredients].sort((a, b) =>
      a.name_ru.localeCompare(b.name_ru, 'ru')
    );
  }, [data]);

  if (data.status === 'loading') {
    return (
      <div className="space-y-6">
        <PageHeader title={t('warehouse.title')} />
        <PageLoading />
      </div>
    );
  }
  if (data.status === 'error') {
    return (
      <div className="space-y-6">
        <PageHeader title={t('warehouse.title')} />
        <PageError error={data.error} />
      </div>
    );
  }

  const warningDays = data.settings.expiry_warning_days || 30;
  const subtitle = plural(sorted.length, FORMS.ingredients);

  return (
    <div className="space-y-6">
      <PageHeader title={t('warehouse.title')} subtitle={subtitle} />

      {sorted.length === 0 ? (
        <EmptyState title={t('warehouse.noIngredients')} />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {sorted.map((item) => (
              <IngredientCard key={item.id} item={item} warningDays={warningDays} />
            ))}
          </div>
          <div className="hidden md:block">
            <IngredientTable items={sorted} warningDays={warningDays} />
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadges({ item, warningDays }) {
  const stock = stockStatus(item);
  const expiry = expiryStatus(item.expiry_date, warningDays);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {stock === 'low' && <Badge variant="danger">{t('warehouse.lowStock')}</Badge>}
      {expiry.kind === 'expired' && (
        <Badge variant="danger">{t('warehouse.expired')}</Badge>
      )}
      {expiry.kind === 'expiring' && (
        <Badge variant="warning">{t('warehouse.expiringSoon')}</Badge>
      )}
    </div>
  );
}

function IngredientTable({ items, warningDays }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left font-medium">{t('warehouse.name')}</th>
            <th className="px-4 py-3 text-right font-medium">{t('warehouse.stock')}</th>
            <th className="px-4 py-3 text-right font-medium">
              {t('warehouse.minThreshold')}
            </th>
            <th className="px-4 py-3 text-left font-medium">{t('warehouse.expiryDate')}</th>
            <th className="px-4 py-3 text-left font-medium">{t('warehouse.lotNumber')}</th>
            <th className="px-4 py-3 text-left font-medium">{t('warehouse.supplier')}</th>
            <th className="px-4 py-3 text-left font-medium">{t('warehouse.updatedAt')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-accent/40">
              <td className="px-4 py-3 align-top">
                <div className="font-medium">{item.name_ru}</div>
                <div className="mt-1">
                  <StatusBadges item={item} warningDays={warningDays} />
                </div>
                {item.notes && (
                  <div className="mt-1 text-xs text-muted-foreground">{item.notes}</div>
                )}
              </td>
              <td className="px-4 py-3 text-right align-top tabular-nums">
                {formatAmountUnit(item.current_stock, item.unit)}
              </td>
              <td className="px-4 py-3 text-right align-top tabular-nums text-muted-foreground">
                {formatAmount(item.min_threshold)}
              </td>
              <td className="px-4 py-3 align-top tabular-nums">
                {formatDate(item.expiry_date)}
              </td>
              <td className="px-4 py-3 align-top text-muted-foreground">
                {item.lot_number || '—'}
              </td>
              <td className="px-4 py-3 align-top text-muted-foreground">
                {item.supplier || '—'}
              </td>
              <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                {formatRelativeDay(item.updated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IngredientCard({ item, warningDays }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{item.name_ru}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{item.supplier || '—'}</p>
        </div>
        <div className="text-right tabular-nums">
          <div className="text-sm font-semibold">
            {formatAmountUnit(item.current_stock, item.unit)}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('warehouse.minThreshold').toLowerCase()}: {formatAmount(item.min_threshold)}
          </div>
        </div>
      </header>

      <div className="mt-3">
        <StatusBadges item={item} warningDays={warningDays} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">{t('warehouse.expiryDate')}</dt>
        <dd className="text-right tabular-nums">{formatDate(item.expiry_date)}</dd>
        <dt className="text-muted-foreground">{t('warehouse.lotNumber')}</dt>
        <dd className="truncate text-right">{item.lot_number || '—'}</dd>
        <dt className="text-muted-foreground">{t('warehouse.updatedAt')}</dt>
        <dd className="text-right">{formatRelativeDay(item.updated_at)}</dd>
      </dl>

      {item.notes && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          {item.notes}
        </p>
      )}
    </article>
  );
}
