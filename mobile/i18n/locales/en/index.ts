import { assistant } from "./assistant";
import { auth } from "./auth";
import { common } from "./common";
import { budgets, dashboard } from "./dashboard";
import { receipts } from "./receipts";
import { settings } from "./settings";
import { errors, offline, screens, tabs } from "./system";
import { recurring, transactions } from "./transactions";

/** The source of truth for every key. Other languages are typed against it (see ../types.ts). */
export const en = {
  assistant,
  auth,
  budgets,
  common,
  dashboard,
  errors,
  offline,
  receipts,
  recurring,
  screens,
  settings,
  tabs,
  transactions,
} as const;

export type Translations = typeof en;
