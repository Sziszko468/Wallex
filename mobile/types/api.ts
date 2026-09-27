export type ApiErrorBody = Record<string, string[] | string | undefined>;

/** DRF's PageNumberPagination envelope — only /api/transactions/ and /api/notifications/ are paginated. */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
