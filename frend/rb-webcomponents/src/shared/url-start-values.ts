// Starting filter values carried by the page URL, and written back into it.
//
// A link can carry a view: a screenshot in a "How it was built" page, or a link a reader shares
// after picking the filters they wanted. This module is the ONLY place that reads or writes the
// address bar for parameters; `RbParameters.wc.svelte` is its only caller.
//
// A filter bar is not a security boundary, and neither is this. A URL can only choose, among what
// the reader could already pick by hand, where the filters start. What a reader may see is decided
// on the server, by sign-in, the locks (`embed/LockedParams.java`) and `access_filter`.
//
// The rules, as the plan states them:
//   - a key is `<report id>.<parameter id>`; the plain `<parameter id>` is read only on the
//     dashboard's own page (`/dashboard/<report id>`), so 25 dashboards on one page never read
//     each other's values;
//   - only declared parameters; an unknown key is ignored, with one warning;
//   - a value is a STARTING value, exactly as if the reader had picked it: it goes through the
//     same checks (options, type) and then through the form's own validation;
//   - a locked parameter ignores the URL, and is never written to it;
//   - values are never rendered as HTML - nothing here is passed to `{@html}`;
//   - writing back happens only on DataPallas's own `/dashboard/...` pages: on a host
//     application's page, the host owns its URL (reading still works).
//
// Plain functions in a module of their own, next to `parameter-controls.ts`, so the rules can be
// read in one place - and so that the same acceptance check serves both the URL and Show Me.

import { controlTypeOf, defaultForType } from './parameter-controls';

/** A parameter as the DSL declares it, as far as a starting value is concerned. */
export interface StartValueParam {
  id: string;
  type?: string;
  defaultValue?: any;
  uiHints?: { control?: string; widget?: string; options?: any } | null;
}

/** The multi-select wildcard, as `RbParameters` writes it: "every option". */
const WILDCARD = '*';

/**
 * Query keys a DataPallas dashboard page carries for itself. They are not parameters and saying so
 * on every page load would be noise - everything else that is not a declared parameter warns once.
 */
const RESERVED_QUERY_KEYS: readonly string[] = ['token', 'embed-token', 'embedToken', 'lang', 'theme'];

/** One warning per key per page, however often the form re-initialises. */
const warned = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`rb-parameters: ${message}`);
}

/** Forgets which keys were warned about. For the tests. */
export function resetUrlWarnings(): void {
  warned.clear();
}

/**
 * Is this one of DataPallas's own dashboard pages?
 *
 * This single line decides where values are written back: on a host application's page that embeds
 * `<rb-dashboard>`, the host owns its URL and nothing is written there.
 */
export function isDashboardPage(pathname: string): boolean {
  return /(^|\/)dashboard\/[^/]+\/?$/.test(pathname || '');
}

/** Is this the dashboard's OWN page, where a plain parameter name is read and written? */
export function isOwnDashboardPage(pathname: string, reportId: string): boolean {
  if (!reportId) return false;
  const match = /(^|\/)dashboard\/([^/]+)\/?$/.exec(pathname || '');
  if (!match) return false;
  try {
    return decodeURIComponent(match[2]) === reportId;
  } catch {
    return match[2] === reportId;
  }
}

/**
 * Split a multi-select value on unescaped commas: `a\,b,c` is the two values `a,b` and `c`.
 *
 * A comma inside an option is written `\,` and a backslash `\\`, so whatever `urlWithValues` writes
 * reads back identically.
 */
export function splitEscaped(raw: string): string[] {
  const out: string[] = [];
  let current = '';
  let escaped = false;
  for (const ch of String(raw)) {
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === ',') { out.push(current); current = ''; continue; }
    current += ch;
  }
  if (escaped) current += '\\'; // a trailing lone backslash is the character itself
  out.push(current);
  return out.map(s => s.trim()).filter(s => s.length > 0);
}

/** The twin of `splitEscaped`: join values, escaping the backslash first and then the comma. */
export function joinEscaped(values: any[]): string {
  return values
    .map(v => String(v).replace(/\\/g, '\\\\').replace(/,/g, '\\,'))
    .join(',');
}

/** The option values this parameter offers, or null when it offers no list. */
function optionValues(p: StartValueParam): string[] | null {
  const opts = (p.uiHints as any)?.options;
  if (!Array.isArray(opts) || opts.length === 0) return null;
  // The three shapes `loadOptions` accepts: plain values, {label, value}, and [value, label].
  return opts.map(o => {
    if (Array.isArray(o) && o.length >= 2 && typeof o[0] !== 'object') return String(o[0]);
    if (typeof o === 'object' && o !== null && 'value' in o) return String((o as any).value);
    return String(o);
  });
}

/** What this parameter holds when nobody has touched it. */
export function defaultValueOf(p: StartValueParam): any {
  return p.defaultValue ?? defaultForType(p.type || '');
}

/**
 * One incoming value, checked the way the control would have been filled in by hand.
 *
 * Returns `{ ok: false }` - and warns once - for a value the reader could not have picked: a word
 * where a number belongs, or a value that is not among a select's options.
 */
