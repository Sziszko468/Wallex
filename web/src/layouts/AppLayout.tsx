import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { QuickAddTransaction } from "../components/transactions/QuickAddTransaction";
import { ToastProvider } from "../components/Toast";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { SyncProvider } from "../hooks/useSync";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import styles from "./AppLayout.module.scss";

// Mirrors $breakpoint-desktop in styles/_mixins.scss.
const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * The signed-in shell. Wide screens get a sidebar; phones and tablets get a slim top bar and a
 * bottom tab bar. Only one of them exists in the page at a time, so assistive technology never
 * meets two copies of the navigation.
 */
export function AppLayout() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY, true);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const openQuickAdd = useCallback(() => setIsQuickAddOpen(true), []);
  const closeQuickAdd = useCallback(() => setIsQuickAddOpen(false), []);

  // A client-side navigation keeps the scroll position; a new page should start at the top.
  // It also makes no sound for screen-reader users, so the new page's title is announced.
  const { pathname } = useLocation();
  const [announcement, setAnnouncement] = useState("");
  const announcedPath = useRef(pathname);
  useEffect(() => {
    window.scrollTo?.(0, 0);
    if (announcedPath.current === pathname) return; // the page that was already there on load
    announcedPath.current = pathname;
    // The page sets its title in its own effect, which runs just after this one.
    const timer = window.setTimeout(() => setAnnouncement(document.title), 120);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <ToastProvider>
      <div className={styles.shell}>
        <a className={styles.skipLink} href="#main-content">
          Skip to main content
        </a>

        {isDesktop ? <Sidebar onAddTransaction={openQuickAdd} /> : <TopBar />}

        <main id="main-content" className={styles.main} tabIndex={-1}>
          <div className={styles.content}>
            {/* Signed-in pages only: keeps them in step with the account's other devices. */}
            <SyncProvider>
              <Outlet />
            </SyncProvider>
          </div>
        </main>

        {!isDesktop && <BottomNav onAddTransaction={openQuickAdd} />}

        <div className={styles.announcer} aria-live="polite" aria-atomic="true">
          {announcement}
        </div>
      </div>

      <QuickAddTransaction isOpen={isQuickAddOpen} onClose={closeQuickAdd} />
    </ToastProvider>
  );
}
