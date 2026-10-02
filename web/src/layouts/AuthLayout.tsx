import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";
import { BrandMark } from "../components/icons/BrandMark";
import { LanguageSelector } from "../components/LanguageSelector";
import { APP_NAME } from "../config/app";
import { ThemeSelector } from "../components/ThemeSelector";
import styles from "./AuthLayout.module.scss";

/** Log in / register. A calm split screen on desktop, a single centred card on smaller screens. */
export function AuthLayout() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <aside className={styles.brandPanel}>
        <div className={styles.brand}>
          <BrandMark size={36} />
          <span className={styles.wordmark}>{APP_NAME}</span>
        </div>

        <div className={styles.pitch}>
          <p className={styles.headline}>{t("auth.layout.headline")}</p>
          <p className={styles.subline}>{t("auth.layout.subline")}</p>
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
          <span className={styles.wordmark}>{APP_NAME}</span>
        </div>

        <div className={styles.card}>
          <Outlet />
        </div>

        <div className={styles.preferences}>
          <LanguageSelector size="sm" />
          <ThemeSelector size="sm" />
        </div>
      </main>
    </div>
  );
}
