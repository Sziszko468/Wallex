import type { CSSProperties } from "react";
import styles from "./Skeleton.module.scss";

interface SkeletonProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  borderRadius?: CSSProperties["borderRadius"];
  className?: string;
}

/** One placeholder block. Size it like the content it stands in for, so the page doesn't jump when data arrives. */
export function Skeleton({ width = "100%", height = "1rem", borderRadius = 8, className }: SkeletonProps) {
  const classes = className ? `${styles.skeleton} ${className}` : styles.skeleton;
  return <span className={classes} style={{ width, height, borderRadius }} aria-hidden="true" />;
}

interface SkeletonRowsProps {
  count?: number;
  rowHeight?: number;
  gap?: number;
}

/** A stack of row-shaped placeholders for lists. */
export function SkeletonRows({ count = 4, rowHeight = 56, gap = 8 }: SkeletonRowsProps) {
  return (
    <div className={styles.rows} style={{ "--rows-gap": `${gap}px` } as CSSProperties} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} height={rowHeight} borderRadius={12} />
      ))}
    </div>
  );
}
