import { useAuth } from "../hooks/useAuth";
import { PagePlaceholder } from "../components/PagePlaceholder";

export function DashboardPage() {
  const { user } = useAuth();
  const displayName = user?.first_name || user?.email;

  return (
    <PagePlaceholder
      title={`Welcome back${displayName ? `, ${displayName}` : ""}!`}
      description="Your financial overview (income, expenses, budget usage) will appear here in a future step."
    />
  );
}
