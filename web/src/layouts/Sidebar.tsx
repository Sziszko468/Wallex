import { useTranslation } from "react-i18next";
import { Link, NavLink } from "react-router-dom";
import { Button } from "../components/Button";
import { APP_NAME } from "../config/app";
import { BrandMark } from "../components/icons/BrandMark";
import { Icon } from "../components/icons/Icon";
import { NAV_GROUPS, SETTINGS_ITEM, type NavItem } from "./navigation";
import { UserMenu } from "./UserMenu";
import styles from "./Sidebar.module.scss";

interface SidebarProps {
  onAddTransaction: () => void;
}

function SidebarLink({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  return (
    <NavLink to={item.to} className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
      <Icon name={item.icon} size={20} />
      {t(item.labelKey)}
    </NavLink>
  );
}

/** The desktop navigation: brand, the quick-add button, every destination, then the account. */
export function Sidebar({ onAddTransaction }: SidebarProps) {
  const { t } = useTranslation();
  return (
    <aside className={styles.sidebar}>
      <Link to="/dashboard" className={styles.brand} aria-label={APP_NAME}>
        <BrandMark size={30} />
        <span className={styles.wordmark}>{APP_NAME}</span>
      </Link>

      <Button leadingIcon="plus" onClick={onAddTransaction} fullWidth>
        {t("nav.newTransaction")}
      </Button>

      <nav aria-label={t("nav.primary")} className={styles.nav}>
        {NAV_GROUPS.map((group) => (
          <div key={group.labelKey} className={styles.group}>
            <p className={styles.groupLabel} aria-hidden="true">
              {t(group.labelKey)}
            </p>
            <ul className={styles.list} aria-label={t(group.labelKey)}>
              {group.items.map((item) => (
                <li key={item.to}>
                  <SidebarLink item={item} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={styles.footer}>
        <SidebarLink item={SETTINGS_ITEM} />
        <UserMenu variant="sidebar" />
      </div>
    </aside>
  );
}
