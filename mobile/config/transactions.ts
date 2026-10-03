/** How long typing in the search box must pause before the list is filtered. */
export const SEARCH_DEBOUNCE_MS = 400;

/** The quick date ranges of the transactions filter. */
export type DatePreset = "all" | "thisMonth" | "lastMonth";
export const DATE_PRESETS: readonly DatePreset[] = ["all", "thisMonth", "lastMonth"];
