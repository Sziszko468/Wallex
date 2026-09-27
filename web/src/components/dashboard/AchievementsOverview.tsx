import { Link } from "react-router-dom";
import type { Achievement } from "../../types/achievement";
import { describeProgress, nextUp, recentlyUnlocked } from "../../utils/achievements";
import { formatDate } from "../../utils/format";
import { ProgressBar } from "../ProgressBar";
import styles from "./AchievementsOverview.module.scss";

const RECENT_SHOWN = 3;

interface AchievementsOverviewProps {
  achievements: Achievement[];
}

/** The latest unlocks and the next milestone — a quiet nudge, not a scoreboard. */
export function AchievementsOverview({ achievements }: AchievementsOverviewProps) {
  const recent = recentlyUnlocked(achievements).slice(0, RECENT_SHOWN);
  const next = nextUp(achievements);
  const unlockedCount = achievements.filter((achievement) => achievement.unlocked).length;

  return (
    <div className={styles.overview}>
      {recent.length > 0 ? (
        <ul className={styles.list}>
          {recent.map((achievement) => (
            <li key={achievement.code} className={styles.item}>
              <span className={styles.icon} aria-hidden="true">
                {achievement.icon}
              </span>
              <span className={styles.title}>{achievement.title}</span>
              {achievement.is_new ? (
                <span className={styles.newBadge}>New</span>
              ) : (
                <span className={styles.meta}>{achievement.unlocked_at && formatDate(achievement.unlocked_at)}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.meta}>Record your first transaction to earn your first achievement.</p>
      )}

      {next && (
        <div className={styles.next}>
          <span className={styles.nextLabel}>
            Next up: {next.icon} {next.title}
          </span>
          <ProgressBar percentage={next.progress_percentage} label={`${next.title} progress`} />
          <span className={styles.meta}>{describeProgress(next)}</span>
        </div>
      )}

      <div className={styles.footer}>
        <span className={styles.meta}>
          {unlockedCount} of {achievements.length} unlocked
        </span>
        <Link to="/achievements" className={styles.link}>
          All achievements →
        </Link>
      </div>
    </div>
  );
}
