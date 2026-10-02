import { useTranslation } from "react-i18next";
import { formatSignedPercentage } from "../../utils/format";
import { Badge } from "../Badge";

interface ChangeBadgeProps {
  /** Percentage change computed by the API; null when there was nothing to compare with. */
  value: number | null;
  /** For spending, a decrease is the good direction (green); for income, an increase. */
  goodWhen?: "down" | "up";
}

/** A change vs. an earlier period: the signed percentage, an arrow, and a tone for good/bad. */
export function ChangeBadge({ value, goodWhen = "down" }: ChangeBadgeProps) {
  const { t } = useTranslation();
  if (value === null) {
    return <Badge tone="neutral">{t("dashboard.categoryTrends.isNew")}</Badge>;
  }
  if (value === 0) {
    return <Badge tone="neutral">{formatSignedPercentage(value)}</Badge>;
  }
  const isGood = (value < 0) === (goodWhen === "down");
  return (
    <Badge tone={isGood ? "success" : "danger"} icon={value > 0 ? "arrow-up" : "arrow-down"}>
      {formatSignedPercentage(value)}
    </Badge>
  );
}
