import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteSavingsGoal, getSavingsGoal, updateSavingsGoal } from "../services/savingsGoalsService";
import { useAsyncData } from "../hooks/useAsyncData";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import { usePageTitle } from "../hooks/usePageTitle";
import type { SavingsGoal } from "../types/savingsGoal";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { DetailList } from "../components/DetailList";
import { Skeleton } from "../components/Skeleton";
import { ErrorState } from "../components/ErrorState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { SummaryStrip } from "../components/SummaryStrip";
import { useToast } from "../components/Toast";
import { DashboardCard } from "../components/dashboard/DashboardCard";
import { GoalStatusBadge } from "../components/goals/GoalStatusBadge";
import { ProgressBar } from "../components/ProgressBar";
import { GoalFormModal } from "../components/goals/GoalFormModal";
import { MoneyModal, type MoneyDirection } from "../components/goals/MoneyModal";
import { extractErrorMessage } from "../utils/errors";
import { formatCurrency, formatDate, formatPercentage } from "../utils/format";
import { describeDaysLeft, goalTone } from "../utils/savingsGoals";
import pageStyles from "../components/page.module.scss";
import styles from "./SavingsGoalDetailPage.module.scss";

const BACK_LINK = { to: "/goals", label: "All goals" };

export function SavingsGoalDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const goalId = Number(id);

  const fetchGoal = useCallback(() => getSavingsGoal(goalId), [goalId]);
  const goal = useAsyncData(fetchGoal);
  usePageTitle(goal.data?.name ?? "Goal");

  // Snapshot taken when Edit is pressed: a background reload must not re-seed the open form.
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [moneyDirection, setMoneyDirection] = useState<MoneyDirection | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function handleSaved() {
    toast.success(editing ? "Goal updated" : "Savings updated");
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
      toast.success("Goal deleted");
      navigate("/goals", { replace: true });
    } catch (error) {
      setActionError(extractErrorMessage(error));
      setIsBusy(false);
      setIsConfirmingDelete(false);
    }
  }

  const data = goal.data;
  const isArchived = data?.status === "archived";

  function renderBody() {
    if (goal.isLoading) return <Skeleton height={320} borderRadius={16} />;
    if (goal.error || !data) return <ErrorState error={goal.error} onRetry={goal.refetch} />;
    return <GoalDetails goal={data} />;
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        backTo={BACK_LINK}
        title={
          data ? (
            <span className={styles.title}>
              {data.name} <GoalStatusBadge status={data.status} />
            </span>
          ) : (
            "Goal"
          )
        }
        actions={
          data && (
            <>
              <Button type="button" leadingIcon="plus" onClick={() => setMoneyDirection("deposit")} disabled={isArchived}>
                Add money
              </Button>
              <Button
                type="button"
                variant="secondary"
                leadingIcon="minus"
                onClick={() => setMoneyDirection("withdraw")}
                disabled={isArchived}
              >
                Remove money
              </Button>
              <Button type="button" variant="secondary" leadingIcon="pencil" onClick={() => setEditing(data)}>
                Edit
              </Button>
              <Button type="button" variant="ghost" onClick={() => toggleArchived(data)} disabled={isBusy}>
                {isArchived ? "Restore" : "Archive"}
              </Button>
              <Button type="button" variant="danger-quiet" leadingIcon="trash" onClick={() => setIsConfirmingDelete(true)}>
                Delete
              </Button>
            </>
          )
        }
      />

      <ErrorBanner message={actionError} />

      {renderBody()}

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

  const timeline =
    goal.target_date && goal.days_left !== null
      ? [
          { label: "Target date", value: formatDate(goal.target_date) },
          {
            label: "Time left",
            value: (
              <span className={goal.days_left < 0 && goal.status === "active" ? styles.overdue : undefined}>
                {describeDaysLeft(goal.days_left)}
              </span>
            ),
          },
          ...(goal.monthly_needed !== null
            ? [{ label: "To reach it", value: `save ${formatCurrency(goal.monthly_needed, goal.currency)} a month` }]
            : []),
        ]
      : null;

  return (
    <>
      <Card as="section" tone="tinted" padding="lg" aria-label="Progress">
        <div className={styles.progress}>
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
        </div>
      </Card>

      <SummaryStrip
        items={[
          { label: "Saved", value: amount(goal.current_amount, goal.base_current_amount), tone: "positive" },
          { label: "Target", value: amount(goal.target_amount, goal.base_target_amount) },
          { label: "Still to save", value: formatCurrency(goal.remaining_amount, goal.currency) },
        ]}
      />

      <DashboardCard title="Target date">
        {timeline ? (
          <DetailList items={timeline} />
        ) : (
          <p className={styles.muted}>No target date. Add one to see how much to save each month.</p>
        )}
      </DashboardCard>
    </>
  );
}
