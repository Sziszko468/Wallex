import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { EXCHANGE_RATE_MAX_AGE_DAYS } from "../config/subscriptions";
import { deleteSavingsGoal, getSavingsSummary, listSavingsGoals } from "../services/savingsGoalsService";
import { useAsyncData } from "../hooks/useAsyncData";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import { usePageTitle } from "../hooks/usePageTitle";
import type { SavingsGoal } from "../types/savingsGoal";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Notice } from "../components/Notice";
import { PageHeader } from "../components/PageHeader";
import { Skeleton } from "../components/Skeleton";
import { SummaryStrip } from "../components/SummaryStrip";
import { useToast } from "../components/Toast";
import { GoalCard } from "../components/goals/GoalCard";
import { GoalFormModal } from "../components/goals/GoalFormModal";
import { MoneyModal, type MoneyDirection } from "../components/goals/MoneyModal";
import { extractErrorMessage } from "../utils/errors";
import { formatCurrency, formatPercentage } from "../utils/format";
import pageStyles from "../components/page.module.scss";
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
  const { t } = useTranslation();
  usePageTitle(t("nav.items.goals"));
  const baseCurrency = useBaseCurrency();
  const toast = useToast();

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
    toast.success(
      form.isOpen ? (form.goal ? t("goals.toast.updated") : t("goals.toast.created")) : t("goals.toast.savingsUpdated")
    );
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
      toast.success(t("goals.toast.deleted"));
      reload();
    } catch (error) {
      setActionError(extractErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  }

  const unconverted = summary.data?.unconverted_currencies ?? [];
  const openCreate = () => setForm({ isOpen: true, goal: null });

  function renderGoals() {
    if (goals.isLoading) {
      return (
        <div className={styles.grid}>
          <Skeleton height={200} borderRadius={16} />
          <Skeleton height={200} borderRadius={16} />
          <Skeleton height={200} borderRadius={16} />
        </div>
      );
    }
    if (goals.error) return <ErrorState error={goals.error} onRetry={goals.refetch} />;
    if ((goals.data ?? []).length === 0) {
      return (
        <EmptyState
          icon="goals"
          title={t("goals.empty.title")}
          message={t("goals.empty.message")}
          action={
            <Button leadingIcon="plus" onClick={openCreate}>
              {t("goals.new")}
            </Button>
          }
        />
      );
    }
    return (
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
    );
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title={t("goals.title")}
        description={t("goals.description")}
        actions={
          <Button type="button" leadingIcon="plus" onClick={openCreate}>
            {t("goals.new")}
          </Button>
        }
      />

      <ErrorBanner message={actionError} />

      {summary.error ? (
        <ErrorState error={summary.error} onRetry={summary.refetch} />
      ) : (
        <SummaryStrip
          items={[
            {
              label: t("goals.summary.totalSaved"),
              value: summary.data ? formatCurrency(summary.data.total_saved, baseCurrency) : undefined,
              tone: "positive",
              isLoading: summary.isLoading,
            },
            {
              label: t("goals.summary.totalTarget"),
              value: summary.data ? formatCurrency(summary.data.total_target, baseCurrency) : undefined,
              isLoading: summary.isLoading,
            },
            {
              label: t("goals.summary.overall"),
              value: summary.data
                ? summary.data.progress_percentage === null
                  ? t("common.states.notAvailable")
                  : formatPercentage(summary.data.progress_percentage)
                : undefined,
              isLoading: summary.isLoading,
            },
          ]}
        />
      )}

      {unconverted.length > 0 && (
        <Notice tone="warning">
          {t("goals.summary.unconverted", { currencies: unconverted.join(", "), days: EXCHANGE_RATE_MAX_AGE_DAYS })}
        </Notice>
      )}

      {renderGoals()}

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
        title={t("goals.delete.title")}
        message={t("goals.delete.message", { name: deleteTarget?.name ?? "" })}
        confirmLabel={t("common.actions.delete")}
        isConfirming={isDeleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
