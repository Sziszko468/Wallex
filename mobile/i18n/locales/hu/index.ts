import type { DeepStrings } from "../../types";
import type { Translations } from "../en";
import { assistant } from "./assistant";
import { auth } from "./auth";
import { common } from "./common";
import { budgets, dashboard } from "./dashboard";
import { receipts } from "./receipts";
import { settings } from "./settings";
import { errors, offline, screens, tabs } from "./system";
import { recurring, transactions } from "./transactions";

export const hu: DeepStrings<Translations> = {
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
};
