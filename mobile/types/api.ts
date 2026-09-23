export type ApiErrorBody = Record<string, string[] | string | undefined>;

/** DRF's PageNumberPagination envelope — only /api/transactions/ is paginated. */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
