import { Link } from "react-router-dom";
import { BrandMark } from "../components/icons/BrandMark";
import { UserMenu } from "./UserMenu";
import styles from "./TopBar.module.scss";

/** The compact header for phones and tablets: the brand on the left, the account on the right. */
export function TopBar() {
  return (
    <header className={styles.topbar}>
      <Link to="/dashboard" className={styles.brand} aria-label="Spendly">
        <BrandMark size={28} />
        <span className={styles.wordmark}>Spendly</span>
      </Link>
      <UserMenu variant="compact" />
    </header>
  );
}
