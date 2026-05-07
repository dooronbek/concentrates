import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Info,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
  X,
} from 'lucide-react';
import { t } from '../i18n/index.js';
import {
  createFlavor,
  getConcentrateTypes,
  getFlavors,
  getIngredients,
  getRecipeVariants,
  updateConcentrateType,
  updateFlavor,
  updateRecipeVariant,
} from '../api/db.js';
import { resolveRecipe, variantOverrideCount } from '../lib/resolveRecipe.js';
import { formatAmountUnit } from '../lib/format.js';
import { plural, FORMS } from '../lib/pluralize.js';
import { uniqueSlug } from '../lib/slug.js';
import { cn } from '../lib/utils.js';
import PageHeader from '../components/PageHeader.jsx';
import Badge from '../components/Badge.jsx';
import { EmptyState, PageError, PageLoading } from '../components/StateView.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import {
  ColorInput,
  FormField,
  NumberInput,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  TextArea,
  TextInput,
} from '../components/FormField.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Recipes() {
  const [data, setData] = useState({ status: 'loading' });
  const [openVariant, setOpenVariant] = useState(null); // { type, flavor, variant }
  const [openType, setOpenType] = useState(null); // type | null
  const [editingFlavor, setEditingFlavor] = useState(null); // flavor | { isNew: true } | null
  const [confirmDeactivate, setConfirmDeactivate] = useState(null); // flavor | null
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const toast = useToast();

  function refresh() {
    return Promise.all([
      getConcentrateTypes(),
      getFlavors(),
      getRecipeVariants(),
      getIngredients(),
    ])
      .then(([types, flavors, variants, ingredients]) =>
        setData({ status: 'ready', types, flavors, variants, ingredients })
      )
      .catch((err) => setData({ status: 'error', error: err.message }));
  }

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

  async function toggleFlavorActive(flavor, nextActive) {
    setDeactivateLoading(true);
    try {
      await updateFlavor(flavor.id, { active: nextActive });
      toast.push({
        kind: 'success',
        message: nextActive
          ? t('recipes.flavorActivatedToast')
          : t('recipes.flavorDeactivatedToast'),
      });
      setConfirmDeactivate(null);
      await refresh();
    } catch (err) {
      toast.push({ kind: 'error', message: err.message });
    } finally {
      setDeactivateLoading(false);
    }
  }

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
        <span>{t('recipes.editWarning')}</span>
      </div>

      {sharedTypes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">
            {t('recipes.commonRecipes')}
          </h2>
          <div className="space-y-4">
            {sharedTypes.map((tp) => (
              <SharedRecipeCard
                key={tp.id}
                type={tp}
                ingredients={data.ingredients}
                onEdit={() => setOpenType(tp)}
              />
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
                onEditBase={() => setOpenType(tp)}
                onOpen={(flavor, variant) =>
                  setOpenVariant({ type: tp, flavor, variant })
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">
            {t('recipes.manageFlavors')}
          </h2>
          <PrimaryButton onClick={() => setEditingFlavor({ isNew: true })}>
            <Plus size={16} />
            {t('recipes.addFlavor')}
          </PrimaryButton>
        </div>
        <p className="text-xs text-muted-foreground">{t('recipes.manageFlavorsHint')}</p>
        <FlavorList
          flavors={data.flavors}
          onEdit={(flavor) => setEditingFlavor(flavor)}
          onToggleActive={(flavor) => {
            if (flavor.active) setConfirmDeactivate(flavor);
            else toggleFlavorActive(flavor, true);
          }}
        />
      </section>

      {openVariant && (
        <VariantEditor
          type={openVariant.type}
          flavor={openVariant.flavor}
          variant={openVariant.variant}
          ingredients={data.ingredients}
          onClose={() => setOpenVariant(null)}
          onSaved={async () => {
            setOpenVariant(null);
            await refresh();
          }}
        />
      )}

      {openType && (
        <ConcentrateTypeEditor
          type={openType}
          ingredients={data.ingredients}
          onClose={() => setOpenType(null)}
          onSaved={async () => {
            setOpenType(null);
            await refresh();
          }}
        />
      )}

      <FlavorFormModal
        open={editingFlavor !== null}
        flavor={editingFlavor && !editingFlavor.isNew ? editingFlavor : null}
        existingIds={data.flavors.map((f) => f.id)}
        onClose={() => setEditingFlavor(null)}
        onSaved={async () => {
          setEditingFlavor(null);
          await refresh();
        }}
      />

      <ConfirmDialog
        open={confirmDeactivate !== null}
        title={
          confirmDeactivate
            ? t('recipes.deactivateConfirmTitle', { name: confirmDeactivate.name_ru })
            : ''
        }
        description={t('recipes.deactivateConfirmDescription')}
        destructive
        loading={deactivateLoading}
        confirmLabel={t('recipes.deactivateFlavor')}
        onConfirm={() => toggleFlavorActive(confirmDeactivate, false)}
        onCancel={() => setConfirmDeactivate(null)}
      />
    </div>
  );
}

function SharedRecipeCard({ type, ingredients, onEdit }) {
  const resolved = useMemo(
    () => resolveRecipe({ concentrateType: type, ingredients }),
    [type, ingredients]
  );

  return (
    <article className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{type.name_ru}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('recipes.sharedRecipeHint')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {t('recipes.outputQuantity')}:{' '}
            <span className="font-medium text-foreground">
              {formatAmountUnit(type.output_quantity, type.output_unit)}
            </span>
          </p>
          <SecondaryButton onClick={onEdit} className="h-9 px-3 text-xs">
            <Pencil size={14} />
            {t('common.edit')}
          </SecondaryButton>
        </div>
      </header>

      <div className="grid gap-6 p-5 lg:grid-cols-[3fr,2fr]">
        <CompositionList composition={resolved.composition} />
        <ProtocolList steps={resolved.protocol} />
      </div>
    </article>
  );
}

function FlavorGridCard({ type, flavors, variantByKey, onEditBase, onOpen }) {
  return (
    <article className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <h3 className="text-lg font-semibold tracking-tight">{type.name_ru}</h3>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {t('recipes.outputQuantity')}:{' '}
            <span className="font-medium text-foreground">
              {formatAmountUnit(type.output_quantity, type.output_unit)}
            </span>
          </p>
          <SecondaryButton onClick={onEditBase} className="h-9 px-3 text-xs">
            <Pencil size={14} />
            {t('recipes.editBaseRecipe')}
          </SecondaryButton>
        </div>
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

function FlavorList({ flavors, onEdit, onToggleActive }) {
  if (flavors.length === 0) {
    return <EmptyState title={t('common.noResults')} />;
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {flavors.map((flavor) => (
        <li
          key={flavor.id}
          className={cn(
            'flex flex-wrap items-center gap-3 px-4 py-3 text-sm',
            !flavor.active && 'bg-muted/30 text-muted-foreground'
          )}
        >
          <span
            className="inline-block h-5 w-5 shrink-0 rounded-md ring-1 ring-inset ring-border"
            style={{ backgroundColor: flavor.color_hex || '#e5e7eb' }}
            aria-hidden="true"
          />
          <span className="flex-1 truncate font-medium">{flavor.name_ru}</span>
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
            {flavor.color_hex || '—'}
          </span>
          <Badge variant={flavor.active ? 'success' : 'outline'}>
            {flavor.active ? t('flavors.active') : t('flavors.inactive')}
          </Badge>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(flavor)}
              aria-label={t('common.edit')}
              title={t('common.edit')}
              className="flex h-9 w-9 items-center justify-center rounded-md text-foreground/70 hover:bg-accent"
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              onClick={() => onToggleActive(flavor)}
              aria-label={
                flavor.active
                  ? t('recipes.deactivateFlavor')
                  : t('recipes.activateFlavor')
              }
              title={
                flavor.active
                  ? t('recipes.deactivateFlavor')
                  : t('recipes.activateFlavor')
              }
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent',
                flavor.active ? 'text-foreground/70' : 'text-success'
              )}
            >
              {flavor.active ? <PowerOff size={16} /> : <Power size={16} />}
            </button>
          </div>
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

// ─── Editors ─────────────────────────────────────────────────────────────

// Inline composition row editor: ingredient picker + amount + unit + remove.
function CompositionRowEditor({ row, ingredients, onChange, onRemove }) {
  const sortedIngredients = useMemo(
    () => [...ingredients].sort((a, b) => a.name_ru.localeCompare(b.name_ru, 'ru')),
    [ingredients]
  );
  return (
    <div className="grid grid-cols-[1fr,auto] gap-2 sm:grid-cols-[1fr,7rem,5rem,auto]">
      <SelectInput
        value={row.ingredient_id || ''}
        onChange={(e) => {
          const id = e.target.value;
          const ing = ingredients.find((i) => i.id === id);
          onChange({
            ...row,
            ingredient_id: id,
            unit: row.unit || ing?.unit || '',
          });
        }}
      >
        <option value="">— {t('recipes.ingredient')} —</option>
        {sortedIngredients.map((ing) => (
          <option key={ing.id} value={ing.id}>
            {ing.name_ru}
          </option>
        ))}
      </SelectInput>
      <NumberInput
        value={row.amount ?? ''}
        onChange={(e) => onChange({ ...row, amount: e.target.value })}
        min="0"
        step="0.001"
        placeholder="0"
      />
      <TextInput
        value={row.unit ?? ''}
        onChange={(e) => onChange({ ...row, unit: e.target.value })}
        placeholder="г"
        className="text-center"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('common.remove')}
        title={t('common.remove')}
        className="flex h-11 w-11 items-center justify-center rounded-md text-destructive/70 hover:bg-destructive/10"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function CompositionEditor({ rows, ingredients, onChange }) {
  function update(index, next) {
    onChange(rows.map((r, i) => (i === index ? next : r)));
  }
  function add() {
    onChange([...rows, { ingredient_id: '', amount: '', unit: '' }]);
  }
  function remove(index) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">—</p>
      )}
      {rows.map((row, index) => (
        <CompositionRowEditor
          key={index}
          row={row}
          ingredients={ingredients}
          onChange={(next) => update(index, next)}
          onRemove={() => remove(index)}
        />
      ))}
      <SecondaryButton onClick={add} className="h-9 px-3 text-xs">
        <Plus size={14} />
        {t('recipes.addRow')}
      </SecondaryButton>
    </div>
  );
}

function ProtocolStepsEditor({ steps, onChange }) {
  function update(index, value) {
    onChange(steps.map((s, i) => (i === index ? value : s)));
  }
  function add() {
    onChange([...steps, '']);
  }
  function remove(index) {
    onChange(steps.filter((_, i) => i !== index));
  }
  return (
    <div className="space-y-2">
      {steps.length === 0 && (
        <p className="text-sm text-muted-foreground">—</p>
      )}
      {steps.map((step, index) => (
        <div key={index} className="flex items-start gap-2">
          <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground tabular-nums">
            {index + 1}
          </span>
          <TextArea
            value={step}
            onChange={(e) => update(index, e.target.value)}
            rows={1}
            className="min-h-[44px] flex-1"
          />
          <button
            type="button"
            onClick={() => remove(index)}
            aria-label={t('common.remove')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-destructive/70 hover:bg-destructive/10"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <SecondaryButton onClick={add} className="h-9 px-3 text-xs">
        <Plus size={14} />
        {t('recipes.addStep')}
      </SecondaryButton>
    </div>
  );
}

// Editor for a concentrate type's base composition + protocol + output info.
function ConcentrateTypeEditor({ type, ingredients, onClose, onSaved }) {
  const [composition, setComposition] = useState(() =>
    Array.isArray(type.base_composition) ? type.base_composition : []
  );
  const [protocol, setProtocol] = useState(() =>
    Array.isArray(type.protocol_steps) ? type.protocol_steps : []
  );
  const [outputQty, setOutputQty] = useState(type.output_quantity);
  const [outputUnit, setOutputUnit] = useState(type.output_unit);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  // Live preview against current state.
  const preview = useMemo(
    () =>
      resolveRecipe({
        concentrateType: {
          ...type,
          base_composition: cleanComposition(composition),
          protocol_steps: cleanSteps(protocol),
        },
        ingredients,
      }),
    [type, composition, protocol, ingredients]
  );

  async function handleSave() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await updateConcentrateType(type.id, {
        base_composition: cleanComposition(composition).map((r) => ({
          ingredient_id: r.ingredient_id,
          amount: Number(r.amount),
          unit: r.unit,
        })),
        protocol_steps: cleanSteps(protocol),
        output_quantity: Number(outputQty) || 1,
        output_unit: outputUnit.trim() || type.output_unit,
      });
      toast.push({ kind: 'success', message: t('recipes.savedToast') });
      await onSaved();
    } catch (err) {
      toast.push({ kind: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={submitting ? undefined : onClose}
      size="xl"
      title={`${t('common.edit')}: ${type.name_ru}`}
      description={
        type.is_flavor_specific
          ? null
          : t('recipes.sharedRecipeHint')
      }
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </SecondaryButton>
          <PrimaryButton onClick={handleSave} loading={submitting}>
            {t('common.save')}
          </PrimaryButton>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[3fr,2fr]">
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {t('recipes.composition')}
            </h3>
            <CompositionEditor
              rows={composition}
              ingredients={ingredients}
              onChange={setComposition}
            />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {t('recipes.protocol')}
            </h3>
            <ProtocolStepsEditor steps={protocol} onChange={setProtocol} />
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('recipes.outputQuantity')}>
              <NumberInput
                value={outputQty}
                onChange={(e) => setOutputQty(e.target.value)}
                min="0"
                step="0.001"
              />
            </FormField>
            <FormField label={t('warehouse.unit')}>
              <TextInput
                value={outputUnit}
                onChange={(e) => setOutputUnit(e.target.value)}
              />
            </FormField>
          </section>
        </div>

        <PreviewPanel resolved={preview} />
      </div>
    </Modal>
  );
}

// Editor for a recipe variant: add / modify / remove + protocol_addendum,
// with a live preview that re-runs resolveRecipe on each keystroke.
function VariantEditor({ type, flavor, variant, ingredients, onClose, onSaved }) {
  const initialOverrides = variant?.overrides ?? { add: [], modify: [], remove: [] };
  const initialAddendum = Array.isArray(variant?.protocol_addendum)
    ? variant.protocol_addendum
    : [];

  const [adds, setAdds] = useState(() => asArray(initialOverrides.add));
  const [modifies, setModifies] = useState(() => asArray(initialOverrides.modify));
  const [removes, setRemoves] = useState(() => asArray(initialOverrides.remove));
  const [addendum, setAddendum] = useState(initialAddendum);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const baseComposition = asArray(type.base_composition);

  // Live preview built on top of current edits.
  const preview = useMemo(() => {
    const draftVariant = {
      overrides: {
        add: cleanComposition(adds),
        modify: cleanComposition(modifies),
        remove: removes,
      },
      protocol_addendum: cleanSteps(addendum),
    };
    return resolveRecipe({
      concentrateType: type,
      flavor,
      variant: draftVariant,
      ingredients,
    });
  }, [type, flavor, ingredients, adds, modifies, removes, addendum]);

  function toggleRemove(ingredientId, on) {
    setRemoves((prev) =>
      on ? Array.from(new Set([...prev, ingredientId])) : prev.filter((id) => id !== ingredientId)
    );
  }

  function setModifyAmount(baseEntry, amount) {
    setModifies((prev) => {
      const idx = prev.findIndex((m) => m.ingredient_id === baseEntry.ingredient_id);
      if (amount === '' || amount == null) {
        // Empty string clears the override row entirely.
        return idx >= 0 ? prev.filter((_, i) => i !== idx) : prev;
      }
      const next = {
        ingredient_id: baseEntry.ingredient_id,
        amount,
        unit: baseEntry.unit,
      };
      if (idx >= 0) return prev.map((m, i) => (i === idx ? next : m));
      return [...prev, next];
    });
  }

  function modifyValueFor(baseEntry) {
    const m = modifies.find((x) => x.ingredient_id === baseEntry.ingredient_id);
    return m ? m.amount : '';
  }

  async function handleSave() {
    if (submitting || !variant) return;
    setSubmitting(true);
    try {
      const payload = {
        overrides: {
          add: cleanComposition(adds).map((r) => ({
            ingredient_id: r.ingredient_id,
            amount: Number(r.amount),
            unit: r.unit,
          })),
          modify: cleanComposition(modifies).map((r) => ({
            ingredient_id: r.ingredient_id,
            amount: Number(r.amount),
            unit: r.unit,
          })),
          remove: removes,
        },
        protocol_addendum: cleanSteps(addendum),
      };
      await updateRecipeVariant(variant.id, payload);
      toast.push({ kind: 'success', message: t('recipes.savedToast') });
      await onSaved();
    } catch (err) {
      toast.push({ kind: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  const overrideCount =
    cleanComposition(adds).length +
    cleanComposition(modifies).length +
    removes.length;

  return (
    <Modal
      open
      onClose={submitting ? undefined : onClose}
      size="xl"
      title={`${type.name_ru} · ${flavor.name_ru}`}
      description={
        overrideCount === 0
          ? t('recipes.noOverridesYet')
          : t('recipes.basePlusN', {
              count: plural(overrideCount, FORMS.changes),
            })
      }
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </SecondaryButton>
          <PrimaryButton
            onClick={handleSave}
            loading={submitting}
            disabled={!variant}
          >
            {t('common.save')}
          </PrimaryButton>
        </>
      }
    >
      {!variant && (
        <div className="mb-4 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
          {t('recipes.variantNotConfigured')}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr,2fr]">
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Plus size={14} /> {t('recipes.tabs.add')}
            </h3>
            <CompositionEditor
              rows={adds}
              ingredients={ingredients}
              onChange={setAdds}
            />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {t('recipes.tabs.modify')}
            </h3>
            <p className="text-xs text-muted-foreground">{t('recipes.modifyHint')}</p>
            {baseComposition.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {baseComposition.map((entry) => {
                  const ing = ingredients.find((i) => i.id === entry.ingredient_id);
                  const value = modifyValueFor(entry);
                  return (
                    <li
                      key={entry.ingredient_id}
                      className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {ing?.name_ru ?? entry.ingredient_id}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatAmountUnit(entry.amount, entry.unit)}
                      </span>
                      <span className="text-xs text-muted-foreground">→</span>
                      <NumberInput
                        value={value}
                        onChange={(e) => setModifyAmount(entry, e.target.value)}
                        min="0"
                        step="0.001"
                        placeholder={String(entry.amount)}
                        className="h-9 w-24 text-right tabular-nums"
                      />
                      <span className="text-xs text-muted-foreground">{entry.unit}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {t('recipes.tabs.remove')}
            </h3>
            <p className="text-xs text-muted-foreground">{t('recipes.removeHint')}</p>
            {baseComposition.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {baseComposition.map((entry) => {
                  const ing = ingredients.find((i) => i.id === entry.ingredient_id);
                  const checked = removes.includes(entry.ingredient_id);
                  return (
                    <li
                      key={entry.ingredient_id}
                      className="flex items-center gap-3 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          toggleRemove(entry.ingredient_id, e.target.checked)
                        }
                        className="h-4 w-4 cursor-pointer"
                      />
                      <span className="flex-1 truncate">
                        {ing?.name_ru ?? entry.ingredient_id}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatAmountUnit(entry.amount, entry.unit)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {t('recipes.protocolAddendum')}
            </h3>
            <ProtocolStepsEditor steps={addendum} onChange={setAddendum} />
          </section>
        </div>

        <PreviewPanel resolved={preview} />
      </div>
    </Modal>
  );
}

function PreviewPanel({ resolved }) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <h3 className="text-sm font-semibold tracking-tight">
        {t('recipes.preview')}
      </h3>
      {resolved.warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <ul className="space-y-1">
            {resolved.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <CompositionList composition={resolved.composition} />
      <ProtocolList steps={resolved.protocol} />
    </div>
  );
}

function FlavorFormModal({ open, flavor, existingIds, onClose, onSaved }) {
  const isEdit = !!flavor;
  const [form, setForm] = useState({ name_ru: '', color_hex: '#FFD700', notes: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setForm({
      name_ru: flavor?.name_ru ?? '',
      color_hex: flavor?.color_hex ?? '#FFD700',
      notes: flavor?.notes ?? '',
    });
    setErrors({});
  }, [open, flavor]);

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    if (!form.name_ru.trim()) {
      setErrors({ name_ru: t('common.required') });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name_ru: form.name_ru.trim(),
        color_hex: form.color_hex || null,
        notes: form.notes.trim(),
      };
      if (isEdit) {
        await updateFlavor(flavor.id, payload);
        toast.push({ kind: 'success', message: t('recipes.flavorUpdatedToast') });
      } else {
        const id = uniqueSlug(payload.name_ru, existingIds);
        await createFlavor({ id, active: true, ...payload });
        toast.push({ kind: 'success', message: t('recipes.flavorAddedToast') });
      }
      await onSaved();
    } catch (err) {
      toast.push({ kind: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={isEdit ? t('recipes.editFlavor') : t('recipes.newFlavor')}
      size="sm"
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </SecondaryButton>
          <PrimaryButton onClick={handleSubmit} loading={submitting}>
            {t('common.save')}
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormField label={t('warehouse.name')} required error={errors.name_ru}>
          <TextInput
            value={form.name_ru}
            onChange={(e) => setField('name_ru', e.target.value)}
            error={errors.name_ru}
            autoFocus
          />
        </FormField>
        <FormField label={t('recipes.color')}>
          <div className="flex items-center gap-2">
            <ColorInput
              value={form.color_hex || '#cccccc'}
              onChange={(e) => setField('color_hex', e.target.value)}
              className="w-20"
            />
            <TextInput
              value={form.color_hex || ''}
              onChange={(e) => setField('color_hex', e.target.value)}
              placeholder="#FFD700"
              className="font-mono"
            />
          </div>
        </FormField>
        <FormField label={t('warehouse.notes')}>
          <TextArea
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            rows={2}
          />
        </FormField>
        <button type="submit" className="hidden" aria-hidden="true" />
      </form>
    </Modal>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

// Drop rows that are missing an ingredient_id or have an empty amount.
// Used by both editors to feed the preview and save functions cleanly.
function cleanComposition(rows) {
  return asArray(rows).filter(
    (r) => r.ingredient_id && r.amount !== '' && r.amount !== null && r.amount !== undefined
  );
}

function cleanSteps(steps) {
  return asArray(steps).map((s) => (typeof s === 'string' ? s : '')).filter((s) => s.trim());
}
