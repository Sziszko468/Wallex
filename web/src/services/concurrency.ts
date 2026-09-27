/** `If-Match` for a conditional write: the object's `updated_at` as the client loaded it. */
export function ifMatch(version: string | undefined): Record<string, string> {
  return version ? { "If-Match": `"${version}"` } : {};
}
