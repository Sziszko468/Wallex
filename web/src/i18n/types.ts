import type { ParseKeys } from "i18next";

/**
 * The shape of a translated catalog: the same keys as the English one, every leaf a string.
 * Typing a catalog with it makes a missing or misspelled key a compile error.
 */
export type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };

/** Any key of the catalog, e.g. "nav.dashboard" — for data that stores a key to translate later. */
export type TranslationKey = ParseKeys;
