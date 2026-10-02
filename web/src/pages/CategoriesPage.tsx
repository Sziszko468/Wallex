import { useTranslation } from "react-i18next";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { usePageTitle } from "../hooks/usePageTitle";
import styles from "../components/page.module.scss";

/** Category management isn't built yet — this page says so plainly instead of pretending. */
export function CategoriesPage() {
  const { t } = useTranslation();
  usePageTitle(t("categories.title"));
  return (
    <div className={styles.page}>
      <PageHeader title={t("categories.title")} description={t("categories.description")} />
      <EmptyState icon="categories" title={t("categories.emptyTitle")} message={t("categories.emptyMessage")} />
    </div>
  );
}
