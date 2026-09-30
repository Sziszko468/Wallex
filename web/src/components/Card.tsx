import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.scss";

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "section" | "div" | "article" | "aside";
  /** "tinted" is the sage-washed panel used for hero areas; "subtle" sits quietly inside other surfaces. */
  tone?: "default" | "subtle" | "tinted";
  padding?: "none" | "md" | "lg";
  children: ReactNode;
}

/** The app's basic surface: soft tone, hairline border, generous radius — no shadow. */
export function Card({ as: Tag = "div", tone = "default", padding = "md", className, children, ...rest }: CardProps) {
  const classes = [styles.card, styles[tone], styles[`padding-${padding}`], className].filter(Boolean).join(" ");
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
