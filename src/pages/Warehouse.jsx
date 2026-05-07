import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { t } from '../i18n/index.js';
import {
  createIngredient,
  deleteIngredient,
  getIngredients,
  getSettings,
  restockIngredient,
  updateIngredient,
} from '../api/db.js';
import { expiryStatus, stockStatus } from '../lib/status.js';
import {
  formatAmount,
  formatAmountUnit,
  formatDate,
  formatRelativeDay,
} from '../lib/format.js';
import { plural, FORMS } from '../lib/pluralize.js';
import { uniqueSlug } from '../lib/slug.js';
import PageHeader from '../components/PageHeader.jsx';
import Badge from '../components/Badge.jsx';
import { EmptyState, PageError, PageLoading } from '../components/StateView.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import {
  FormField,
  TextInput,
  NumberInput,
  TextArea,
  PrimaryButton,
  SecondaryButton,
} from '../components/FormField.jsx';
import { useToast } from '../components/Toast.jsx';

const COMMON_UNITS = ['кг', 'г', 'л', 'мл', 'шт'];

export default function Warehouse() {
  const [data, setData] = useState({ status: 'loading' });
  const [editing, setEditing] = useState(null); // ingredient | { isNew: true } | null
  const [restocking, setRestocking] = useState(null); // ingredient | null
  const [deleting, setDeleting] = useState(null); // ingredient | null
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const toast = useToast();

  function refresh() {
    return Promise.all([getIngredients(), getSettings()])
      .then(([ingredients, settings]) =>
        setData({ status: 'ready', ingredients, settings })
      )
      .catch((err) => setData({ status: 'error', error: err.message }));
  }

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

  async function handleDelete() {
    if (!deleting) return;
    setDeleteSubmitting(true);
    try {
      await deleteIngredient(deleting.id);
      toast.push({ kind: 'success', message: t('warehouse.deletedToast') });
      setDeleting(null);
      await refresh();
    } catch (err) {
      toast.push({ kind: 'error', message: err.message });
    } finally {
      setDeleteSubmitting(false);
    }
  }

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('warehouse.title')}
        subtitle={plural(sorted.length, FORMS.ingredients)}
        actions={
          <PrimaryButton onClick={() => setEditing({ isNew: true })}>
            <Plus size={16} />
            {t('warehouse.addIngredient')}
          </PrimaryButton>
        }
      />

      {sorted.length === 0 ? (
        <EmptyState title={t('warehouse.noIngredients')} />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {sorted.map((item) => (
              <IngredientCard
                key={item.id}
                item={item}
                warningDays={warningDays}
                onEdit={() => setEditing(item)}
                onRestock={() => setRestocking(item)}
                onDelete={() => setDeleting(item)}
              />
            ))}
          </div>
          <div className="hidden md:block">
            <IngredientTable
              items={sorted}
              warningDays={warningDays}
              onEdit={(item) => setEditing(item)}
              onRestock={(item) => setRestocking(item)}
              onDelete={(item) => setDeleting(item)}
            />
          </div>
        </>
      )}

      <IngredientFormModal
        open={editing !== null}
        ingredient={editing && !editing.isNew ? editing : null}
        existingIds={data.ingredients.map((i) => i.id)}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await refresh();
        }}
      />

      <RestockDialog
        open={restocking !== null}
        ingredient={restocking}
        onClose={() => setRestocking(null)}
        onSaved={async () => {
          setRestocking(null);
          await refresh();
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={
          deleting ? t('warehouse.deleteConfirm', { name: deleting.name_ru }) : ''
        }
        description={t('warehouse.deleteConfirmDescription')}
        destructive
        loading={deleteSubmitting}
        confirmLabel={t('warehouse.delete')}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
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

function ActionButtons({ onEdit, onRestock, onDelete }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onRestock}
        aria-label={t('warehouse.restock')}
        title={t('warehouse.restock')}
        className="flex h-9 w-9 items-center justify-center rounded-md text-foreground/70 hover:bg-accent"
      >
        <RefreshCw size={16} />
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label={t('common.edit')}
        title={t('common.edit')}
        className="flex h-9 w-9 items-center justify-center rounded-md text-foreground/70 hover:bg-accent"
      >
        <Pencil size={16} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={t('common.delete')}
        title={t('common.delete')}
        className="flex h-9 w-9 items-center justify-center rounded-md text-destructive/70 hover:bg-destructive/10"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function IngredientTable({ items, warningDays, onEdit, onRestock, onDelete }) {
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
            <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
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
              <td className="px-4 py-3 align-top">
                <div className="flex justify-end">
                  <ActionButtons
                    onEdit={() => onEdit(item)}
                    onRestock={() => onRestock(item)}
                    onDelete={() => onDelete(item)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IngredientCard({ item, warningDays, onEdit, onRestock, onDelete }) {
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

      <div className="mt-3 flex justify-end border-t border-border pt-3">
        <ActionButtons
          onEdit={onEdit}
          onRestock={onRestock}
          onDelete={onDelete}
        />
      </div>
    </article>
  );
}

function emptyForm() {
  return {
    name_ru: '',
    unit: 'кг',
    current_stock: '',
    min_threshold: '',
    lot_number: '',
    expiry_date: '',
    supplier: '',
    notes: '',
  };
}

function ingredientToForm(ing) {
  return {
    name_ru: ing.name_ru ?? '',
    unit: ing.unit ?? 'кг',
    current_stock: ing.current_stock ?? '',
    min_threshold: ing.min_threshold ?? '',
    lot_number: ing.lot_number ?? '',
    expiry_date: ing.expiry_date ?? '',
    supplier: ing.supplier ?? '',
    notes: ing.notes ?? '',
  };
}

function IngredientFormModal({ open, ingredient, existingIds, onClose, onSaved }) {
  const isEdit = !!ingredient;
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setForm(ingredient ? ingredientToForm(ingredient) : emptyForm());
    setErrors({});
  }, [open, ingredient]);

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  function validate() {
    const e = {};
    if (!form.name_ru.trim()) e.name_ru = t('common.required');
    if (!form.unit.trim()) e.unit = t('common.required');
    const stock = Number(form.current_stock);
    if (form.current_stock === '' || !Number.isFinite(stock) || stock < 0) {
      e.current_stock = t('common.invalidNumber');
    }
    const min = Number(form.min_threshold);
    if (form.min_threshold === '' || !Number.isFinite(min) || min < 0) {
      e.min_threshold = t('common.invalidNumber');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        name_ru: form.name_ru.trim(),
        unit: form.unit.trim(),
        current_stock: Number(form.current_stock),
        min_threshold: Number(form.min_threshold),
        lot_number: form.lot_number.trim(),
        expiry_date: form.expiry_date || null,
        supplier: form.supplier.trim(),
        notes: form.notes.trim(),
      };
      if (isEdit) {
        await updateIngredient(ingredient.id, payload);
        toast.push({ kind: 'success', message: t('warehouse.updatedToast') });
      } else {
        const id = uniqueSlug(payload.name_ru, existingIds, 'ing');
        await createIngredient({ id, ...payload });
        toast.push({ kind: 'success', message: t('warehouse.addedToast') });
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
      title={isEdit ? t('warehouse.editIngredient') : t('warehouse.newIngredient')}
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

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={t('warehouse.unit')} required error={errors.unit}>
            <TextInput
              value={form.unit}
              onChange={(e) => setField('unit', e.target.value)}
              error={errors.unit}
              list="warehouse-units"
            />
            <datalist id="warehouse-units">
              {COMMON_UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </FormField>
          <FormField
            label={t('warehouse.currentStock')}
            required
            error={errors.current_stock}
          >
            <NumberInput
              value={form.current_stock}
              onChange={(e) => setField('current_stock', e.target.value)}
              error={errors.current_stock}
              min="0"
              step="0.01"
            />
          </FormField>
          <FormField
            label={t('warehouse.minThreshold')}
            required
            error={errors.min_threshold}
          >
            <NumberInput
              value={form.min_threshold}
              onChange={(e) => setField('min_threshold', e.target.value)}
              error={errors.min_threshold}
              min="0"
              step="0.01"
            />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('warehouse.lotNumber')}>
            <TextInput
              value={form.lot_number}
              onChange={(e) => setField('lot_number', e.target.value)}
            />
          </FormField>
          <FormField label={t('warehouse.expiryDate')}>
            <TextInput
              type="date"
              value={form.expiry_date}
              onChange={(e) => setField('expiry_date', e.target.value)}
            />
          </FormField>
        </div>

        <FormField label={t('warehouse.supplier')}>
          <TextInput
            value={form.supplier}
            onChange={(e) => setField('supplier', e.target.value)}
          />
        </FormField>

        <FormField label={t('warehouse.notes')}>
          <TextArea
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            rows={2}
          />
        </FormField>

        {/* Hidden submit so Enter submits */}
        <button type="submit" className="hidden" aria-hidden="true" />
      </form>
    </Modal>
  );
}

function RestockDialog({ open, ingredient, onClose, onSaved }) {
  const [amount, setAmount] = useState('');
  const [lot, setLot] = useState('');
  const [expiry, setExpiry] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setLot('');
    setExpiry('');
    setError(null);
  }, [open, ingredient]);

  if (!ingredient) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError(t('common.invalidNumber'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await restockIngredient(ingredient.id, {
        amount: n,
        lot_number: lot.trim() || undefined,
        expiry_date: expiry || undefined,
      });
      toast.push({ kind: 'success', message: t('warehouse.restockedToast') });
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
      title={t('warehouse.restockTitle', { name: ingredient.name_ru })}
      size="sm"
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </SecondaryButton>
          <PrimaryButton onClick={handleSubmit} loading={submitting}>
            {t('warehouse.restockSubmit')}
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormField
          label={`${t('warehouse.restockAmount')} (${ingredient.unit})`}
          required
          error={error}
          hint={
            ingredient.current_stock !== undefined
              ? `${t('warehouse.currentStock')}: ${formatAmountUnit(ingredient.current_stock, ingredient.unit)}`
              : null
          }
        >
          <NumberInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={error}
            min="0"
            step="0.01"
            autoFocus
          />
        </FormField>

        <FormField label={t('warehouse.restockNewLot')}>
          <TextInput value={lot} onChange={(e) => setLot(e.target.value)} />
        </FormField>

        <FormField label={t('warehouse.restockNewExpiry')}>
          <TextInput
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
        </FormField>

        <button type="submit" className="hidden" aria-hidden="true" />
      </form>
    </Modal>
  );
}
