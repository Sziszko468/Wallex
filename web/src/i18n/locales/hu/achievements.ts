import type { DeepStrings } from "../../types";
import type { achievements as en } from "../en/achievements";

export const achievements: DeepStrings<typeof en> = {
  title: "Eredmények",
  description: "Mérföldkövek, amelyeket a követéssel, megtakarítással és a költségkeret betartásával szerezhetsz.",
  descriptionWithCount:
    "{{unlocked}} / {{total}} feloldva · mérföldkövek, amelyeket a követéssel, megtakarítással és a költségkeret betartásával szerezhetsz.",
  sections: {
    unlocked: "Feloldva",
    inProgress: "Folyamatban",
    notStarted: "Még nem kezdted el",
  },
  empty: {
    title: "Még nincs eredmény",
    message: "A mérföldkövek itt jelennek meg, ahogy követed a kiadásaidat, megtakarítasz és betartod a költségkereteidet.",
  },
  card: {
    isNew: "Új",
    unlockedOn: "Feloldva: {{date}}",
    progress: "{{title}} előrehaladása",
  },
  progressDays: "{{progress}} / {{target}} nap",
};
