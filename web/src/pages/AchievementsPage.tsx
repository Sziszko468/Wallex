import { useCallback, useEffect } from "react";
import { listAchievements, markAchievementsSeen } from "../services/achievementsService";
import { useAsyncData } from "../hooks/useAsyncData";
import type { Achievement } from "../types/achievement";
import { Skeleton } from "../components/Skeleton";
import { ErrorState } from "../components/ErrorState";
import { AchievementCard } from "../components/achievements/AchievementCard";
import styles from "./AchievementsPage.module.scss";

interface Section {
  title: string;
  items: Achievement[];
}

export function AchievementsPage() {
  const fetchAchievements = useCallback(() => listAchievements(), []);
  const achievements = useAsyncData(fetchAchievements);
  const data = achievements.data;

  // The "New" badges stay for this visit (the data is already loaded); the next visit won't show them.
  const hasNew = data?.some((achievement) => achievement.is_new) ?? false;
  useEffect(() => {
    if (hasNew) markAchievementsSeen().catch(() => undefined); // best effort: badges just show again next time
  }, [hasNew]);

  const sections: Section[] = data
    ? [
        { title: "Unlocked", items: data.filter((achievement) => achievement.unlocked) },
        {
          title: "In progress",
          items: data.filter((achievement) => !achievement.unlocked && achievement.progress_percentage > 0),
        },
        {
          title: "Not started",
          items: data.filter((achievement) => !achievement.unlocked && achievement.progress_percentage === 0),
        },
      ]
    : [];
  const unlockedCount = sections[0]?.items.length ?? 0;

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.heading}>Achievements</h1>
        {data && (
          <p className={styles.subtitle}>
            {unlockedCount} of {data.length} unlocked · milestones earned by tracking, saving and staying on budget.
          </p>
        )}
      </div>

      {achievements.isLoading ? (
        <Skeleton height={260} borderRadius={8} />
      ) : achievements.error ? (
        <ErrorState error={achievements.error} onRetry={achievements.refetch} />
      ) : (
        sections
          .filter((section) => section.items.length > 0)
          .map((section) => (
            <section key={section.title} className={styles.section} aria-label={section.title}>
              <h2 className={styles.sectionHeading}>{section.title}</h2>
              <div className={styles.grid}>
                {section.items.map((achievement) => (
                  <AchievementCard key={achievement.code} achievement={achievement} />
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
