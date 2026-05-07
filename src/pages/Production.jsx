import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Package,
  Save,
  XCircle,
} from 'lucide-react';
import { t } from '../i18n/index.js';
import {
  createBatch,
  getConcentrateTypes,
  getFlavors,
  getIngredients,
  getRecipeVariants,
  getSettings,
} from '../api/db.js';
import { blockingProblems, checkStock, planProduction } from '../lib/production.js';
import { formatAmount, formatAmountUnit } from '../lib/format.js';
import { cn } from '../lib/utils.js';
import PageHeader from '../components/PageHeader.jsx';
import Badge from '../components/Badge.jsx';
import { PageError, PageLoading } from '../components/StateView.jsx';
import {
  FormField,
  NumberInput,
  PrimaryButton,
  SecondaryButton,
  TextArea,
  TextInput,
} from '../components/FormField.jsx';
import { useToast } from '../components/Toast.jsx';

const STEPS = [
  'production.step1',
  'production.step2',
  'production.step3',
  'production.step5', // step 4 in UI = "confirmation/save" — using step5 i18n key for the title
];

export default function Production() {
  const [params] = useSearchParams();
  const initialType = params.get('type') || '';
  const initialFlavor = params.get('flavor') || '';

  const [data, setData] = useState({ status: 'loading' });
  const [step, setStep] = useState(1);
  const [typeId, setTypeId] = useState(initialType);
  const [flavorId, setFlavorId] = useState(initialFlavor);
  const [multiplier, setMultiplier] = useState(1);
  const [checked, setChecked] = useState(new Set());
  const [notes, setNotes] = useState('');
  const [producedAt, setProducedAt] = useState(() => isoForLocalInput(new Date()));
  const [producedBy, setProducedBy] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getConcentrateTypes(),
      getFlavors(),
      getRecipeVariants(),
      getIngredients(),
      getSettings(),
    ])
      .then(([types, flavors, variants, ingredients, settings]) => {
        if (cancelled) return;
        setData({ status: 'ready', types, flavors, variants, ingredients, settings });
        if (!producedBy && settings.operator_name) setProducedBy(settings.operator_name);
      })
      .catch((err) => {
        if (!cancelled) setData({ status: 'error', error: err.message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived state — all `useMemo` calls live above the early returns so the
  // hook order is identical on every render. Each factory handles the
  // not-ready data shape internally.
  const ingredientsById = useMemo(() => {
    if (data.status !== 'ready') return new Map();
    return new Map(data.ingredients.map((i) => [i.id, i]));
  }, [data]);

  const planned = useMemo(() => {
    if (data.status !== 'ready') return null;
    const type = data.types.find((tp) => tp.id === typeId);
    if (!type) return null;
    if (type.is_flavor_specific && !flavorId) return null;
    const flavor = data.flavors.find((f) => f.id === flavorId) || null;
    const variant =
      type.is_flavor_specific && flavor
        ? data.variants.find(
            (v) =>
              v.concentrate_type_id === type.id && v.flavor_id === flavor.id
          ) || null
        : null;
    return planProduction({
      concentrateType: type,
      flavor,
      variant,
      ingredients: data.ingredients,
      multiplier,
    });
  }, [data, typeId, flavorId, multiplier]);

  const stockRows = useMemo(() => {
    if (!planned) return [];
    return checkStock(planned.composition, ingredientsById);
  }, [planned, ingredientsById]);

  const blockers = useMemo(() => {
    if (!planned) return [];
    return blockingProblems(planned);
  }, [planned]);

  if (data.status === 'loading') {
    return (
      <div className="space-y-6">
        <PageHeader title={t('production.title')} />
        <PageLoading />
      </div>
    );
  }
  if (data.status === 'error') {
    return (
      <div className="space-y-6">
        <PageHeader title={t('production.title')} />
        <PageError error={data.error} />
      </div>
    );
  }

  const type = data.types.find((tp) => tp.id === typeId) || null;
  const flavor = data.flavors.find((f) => f.id === flavorId) || null;
  const stockOk = stockRows.every((r) => r.status === 'ok');
  const allStepsChecked = planned ? planned.protocol.every((_, i) => checked.has(i)) : false;

  function toggleStep(index) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function canAdvance() {
    if (step === 1) {
      if (!type) return false;
      if (type.is_flavor_specific && !flavor) return false;
      const m = Number(multiplier);
      return Number.isFinite(m) && m > 0;
    }
    if (step === 2) return stockOk && blockers.length === 0;
    if (step === 3) return allStepsChecked;
    return false;
  }

  async function handleSave() {
    if (saving) return;
    if (!planned || !type) return;
    setSaving(true);
    try {
      const ingredientsUsed = planned.composition.map((entry) => {
        const ing = ingredientsById.get(entry.ingredient_id);
        return {
          ingredient_id: entry.ingredient_id,
          name_ru: ing?.name_ru ?? entry.ingredient_id,
          amount: Number(entry.amount),
          unit: entry.unit,
          lot_number: ing?.lot_number ?? null,
        };
      });
      const batch = await createBatch({
        concentrate_type_id: type.id,
        flavor_id: flavor?.id ?? null,
        produced_at: localInputToIso(producedAt),
        produced_by: producedBy.trim() || 'оператор',
        quantity: Number(multiplier) || 1,
        ingredients_used: ingredientsUsed,
        notes: notes.trim(),
        shift_id: null,
      });
      toast.push({
        kind: 'success',
        message: t('production.batchSaved', { batchId: batch.batch_id }),
      });
      navigate('/');
    } catch (err) {
      toast.push({
        kind: 'error',
        message: `${t('production.saveError')}: ${err.message}`,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('production.title')}
        subtitle={t('production.single')}
      />

      <StepIndicator step={step} total={4} />

      {step === 1 && (
        <Step1
          types={data.types}
          flavors={data.flavors.filter((f) => f.active)}
          typeId={typeId}
          flavorId={flavorId}
          multiplier={multiplier}
          onTypeChange={(id) => {
            setTypeId(id);
            const tp = data.types.find((x) => x.id === id);
            if (tp && !tp.is_flavor_specific) setFlavorId('');
          }}
          onFlavorChange={setFlavorId}
          onMultiplierChange={setMultiplier}
        />
      )}

      {step === 2 && (
        <Step2 stockRows={stockRows} blockers={blockers} ok={stockOk} />
      )}

      {step === 3 && planned && (
        <Step3
          steps={planned.protocol}
          checked={checked}
          onToggle={toggleStep}
        />
      )}

      {step === 4 && planned && (
        <Step4
          type={type}
          flavor={flavor}
          multiplier={multiplier}
          composition={planned.composition}
          notes={notes}
          onNotesChange={setNotes}
          producedAt={producedAt}
          onProducedAtChange={setProducedAt}
          producedBy={producedBy}
          onProducedByChange={setProducedBy}
        />
      )}

      <Navigation
        step={step}
        canAdvance={canAdvance()}
        saving={saving}
        onBack={() => setStep((s) => s - 1)}
        onContinue={() => setStep((s) => s + 1)}
        onSave={handleSave}
      />
    </div>
  );
}

function StepIndicator({ step, total }) {
  return (
    <ol className="flex items-center gap-1 sm:gap-3">
      {Array.from({ length: total }).map((_, i) => {
        const n = i + 1;
        const status =
          n < step ? 'done' : n === step ? 'current' : 'upcoming';
        return (
          <li
            key={n}
            className="flex flex-1 items-center gap-2 text-xs"
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums',
                status === 'done' && 'border-success bg-success text-success-foreground',
                status === 'current' && 'border-primary bg-primary text-primary-foreground',
                status === 'upcoming' && 'border-border text-muted-foreground'
              )}
            >
              {status === 'done' ? <Check size={14} /> : n}
            </span>
            <span
              className={cn(
                'hidden truncate sm:block',
                status === 'upcoming' && 'text-muted-foreground'
              )}
            >
              {t(STEPS[i])}
            </span>
            {i < total - 1 && (
              <span
                className={cn(
                  'mx-1 hidden h-px flex-1 sm:block',
                  status === 'done' ? 'bg-success/40' : 'bg-border'
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Step1({
  types,
  flavors,
  typeId,
  flavorId,
  multiplier,
  onTypeChange,
  onFlavorChange,
  onMultiplierChange,
}) {
  const selectedType = types.find((tp) => tp.id === typeId);
  const flavorRequired = selectedType?.is_flavor_specific;

  return (
    <div className="space-y-6 rounded-lg border border-border bg-card p-5">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold tracking-tight">
          {t('production.selectType')}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((tp) => (
            <button
              key={tp.id}
              type="button"
              onClick={() => onTypeChange(tp.id)}
              className={cn(
                'flex min-h-[88px] flex-col justify-between rounded-lg border bg-background p-3 text-left transition-colors',
                tp.id === typeId
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-border hover:bg-accent'
              )}
            >
              <div className="text-sm font-medium">{tp.name_ru}</div>
              <div className="text-xs text-muted-foreground">
                {tp.is_flavor_specific
                  ? `${tp.output_quantity} ${tp.output_unit}`
                  : t('flavors.shared')}
              </div>
            </button>
          ))}
        </div>
      </div>

      {flavorRequired && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold tracking-tight">
            {t('production.selectFlavor')}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {flavors.map((flavor) => {
              const selected = flavor.id === flavorId;
              return (
                <button
                  key={flavor.id}
                  type="button"
                  onClick={() => onFlavorChange(flavor.id)}
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
        </div>
      )}

      <FormField label={t('production.multiplier')}>
        <NumberInput
          value={multiplier}
          onChange={(e) => onMultiplierChange(e.target.value)}
          min="0.1"
          step="0.1"
          inputMode="decimal"
          className="max-w-[8rem]"
        />
      </FormField>
    </div>
  );
}

function Step2({ stockRows, blockers, ok }) {
  return (
    <div className="space-y-4">
      {blockers.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">{t('production.warningsBlock')}</div>
            <ul className="mt-1 list-disc pl-4 text-xs">
              {blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{t('production.ingredient')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('production.required')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('production.available')}</th>
              <th className="px-4 py-3 text-left font-medium">{t('production.stockStatus')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {stockRows.map((row) => (
              <tr key={row.ingredient_id}>
                <td className="px-4 py-3">
                  <div className="font-medium">
                    {row.ingredient?.name_ru ?? row.ingredient_id}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatAmountUnit(row.amount, row.unit)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {row.ingredient
                    ? formatAmountUnit(row.available, row.ingredient.unit)
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  {row.status === 'ok' ? (
                    <Badge variant="success">
                      <CheckCircle2 size={12} />
                      {t('production.stockOk')}
                    </Badge>
                  ) : (
                    <Badge variant="danger">
                      <XCircle size={12} />
                      {t('production.stockShort', {
                        amount: formatAmountUnit(row.shortBy ?? row.amount, row.unit),
                      })}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!ok && blockers.length === 0 && (
        <div className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
          <Package size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <div>{t('production.insufficientStock')}</div>
            <Link
              to="/warehouse"
              className="mt-1 inline-block text-xs font-medium underline"
            >
              {t('production.goToWarehouse')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Step3({ steps, checked, onToggle }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground">{t('production.stepsChecklist')}</p>
      <ol className="space-y-2">
        {steps.map((step, index) => {
          const done = checked.has(index);
          return (
            <li key={index}>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-3 text-sm transition-colors',
                  done ? 'border-success/40 bg-success/5' : 'hover:bg-accent'
                )}
              >
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => onToggle(index)}
                  className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer"
                />
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground tabular-nums">
                  {index + 1}
                </span>
                <span className={cn(done && 'line-through opacity-70')}>{step}</span>
              </label>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Step4({
  type,
  flavor,
  multiplier,
  composition,
  notes,
  onNotesChange,
  producedAt,
  onProducedAtChange,
  producedBy,
  onProducedByChange,
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold tracking-tight">
          {t('production.summary')}
        </h3>
        <dl className="grid gap-2 text-sm sm:grid-cols-[160px,1fr]">
          <dt className="text-muted-foreground">{t('journal.concentrateType')}</dt>
          <dd className="font-medium">{type.name_ru}</dd>
          {flavor && (
            <>
              <dt className="text-muted-foreground">{t('journal.flavor')}</dt>
              <dd>
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-inset ring-border"
                    style={{ backgroundColor: flavor.color_hex || '#e5e7eb' }}
                    aria-hidden="true"
                  />
                  {flavor.name_ru}
                </span>
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">{t('production.multiplier')}</dt>
          <dd className="tabular-nums">{formatAmount(multiplier)}×</dd>
        </dl>

        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border">
          {composition.map((entry, i) => (
            <li
              key={`${entry.ingredient_id}-${i}`}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">{entry.name_ru}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatAmountUnit(entry.amount, entry.unit)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('production.operator')}>
          <TextInput
            value={producedBy}
            onChange={(e) => onProducedByChange(e.target.value)}
          />
        </FormField>
        <FormField label={t('production.datetime')}>
          <TextInput
            type="datetime-local"
            value={producedAt}
            onChange={(e) => onProducedAtChange(e.target.value)}
          />
        </FormField>
      </div>

      <FormField label={t('production.notes')}>
        <TextArea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={3}
        />
      </FormField>
    </div>
  );
}

function Navigation({ step, canAdvance, saving, onBack, onContinue, onSave }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SecondaryButton onClick={onBack} disabled={step === 1 || saving}>
        <ArrowLeft size={16} />
        {t('production.back')}
      </SecondaryButton>
      {step < 4 ? (
        <PrimaryButton onClick={onContinue} disabled={!canAdvance}>
          {t('production.continue')}
          <ArrowRight size={16} />
        </PrimaryButton>
      ) : (
        <PrimaryButton onClick={onSave} loading={saving}>
          <Save size={16} />
          {t('production.saveBatch')}
        </PrimaryButton>
      )}
    </div>
  );
}

// "2026-05-07T14:30" ↔ ISO. Local time, sliced for the datetime-local input.
function isoForLocalInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    'T' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes())
  );
}

function localInputToIso(value) {
  // Accept "YYYY-MM-DDTHH:MM" (browser-local) → full ISO (UTC).
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}
