import { Link, NavLink } from "react-router-dom";
import { Button } from "../components/Button";
import { BrandMark } from "../components/icons/BrandMark";
import { Icon } from "../components/icons/Icon";
import { NAV_GROUPS, SETTINGS_ITEM, type NavItem } from "./navigation";
import { UserMenu } from "./UserMenu";
import styles from "./Sidebar.module.scss";

interface SidebarProps {
  onAddTransaction: () => void;
}

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
      <Icon name={item.icon} size={20} />
      {item.label}
    </NavLink>
  );
}

/** The desktop navigation: brand, the quick-add button, every destination, then the account. */
export function Sidebar({ onAddTransaction }: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <Link to="/dashboard" className={styles.brand} aria-label="Spendly">
        <BrandMark size={30} />
        <span className={styles.wordmark}>Spendly</span>
      </Link>

      <Button leadingIcon="plus" onClick={onAddTransaction} fullWidth>
        New transaction
      </Button>

      <nav aria-label="Primary" className={styles.nav}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className={styles.group}>
            <p className={styles.groupLabel} aria-hidden="true">
              {group.label}
            </p>
            <ul className={styles.list} aria-label={group.label}>
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
