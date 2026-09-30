import { Icon } from "./icons/Icon";
import styles from "./Field.module.scss";

interface FieldMessagesProps {
  /** The control's id — the messages get `${id}-hint` / `${id}-error` so aria-describedby can point at them. */
  id: string;
  hint?: string;
  error?: string;
}

/** The hint and error lines under a form control. The error also carries an icon (colour isn't the only signal). */
export function FieldMessages({ id, hint, error }: FieldMessagesProps) {
  return (
    <>
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          <Icon name="alert-circle" size={14} />
          <span>{error}</span>
        </p>
      )}
    </>
  );
}
