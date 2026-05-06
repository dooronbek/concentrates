import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Package,
  PackageX,
  Plus,
} from 'lucide-react';
import { t } from '../i18n/index.js';
import {
  getBatches,
  getConcentrateTypes,
  getFlavors,
  getIngredients,
  getSettings,
} from '../api/db.js';
import { expiryStatus, stockStatus } from '../lib/status.js';
import { formatAmountUnit, formatRelativeDay } from '../lib/format.js';
import { plural, FORMS } from '../lib/pluralize.js';
import { cn } from '../lib/utils.js';
import PageHeader from '../components/PageHeader.jsx';
import Badge from '../components/Badge.jsx';
import { PageError, PageLoading } from '../components/StateView.jsx';

export default function Dashboard() {
  const [data, setData] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getIngredients(),
      getConcentrateTypes(),
      getFlavors(),
      getBatches(),
      getSettings(),
    ])
      .then(([ingredients, types, flavors, batches, settings]) => {
        if (cancelled) return;
        setData({ status: 'ready', ingredients, types, flavors, batches, settings });
      })
      .catch((err) => {
        if (!cancelled) setData({ status: 'error', error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (data.status === 'loading') {
    return (
      <div className="space-y-6">
        <PageHeader title={t('dashboard.title')} />
        <PageLoading />
      </div>
    );
  }
  if (data.status === 'error') {
    return (
      <div className="space-y-6">
        <PageHeader title={t('dashboard.title')} />
        <PageError error={data.error} />
      </div>
    );
  }

  const warningDays = data.settings.expiry_warning_days || 30;
  const activeFlavors = data.flavors.filter((f) => f.active);

  return (
    <div className="space-y-6">
      <PageHeader title={t('dashboard.title')} />
      <AlertsSection ingredients={data.ingredients} warningDays={warningDays} />
      <QuickActions types={data.types} flavors={activeFlavors} />
      <RecentBatches batches={data.batches} />
    </div>
  );
}

function AlertsSection({ ingredients, warningDays }) {
  const { lowStock, expiring, expired } = useMemo(() => {
    const low = [];
    const exp = [];
    const past = [];
    for (const ing of ingredients) {
      if (stockStatus(ing) === 'low') low.push(ing);
      const status = expiryStatus(ing.expiry_date, warningDays);
      if (status.kind === 'expired') past.push({ ...ing, days: status.days });
      else if (status.kind === 'expiring') exp.push({ ...ing, days: status.days });
    }
    low.sort((a, b) => a.name_ru.localeCompare(b.name_ru, 'ru'));
    exp.sort((a, b) => a.days - b.days);
    past.sort((a, b) => a.days - b.days);
    return { lowStock: low, expiring: exp, expired: past };
  }, [ingredients, warningDays]);

  const total = lowStock.length + expiring.length + expired.length;

  if (total === 0) {
    return (
      <section className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success" />
        <div>
          <div className="text-sm font-medium text-success">{t('dashboard.allGood')}</div>
          <div className="mt-1 text-sm text-success/80">
            {t('dashboard.allGoodDescription')}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={18} className="text-warning" />
        <h2 className="text-base font-semibold tracking-tight">
          {t('dashboard.needsAttention')}
        </h2>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {expired.length > 0 && (
          <AlertCard
            tone="danger"
            icon={PackageX}
            title={t('dashboard.expired')}
            count={expired.length}
            countNoun={FORMS.ingredients}
            items={expired.map((ing) => ({
              key: ing.id,
              name: ing.name_ru,
              detail: t('dashboard.expiredDaysAgo', {
                days: plural(Math.abs(ing.days), FORMS.days),
              }),
            }))}
          />
        )}

        {lowStock.length > 0 && (
          <AlertCard
            tone="danger"
            icon={Package}
            title={t('dashboard.lowStock')}
            count={lowStock.length}
            countNoun={FORMS.ingredients}
            items={lowStock.map((ing) => ({
              key: ing.id,
              name: ing.name_ru,
              detail: `${formatAmountUnit(ing.current_stock, ing.unit)} · ${t('dashboard.minimumLabel', { amount: formatAmountUnit(ing.min_threshold, ing.unit) })}`,
            }))}
          />
        )}

        {expiring.length > 0 && (
          <AlertCard
            tone="warning"
            icon={Clock}
            title={t('dashboard.expiringSoon')}
            count={expiring.length}
            countNoun={FORMS.ingredients}
            items={expiring.map((ing) => ({
              key: ing.id,
              name: ing.name_ru,
              detail: t('dashboard.expiringInDays', {
                days: plural(ing.days, FORMS.days),
              }),
            }))}
          />
        )}
      </div>
    </section>
  );
}

function AlertCard({ tone, icon: Icon, title, count, countNoun, items }) {
  const toneClasses =
    tone === 'danger'
      ? 'border-destructive/30 bg-destructive/5'
      : 'border-warning/30 bg-warning/5';
  const iconClass = tone === 'danger' ? 'text-destructive' : 'text-warning';
  return (
    <article className={`rounded-lg border ${toneClasses} p-4`}>
      <header className="mb-3 flex items-center gap-2">
        <Icon size={18} className={iconClass} />
        <h3 className="text-sm font-medium">{title}</h3>
        <Badge variant={tone === 'danger' ? 'danger' : 'warning'} className="ml-auto">
          {plural(count, countNoun)}
        </Badge>
      </header>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-start justify-between gap-3 text-sm">
            <Link
              to="/warehouse"
              className="min-w-0 truncate font-medium hover:underline"
              title={item.name}
            >
              {item.name}
            </Link>
            <span className="shrink-0 text-xs text-muted-foreground">{item.detail}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function QuickActions({ types, flavors }) {
  const navigate = useNavigate();
  const [selectedFlavorId, setSelectedFlavorId] = useState(null);
  const [error, setError] = useState(null);

  if (types.length === 0) return null;

  function handleType(type) {
    if (!type.is_flavor_specific) {
      // Concentrate B: no flavor required, ignore selection.
      navigate(`/production?type=${type.id}`);
      return;
    }
    if (!selectedFlavorId) {
      setError(t('dashboard.selectFlavorFirst'));
      return;
    }
    setError(null);
    navigate(`/production?type=${type.id}&flavor=${selectedFlavorId}`);
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">
          {t('dashboard.quickAction')}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('dashboard.quickActionDescription')}
        </p>
      </div>

      {flavors.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {flavors.map((flavor) => {
            const selected = flavor.id === selectedFlavorId;
            return (
              <button
                key={flavor.id}
                type="button"
                onClick={() => {
                  setSelectedFlavorId(selected ? null : flavor.id);
                  setError(null);
                }}
                aria-pressed={selected}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card hover:bg-accent'
                )}
              >
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-inset ring-border"
                  style={{ backgroundColor: flavor.color_hex || '#e5e7eb' }}
                  aria-hidden="true"
                />
                {flavor.name_ru}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning"
        >
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {types.map((type) => {
          const requiresFlavor = type.is_flavor_specific;
          const ready = !requiresFlavor || !!selectedFlavorId;
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => handleType(type)}
              className={cn(
                'group flex min-h-[88px] flex-col justify-between rounded-lg border bg-card p-4 text-left transition-colors',
                ready
                  ? 'border-border hover:border-primary/40 hover:bg-accent'
                  : 'border-dashed border-border/70 bg-muted/30 hover:border-warning/40'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{type.name_ru}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {requiresFlavor
                      ? `${type.output_quantity} ${type.output_unit} ${t('recipes.perBatch')}`
                      : t('flavors.shared')}
                  </div>
                </div>
                <Plus
                  size={18}
                  className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RecentBatches({ batches }) {
  const recent = batches.slice(0, 5);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight">
          {t('dashboard.recentBatches')}
        </h2>
        {batches.length > 0 && (
          <Link
            to="/journal"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t('common.viewAll')}
            <ChevronRight size={14} />
          </Link>
        )}
      </div>

      {recent.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {t('dashboard.noBatches')}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {recent.map((batch) => (
            <li key={batch.batch_id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {batch.concentrate_type_name_ru}
                  {batch.flavor_name_ru && (
                    <span className="text-muted-foreground"> · {batch.flavor_name_ru}</span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {formatRelativeDay(batch.produced_at)} · {batch.produced_by}
                </div>
              </div>
              <div className="hidden font-mono text-xs text-muted-foreground sm:block">
                {batch.batch_id}
              </div>
              <Badge variant={batch.status === 'cancelled' ? 'danger' : 'success'}>
                {batch.status === 'cancelled'
                  ? t('journal.statusCancelled')
                  : t('journal.statusCompleted')}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
