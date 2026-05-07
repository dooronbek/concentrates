import { useEffect, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  XCircle,
  X,
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
import {
  blockingProblems,
  checkStock,
  planProduction,
  scaleComposition,
  unionCompositions,
} from '../lib/production.js';
import { resolveRecipe } from '../lib/resolveRecipe.js';
import { formatAmount, formatAmountUnit } from '../lib/format.js';
import { plural, FORMS } from '../lib/pluralize.js';
import { cn } from '../lib/utils.js';
import {
  clearShift,
  loadShift,
  makeShiftId,
  saveShift,
} from '../lib/shiftPersistence.js';
import PageHeader from '../components/PageHeader.jsx';
import Badge from '../components/Badge.jsx';
import { PageError, PageLoading } from '../components/StateView.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import {
  FormField,
  NumberInput,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
} from '../components/FormField.jsx';
import { useToast } from '../components/Toast.jsx';

const SOFT_LIMIT = 8;
const STEP_KEYS = [
  'shift.step1',
  'shift.step2',
  'shift.step3',
  'shift.step4',
  'shift.step5',
];

let _localKey = 0;
function nextKey() {
  _localKey += 1;
  return `b-${Date.now().toString(36)}-${_localKey}`;
}

function freshShift() {
  return {
    shiftId: null,
    startedAt: new Date().toISOString(),
    step: 1,
    planned: [],
    distribution: { index: 0, cells: {} },
    protocols: {},
    saves: {},
  };
}

function shiftReducer(state, action) {
  switch (action.type) {
    case 'replace':
      return action.shift;
    case 'setStep':
      return { ...state, step: action.step };
    case 'addPlanned':
      return { ...state, planned: [...state.planned, action.row] };
    case 'updatePlanned':
      return {
        ...state,
        planned: state.planned.map((p) =>
          p.key === action.key ? { ...p, ...action.patch } : p
        ),
      };
    case 'removePlanned':
      return {
        ...state,
        planned: state.planned.filter((p) => p.key !== action.key),
      };
    case 'setShiftId':
      return { ...state, shiftId: action.shiftId };
    case 'setDistributionIndex':
      return {
        ...state,
        distribution: { ...state.distribution, index: action.index },
      };
    case 'setDistributionCell': {
      const { plannedKey, ingredientId, cell } = action;
      const k = `${plannedKey}__${ingredientId}`;
      return {
        ...state,
        distribution: {
          ...state.distribution,
          cells: { ...state.distribution.cells, [k]: cell },
        },
      };
    }
    case 'toggleProtocolStep': {
      const { plannedKey, stepIndex } = action;
      const cur = state.protocols[plannedKey] || [];
      const next = cur.includes(stepIndex)
        ? cur.filter((i) => i !== stepIndex)
        : [...cur, stepIndex];
      return {
        ...state,
        protocols: { ...state.protocols, [plannedKey]: next },
      };
    }
    case 'setSave':
      return {
        ...state,
        saves: { ...state.saves, [action.key]: action.result },
      };
    case 'reset':
      return freshShift();
    default:
      return state;
  }
}

