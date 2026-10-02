import { useTranslation } from "react-i18next";
import type { Merchant } from "../../types/dashboard";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { EmptyState } from "../EmptyState";
import { ChangeBadge } from "./ChangeBadge";
import styles from "./TopMerchantsList.module.scss";

interface TopMerchantsListProps {
  merchants: Merchant[];
}

/** Where the money went: merchants by total, with the API's count, average, share and change. */
export function TopMerchantsList({ merchants }: TopMerchantsListProps) {
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  if (merchants.length === 0) {
    return <EmptyState icon="shopping-bag" message={t("dashboard.merchants.empty")} />;
  }

  return (
    <ol className={styles.list}>
      {merchants.map((merchant) => (
        <li key={merchant.merchant} className={styles.item}>
          <span className={styles.initial} aria-hidden="true">
            {merchant.merchant.charAt(0).toUpperCase()}
          </span>
          <div className={styles.details}>
            <span className={styles.name}>{merchant.merchant}</span>
            <span className={styles.meta}>
              {t("dashboard.merchants.meta", { count: merchant.transaction_count, average: formatCurrency(merchant.average, baseCurrency) })}
              {merchant.share_percentage !== null &&
                ` · ${t("dashboard.merchants.share", { percentage: formatPercentage(merchant.share_percentage) })}`}
            </span>
          </div>
          <div className={styles.figures}>
            <span className={styles.total}>{formatCurrency(merchant.total, baseCurrency)}</span>
            <ChangeBadge value={merchant.change_percentage} />
          </div>
        </li>
      ))}
    </ol>
  );
}
