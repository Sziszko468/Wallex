import { useId, type ReactNode } from "react";
import { Card } from "../Card";
import styles from "./DashboardCard.module.scss";

interface DashboardCardProps {
  title: string;
  /** A short line under the title saying what the card is for. */
  description?: string;
  /** A link or button on the right of the title ("View all"). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A titled section of the app: heading, optional action, then the content. */
export function DashboardCard({ title, description, action, children, className }: DashboardCardProps) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className={className} padding="md">
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {action && <div className={styles.action}>{action}</div>}
      </header>
      <div className={styles.body}>{children}</div>
    </Card>
  );
}
