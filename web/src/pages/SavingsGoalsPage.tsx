import { useCallback, useState } from "react";
import { deleteSavingsGoal, getSavingsSummary, listSavingsGoals } from "../services/savingsGoalsService";
import { useAsyncData } from "../hooks/useAsyncData";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import type { SavingsGoal } from "../types/savingsGoal";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { StatCard } from "../components/dashboard/StatCard";
import { GoalCard } from "../components/goals/GoalCard";
import { GoalFormModal } from "../components/goals/GoalFormModal";
import { MoneyModal, type MoneyDirection } from "../components/goals/MoneyModal";
import { extractErrorMessage } from "../utils/errors";
import { formatCurrency, formatPercentage } from "../utils/format";
import styles from "./SavingsGoalsPage.module.scss";

interface FormState {
  isOpen: boolean;
  goal: SavingsGoal | null;
}

interface MoneyState {
  goal: SavingsGoal | null;
  direction: MoneyDirection;
}

export function SavingsGoalsPage() {
  const baseCurrency = useBaseCurrency();

  const fetchGoals = useCallback(() => listSavingsGoals(), []);
  const goals = useAsyncData(fetchGoals);

  const fetchSummary = useCallback(() => getSavingsSummary(), []);
  const summary = useAsyncData(fetchSummary);

  const [form, setForm] = useState<FormState>({ isOpen: false, goal: null });
  const [money, setMoney] = useState<MoneyState>({ goal: null, direction: "deposit" });
  const [deleteTarget, setDeleteTarget] = useState<SavingsGoal | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Every write changes the goal's figures and the totals: reload both from the server.
  const { refetch: refetchGoals } = goals;
  const { refetch: refetchSummary } = summary;
  const reload = useCallback(() => {
    refetchGoals();
    refetchSummary();
  }, [refetchGoals, refetchSummary]);

  function handleSaved() {
    setForm({ isOpen: false, goal: null });
    setMoney((current) => ({ ...current, goal: null }));
    reload();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteSavingsGoal(deleteTarget.id);
      setDeleteTarget(null);
      reload();
    } catch (error) {
      setActionError(extractErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  }

  const unconverted = summary.data?.unconverted_currencies ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.heading}>Savings goals</h1>
        <Button type="button" onClick={() => setForm({ isOpen: true, goal: null })}>
          New goal
        </Button>
      </div>

      <ErrorBanner message={actionError} />

      {summary.error ? (
        <ErrorState error={summary.error} onRetry={summary.refetch} />
      ) : (
        <div className={styles.statsRow}>
          <StatCard
            label="Total saved"
            value={summary.data ? formatCurrency(summary.data.total_saved, baseCurrency) : undefined}
            tone="positive"
            isLoading={summary.isLoading}
          />
          <StatCard
            label="Total target"
            value={summary.data ? formatCurrency(summary.data.total_target, baseCurrency) : undefined}
            isLoading={summary.isLoading}
          />
          <StatCard
            label="Overall progress"
            value={
              summary.data
                ? summary.data.progress_percentage === null
                  ? "—"
                  : formatPercentage(summary.data.progress_percentage)
                : undefined
            }
            isLoading={summary.isLoading}
          />
        </div>
      )}

      {unconverted.length > 0 && (
        <p className={styles.notice}>
          Not included in the totals: goals saved in {unconverted.join(", ")} — no exchange rate from the last 7
          days.
        </p>
      )}

      {goals.isLoading ? (
        <Skeleton height={220} borderRadius={8} />
      ) : goals.error ? (
        <ErrorState error={goals.error} onRetry={goals.refetch} />
      ) : (goals.data ?? []).length === 0 ? (
        <EmptyState message="No savings goals yet. Create one for a trip, a new laptop or an emergency fund." />
      ) : (
        <div className={styles.grid}>
          {(goals.data ?? []).map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onAddMoney={(selected) => setMoney({ goal: selected, direction: "deposit" })}
              onRemoveMoney={(selected) => setMoney({ goal: selected, direction: "withdraw" })}
              onEdit={(selected) => setForm({ isOpen: true, goal: selected })}
              onDelete={(selected) => {
                setActionError(null);
                setDeleteTarget(selected);
              }}
            />
          ))}
        </div>
      )}

      <GoalFormModal
        isOpen={form.isOpen}
        goal={form.goal}
        onClose={() => setForm({ isOpen: false, goal: null })}
        onSaved={handleSaved}
      />

      <MoneyModal
        goal={money.goal}
        direction={money.direction}
        onClose={() => setMoney((current) => ({ ...current, goal: null }))}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete goal"
        message={`Delete "${deleteTarget?.name ?? ""}"? Its progress is lost. To keep it, archive it instead.`}
        confirmLabel="Delete"
        isConfirming={isDeleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
