import { useTranslation } from "react-i18next";
import type { RecurringTransaction } from "../../types/recurringTransaction";
import type { Category } from "../../types/category";
import { formatCurrency, formatDate } from "../../utils/format";
import { frequencyLabel } from "../../utils/subscriptions";
import { Badge } from "../Badge";
import { CategoryMark } from "../CategoryMark";
import { IconButton } from "../IconButton";
import { ListRow, RowList } from "../ListRow";
import styles from "./RecurringList.module.scss";

interface RecurringListProps {
  items: RecurringTransaction[];
  categoriesById: Map<number, Category>;
  onEdit: (item: RecurringTransaction) => void;
  onDelete: (item: RecurringTransaction) => void;
  onToggleActive: (item: RecurringTransaction) => void;
  togglingId: number | null;
}

export function RecurringList({ items, categoriesById, onEdit, onDelete, onToggleActive, togglingId }: RecurringListProps) {
  const { t } = useTranslation();
  return (
    <RowList label={t("recurring.listLabel")}>
      {items.map((item) => {
        const category = categoriesById.get(item.category);
        const isIncome = item.type === "income";
        return (
          <ListRow
            key={item.id}
            dimmed={!item.is_active}
            leading={<CategoryMark category={category} />}
            title={
              <>
                {item.name}
                {item.is_subscription && (
                  <Badge tone="primary" className={styles.badge}>
                    {t("recurring.subscriptionBadge")}
                  </Badge>
                )}
              </>
            }
            meta={
              <>
                {category && <span>{category.name}</span>}
                <span>{frequencyLabel(item.frequency)}</span>
                <span>{t("recurring.next", { date: formatDate(item.next_occurrence_date) })}</span>
              </>
            }
            trailing={
              <>
                <span className={isIncome ? styles.income : undefined}>
                  {isIncome ? "+" : "−"}
                  {formatCurrency(item.amount, item.currency)}
                </span>
                {!item.is_active && (
                  <Badge variant="outline" icon="pause">
                    {t("recurring.paused")}
                  </Badge>
                )}
              </>
            }
            actions={
              <>
                <IconButton
                  icon={item.is_active ? "pause" : "play"}
                  label={t(item.is_active ? "recurring.pause" : "recurring.resume", { name: item.name })}
                  size="sm"
                  disabled={togglingId === item.id}
                  onClick={() => onToggleActive(item)}
                />
                <IconButton icon="pencil" label={t("common.item.edit", { name: item.name })} size="sm" onClick={() => onEdit(item)} />
                <IconButton icon="trash" label={t("common.item.delete", { name: item.name })} variant="danger" size="sm" onClick={() => onDelete(item)} />
              </>
            }
          />
        );
      })}
    </RowList>
  );
}
