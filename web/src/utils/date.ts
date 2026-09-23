/** "YYYY-MM-DD" from LOCAL date components — never toISOString(), which is
 * UTC-based and can silently roll the date back near local midnight. */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