export function acceptValue(
  p: StartValueParam, raw: any, warnKey?: string,
): { ok: boolean; value?: any } {
  const control = controlTypeOf(p as any);
  const text = raw == null ? '' : String(raw);
  const reject = (why: string) => {
    if (warnKey) warnOnce(warnKey, `"${warnKey}" is ignored - ${why}.`);
    return { ok: false };
  };

  if (control === 'boolean') {
    const t = text.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(t)) return { ok: true, value: true };
    if (['false', '0', 'no', 'off'].includes(t)) return { ok: true, value: false };
    return reject('it is not true or false');
  }

  if (control === 'integer') {
    if (!/^-?\d+$/.test(text.trim())) return reject('it is not a whole number');
    return { ok: true, value: Number(text.trim()) };
  }

  if (control === 'decimal') {
    const n = Number(text.trim());
    if (text.trim() === '' || !Number.isFinite(n)) return reject('it is not a number');
    return { ok: true, value: n };
  }

  if (control === 'multi-select') {
    if (text.trim() === WILDCARD) return { ok: true, value: WILDCARD };
    const picked = splitEscaped(text);
    if (picked.length === 0) return { ok: true, value: '' };
    const known = optionValues(p);
    if (known) {
      const outside = picked.filter(v => !known.includes(v));
      if (outside.length) return reject(`${outside.join(', ')} is not one of its options`);
    }
    // Back in the value contract the rest of the component and the backend share: a plain CSV.
    return { ok: true, value: picked.join(',') };
  }

  if (control === 'select' || control === 'radio') {
    const known = optionValues(p);
    if (known && !known.includes(text)) return reject('it is not one of its options');
    return { ok: true, value: text };
  }

  // text, date, datetime and anything that fell back to a text box: the value travels as the reader
  // would have typed it. A date carries whatever a default of the same parameter would carry -
  // nothing here expands a token, exactly as nothing does for a default.
  return { ok: true, value: text };
}

/**
 * The values a caller may apply, out of what it was handed: declared parameters only, each value
 * accepted by the check above, and never a locked one.
 *
 * Both starting values from the URL and Show Me (which sets a story's values in place) come through
 * here, so the two can never drift apart.
 */
export function acceptedValues(
  parameters: StartValueParam[],
  incoming: { [key: string]: any },
  locked: { [id: string]: any } = {},
): { [id: string]: any } {
  const out: { [id: string]: any } = {};
  if (!parameters || !incoming) return out;
  const byId = new Map(parameters.map(p => [p.id, p]));
  for (const [id, raw] of Object.entries(incoming)) {
    const p = byId.get(id);
    if (!p) {
      warnOnce(id, `"${id}" is not a parameter of this dashboard - ignored.`);
      continue;
    }
    // Locks win: the value is the link's, not the caller's. The server enforces this whatever the
    // browser sends; this keeps the filter bar honest about what is on screen.
    if (locked && Object.prototype.hasOwnProperty.call(locked, id)) continue;
    const accepted = acceptValue(p, raw, id);
    if (accepted.ok) out[id] = accepted.value;
  }
  return out;
}

/**
 * The starting values this dashboard takes from the page URL.
 *
 * `search` is `location.search`, `pathname` is `location.pathname`. Locked parameters are the
 * caller's to skip - it is the one that knows the locks.
 */
export function startValuesFromUrl(
  search: string,
  pathname: string,
  reportId: string,
  parameters: StartValueParam[],
): { [id: string]: any } {
  const out: { [id: string]: any } = {};
  if (!search || !parameters || parameters.length === 0) return out;

  const query = new URLSearchParams(search);
  const own = isOwnDashboardPage(pathname, reportId);
  const prefix = reportId ? `${reportId}.` : '';
  const byId = new Map(parameters.map(p => [p.id, p]));

  query.forEach((raw, key) => {
    let id: string | null = null;
    if (prefix && key.startsWith(prefix)) {
      id = key.slice(prefix.length);
    } else if (own && !key.includes('.')) {
      // The plain name, on this dashboard's own page only - so the 25 dashboards of the Gallery
      // never read each other's values.
      id = key;
    } else {
      return;
    }
    const p = byId.get(id);
    if (!p) {
      if (!RESERVED_QUERY_KEYS.includes(key)) {
        warnOnce(key, `"${key}" is not a parameter of this dashboard - ignored.`);
      }
      return;
    }
    const accepted = acceptValue(p, raw, key);
    if (accepted.ok) out[id] = accepted.value;
  });

  return out;
}

/** One value as the URL carries it. The empty string means "no key". */
function serialise(p: StartValueParam, value: any): string {
  if (value == null) return '';
  if (controlTypeOf(p as any) === 'multi-select') {
    const text = String(value);
    if (text.trim() === WILDCARD) return WILDCARD;
    // The component's own value is a plain CSV: split it there, escape each value here.
    const picked = text.split(',').map(s => s.trim()).filter(Boolean);
    return picked.length ? joinEscaped(picked) : '';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/**
 * `href` with this dashboard's values in it: the twin of `startValuesFromUrl`.
 *
 * Only what the reader has actually chosen is written - a value back at its default takes its key
 * away again, so a dashboard nobody touched leaves the URL exactly as it is today. A locked
 * parameter is never written. Every other query parameter stays as it was: the share link's
 * `token`, the other dashboards' keys, anything else the URL carries.
 *
 * On a host application's page the href comes back unchanged: the host owns its URL.
 */
export function urlWithValues(
  href: string,
  reportId: string,
  parameters: StartValueParam[],
  values: { [id: string]: any },
  locked: { [id: string]: any } = {},
): string {
  if (!href || !parameters || parameters.length === 0) return href;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (!isDashboardPage(url.pathname)) return href;

  const own = isOwnDashboardPage(url.pathname, reportId);
  if (!own && !reportId) return href;

  for (const p of parameters) {
    const key = own ? p.id : `${reportId}.${p.id}`;
    const isLocked = locked && Object.prototype.hasOwnProperty.call(locked, p.id);
    const value = serialise(p, values ? values[p.id] : undefined);
    const fallback = serialise(p, defaultValueOf(p));
    if (isLocked || value === '' || value === fallback) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}
