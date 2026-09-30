import { useCallback } from "react";
import { listCategories } from "../../services/categoriesService";
import { useAsyncData } from "../../hooks/useAsyncData";
import { ErrorState } from "../ErrorState";
import { Modal } from "../Modal";
import { SkeletonRows } from "../Skeleton";
import { useToast } from "../Toast";
import { TransactionFormModal } from "./TransactionFormModal";

interface QuickAddTransactionProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "New transaction" from anywhere in the app (the sidebar button, the phone's floating button).
 * It only loads the categories once opened. After saving, the sync check that follows every
 * write refreshes whatever page is on screen, so nothing needs to be told about the new row.
 */
export function QuickAddTransaction({ isOpen, onClose }: QuickAddTransactionProps) {
  if (!isOpen) return null;
  return <QuickAddDialog onClose={onClose} />;
}

function QuickAddDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const fetchCategories = useCallback(() => listCategories(), []);
  const categories = useAsyncData(fetchCategories, { live: false });

  if (categories.isLoading || categories.error) {
    return (
      <Modal isOpen onClose={onClose} title="New transaction">
        {categories.error ? (
          <ErrorState error={categories.error} onRetry={categories.refetch} title="We couldn't load your categories" />
        ) : (
          <SkeletonRows count={3} rowHeight={52} />
        )}
      </Modal>
    );
  }

  return (
    <TransactionFormModal
      isOpen
      transaction={null}
      categories={categories.data ?? []}
      title="New transaction"
      onClose={onClose}
      onSaved={() => {
        onClose();
        toast.success("Transaction added");
      }}
    />
  );
}
