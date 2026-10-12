/**
 * Opening the app with `?session=<id>` resumes that settlement. The id is
 * only used if it looks like a backend session id (a UUID), so a mangled or
 * malicious link can't push arbitrary text into API paths.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSessionParam(search: string): string | null {
  const value = new URLSearchParams(search).get("session")?.trim() ?? "";
  return UUID.test(value) ? value : null;
}

/** The same URL with the `session` parameter removed (everything else kept). */
export function withoutSessionParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("session");
  return url.pathname + url.search + url.hash;
}
