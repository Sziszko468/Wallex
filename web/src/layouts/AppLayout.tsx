import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { SyncProvider } from "../hooks/useSync";
import styles from "./AppLayout.module.scss";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/recurring", label: "Recurring" },
  { to: "/subscriptions", label: "Subscriptions" },
  { to: "/budgets", label: "Budgets" },
  { to: "/goals", label: "Goals" },
  { to: "/achievements", label: "Achievements" },
  { to: "/categories", label: "Categories" },
  { to: "/import", label: "Import" },
  { to: "/settings", label: "Settings" },
];

export function AppLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, logout } = useAuth();

  async function handleLogout() {
    setIsMenuOpen(false);
    await logout();
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerBar}>
          <span className={styles.brand}>Spendly</span>
          <button
            type="button"
            className={styles.menuToggle}
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-controls="app-nav"
          >
            {isMenuOpen ? "Close" : "Menu"}
          </button>
        </div>

        <nav id="app-nav" className={`${styles.nav} ${isMenuOpen ? styles.navOpen : ""}`}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`
              }
              onClick={() => setIsMenuOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
          <div className={styles.navFooter}>
            {user && <span className={styles.userEmail}>{user.email}</span>}
            <button type="button" className={styles.logoutButton} onClick={handleLogout}>
              Log out
            </button>
          </div>
        </nav>
      </header>

      <main className={styles.main}>
        {/* Signed-in pages only: keeps them in step with the account's other devices. */}
        <SyncProvider>
          <Outlet />
        </SyncProvider>
      </main>
    </div>
  );
}
