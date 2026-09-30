import { Outlet } from "react-router-dom";
import { BrandMark } from "../components/icons/BrandMark";
import { ThemeSelector } from "../components/ThemeSelector";
import styles from "./AuthLayout.module.scss";

/** Log in / register. A calm split screen on desktop, a single centred card on smaller screens. */
export function AuthLayout() {
  return (
    <div className={styles.page}>
      <aside className={styles.brandPanel}>
        <div className={styles.brand}>
          <BrandMark size={36} />
          <span className={styles.wordmark}>Spendly</span>
        </div>

        <div className={styles.pitch}>
          <p className={styles.headline}>A calmer way to see where your money goes.</p>
          <p className={styles.subline}>
            Track spending, stay within your budgets and work towards your goals — without the noise.
          </p>
        </div>

        <svg className={styles.art} viewBox="0 0 400 400" fill="none" aria-hidden="true" focusable="false">
          <circle cx="200" cy="200" r="190" className={styles.artRing} />
          <circle cx="200" cy="200" r="145" className={styles.artRing} />
          <g transform="rotate(-100 200 200)" strokeWidth="44" strokeLinecap="round">
            <circle cx="200" cy="200" r="100" stroke="var(--color-primary)" strokeDasharray="188.5 439.8" />
            <circle cx="200" cy="200" r="100" stroke="var(--color-savings)" strokeDasharray="125.7 502.6" strokeDashoffset="-267.9" />
            <circle cx="200" cy="200" r="100" stroke="var(--color-sand)" strokeDasharray="75.4 552.9" strokeDashoffset="-472.9" />
          </g>
        </svg>
      </aside>

      <main className={styles.formPanel}>
        <div className={styles.mobileBrand}>
          <BrandMark size={32} />
          <span className={styles.wordmark}>Spendly</span>
        </div>

        <div className={styles.card}>
          <Outlet />
        </div>

        <div className={styles.theme}>
          <ThemeSelector size="sm" />
        </div>
      </main>
    </div>
  );
}
