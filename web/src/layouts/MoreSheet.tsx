import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { Icon } from "../components/icons/Icon";
import { Modal } from "../components/Modal";
import { MORE_ITEMS } from "./navigation";
import styles from "./MoreSheet.module.scss";

interface MoreSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Every destination that doesn't fit in the phone's bottom bar, as big, easy-to-hit tiles. */
export function MoreSheet({ isOpen, onClose }: MoreSheetProps) {
  const { t } = useTranslation();
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("nav.more")} size="sm">
      <nav aria-label={t("nav.moreDestinations")}>
        <ul className={styles.grid}>
          {MORE_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/settings"}
                className={({ isActive }) => (isActive ? `${styles.tile} ${styles.active}` : styles.tile)}
                onClick={onClose}
              >
                <span className={styles.icon}>
                  <Icon name={item.icon} size={22} />
                </span>
                {t(item.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </Modal>
  );
}
