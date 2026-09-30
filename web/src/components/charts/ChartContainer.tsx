import type { ReactNode } from "react";
import styles from "./ChartContainer.module.scss";

export interface LegendItem {
  label: string;
  /** Any CSS colour — normally a chart token. */
  color: string;
}

interface ChartContainerProps {
  /** A sentence describing what the chart shows, for screen readers. */
  label: string;
  legend?: LegendItem[];
  children: ReactNode;
}

/** Wraps a chart with a screen-reader description and a small, quiet legend. */
export function ChartContainer({ label, legend, children }: ChartContainerProps) {
  return (
    <figure className={styles.figure} aria-label={label}>
      {legend && legend.length > 0 && (
        <ul className={styles.legend}>
          {legend.map((item) => (
            <li key={item.label} className={styles.legendItem}>
              <span className={styles.swatch} style={{ backgroundColor: item.color }} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      {children}
    </figure>
  );
}
