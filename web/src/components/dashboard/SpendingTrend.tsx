import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Trends } from "../../types/dashboard";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { formatCurrency, formatShortMonth } from "../../utils/format";
import { EmptyState } from "../EmptyState";
import { ChangeBadge } from "./ChangeBadge";
import styles from "./SpendingTrend.module.scss";

interface SpendingTrendProps {
  trends: Trends;
}

/** Income and expenses over the last months, with each month's change — all computed by the API. */
export function SpendingTrend({ trends }: SpendingTrendProps) {
  const baseCurrency = useBaseCurrency();
  const { months } = trends;
  const hasActivity = months.some((point) => point.income !== "0.00" || point.expenses !== "0.00");
  if (!hasActivity) {
    return <EmptyState message="No transactions in these months yet." />;
  }

  const crossesYear = months[0]?.year !== months[months.length - 1]?.year;
  // Numbers only for plotting; the figures themselves come from the backend.
  const chartData = months.map((point) => ({
    name: formatShortMonth(point.year, point.month, crossesYear),
    Expenses: Number(point.expenses),
    Income: Number(point.income),
  }));

  return (
    <div className={styles.trend}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} width={48} />
          <Tooltip formatter={(value) => formatCurrency(Number(value), baseCurrency)} />
          <Legend />
          <Line type="monotone" dataKey="Expenses" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="Income" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>

      <p className={styles.average}>
        Average spending: <strong>{formatCurrency(trends.average_monthly_expenses, baseCurrency)}</strong> / month
      </p>

      <ul className={styles.months} aria-label="Expenses per month">
        {months.map((point) => (
          <li key={`${point.year}-${point.month}`} className={styles.month}>
            <span className={styles.monthName}>{formatShortMonth(point.year, point.month, crossesYear)}</span>
            <span className={styles.amount}>{formatCurrency(point.expenses, baseCurrency)}</span>
            <ChangeBadge value={point.expenses_change_percentage} />
          </li>
        ))}
      </ul>
    </div>
  );
}
