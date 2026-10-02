import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
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

export function SavingsGoalDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const goalId = Number(id);

  const fetchGoal = useCallback(() => getSavingsGoal(goalId), [goalId]);
  const goal = useAsyncData(fetchGoal);
  usePageTitle(goal.data?.name ?? t("goals.detail.fallbackTitle"));

  // Snapshot taken when Edit is pressed: a background reload must not re-seed the open form.
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [moneyDirection, setMoneyDirection] = useState<MoneyDirection | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function handleSaved() {
    toast.success(editing ? t("goals.toast.updated") : t("goals.toast.savingsUpdated"));
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
      toast.success(t("goals.toast.deleted"));
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
        backTo={{ to: "/goals", label: t("goals.detail.backLink") }}
        title={
          data ? (
            <span className={styles.title}>
              {data.name} <GoalStatusBadge status={data.status} />
            </span>
          ) : (
            t("goals.detail.fallbackTitle")
          )
        }
        actions={
          data && (
            <>
              <Button type="button" leadingIcon="plus" onClick={() => setMoneyDirection("deposit")} disabled={isArchived}>
                {t("goals.card.addMoney")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                leadingIcon="minus"
                onClick={() => setMoneyDirection("withdraw")}
                disabled={isArchived}
              >
                {t("goals.detail.removeMoney")}
              </Button>
              <Button type="button" variant="secondary" leadingIcon="pencil" onClick={() => setEditing(data)}>
                {t("common.actions.edit")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => toggleArchived(data)} disabled={isBusy}>
                {isArchived ? t("goals.detail.restore") : t("goals.detail.archive")}
              </Button>
              <Button type="button" variant="danger-quiet" leadingIcon="trash" onClick={() => setIsConfirmingDelete(true)}>
                {t("common.actions.delete")}
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
        title={t("goals.delete.title")}
        message={t("goals.delete.message", { name: data?.name ?? "" })}
        confirmLabel={t("common.actions.delete")}
        isConfirming={isBusy}
        onConfirm={confirmDelete}
        onClose={() => setIsConfirmingDelete(false)}
      />
    </div>
  );
}

function GoalDetails({ goal }: { goal: SavingsGoal }) {
  const { t } = useTranslation();
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
          { label: t("goals.detail.targetDateCard"), value: formatDate(goal.target_date) },
          {
            label: t("goals.detail.timeLeft"),
            value: (
              <span className={goal.days_left < 0 && goal.status === "active" ? styles.overdue : undefined}>
                {describeDaysLeft(goal.days_left)}
              </span>
            ),
          },
          ...(goal.monthly_needed !== null
            ? [{ label: t("goals.detail.toReach"), value: t("goals.detail.monthlySave", { amount: formatCurrency(goal.monthly_needed, goal.currency) }) }]
            : []),
        ]
      : null;

  return (
    <>
      <Card as="section" tone="tinted" padding="lg" aria-label={t("goals.detail.progress")}>
        <div className={styles.progress}>
          <div className={styles.progressHeader}>
            <span className={styles.progressValue}>{formatPercentage(goal.progress_percentage)}</span>
            <span className={styles.muted}>
              {t("goals.detail.amountOf", { saved: formatCurrency(goal.current_amount, goal.currency), target: formatCurrency(goal.target_amount, goal.currency) })}
            </span>
          </div>
          <ProgressBar
            percentage={goal.progress_percentage}
            label={t("goals.card.progress", { name: goal.name })}
            tone={goalTone(goal.status)}
            size="large"
          />
        </div>
      </Card>

      <SummaryStrip
        items={[
          { label: t("goals.detail.saved"), value: amount(goal.current_amount, goal.base_current_amount), tone: "positive" },
          { label: t("goals.detail.target"), value: amount(goal.target_amount, goal.base_target_amount) },
          { label: t("goals.detail.stillToSave"), value: formatCurrency(goal.remaining_amount, goal.currency) },
        ]}
      />

      <DashboardCard title={t("goals.detail.targetDateCard")}>
        {timeline ? (
          <DetailList items={timeline} />
        ) : (
          <p className={styles.muted}>{t("goals.detail.noTargetDate")}</p>
        )}
      </DashboardCard>
    </>
  );
}
