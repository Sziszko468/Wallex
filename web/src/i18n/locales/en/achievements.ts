export const achievements = {
  title: "Achievements",
  description: "Milestones earned by tracking, saving and staying on budget.",
  descriptionWithCount: "{{unlocked}} of {{total}} unlocked · milestones earned by tracking, saving and staying on budget.",
  sections: {
    unlocked: "Unlocked",
    inProgress: "In progress",
    notStarted: "Not started",
  },
  empty: {
    title: "No achievements yet",
    message: "Milestones appear here as you track spending, save and stay on budget.",
  },
  card: {
    isNew: "New",
    unlockedOn: "Unlocked {{date}}",
    progress: "{{title}} progress",
  },
  progressDays: "{{progress}} / {{target}} days",
} as const;
