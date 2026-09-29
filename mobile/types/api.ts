export type ApiErrorBody = Record<string, string[] | string | undefined>;

/** DRF's PageNumberPagination envelope — only transactions, notifications and assistant conversations are paginated. */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
