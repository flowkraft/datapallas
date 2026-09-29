/**
 * How a web component asks the server for something when it rides on the browser's own session.
 *
 * <p>A page that carries a credential of its own - an embed token, an API key, a bearer - names its
 * caller inside the request, and the server takes that as the answer: those requests are exempt
 * from CSRF (see {@code SecurityConfig.configureCsrf}). A page that carries none of them is asking
 * as whoever is signed in on this browser, through a session cookie the browser attaches by itself
 * - and a cookie the browser attaches by itself, it attaches just as readily for a page the reader
 * never meant to visit. That is what CSRF is, and why the server refuses such a write unless it
 * also carries the token it put in a cookie for exactly this purpose. Reading that cookie back is
 * the whole of the client's part: the server issues XSRF-TOKEN with httpOnly=false so a page can.
 *
 * <p>Every component that writes goes through here, so there is one answer to "does this request
 * carry the token" rather than one per component.
 */

/** The credentials that name their own caller: a request carrying one is not a session request. */
const OWN_CREDENTIALS = ['x-embed-token', 'x-api-key', 'authorization'];

/** One cookie's value out of a `document.cookie` text, or '' when that cookie is not in it. */
export function cookieValue(name: string, cookieText: string): string {
  for (const part of String(cookieText || '').split(';')) {
    const equals = part.indexOf('=');
    if (equals < 0) continue;
    if (part.slice(0, equals).trim() !== name) continue;
    const raw = part.slice(equals + 1).trim();
    // The server writes the token as it is, but a cookie is allowed to arrive percent-encoded.
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return '';
}

/**
 * The same headers, plus X-XSRF-TOKEN when this request rides on the browser session.
 *
 * <p>Returned unchanged when the request already carries a credential of its own, and unchanged
 * when there is no XSRF-TOKEN cookie to read - a page served without one is either not signed in
 * or not talking to this server, and an invented header would help neither.
 */
export function withCsrfHeader(
  headers: Record<string, string>,
  cookieText?: string,
): Record<string, string> {
  const carried = Object.keys(headers || {}).map((name) => name.toLowerCase());
  if (OWN_CREDENTIALS.some((credential) => carried.includes(credential))) return headers;

  const text = cookieText ?? (typeof document === 'undefined' ? '' : document.cookie);
  const token = cookieValue('XSRF-TOKEN', text);
  if (!token) return headers;

  return { ...headers, 'X-XSRF-TOKEN': token };
}

/**
 * The container's own error body, rather than one this application wrote.
 *
 * <p>Spring answers a request it turned away itself with
 * {@code {"timestamp":…,"status":403,"error":"Forbidden","path":…}}, where `error` is the status's
 * name and not a sentence. Everything this application refuses on purpose answers with `{ error }`
 * alone, and says in words why.
 */
function isContainerDefault(body: any): boolean {
  return !!body && typeof body === 'object'
    && typeof body.status === 'number' && typeof body.path === 'string';
}

/**
 * What to put in front of a reader when a request came back refused.
 *
 * <p>A sentence the application wrote is shown as it stands. The container's bare status name is
 * not: "Forbidden" on its own tells the reader nothing they can act on, which is the whole of what
 * they saw when a write left without its token.
 */
export function refusalMessage(body: any, status: number, fallback: string): string {
  const said = typeof body?.error === 'string' ? body.error.trim() : '';
  if (said && !isContainerDefault(body)) return said;

  if (status === 401)
    return 'You are not signed in any more. Reload the page and sign in again.';
  if (status === 403)
    return 'The server did not accept this request from this page. Reload the page and try again;'
      + ' if it keeps happening, sign in again.';

  return fallback + ' (' + status + ').';
}
