import styles from "./ChartTooltip.module.scss";

interface TooltipEntry {
  name?: string | number;
  value?: unknown;
  color?: string;
  payload?: { fill?: string } | null;
}

interface ChartTooltipProps {
  // These three are injected by Recharts when it renders the tooltip.
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: string | number;
  formatValue: (value: number) => string;
  /** Turns the axis label into the tooltip's heading ("Sep" → "September"). Defaults to the label. */
  formatLabel?: (label: string | number) => string;
}

/** The hover card for every chart: theme surface, swatch + name + amount per series. */
export function ChartTooltip({ active, payload, label, formatValue, formatLabel }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className={styles.tooltip}>
      {label !== undefined && label !== "" && (
        <p className={styles.heading}>{formatLabel ? formatLabel(label) : label}</p>
      )}
      <ul className={styles.list}>
        {payload.map((entry, index) => (
          <li key={`${entry.name}-${index}`} className={styles.row}>
            <span className={styles.swatch} style={{ backgroundColor: entry.color ?? entry.payload?.fill }} aria-hidden="true" />
            <span className={styles.name}>{entry.name}</span>
            <span className={styles.value}>{formatValue(Number(entry.value))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