export default function Shift() {
  const [data, setData] = useState({ status: 'loading' });
  const [shift, dispatch] = useReducer(shiftReducer, null, () => {
    const stored = loadShift();
    return stored && typeof stored === 'object' ? stored : freshShift();
  });
  const [confirmExit, setConfirmExit] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  // Persist on every change.
  useEffect(() => {
    if (shift && (shift.step > 1 || shift.planned.length > 0)) {
      saveShift(shift);
    }
  }, [shift]);

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
        setData({
          status: 'ready',
          types,
          flavors,
          variants,
          ingredients,
          settings,
        });
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
        <PageHeader title={t('shift.title')} />
        <PageLoading />
      </div>
    );
  }
  if (data.status === 'error') {
    return (
      <div className="space-y-6">
        <PageHeader title={t('shift.title')} />
        <PageError error={data.error} />
      </div>
    );
  }

  const variantByKey = new Map(
    data.variants.map((v) => [`${v.concentrate_type_id}__${v.flavor_id}`, v])
  );
  const typeById = new Map(data.types.map((tp) => [tp.id, tp]));
  const flavorById = new Map(data.flavors.map((f) => [f.id, f]));
  const ingredientsById = new Map(data.ingredients.map((i) => [i.id, i]));

  // Resolve every planned batch to its scaled composition + protocol.
  const resolvedBatches = shift.planned.map((p) => {
    const type = typeById.get(p.concentrate_type_id);
    const flavor = p.flavor_id ? flavorById.get(p.flavor_id) : null;
    const variant =
      type?.is_flavor_specific && flavor
        ? variantByKey.get(`${type.id}__${flavor.id}`) || null
        : null;
    const planned = type
      ? planProduction({
          concentrateType: type,
          flavor,
          variant,
          ingredients: data.ingredients,
          multiplier: p.multiplier,
        })
      : { composition: [], protocol: [], warnings: [] };
    return { row: p, type, flavor, variant, planned };
  });

  function handleCancelShift() {
    clearShift();
    dispatch({ type: 'reset' });
    setConfirmExit(false);
    navigate('/');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('shift.title')}
        actions={
          <SecondaryButton onClick={() => setConfirmExit(true)} className="text-destructive">
            <X size={16} />
            {t('dashboard.cancelShift')}
          </SecondaryButton>
        }
      />

      <StepIndicator step={shift.step} />

      {shift.step === 1 && (
        <Step1Plan
          planned={shift.planned}
          types={data.types}
          flavors={data.flavors.filter((f) => f.active)}
          onAdd={(row) => dispatch({ type: 'addPlanned', row })}
          onUpdate={(key, patch) =>
            dispatch({ type: 'updatePlanned', key, patch })
          }
          onRemove={(key) => dispatch({ type: 'removePlanned', key })}
        />
      )}

      {shift.step === 2 && (
        <Step2CombinedStock
          resolvedBatches={resolvedBatches}
          ingredientsById={ingredientsById}
        />
      )}

      {shift.step === 3 && (
        <Step3Distribution
          shift={shift}
          resolvedBatches={resolvedBatches}
          ingredientsById={ingredientsById}
          dispatch={dispatch}
        />
      )}

      {shift.step === 4 && (
        <Step4Protocols
          shift={shift}
          resolvedBatches={resolvedBatches}
          dispatch={dispatch}
        />
      )}

      {shift.step === 5 && (
        <Step5Save
          shift={shift}
          resolvedBatches={resolvedBatches}
          settings={data.settings}
          ingredientsById={ingredientsById}
          dispatch={dispatch}
          onComplete={() => {
            const saved = Object.values(shift.saves).filter(
              (s) => s.status === 'saved'
            ).length;
            toast.push({
              kind: 'success',
              message: t('shift.shiftSaved', {
                count: plural(saved, FORMS.batches),
              }),
            });
            clearShift();
            dispatch({ type: 'reset' });
            navigate('/');
          }}
        />
      )}

      <Navigation
        shift={shift}
        resolvedBatches={resolvedBatches}
        ingredientsById={ingredientsById}
        dispatch={dispatch}
      />

      <ConfirmDialog
        open={confirmExit}
        title={t('shift.exitConfirmTitle')}
        description={t('shift.exitConfirmDescription')}
        destructive
        confirmLabel={t('dashboard.cancelShift')}
        onConfirm={handleCancelShift}
        onCancel={() => setConfirmExit(false)}
      />
    </div>
  );
}

