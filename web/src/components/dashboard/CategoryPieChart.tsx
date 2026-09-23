import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CategoryBreakdownEntry } from "../../types/dashboard";
import { formatCurrency } from "../../utils/format";
import { EmptyState } from "../EmptyState";

interface CategoryPieChartProps {
  data: CategoryBreakdownEntry[];
  colorFor: (categoryId: number) => string;
}

export function CategoryPieChart({ data, colorFor }: CategoryPieChartProps) {
  if (data.length === 0) {
    return <EmptyState message="No expenses recorded this month yet." />;
  }

  // Same as the monthly chart: Number(...) here is purely for the charting
  // library's benefit, not a recomputation of the (already-final) amount.
  const chartData = data.map((entry) => ({
    id: entry.category_id,
    name: entry.category_name,
    value: Number(entry.amount),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
        >
          {chartData.map((entry) => (
            <Cell key={entry.id} fill={colorFor(entry.id)} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
      </PieChart>
    </ResponsiveContainer>
  );
}
