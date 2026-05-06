import { useEffect, useMemo, useState } from 'react';
import { Info, X, AlertTriangle } from 'lucide-react';
import { t } from '../i18n/index.js';
import {
  getConcentrateTypes,
  getFlavors,
  getIngredients,
  getRecipeVariants,
} from '../api/db.js';
import { resolveRecipe, variantOverrideCount } from '../lib/resolveRecipe.js';
import { formatAmountUnit } from '../lib/format.js';
import { plural, FORMS } from '../lib/pluralize.js';
import { cn } from '../lib/utils.js';
import PageHeader from '../components/PageHeader.jsx';
import Badge from '../components/Badge.jsx';
import { EmptyState, PageError, PageLoading } from '../components/StateView.jsx';

export default function Recipes() {
  const [data, setData] = useState({ status: 'loading' });
  const [open, setOpen] = useState(null); // { type, flavor, variant }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getConcentrateTypes(),
      getFlavors(),
      getRecipeVariants(),
      getIngredients(),
    ])
      .then(([types, flavors, variants, ingredients]) => {
        if (!cancelled) {
          setData({ status: 'ready', types, flavors, variants, ingredients });
        }
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
        <PageHeader title={t('recipes.title')} />
        <PageLoading />
      </div>
    );
  }
  if (data.status === 'error') {
    return (
      <div className="space-y-6">
        <PageHeader title={t('recipes.title')} />
        <PageError error={data.error} />
      </div>
    );
  }

  const sharedTypes = data.types.filter((tp) => !tp.is_flavor_specific);
  const flavoredTypes = data.types.filter((tp) => tp.is_flavor_specific);
  const activeFlavors = data.flavors.filter((f) => f.active);

  const variantByKey = new Map(
    data.variants.map((v) => [`${v.concentrate_type_id}__${v.flavor_id}`, v])
  );

  return (
    <div className="space-y-8">
      <PageHeader title={t('recipes.title')} subtitle={t('recipes.subtitle')} />

      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>{t('recipes.readOnlyHint')}</span>
      </div>

      {sharedTypes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">
            {t('recipes.commonRecipes')}
          </h2>
          <div className="space-y-4">
            {sharedTypes.map((tp) => (
              <SharedRecipeCard key={tp.id} type={tp} ingredients={data.ingredients} />
            ))}
          </div>
        </section>
      )}

      {flavoredTypes.length > 0 && activeFlavors.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">
            {t('recipes.byFlavor')}
          </h2>
          <div className="space-y-4">
            {flavoredTypes.map((tp) => (
              <FlavorGridCard
                key={tp.id}
                type={tp}
                flavors={activeFlavors}
                variantByKey={variantByKey}
                onOpen={(flavor, variant) =>
                  setOpen({ type: tp, flavor, variant })
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          {t('recipes.manageFlavors')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('recipes.manageFlavorsHint')}</p>
        <FlavorList flavors={data.flavors} />
      </section>

      {open && (
        <RecipeModal
          type={open.type}
          flavor={open.flavor}
          variant={open.variant}
          ingredients={data.ingredients}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function SharedRecipeCard({ type, ingredients }) {
  const resolved = useMemo(
    () => resolveRecipe({ concentrateType: type, ingredients }),
    [type, ingredients]
  );

  return (
    <article className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{type.name_ru}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('recipes.sharedRecipeHint')}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('recipes.outputQuantity')}:{' '}
          <span className="font-medium text-foreground">
            {formatAmountUnit(type.output_quantity, type.output_unit)}
          </span>
        </p>
      </header>

      <div className="grid gap-6 p-5 lg:grid-cols-[3fr,2fr]">
        <CompositionList composition={resolved.composition} />
        <ProtocolList steps={resolved.protocol} />
      </div>
    </article>
  );
}

function FlavorGridCard({ type, flavors, variantByKey, onOpen }) {
  return (
    <article className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-4">
        <h3 className="text-lg font-semibold tracking-tight">{type.name_ru}</h3>
        <p className="text-sm text-muted-foreground">
          {t('recipes.outputQuantity')}:{' '}
          <span className="font-medium text-foreground">
            {formatAmountUnit(type.output_quantity, type.output_unit)}
          </span>
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        {flavors.map((flavor) => {
          const variant = variantByKey.get(`${type.id}__${flavor.id}`);
          const count = variantOverrideCount(variant);
          const label = !variant
            ? t('recipes.noVariant')
            : count === 0
              ? t('recipes.baseOnly')
              : t('recipes.basePlusN', {
                  count: plural(count, FORMS.changes),
                });

          return (
            <button
              key={flavor.id}
              type="button"
              onClick={() => onOpen(flavor, variant)}
              className={cn(
                'group flex min-h-[88px] flex-col items-start gap-2 rounded-lg border border-border bg-background p-3 text-left transition-colors',
                'hover:border-primary/40 hover:bg-accent',
                !variant && 'border-dashed bg-muted/30'
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-inset ring-border"
                  style={{ backgroundColor: flavor.color_hex || '#e5e7eb' }}
                  aria-hidden="true"
                />
                <span className="text-sm font-medium">{flavor.name_ru}</span>
              </div>
              <span
                className={cn(
                  'text-xs',
                  variant ? 'text-muted-foreground' : 'italic text-muted-foreground/80'
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

function FlavorList({ flavors }) {
  if (flavors.length === 0) {
    return <EmptyState title={t('common.noResults')} />;
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {flavors.map((flavor) => (
        <li
          key={flavor.id}
          className="flex items-center gap-3 px-4 py-3 text-sm"
        >
          <span
            className="inline-block h-5 w-5 shrink-0 rounded-md ring-1 ring-inset ring-border"
            style={{ backgroundColor: flavor.color_hex || '#e5e7eb' }}
            aria-hidden="true"
          />
          <span className="flex-1 font-medium">{flavor.name_ru}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {flavor.color_hex || '—'}
          </span>
          <Badge variant={flavor.active ? 'success' : 'outline'}>
            {flavor.active ? t('flavors.active') : t('flavors.inactive')}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function CompositionList({ composition }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
        {t('recipes.composition')}
      </h3>
      {composition.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {composition.map((entry, index) => (
            <li
              key={`${entry.ingredient_id}-${index}`}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">{entry.name_ru}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatAmountUnit(entry.amount, entry.unit)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProtocolList({ steps }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
        {t('recipes.protocol')}
      </h3>
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ol className="space-y-2 text-sm">
          {steps.map((step, index) => (
            <li key={index} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground tabular-nums">
                {index + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RecipeModal({ type, flavor, variant, ingredients, onClose }) {
  // Trap Escape and lock body scroll while open.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const resolved = useMemo(
    () => resolveRecipe({ concentrateType: type, flavor, variant, ingredients }),
    [type, flavor, variant, ingredients]
  );

  const overrideCount = variantOverrideCount(variant);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <div
        onClick={onClose}
        aria-hidden="true"
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-t-xl border border-border bg-card shadow-xl sm:rounded-xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-inset ring-border"
                style={{ backgroundColor: flavor.color_hex || '#e5e7eb' }}
                aria-hidden="true"
              />
              <h2 className="truncate text-lg font-semibold tracking-tight">
                {type.name_ru} · {flavor.name_ru}
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {!variant
                ? t('recipes.variantNotConfigured')
                : overrideCount === 0
                  ? t('recipes.baseOnly')
                  : t('recipes.basePlusN', {
                      count: plural(overrideCount, FORMS.changes),
                    })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-foreground/70 hover:bg-accent"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {resolved.warnings.length > 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <ul className="space-y-1">
                {resolved.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[3fr,2fr]">
            <CompositionList composition={resolved.composition} />
            <ProtocolList steps={resolved.protocol} />
          </div>

          {variant?.notes && (
            <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
              {variant.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
