import type { Achievement } from "../../types/achievement";
import { describeProgress } from "../../utils/achievements";
import { formatDate } from "../../utils/format";
import { Badge } from "../Badge";
import { ProgressBar } from "../ProgressBar";
import styles from "./AchievementCard.module.scss";

interface AchievementCardProps {
  achievement: Achievement;
}

/** One achievement: unlocked (with when and how), or locked with the progress towards it. */
export function AchievementCard({ achievement }: AchievementCardProps) {
  const { unlocked } = achievement;
  return (
    <article className={`${styles.card} ${unlocked ? styles.unlocked : styles.locked}`} aria-label={achievement.title}>
      <span className={styles.icon} aria-hidden="true">
        {achievement.icon}
      </span>
      <div className={styles.body}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{achievement.title}</h3>
          {achievement.is_new && <Badge tone="primary">New</Badge>}
        </div>
        {unlocked ? (
          <p className={styles.meta}>
            {achievement.detail && <>{achievement.detail} · </>}
            Unlocked {achievement.unlocked_at && formatDate(achievement.unlocked_at)}
          </p>
        ) : (
          <>
            <p className={styles.meta}>{achievement.description}</p>
            {achievement.progress_percentage > 0 && (
              <div className={styles.progress}>
                <ProgressBar percentage={achievement.progress_percentage} label={`${achievement.title} progress`} />
                <span className={styles.progressText}>{describeProgress(achievement)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}
