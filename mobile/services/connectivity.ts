/**
 * Whether the *backend* answered the most recent request — which can differ
 * from the device's network state (Wi-Fi without internet, server down).
 * Fed by the API client, read through useSyncExternalStore.
 */

export interface ConnectivitySnapshot {
  isApiReachable: boolean;
  /** Oldest `storedAt` of the cached responses shown since the API became unreachable. */
  cacheServedAt: number | null;
}

let snapshot: ConnectivitySnapshot = { isApiReachable: true, cacheServedAt: null };
const listeners = new Set<() => void>();

function update(next: ConnectivitySnapshot): void {
  if (next.isApiReachable === snapshot.isApiReachable && next.cacheServedAt === snapshot.cacheServedAt) {
    return;
  }
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function reportApiReachable(): void {
  update({ isApiReachable: true, cacheServedAt: null });
}

export function reportApiUnreachable(): void {
  update({ ...snapshot, isApiReachable: false });
}

export function reportServedFromCache(storedAt: number): void {
  const oldest = snapshot.cacheServedAt === null ? storedAt : Math.min(snapshot.cacheServedAt, storedAt);
  update({ isApiReachable: false, cacheServedAt: oldest });
}

export function subscribeConnectivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConnectivitySnapshot(): ConnectivitySnapshot {
  return snapshot;
}
