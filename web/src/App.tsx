import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { GuestRoute } from "./components/GuestRoute";
import { AuthLayout } from "./layouts/AuthLayout";
import { AppLayout } from "./layouts/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AssistantPage } from "./pages/AssistantPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { RecurringTransactionsPage } from "./pages/RecurringTransactionsPage";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { SubscriptionDetailPage } from "./pages/SubscriptionDetailPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { SavingsGoalsPage } from "./pages/SavingsGoalsPage";
import { SavingsGoalDetailPage } from "./pages/SavingsGoalDetailPage";
import { AchievementsPage } from "./pages/AchievementsPage";
import { ImportPage } from "./pages/ImportPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SecurityPage } from "./pages/SecurityPage";

/** The whole route tree — rendered by tests inside a MemoryRouter. */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/assistant/:conversationId" element={<AssistantPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/recurring" element={<RecurringTransactionsPage />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/subscriptions/:id" element={<SubscriptionDetailPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/goals" element={<SavingsGoalsPage />} />
          <Route path="/goals/:id" element={<SavingsGoalDetailPage />} />
          <Route path="/achievements" element={<AchievementsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/security" element={<SecurityPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
