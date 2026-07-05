/**
 * Date/time helpers for rendering timestamps.
 * Accept nullable Unix-seconds timestamps and return locale-aware strings.
 * Missing values render as an em dash, never "1/1/1970".
 */

export function formatDate(ts: number | null | undefined): string {
  if (ts == null || ts <= 0) return "\u2014";
  return new Date(ts * 1000).toLocaleDateString();
}

export function formatDateTime(ts: number | null | undefined): string {
  if (ts == null || ts <= 0) return "\u2014";
  return new Date(ts * 1000).toLocaleString();
}
