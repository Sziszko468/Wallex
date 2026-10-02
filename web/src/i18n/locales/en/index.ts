import { achievements } from "./achievements";
import { assistant, importCsv } from "./assistant";
import { auth } from "./auth";
import { budgets, categories } from "./budgets";
import { common } from "./common";
import { dashboard } from "./dashboard";
import { errors } from "./errors";
import { goals } from "./goals";
import { nav } from "./nav";
import { recurring } from "./recurring";
import { security } from "./security";
import { subscriptions } from "./subscriptions";
import { transactions } from "./transactions";
import { settings } from "./settings";

/** The source of truth for every key. Other languages are typed against it (see ../types.ts). */
export const en = {
  achievements,
  assistant,
  auth,
  budgets,
  categories,
  common,
  dashboard,
  errors,
  goals,
  importCsv,
  nav,
  recurring,
  security,
  settings,
  subscriptions,
  transactions,
} as const;

export type Translations = typeof en;
