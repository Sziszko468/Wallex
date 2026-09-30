import { useId, useState, type ReactNode } from "react";
import { Icon } from "./icons/Icon";
import styles from "./Disclosure.module.scss";

interface DisclosureProps {
  title: string;
  description?: string;
  /** Whether it starts open. Not reactive: the user's own toggling takes over after the first render. */
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * A titled section the reader can fold away — used to keep long pages short on phones.
 * Closed content isn't rendered at all, so it costs nothing until it's opened.
 */
export function Disclosure({ title, description, defaultOpen = true, children }: DisclosureProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className={styles.disclosure}>
      <h2 className={styles.heading}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className={styles.titles}>
            <span className={styles.title}>{title}</span>
            {description && <span className={styles.description}>{description}</span>}
          </span>
          <Icon name="chevron-down" size={20} className={isOpen ? `${styles.chevron} ${styles.open}` : styles.chevron} />
        </button>
      </h2>
      <div id={panelId} className={styles.panel} hidden={!isOpen}>
        {isOpen && children}
      </div>
    </section>
  );
}
