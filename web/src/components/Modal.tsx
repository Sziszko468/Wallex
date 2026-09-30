import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { IconButton } from "./IconButton";
import styles from "./Modal.module.scss";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** A line under the title that also becomes the dialog's accessible description. */
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  /**
   * "center": a dialog in the middle of the screen. "right": a drawer attached to the right edge.
   * Below tablet width both become a bottom sheet — the natural shape on a phone.
   */
  placement?: "center" | "right";
}

// How many dialogs are open right now: the page behind is locked while at least one is.
let openDialogCount = 0;

function lockPage() {
  openDialogCount += 1;
  if (openDialogCount > 1) return;
  document.body.dataset.previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  // `inert` takes the page behind out of the tab order and the accessibility tree.
  document.getElementById("root")?.setAttribute("inert", "");
}

function unlockPage() {
  openDialogCount = Math.max(0, openDialogCount - 1);
  if (openDialogCount > 0) return;
  document.body.style.overflow = document.body.dataset.previousOverflow ?? "";
  delete document.body.dataset.previousOverflow;
  document.getElementById("root")?.removeAttribute("inert");
}

export function Modal({ isOpen, onClose, title, description, children, size = "md", placement = "center" }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Callers pass a fresh onClose on every render; the listeners below shouldn't be rebuilt for that.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    lockPage();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      unlockPage();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return createPortal(
    <div className={`${styles.backdrop} ${styles[placement]}`} onMouseDown={handleBackdropMouseDown}>
      <div
        ref={dialogRef}
        className={`${styles.dialog} ${styles[size]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className={styles.description}>
                {description}
              </p>
            )}
          </div>
          <IconButton icon="x" label="Close" size="sm" onClick={onClose} />
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
