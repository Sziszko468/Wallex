import { Outlet } from "react-router-dom";
import styles from "./AuthLayout.module.scss";

export function AuthLayout() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.brand}>Spendly</h1>
        <Outlet />
      </div>
    </div>
  );
}
