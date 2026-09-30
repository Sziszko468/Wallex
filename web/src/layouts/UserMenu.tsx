import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { User } from "../types/auth";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/icons/Icon";
import { ThemeSelector } from "../components/ThemeSelector";
import { SECURITY_ITEM } from "./navigation";
import styles from "./UserMenu.module.scss";

interface UserMenuProps {
  /** "sidebar": a full-width profile row that opens upward. "compact": just the avatar, opens downward. */
  variant: "sidebar" | "compact";
}

function displayName(user: User): string {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return fullName || user.email.split("@")[0] || user.email;
}

/** The account menu: who you are, the theme switch, security, and logging out. */
export function UserMenu({ variant }: UserMenuProps) {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Closing: on Escape (focus goes back to the button) or on a click elsewhere.
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isOpen]);

  if (!user) return null;
  const name = displayName(user);

  return (
    <div ref={containerRef} className={`${styles.menu} ${styles[variant]}`}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={variant === "compact" ? `Account menu, ${name}` : undefined}
        onClick={() => setIsOpen((open) => !open)}
      >
        <Avatar name={name} size="md" />
        {variant === "sidebar" && (
          <>
            <span className={styles.identity}>
              <span className={styles.name}>{name}</span>
              <span className={styles.email}>{user.email}</span>
            </span>
            <Icon name="chevron-down" size={16} className={isOpen ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron} />
          </>
        )}
      </button>

      {isOpen && (
        <div id={panelId} className={styles.panel}>
          <div className={styles.profile}>
            <Avatar name={name} size="lg" />
            <div className={styles.profileText}>
              <p className={styles.profileName}>{name}</p>
              <p className={styles.profileEmail}>{user.email}</p>
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionLabel}>Theme</p>
            <ThemeSelector size="sm" fullWidth />
          </div>

          <div className={styles.section}>
            <Link to={SECURITY_ITEM.to} className={styles.item} onClick={() => setIsOpen(false)}>
              <Icon name={SECURITY_ITEM.icon} size={18} />
              {SECURITY_ITEM.label}
            </Link>
            <button type="button" className={styles.item} onClick={() => void logout()}>
              <Icon name="log-out" size={18} />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