function StepIndicator({ step }) {
  return (
    <ol className="flex items-center gap-1 sm:gap-3">
      {STEP_KEYS.map((key, i) => {
        const n = i + 1;
        const status = n < step ? 'done' : n === step ? 'current' : 'upcoming';
        return (
          <li key={key} className="flex flex-1 items-center gap-2 text-xs">
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
              {t(key)}
            </span>
            {i < STEP_KEYS.length - 1 && (
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

// ─── Step 1: plan ─────────────────────────────────────────────────────────

function Step1Plan({ planned, types, flavors, onAdd, onUpdate, onRemove }) {
  function handleAdd() {
    const firstType = types[0];
    onAdd({
      key: nextKey(),
      concentrate_type_id: firstType?.id ?? '',
      flavor_id:
        firstType?.is_flavor_specific && flavors[0] ? flavors[0].id : null,
      multiplier: 1,
    });
  }

  const tooMany = planned.length > SOFT_LIMIT;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        {planned.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t('shift.noBatches')}
          </div>
        ) : (
          <ul className="space-y-2">
            {planned.map((row, i) => (
              <PlannedRow
                key={row.key}
                index={i}
                row={row}
                types={types}
                flavors={flavors}
                onChange={(patch) => onUpdate(row.key, patch)}
                onRemove={() => onRemove(row.key)}
              />
            ))}
          </ul>
        )}

        <div className="mt-4 flex justify-between">
          <SecondaryButton onClick={handleAdd}>
            <Plus size={16} />
            {t('shift.addBatch')}
          </SecondaryButton>
          {planned.length > 0 && (
            <PlannedSummary planned={planned} types={types} flavors={flavors} />
          )}
        </div>
      </div>

      {tooMany && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{t('shift.softLimitWarning', { max: SOFT_LIMIT })}</span>
        </div>
      )}
    </div>
  );
}

function PlannedRow({ index, row, types, flavors, onChange, onRemove }) {
  const type = types.find((tp) => tp.id === row.concentrate_type_id);
  const flavorRequired = type?.is_flavor_specific;

  return (
    <li className="grid grid-cols-1 items-end gap-2 rounded-md border border-border bg-background p-3 sm:grid-cols-[2.5rem,1fr,1fr,6rem,auto]">
      <div className="text-xs text-muted-foreground sm:pb-3">
        {t('shift.boxLabel', { n: index + 1 })}
      </div>
      <SelectInput
        value={row.concentrate_type_id}
        onChange={(e) => {
          const id = e.target.value;
          const tp = types.find((x) => x.id === id);
          onChange({
            concentrate_type_id: id,
            flavor_id:
              tp?.is_flavor_specific && flavors[0] ? row.flavor_id ?? flavors[0].id : null,
          });
        }}
      >
        {types.map((tp) => (
          <option key={tp.id} value={tp.id}>
            {tp.name_ru}
          </option>
        ))}
      </SelectInput>
      <SelectInput
        value={row.flavor_id ?? ''}
        onChange={(e) => onChange({ flavor_id: e.target.value || null })}
        disabled={!flavorRequired}
      >
        {!flavorRequired && <option value="">{t('flavors.shared')}</option>}
        {flavorRequired &&
          flavors.map((flavor) => (
            <option key={flavor.id} value={flavor.id}>
              {flavor.name_ru}
            </option>
          ))}
      </SelectInput>
      <NumberInput
        value={row.multiplier}
        onChange={(e) => onChange({ multiplier: Number(e.target.value) || 1 })}
        min="0.1"
        step="0.1"
        className="text-right"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('shift.removeBatch')}
        className="flex h-11 w-11 items-center justify-center rounded-md text-destructive/70 hover:bg-destructive/10"
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
}

function PlannedSummary({ planned, types, flavors }) {
  const breakdown = planned.reduce((acc, p) => {
    const tp = types.find((x) => x.id === p.concentrate_type_id);
    const fl = p.flavor_id ? flavors.find((x) => x.id === p.flavor_id) : null;
    const label = fl ? `${tp?.name_ru ?? '?'} · ${fl.name_ru}` : tp?.name_ru ?? '?';
    const cur = acc.find((x) => x.label === label);
    if (cur) cur.count += 1;
    else acc.push({ label, count: 1 });
    return acc;
  }, []);

  return (
    <div className="text-right text-xs text-muted-foreground">
      <div className="font-medium text-foreground">
        {plural(planned.length, FORMS.batches)}
      </div>
      <div className="mt-0.5">
        {breakdown
          .map((b) => t('shift.breakdownItem', { count: b.count, label: b.label }))
          .join(' · ')}
      </div>
    </div>
  );
}

// ─── Step 2: combined stock check ────────────────────────────────────────

function Step2CombinedStock({ resolvedBatches, ingredientsById }) {
  const allBlockers = resolvedBatches.flatMap((b) =>
    blockingProblems(b.planned).map((p) => `${b.type?.name_ru ?? '?'}: ${p}`)
  );
  const union = unionCompositions(resolvedBatches.map((b) => b.planned.composition));
  const stockRows = checkStock(union, ingredientsById);
  const anyShort = stockRows.some((r) => r.status !== 'ok');

  return (
    <div className="space-y-4">
      {allBlockers.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">{t('production.warningsBlock')}</div>
            <ul className="mt-1 list-disc pl-4 text-xs">
              {allBlockers.map((b, i) => (
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
                <td className="px-4 py-3 font-medium">
                  {row.ingredient?.name_ru ?? row.ingredient_id}
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

      {anyShort && (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
          {t('production.insufficientStock')}
        </div>
      )}
    </div>
  );
}

// ─── Step 3: ingredient distribution (one ingredient at a time) ──────────

function buildDistributionPlan(resolvedBatches) {
  // Ordered union: walk every batch in plan-order and append unseen
  // ingredients. Each entry carries per-box rows.
  const seen = new Map();
  for (const batch of resolvedBatches) {
    for (const entry of batch.planned.composition) {
      if (!seen.has(entry.ingredient_id)) {
        seen.set(entry.ingredient_id, {
          ingredient_id: entry.ingredient_id,
          name_ru: entry.name_ru,
          unit: entry.unit,
          totalRequired: 0,
          perBox: [],
        });
      }
      const it = seen.get(entry.ingredient_id);
      it.totalRequired += Number(entry.amount) || 0;
      it.perBox.push({
        plannedKey: batch.row.key,
        boxIndex: resolvedBatches.indexOf(batch),
        type: batch.type,
        flavor: batch.flavor,
        required: Number(entry.amount) || 0,
      });
    }
  }
  return Array.from(seen.values());
}

function Step3Distribution({ shift, resolvedBatches, ingredientsById, dispatch }) {
  const plan = useMemo(
    () => buildDistributionPlan(resolvedBatches),
    [resolvedBatches]
  );
  const safeIndex = Math.min(shift.distribution.index, Math.max(plan.length - 1, 0));
  const current = plan[safeIndex];

  if (!current) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {t('shift.noBatches')}
      </div>
    );
  }

  const cellState = (plannedKey, ingredientId) =>
    shift.distribution.cells[`${plannedKey}__${ingredientId}`] || {
      checked: false,
      actualAmount: '',
    };

  const allChecked = current.perBox.every(
    (box) => cellState(box.plannedKey, current.ingredient_id).checked
  );

  function setCell(plannedKey, patch) {
    const prev = cellState(plannedKey, current.ingredient_id);
    dispatch({
      type: 'setDistributionCell',
      plannedKey,
      ingredientId: current.ingredient_id,
      cell: { ...prev, ...patch },
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('shift.ingredientProgress', {
                current: safeIndex + 1,
                total: plan.length,
              })}
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight">
              {current.name_ru}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">
              {t('production.required')}:{' '}
              <span className="font-medium text-foreground">
                {formatAmountUnit(current.totalRequired, current.unit)}
              </span>
            </p>
          </div>
          <ProgressBar value={safeIndex + 1} max={plan.length} />
        </div>

        <ul className="mt-4 space-y-2">
          {current.perBox.map((box) => {
            const cell = cellState(box.plannedKey, current.ingredient_id);
            return (
              <li
                key={box.plannedKey}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3',
                  cell.checked
                    ? 'border-success/40 bg-success/5'
                    : 'border-border'
                )}
              >
                <label className="flex flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={cell.checked}
                    onChange={(e) => setCell(box.plannedKey, { checked: e.target.checked })}
                    className="h-6 w-6 cursor-pointer"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {t('shift.boxLabel', { n: box.boxIndex + 1 })} ·{' '}
                      {box.type?.name_ru ?? '?'}
                      {box.flavor && (
                        <span className="text-muted-foreground"> · {box.flavor.name_ru}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {t('production.required')}:{' '}
                      <span className="font-medium text-foreground">
                        {formatAmountUnit(box.required, current.unit)}
                      </span>
                    </div>
                  </div>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('shift.actualAmount')}
                  </span>
                  <NumberInput
                    value={cell.actualAmount}
                    onChange={(e) => setCell(box.plannedKey, { actualAmount: e.target.value })}
                    placeholder={String(formatAmount(box.required))}
                    min="0"
                    step="0.001"
                    className="h-12 w-28 text-right text-base tabular-nums"
                  />
                  <span className="text-sm text-muted-foreground">{current.unit}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-3">
        <SecondaryButton
          onClick={() =>
            dispatch({ type: 'setDistributionIndex', index: Math.max(0, safeIndex - 1) })
          }
          disabled={safeIndex === 0}
        >
          <ArrowLeft size={16} />
          {t('shift.previousIngredient')}
        </SecondaryButton>
        <PrimaryButton
          onClick={() =>
            dispatch({
              type: 'setDistributionIndex',
              index: Math.min(plan.length - 1, safeIndex + 1),
            })
          }
          disabled={!allChecked || safeIndex === plan.length - 1}
        >
          {t('shift.nextIngredient')}
          <ArrowRight size={16} />
        </PrimaryButton>
      </div>
    </div>
  );
}

function ProgressBar({ value, max }) {
  const pct = Math.round((value / Math.max(max, 1)) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {value}/{max}
      </span>
    </div>
  );
}

// ─── Step 4: per-box protocol checklists ─────────────────────────────────

function Step4Protocols({ shift, resolvedBatches, dispatch }) {
  const [activeKey, setActiveKey] = useState(resolvedBatches[0]?.row.key ?? null);

  if (resolvedBatches.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {t('shift.noBatches')}
      </div>
    );
  }

  const active = resolvedBatches.find((b) => b.row.key === activeKey) || resolvedBatches[0];
  const checked = new Set(shift.protocols[active.row.key] || []);
  const allDone = active.planned.protocol.every((_, i) => checked.has(i));

  return (
    <div className="grid gap-4 lg:grid-cols-[14rem,1fr]">
      <ul className="space-y-1">
        {resolvedBatches.map((batch, i) => {
          const ck = new Set(shift.protocols[batch.row.key] || []);
          const total = batch.planned.protocol.length;
          const done = ck.size >= total && total > 0;
          const isActive = activeKey === batch.row.key;
          return (
            <li key={batch.row.key}>
              <button
                type="button"
                onClick={() => setActiveKey(batch.row.key)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm',
                  isActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:bg-accent',
                  done && !isActive && 'border-success/40'
                )}
              >
                <span className="min-w-0 truncate">
                  {t('shift.boxLabel', { n: i + 1 })}: {batch.type?.name_ru ?? '?'}
                  {batch.flavor && (
                    <span className="text-muted-foreground"> · {batch.flavor.name_ru}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {ck.size}/{total}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="space-y-3 rounded-lg border border-border bg-card p-5">
        <header className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold tracking-tight">
            {active.type?.name_ru}
            {active.flavor && (
              <span className="text-muted-foreground"> · {active.flavor.name_ru}</span>
            )}
          </h3>
          {allDone && <Badge variant="success">{t('shift.boxComplete')}</Badge>}
        </header>
        <ol className="space-y-2">
          {active.planned.protocol.map((step, index) => {
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
                    onChange={() =>
                      dispatch({
                        type: 'toggleProtocolStep',
                        plannedKey: active.row.key,
                        stepIndex: index,
                      })
                    }
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
    </div>
  );
}

// ─── Step 5: sequential save ─────────────────────────────────────────────

function Step5Save({
  shift,
  resolvedBatches,
  settings,
  ingredientsById,
  dispatch,
  onComplete,
}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const allDone =
    resolvedBatches.length > 0 &&
    resolvedBatches.every((b) => shift.saves[b.row.key]?.status === 'saved');

  async function runSave() {
    if (running) return;
    setRunning(true);
    const shiftId = shift.shiftId || makeShiftId();
    if (!shift.shiftId) dispatch({ type: 'setShiftId', shiftId });

    const pending = resolvedBatches.filter(
      (b) => shift.saves[b.row.key]?.status !== 'saved'
    );
    setProgress({ current: 0, total: pending.length });

    for (let i = 0; i < pending.length; i += 1) {
      const batch = pending[i];
      setProgress({ current: i + 1, total: pending.length });

      try {
        const ingredientsUsed = batch.planned.composition.map((entry) => {
          const ing = ingredientsById.get(entry.ingredient_id);
          return {
            ingredient_id: entry.ingredient_id,
            name_ru: ing?.name_ru ?? entry.ingredient_id,
            amount: Number(entry.amount),
            unit: entry.unit,
            lot_number: ing?.lot_number ?? null,
          };
        });

        // Actuals from distribution overrides — only included for boxes
        // where the operator entered a non-empty actual amount.
        const actuals = batch.planned.composition.map((entry) => {
          const cell = shift.distribution.cells[`${batch.row.key}__${entry.ingredient_id}`];
          const overridden =
            cell && cell.actualAmount !== '' && cell.actualAmount != null;
          const ing = ingredientsById.get(entry.ingredient_id);
          return {
            ingredient_id: entry.ingredient_id,
            name_ru: ing?.name_ru ?? entry.ingredient_id,
            amount: overridden ? Number(cell.actualAmount) : Number(entry.amount),
            unit: entry.unit,
            lot_number: ing?.lot_number ?? null,
          };
        });
        const anyOverride = batch.planned.composition.some((entry) => {
          const cell = shift.distribution.cells[`${batch.row.key}__${entry.ingredient_id}`];
          return cell && cell.actualAmount !== '' && cell.actualAmount != null;
        });

        const saved = await createBatch({
          concentrate_type_id: batch.type.id,
          flavor_id: batch.flavor?.id ?? null,
          produced_at: new Date().toISOString(),
          produced_by: settings.operator_name || 'оператор',
          quantity: Number(batch.row.multiplier) || 1,
          ingredients_used: ingredientsUsed,
          actual_ingredients_used: anyOverride ? actuals : null,
          notes: '',
          shift_id: shiftId,
        });

        dispatch({
          type: 'setSave',
          key: batch.row.key,
          result: { status: 'saved', batchId: saved.batch_id },
        });
      } catch (err) {
        dispatch({
          type: 'setSave',
          key: batch.row.key,
          result: { status: 'failed', error: err.message },
        });
        // Keep going — each box is its own logical unit. Operator can retry
        // individual failures from the list below.
      }
    }
    setRunning(false);
  }

  useEffect(() => {
    if (allDone && resolvedBatches.length > 0) {
      const tid = setTimeout(() => onComplete(), 600);
      return () => clearTimeout(tid);
    }
    return undefined;
  }, [allDone, resolvedBatches.length, onComplete]);

  const succeeded = resolvedBatches.filter(
    (b) => shift.saves[b.row.key]?.status === 'saved'
  ).length;
  const failed = resolvedBatches.filter(
    (b) => shift.saves[b.row.key]?.status === 'failed'
  ).length;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              {t('shift.saveShift')}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {plural(resolvedBatches.length, FORMS.batches)}
              {failed > 0 && ` · ${t('shift.shiftPartial')}`}
            </p>
          </div>
          {!allDone && (
            <PrimaryButton onClick={runSave} loading={running}>
              <Save size={16} />
              {failed > 0 ? t('shift.retryFailed') : t('shift.saveShift')}
            </PrimaryButton>
          )}
        </div>

        {running && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t('shift.savingBatch', {
              current: progress.current,
              total: progress.total,
            })}
          </p>
        )}

        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border">
          {resolvedBatches.map((batch, i) => {
            const result = shift.saves[batch.row.key] || { status: 'pending' };
            return (
              <li
                key={batch.row.key}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {batch.type?.name_ru ?? '?'}
                    {batch.flavor && (
                      <span className="text-muted-foreground"> · {batch.flavor.name_ru}</span>
                    )}
                  </div>
                  {result.status === 'saved' && result.batchId && (
                    <div className="font-mono text-xs text-muted-foreground">
                      {result.batchId}
                    </div>
                  )}
                  {result.status === 'failed' && result.error && (
                    <div className="text-xs text-destructive">{result.error}</div>
                  )}
                </div>
                {result.status === 'pending' && (
                  <Badge variant="outline">…</Badge>
                )}
                {result.status === 'saved' && (
                  <Badge variant="success">
                    <CheckCircle2 size={12} />
                  </Badge>
                )}
                {result.status === 'failed' && (
                  <Badge variant="danger">
                    <XCircle size={12} />
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>

        {allDone && (
          <div className="mt-4 flex items-center gap-2 text-sm text-success">
            <CheckCircle2 size={16} />
            <span>
              {t('shift.shiftSaved', { count: plural(succeeded, FORMS.batches) })}
            </span>
            <Loader2 size={14} className="ml-2 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bottom navigation ───────────────────────────────────────────────────

function Navigation({ shift, resolvedBatches, ingredientsById, dispatch }) {
  function canAdvance() {
    if (shift.step === 1) return shift.planned.length > 0;
    if (shift.step === 2) {
      const allBlockers = resolvedBatches.flatMap((b) => blockingProblems(b.planned));
      if (allBlockers.length > 0) return false;
      const union = unionCompositions(
        resolvedBatches.map((b) => b.planned.composition)
      );
      const stockRows = checkStock(union, ingredientsById);
      return stockRows.every((r) => r.status === 'ok');
    }
    if (shift.step === 3) {
      const plan = buildDistributionPlan(resolvedBatches);
      return plan.every((it) =>
        it.perBox.every(
          (box) =>
            shift.distribution.cells[`${box.plannedKey}__${it.ingredient_id}`]?.checked
        )
      );
    }
    if (shift.step === 4) {
      return resolvedBatches.every((b) => {
        const ck = new Set(shift.protocols[b.row.key] || []);
        return b.planned.protocol.every((_, i) => ck.has(i));
      });
    }
    return false;
  }

  if (shift.step === 5) return null; // step 5 has its own save button

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SecondaryButton
        onClick={() => dispatch({ type: 'setStep', step: shift.step - 1 })}
        disabled={shift.step === 1}
      >
        <ArrowLeft size={16} />
        {t('production.back')}
      </SecondaryButton>
      <PrimaryButton
        onClick={() => dispatch({ type: 'setStep', step: shift.step + 1 })}
        disabled={!canAdvance()}
      >
        {t('production.continue')}
        <ArrowRight size={16} />
      </PrimaryButton>
    </div>
  );
}
