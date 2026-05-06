import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n/index.js';
import { getBatches, getConcentrateTypes, getFlavors } from '../api/db.js';
import { formatAmount, formatDateTime, formatRelativeDay } from '../lib/format.js';
import { plural, FORMS } from '../lib/pluralize.js';
import PageHeader from '../components/PageHeader.jsx';
import Badge from '../components/Badge.jsx';
import { EmptyState, PageError, PageLoading } from '../components/StateView.jsx';

export default function BatchJournal() {
  const [data, setData] = useState({ status: 'loading' });
  const [typeFilter, setTypeFilter] = useState('');
  const [flavorFilter, setFlavorFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([getBatches(), getConcentrateTypes(), getFlavors()])
      .then(([batches, types, flavors]) => {
        if (!cancelled) setData({ status: 'ready', batches, types, flavors });
      })
      .catch((err) => {
        if (!cancelled) setData({ status: 'error', error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (data.status !== 'ready') return [];
    return data.batches.filter((b) => {
      if (typeFilter && b.concentrate_type_id !== typeFilter) return false;
      if (flavorFilter && (b.flavor_id ?? '') !== flavorFilter) return false;
      return true;
    });
  }, [data, typeFilter, flavorFilter]);

  if (data.status === 'loading') {
    return (
      <div className="space-y-6">
        <PageHeader title={t('journal.title')} />
        <PageLoading />
      </div>
    );
  }
  if (data.status === 'error') {
    return (
      <div className="space-y-6">
        <PageHeader title={t('journal.title')} />
        <PageError error={data.error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('journal.title')}
        subtitle={plural(data.batches.length, FORMS.batches)}
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-muted-foreground">
            {t('journal.filterRecipe')}
          </span>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="h-11 min-w-[12rem] rounded-md border border-input bg-card px-3 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          >
            <option value="">{t('common.all')}</option>
            {data.types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name_ru}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-muted-foreground">
            {t('journal.filterFlavor')}
          </span>
          <select
            value={flavorFilter}
            onChange={(event) => setFlavorFilter(event.target.value)}
            className="h-11 min-w-[12rem] rounded-md border border-input bg-card px-3 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          >
            <option value="">{t('journal.allFlavors')}</option>
            {data.flavors.map((flavor) => (
              <option key={flavor.id} value={flavor.id}>
                {flavor.name_ru}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t('journal.noBatches')} />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {filtered.map((batch) => (
              <BatchCard key={batch.batch_id} batch={batch} />
            ))}
          </div>
          <div className="hidden md:block">
            <BatchTable batches={filtered} flavors={data.flavors} />
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'cancelled') {
    return <Badge variant="danger">{t('journal.statusCancelled')}</Badge>;
  }
  return <Badge variant="success">{t('journal.statusCompleted')}</Badge>;
}

function FlavorCell({ batch, flavors }) {
  if (!batch.flavor_id) {
    return <span className="text-muted-foreground">{t('journal.noFlavor')}</span>;
  }
  const flavor = flavors.find((f) => f.id === batch.flavor_id);
  const color = flavor?.color_hex;
  return (
    <span className="inline-flex items-center gap-2">
      {color && (
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-border"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      )}
      <span>{batch.flavor_name_ru ?? flavor?.name_ru ?? batch.flavor_id}</span>
    </span>
  );
}

function BatchTable({ batches, flavors }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left font-medium">{t('journal.batchId')}</th>
            <th className="px-4 py-3 text-left font-medium">
              {t('journal.concentrateType')}
            </th>
            <th className="px-4 py-3 text-left font-medium">
              {t('journal.flavorColumn')}
            </th>
            <th className="px-4 py-3 text-left font-medium">{t('journal.producedAt')}</th>
            <th className="px-4 py-3 text-left font-medium">{t('journal.producedBy')}</th>
            <th className="px-4 py-3 text-right font-medium">{t('journal.quantity')}</th>
            <th className="px-4 py-3 text-right font-medium">
              {t('journal.ingredientsUsed')}
            </th>
            <th className="px-4 py-3 text-left font-medium">{t('journal.status')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {batches.map((batch) => (
            <tr key={batch.batch_id} className="align-top hover:bg-accent/40">
              <td className="px-4 py-3 font-mono text-xs">{batch.batch_id}</td>
              <td className="px-4 py-3 font-medium">{batch.concentrate_type_name_ru}</td>
              <td className="px-4 py-3">
                <FlavorCell batch={batch} flavors={flavors} />
              </td>
              <td className="px-4 py-3 tabular-nums">
                {formatDateTime(batch.produced_at)}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{batch.produced_by}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatAmount(batch.quantity)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                {batch.ingredients_used?.length ?? 0}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={batch.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BatchCard({ batch }) {
  return (
    <article className="space-y-2 rounded-lg border border-border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">
            {batch.concentrate_type_name_ru}
            {batch.flavor_name_ru && (
              <span className="text-muted-foreground"> · {batch.flavor_name_ru}</span>
            )}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {batch.batch_id}
          </p>
        </div>
        <StatusBadge status={batch.status} />
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t('journal.producedAt')}</dt>
        <dd className="text-right tabular-nums">
          {formatRelativeDay(batch.produced_at)}
        </dd>
        <dt className="text-muted-foreground">{t('journal.producedBy')}</dt>
        <dd className="truncate text-right">{batch.produced_by}</dd>
        <dt className="text-muted-foreground">{t('journal.quantity')}</dt>
        <dd className="text-right tabular-nums">{formatAmount(batch.quantity)}</dd>
        <dt className="text-muted-foreground">{t('journal.ingredientsUsed')}</dt>
        <dd className="text-right tabular-nums">
          {plural(batch.ingredients_used?.length ?? 0, FORMS.items)}
        </dd>
      </dl>

      {batch.notes && (
        <p className="border-t border-border pt-2 text-xs text-muted-foreground">
          {batch.notes}
        </p>
      )}
    </article>
  );
}
