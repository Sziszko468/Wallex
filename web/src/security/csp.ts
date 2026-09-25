/**
 * Content-Security-Policy for the production build (injected into index.html
 * by vite.config.ts; the dev server needs inline scripts for hot reload).
 *
 * Tokens live in localStorage, so an XSS would be able to read them. React
 * already escapes all rendered text and the app never injects raw HTML; this
 * policy is the second line of defence: only our own bundled scripts can run,
 * and the page can only talk to our own API.
 *
 * `frame-ancestors` (clickjacking) can't be set from a <meta> tag — the hosting
 * platform must send it as an HTTP header (see docs/security-audit.md).
 */
export function buildContentSecurityPolicy(apiBaseUrl: string): string {
  const apiOrigin = new URL(apiBaseUrl).origin;
  return [
    "default-src 'self'",
    "script-src 'self'",
    // React and Recharts set style attributes; styles can't execute code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
