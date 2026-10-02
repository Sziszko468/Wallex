import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "./icons/Icon";
import { IconButton } from "./IconButton";
import styles from "./Toast.module.scss";

type ToastTone = "success" | "error";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const SUCCESS_MS = 4500;
const ERROR_MS = 9000;
const MAX_VISIBLE = 3;

const ToastContext = createContext<ToastApi | null>(null);

/** Short confirmations ("Transaction added") that appear, announce themselves politely, and leave. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (tone: ToastTone, message: string) => {
      const id = ++nextId.current;
      setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? ERROR_MS : SUCCESS_MS);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({ success: (message) => show("success", message), error: (message) => show("error", message) }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className={styles.region} aria-live="polite">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`${styles.toast} ${styles[toast.tone]}`}
              role={toast.tone === "error" ? "alert" : "status"}
            >
              <Icon name={toast.tone === "error" ? "alert-circle" : "check-circle"} size={20} className={styles.icon} />
              <span className={styles.message}>{toast.message}</span>
              <IconButton icon="x" label={t("common.actions.dismiss")} size="sm" onClick={() => dismiss(toast.id)} />
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
