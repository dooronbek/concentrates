import Modal from './Modal.jsx';
import { DestructiveButton, PrimaryButton, SecondaryButton } from './FormField.jsx';
import { t } from '../i18n/index.js';

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const Confirm = destructive ? DestructiveButton : PrimaryButton;
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <SecondaryButton onClick={onCancel} disabled={loading}>
            {cancelLabel ?? t('common.cancel')}
          </SecondaryButton>
          <Confirm onClick={onConfirm} loading={loading}>
            {confirmLabel ?? t('common.confirm')}
          </Confirm>
        </>
      }
    >
      <div className="text-sm text-muted-foreground">{description}</div>
    </Modal>
  );
}
