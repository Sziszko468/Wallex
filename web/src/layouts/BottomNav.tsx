import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { Icon } from "../components/icons/Icon";
import { BOTTOM_BAR_ITEMS } from "./navigation";
import { MoreSheet } from "./MoreSheet";
import styles from "./BottomNav.module.scss";

interface BottomNavProps {
  onAddTransaction: () => void;
}

/**
 * The phone/tablet navigation: three destinations, a floating "new transaction" button in the
 * middle (right under the thumb), and "More" for the rest. Every target is at least 44px.
 */
export function BottomNav({ onAddTransaction }: BottomNavProps) {
  const { t } = useTranslation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [first, second, third] = BOTTOM_BAR_ITEMS;

  function renderLink(item: (typeof BOTTOM_BAR_ITEMS)[number] | undefined) {
    if (!item) return null;
    return (
      <li>
        <NavLink to={item.to} className={({ isActive }) => (isActive ? `${styles.item} ${styles.active}` : styles.item)}>
          <span className={styles.iconWrap}>
            <Icon name={item.icon} size={22} />
          </span>
          <span className={styles.label}>{t(item.labelKey)}</span>
        </NavLink>
      </li>
    );
  }

  return (
    <>
      <nav aria-label={t("nav.primary")} className={styles.bar}>
        <ul className={styles.list}>
          {renderLink(first)}
          {renderLink(second)}
          <li className={styles.fabSlot} aria-hidden="true" />
          {renderLink(third)}
          <li>
            <button
              type="button"
              className={styles.item}
              aria-haspopup="dialog"
              aria-expanded={isMoreOpen}
              onClick={() => setIsMoreOpen(true)}
            >
              <span className={styles.iconWrap}>
                <Icon name="menu" size={22} />
              </span>
              <span className={styles.label}>{t("nav.more")}</span>
            </button>
          </li>
        </ul>
      </nav>

      <button type="button" className={styles.fab} aria-label={t("nav.newTransaction")} onClick={onAddTransaction}>
        <Icon name="plus" size={26} strokeWidth={2.25} />
      </button>

      <MoreSheet isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} />
    </>
  );
}
