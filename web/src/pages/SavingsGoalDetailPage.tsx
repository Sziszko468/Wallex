import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteSavingsGoal, getSavingsGoal, updateSavingsGoal } from "../services/savingsGoalsService";
import { useAsyncData } from "../hooks/useAsyncData";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import type { SavingsGoal } from "../types/savingsGoal";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { ErrorState } from "../components/ErrorState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { StatCard } from "../components/dashboard/StatCard";
import { DashboardCard } from "../components/dashboard/DashboardCard";
import { GoalStatusBadge } from "../components/goals/GoalStatusBadge";
import { ProgressBar } from "../components/ProgressBar";
import { GoalFormModal } from "../components/goals/GoalFormModal";
import { MoneyModal, type MoneyDirection } from "../components/goals/MoneyModal";
import { extractErrorMessage } from "../utils/errors";
import { formatCurrency, formatDate, formatPercentage } from "../utils/format";
import { describeDaysLeft, goalTone } from "../utils/savingsGoals";
import styles from "./SavingsGoalDetailPage.module.scss";

export function SavingsGoalDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goalId = Number(id);

  const fetchGoal = useCallback(() => getSavingsGoal(goalId), [goalId]);
  const goal = useAsyncData(fetchGoal);

  // Snapshot taken when Edit is pressed: a background reload must not re-seed the open form.
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [moneyDirection, setMoneyDirection] = useState<MoneyDirection | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function handleSaved() {
    setEditing(null);
    setMoneyDirection(null);
    goal.refetch();
  }

  async function toggleArchived(current: SavingsGoal) {
    setActionError(null);
    setIsBusy(true);
    try {
      await updateSavingsGoal(current.id, { status: current.status === "archived" ? "active" : "archived" });
      goal.refetch();
    } catch (error) {
      setActionError(extractErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function confirmDelete() {
    setIsBusy(true);
    try {
      await deleteSavingsGoal(goalId);
      navigate("/goals", { replace: true });
    } catch (error) {
      setActionError(extractErrorMessage(error));
      setIsBusy(false);
      setIsConfirmingDelete(false);
    }
  }

  const data = goal.data;
  const isArchived = data?.status === "archived";

  return (
    <div className={styles.page}>
      <Link to="/goals" className={styles.backLink}>
        ← All goals
      </Link>

      <ErrorBanner message={actionError} />

      {goal.isLoading ? (
        <Skeleton height={320} borderRadius={8} />
      ) : goal.error || !data ? (
        <ErrorState error={goal.error} onRetry={goal.refetch} />
      ) : (
        <>
          <div className={styles.headerRow}>
            <h1 className={styles.heading}>
              {data.name} <GoalStatusBadge status={data.status} />
            </h1>
            <div className={styles.actions}>
              <Button type="button" onClick={() => setMoneyDirection("deposit")} disabled={isArchived}>
                Add money
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setMoneyDirection("withdraw")}
                disabled={isArchived}
              >
                Remove money
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(data)}>
                Edit
              </Button>
              <Button type="button" variant="secondary" onClick={() => toggleArchived(data)} disabled={isBusy}>
                {isArchived ? "Restore" : "Archive"}
              </Button>
              <Button type="button" variant="danger" onClick={() => setIsConfirmingDelete(true)}>
                Delete
              </Button>
            </div>
          </div>

          <GoalDetails goal={data} />
        </>
      )}

      <GoalFormModal isOpen={editing !== null} goal={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />

      <MoneyModal
        goal={moneyDirection && data ? data : null}
        direction={moneyDirection ?? "deposit"}
        onClose={() => setMoneyDirection(null)}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title="Delete goal"
        message={`Delete "${data?.name ?? ""}"? Its progress is lost. To keep it, archive it instead.`}
        confirmLabel="Delete"
        isConfirming={isBusy}
        onConfirm={confirmDelete}
        onClose={() => setIsConfirmingDelete(false)}
      />
    </div>
  );
}

function GoalDetails({ goal }: { goal: SavingsGoal }) {
  const baseCurrency = useBaseCurrency();
  const isForeign = goal.currency !== baseCurrency;

  /** An amount in the goal's currency, plus "≈ base" when it's saved in another one. */
  function amount(value: string, baseValue: string | null) {
    const own = formatCurrency(value, goal.currency);
    if (!isForeign || baseValue === null) return own;
    return `${own} ≈ ${formatCurrency(baseValue, baseCurrency)}`;
  }

  return (
    <>
      <section className={styles.progressCard} aria-label="Progress">
        <div className={styles.progressHeader}>
          <span className={styles.progressValue}>{formatPercentage(goal.progress_percentage)}</span>
          <span className={styles.muted}>
            {formatCurrency(goal.current_amount, goal.currency)} of {formatCurrency(goal.target_amount, goal.currency)}
          </span>
        </div>
        <ProgressBar
          percentage={goal.progress_percentage}
          label={`${goal.name} progress`}
          tone={goalTone(goal.status)}
          size="large"
        />
      </section>

      <div className={styles.statsRow}>
        <StatCard label="Saved" value={amount(goal.current_amount, goal.base_current_amount)} tone="positive" />
        <StatCard label="Target" value={amount(goal.target_amount, goal.base_target_amount)} />
        <StatCard label="Still to save" value={formatCurrency(goal.remaining_amount, goal.currency)} />
      </div>

      <DashboardCard title="Target date">
        {goal.target_date && goal.days_left !== null ? (
          <dl className={styles.details}>
            <dt>Target date</dt>
            <dd>{formatDate(goal.target_date)}</dd>
            <dt>Time left</dt>
            <dd className={goal.days_left < 0 && goal.status === "active" ? styles.overdue : undefined}>
              {describeDaysLeft(goal.days_left)}
            </dd>
            {goal.monthly_needed !== null && (
              <>
                <dt>To reach it</dt>
                <dd>save {formatCurrency(goal.monthly_needed, goal.currency)} a month</dd>
              </>
            )}
          </dl>
        ) : (
          <p className={styles.muted}>No target date. Add one to see how much to save each month.</p>
        )}
      </DashboardCard>
    </>
  );
}
