import { useEffect, useState } from 'react';
import { Database, Mail } from 'lucide-react';
import { t } from '../i18n/index.js';
import { getSettings, isMockMode, updateSettings } from '../api/db.js';
import { useAuth } from '../auth/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Badge from '../components/Badge.jsx';
import { PageError, PageLoading } from '../components/StateView.jsx';
import {
  FormField,
  NumberInput,
  PrimaryButton,
  TextInput,
} from '../components/FormField.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Settings() {
  const [data, setData] = useState({ status: 'loading' });
  const [form, setForm] = useState({ operator_name: '', expiry_warning_days: 30 });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((settings) => {
        if (cancelled) return;
        setData({ status: 'ready', settings });
        setForm({
          operator_name: settings.operator_name ?? '',
          expiry_warning_days: settings.expiry_warning_days ?? 30,
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
        <PageHeader title={t('settings.title')} />
        <PageLoading />
      </div>
    );
  }
  if (data.status === 'error') {
    return (
      <div className="space-y-6">
        <PageHeader title={t('settings.title')} />
        <PageError error={data.error} />
      </div>
    );
  }

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  function validate() {
    const e = {};
    const days = Number(form.expiry_warning_days);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      e.expiry_warning_days = '1–365';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (saving) return;
    if (!validate()) return;
    setSaving(true);
    try {
      const patch = {
        operator_name: form.operator_name.trim(),
        expiry_warning_days: Number(form.expiry_warning_days),
      };
      const next = await updateSettings(patch);
      setData({ status: 'ready', settings: next });
      toast.push({ kind: 'success', message: t('settings.savedToast') });
    } catch (err) {
      toast.push({ kind: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL || '—';
  const operatorEmail =
    user?.email && !user.email.startsWith('operator (mock)')
      ? user.email
      : import.meta.env.VITE_OPERATOR_EMAIL || '—';

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <FormField
          label={t('settings.operatorName')}
          hint={t('settings.operatorNameHint')}
        >
          <TextInput
            value={form.operator_name}
            onChange={(e) => setField('operator_name', e.target.value)}
            placeholder="Иван Петров"
          />
        </FormField>

        <FormField
          label={t('settings.expiryWarningDays')}
          hint={t('settings.expiryWarningDaysHint')}
          error={errors.expiry_warning_days}
        >
          <NumberInput
            value={form.expiry_warning_days}
            onChange={(e) => setField('expiry_warning_days', e.target.value)}
            min="1"
            max="365"
            step="1"
            inputMode="numeric"
            error={errors.expiry_warning_days}
          />
        </FormField>

        <div className="flex justify-end pt-2">
          <PrimaryButton onClick={handleSave} loading={saving}>
            {t('settings.save')}
          </PrimaryButton>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-5">
        <header className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight">
            {t('settings.supabaseInfo')}
          </h2>
          {isMockMode() && (
            <Badge variant="warning">{t('app.mockBadge')}</Badge>
          )}
        </header>
        <dl className="grid gap-3 text-sm sm:grid-cols-[160px,1fr]">
          <dt className="flex items-center gap-2 text-muted-foreground">
            <Database size={14} />
            {t('settings.supabaseUrl')}
          </dt>
          <dd className="break-all font-mono text-xs text-foreground">{supabaseUrl}</dd>

          <dt className="flex items-center gap-2 text-muted-foreground">
            <Mail size={14} />
            {t('settings.supabaseEmail')}
          </dt>
          <dd className="break-all font-mono text-xs text-foreground">{operatorEmail}</dd>
        </dl>
      </section>
    </div>
  );
}
