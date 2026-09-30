import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { usePageTitle } from "../hooks/usePageTitle";
import styles from "../components/page.module.scss";

/** Category management isn't built yet — this page says so plainly instead of pretending. */
export function CategoriesPage() {
  usePageTitle("Categories");
  return (
    <div className={styles.page}>
      <PageHeader title="Categories" description="How your spending is organised." />
      <EmptyState
        icon="categories"
        title="Custom categories are coming"
        message="Soon you'll be able to add and organise your own here. The default categories already work across your transactions and budgets."
      />
    </div>
  );
}
