/** How often the app, while in the foreground, asks the server whether anything changed. */
export const SYNC_POLL_INTERVAL_MS = 30_000;

let tick = 0;

/**
 * A logical clock shared by the sync provider and every data view. A view that *started*
 * loading after a change was detected already has that change, so it needn't reload for it
 * (see useAsyncData). Ticks, not wall-clock time: they are strictly ordered and test-friendly.
 */
export function nextSyncTick(): number {
  tick += 1;
  return tick;
}
