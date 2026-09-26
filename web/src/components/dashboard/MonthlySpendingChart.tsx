import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyDataPoint } from "../../types/dashboard";
import { formatCurrency } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { EmptyState } from "../EmptyState";

interface MonthlySpendingChartProps {
  data: MonthlyDataPoint[];
}

export function MonthlySpendingChart({ data }: MonthlySpendingChartProps) {
  const baseCurrency = useBaseCurrency();
  const hasAnyActivity = data.some((point) => point.income !== "0.00" || point.expenses !== "0.00");
  if (!hasAnyActivity) {
    return <EmptyState message="No transactions recorded this year yet." />;
  }

  // Values are only converted to numbers here so the chart library can plot
  // them — the underlying totals are still whatever the backend computed.
  const chartData = data.map((point) => ({
    name: point.month_name.slice(0, 3),
    Income: Number(point.income),
    Expenses: Number(point.expenses),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} width={48} />
        <Tooltip formatter={(value) => formatCurrency(Number(value), baseCurrency)} />
        <Legend />
        <Bar dataKey="Income" fill="#16a34a" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Expenses" fill="#dc2626" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
