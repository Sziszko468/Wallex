import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Achievement } from "../../types/achievement";
import { describeProgress, nextUp, recentlyUnlocked } from "../../utils/achievements";
import { formatDate } from "../../utils/format";
import { Badge } from "../Badge";
import { ProgressBar } from "../ProgressBar";
import styles from "./AchievementsOverview.module.scss";

const RECENT_SHOWN = 3;

interface AchievementsOverviewProps {
  achievements: Achievement[];
}

/** The latest unlocks and the next milestone — a quiet nudge, not a scoreboard. */
export function AchievementsOverview({ achievements }: AchievementsOverviewProps) {
  const { t } = useTranslation();
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
                <Badge tone="primary">{t("dashboard.achievements.isNew")}</Badge>
              ) : (
                <span className={styles.meta}>{achievement.unlocked_at && formatDate(achievement.unlocked_at)}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.meta}>{t("dashboard.achievements.empty")}</p>
      )}

      {next && (
        <div className={styles.next}>
          <span className={styles.nextLabel}>
            {t("dashboard.achievements.nextUp", { icon: next.icon, title: next.title })}
          </span>
          <ProgressBar percentage={next.progress_percentage} label={t("dashboard.achievements.progress", { title: next.title })} />
          <span className={styles.meta}>{describeProgress(next)}</span>
        </div>
      )}

      <div className={styles.footer}>
        <span className={styles.meta}>
          {t("dashboard.achievements.unlocked", { unlocked: unlockedCount, total: achievements.length })}
        </span>
        <Link to="/achievements" className={styles.link}>
          {t("dashboard.achievements.all")}
        </Link>
      </div>
    </div>
  );
}
