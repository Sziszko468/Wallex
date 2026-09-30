import { useCallback, useEffect } from "react";
import { listAchievements, markAchievementsSeen } from "../services/achievementsService";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageTitle } from "../hooks/usePageTitle";
import type { Achievement } from "../types/achievement";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { PageHeader } from "../components/PageHeader";
import { SkeletonRows } from "../components/Skeleton";
import { AchievementCard } from "../components/achievements/AchievementCard";
import pageStyles from "../components/page.module.scss";
import styles from "./AchievementsPage.module.scss";

interface Section {
  title: string;
  items: Achievement[];
}

export function AchievementsPage() {
  usePageTitle("Achievements");
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

  function renderBody() {
    if (achievements.isLoading) return <SkeletonRows count={4} rowHeight={84} />;
    if (achievements.error) return <ErrorState error={achievements.error} onRetry={achievements.refetch} />;
    if (sections.every((section) => section.items.length === 0)) {
      return (
        <EmptyState
          icon="achievements"
          title="No achievements yet"
          message="Milestones appear here as you track spending, save and stay on budget."
        />
      );
    }
    return sections
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
      ));
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Achievements"
        description={
          data
            ? `${unlockedCount} of ${data.length} unlocked · milestones earned by tracking, saving and staying on budget.`
            : "Milestones earned by tracking, saving and staying on budget."
        }
      />
      {renderBody()}
    </div>
  );
}
