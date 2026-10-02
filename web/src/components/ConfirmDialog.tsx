import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { Button } from "./Button";
import formStyles from "./form.module.scss";
import styles from "./ConfirmDialog.module.scss";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  isConfirming = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className={styles.message}>{message}</p>
      <div className={formStyles.actions}>
        <Button type="button" variant="secondary" onClick={onClose} disabled={isConfirming}>
          {t("common.actions.cancel")}
        </Button>
        <Button type="button" variant="danger" onClick={onConfirm} isLoading={isConfirming}>
          {confirmLabel ?? t("common.actions.confirm")}
        </Button>
      </div>
    </Modal>
  );
}
