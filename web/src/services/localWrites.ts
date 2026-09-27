/**
 * The API client reports every successful write (POST/PUT/PATCH/DELETE) here, so the sync
 * provider can check the server's version right away instead of at the next poll — and
 * reload every view on screen that the write may have affected (e.g. a new expense changes
 * the dashboard's budget card, too).
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyLocalWrite(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeLocalWrites(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
