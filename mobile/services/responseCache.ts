import type { InternalAxiosRequestConfig } from "axios";
import { getOfflineUser, readUserJson, removeUserKeys, writeUserJson } from "../utils/offlineStore";

/**
 * Last successful response of each GET request, so screens can still show
 * what was loaded before when the backend can't be reached. Read-only
 * fallback: nothing is ever computed from it, the backend stays the source
 * of truth and every successful request overwrites the stored copy.
 */

const INDEX_NAME = "response_index";
const ENTRY_PREFIX = "response:";
const MAX_ENTRIES = 50;

export interface CachedResponse {
  data: unknown;
  storedAt: number;
}

type CacheIndex = Record<string, number>; // key -> storedAt

// Writes are serialized so concurrent responses can't overwrite each other's index update.
let writeQueue: Promise<void> = Promise.resolve();

function sortedParams(params: unknown): string {
  if (!params || typeof params !== "object") return "";
  const entries = Object.entries(params as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

export function cacheKeyFor(config: InternalAxiosRequestConfig): string {
  return `${config.url ?? ""}?${sortedParams(config.params)}`;
}

export function storeResponse(key: string, data: unknown): void {
  if (getOfflineUser() === null) return;
  writeQueue = writeQueue
    .then(async () => {
      const index = (await readUserJson<CacheIndex>(INDEX_NAME)) ?? {};
      const storedAt = Date.now();
      await writeUserJson(ENTRY_PREFIX + key, { data, storedAt } satisfies CachedResponse);
      index[key] = storedAt;

      const evicted = Object.keys(index)
        .sort((a, b) => (index[b] ?? 0) - (index[a] ?? 0))
        .slice(MAX_ENTRIES);
      evicted.forEach((evictedKey) => delete index[evictedKey]);
      await removeUserKeys(evicted.map((evictedKey) => ENTRY_PREFIX + evictedKey));
      await writeUserJson(INDEX_NAME, index);
    })
    .catch((error: unknown) => {
      // Caching is best-effort; a full disk must never break a successful request.
      console.warn("Failed to cache response", error);
    });
}

export async function readResponse(key: string): Promise<CachedResponse | null> {
  try {
    return await readUserJson<CachedResponse>(ENTRY_PREFIX + key);
  } catch (error) {
    console.warn("Failed to read cached response", error);
    return null;
  }
}
