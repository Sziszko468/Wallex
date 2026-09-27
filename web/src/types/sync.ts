export interface ResourceState {
  count: number;
  /** Server clock (updated_at). Never compare it with the device's own clock. */
  last_modified: string | null;
}

/** GET /api/sync/status/ — "has anything changed since I last loaded?" */
export interface SyncStatus {
  /** Fingerprint of all the user's data: reload when it differs from the last one seen. */
  version: string;
  server_time: string;
  resources: {
    transactions: ResourceState;
    categories: ResourceState;
    budgets: ResourceState;
    recurring_transactions: ResourceState;
    savings_goals: ResourceState;
  };
}
