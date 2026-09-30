import type { RecurringTransaction } from "../../types/recurringTransaction";
import type { Category } from "../../types/category";
import { formatCurrency, formatDate } from "../../utils/format";
import { Badge } from "../Badge";
import { CategoryMark } from "../CategoryMark";
import { IconButton } from "../IconButton";
import { ListRow, RowList } from "../ListRow";
import styles from "./RecurringList.module.scss";

const FREQUENCY_LABELS: Record<RecurringTransaction["frequency"], string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

interface RecurringListProps {
  items: RecurringTransaction[];
  categoriesById: Map<number, Category>;
  onEdit: (item: RecurringTransaction) => void;
  onDelete: (item: RecurringTransaction) => void;
  onToggleActive: (item: RecurringTransaction) => void;
  togglingId: number | null;
}

export function RecurringList({ items, categoriesById, onEdit, onDelete, onToggleActive, togglingId }: RecurringListProps) {
  return (
    <RowList label="Recurring transactions">
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
                    Subscription
                  </Badge>
                )}
              </>
            }
            meta={
              <>
                {category && <span>{category.name}</span>}
                <span>{FREQUENCY_LABELS[item.frequency]}</span>
                <span>Next {formatDate(item.next_occurrence_date)}</span>
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
                    Paused
                  </Badge>
                )}
              </>
            }
            actions={
              <>
                <IconButton
                  icon={item.is_active ? "pause" : "play"}
                  label={`${item.is_active ? "Pause" : "Resume"} ${item.name}`}
                  size="sm"
                  disabled={togglingId === item.id}
                  onClick={() => onToggleActive(item)}
                />
                <IconButton icon="pencil" label={`Edit ${item.name}`} size="sm" onClick={() => onEdit(item)} />
                <IconButton icon="trash" label={`Delete ${item.name}`} variant="danger" size="sm" onClick={() => onDelete(item)} />
              </>
            }
          />
        );
      })}
    </RowList>
  );
}
