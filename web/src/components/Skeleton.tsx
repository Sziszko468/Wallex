import type { CSSProperties } from "react";
import styles from "./Skeleton.module.scss";

interface SkeletonProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  borderRadius?: CSSProperties["borderRadius"];
  className?: string;
}

export function Skeleton({
  width = "100%",
  height = "1rem",
  borderRadius = 6,
  className,
}: SkeletonProps) {
  const classes = className ? `${styles.skeleton} ${className}` : styles.skeleton;
  return <span className={classes} style={{ width, height, borderRadius }} aria-hidden="true" />;
}
