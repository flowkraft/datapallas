/**
 * Prepares a published dashboard's template before it is written into the page.
 *
 * <h2>Why this exists</h2>
 * A dashboard's template is authored HTML full of `rb-*` widgets, and every one of those widgets is
 * self-contained: it fetches its own config and its own data on mount, reading its credential from
 * its own host attribute and from nowhere else. `<rb-dashboard>` holds the credential for the page
 * — a session cookie carries by itself, but an `embed-token` is an attribute and attributes do not
 * inherit. Written verbatim, the template therefore renders the frame of a shared dashboard with
 * every widget empty: the page opens, the widgets are refused one by one, and the visitor is shown
 * half a dashboard with nothing to explain it.
 *
 * <p>So the host's credential and the host's API base are written onto the widgets as the template
 * is injected. There is exactly one dashboard on the page and exactly one report it may read, which
 * is what makes this safe to do wholesale: the token the widgets receive unlocks that one report
 * and nothing else, and a widget that names a different report is told so rather than left blank.
 *
 * <h2>Why the API base is overridden rather than defaulted</h2>
 * A template carries the API base that was true on the author's machine when the dashboard was
 * published — `http://localhost:9090/api` for every sample we ship. The page knows where its own
 * API is, because its own server put it there. The page is right and the template is stale, so the
 * page wins. A template that names no base is filled in by the same rule.
 *
 * This is pure string work with no DOM and no browser API, so it holds identically in Electron, on
 * Windows, on the Server and in Docker, and can be tested without any of them.
 */

export interface DashboardHostContext {
  /** The one report this page — and therefore this page's credential — may read. */
  reportId: string;
  /** Where the page's own API lives, as `<rb-dashboard>` received it. */
  apiBaseUrl: string;
  /** The short-lived token minted for a share link or an embed; empty when a session cookie carries. */
  embedToken: string;
  /** Current parameter values, as the dashboard's `rb-parameters` last reported them. */
  reportParams: Record<string, unknown>;
}

/** The widgets that take `report-params`; the others ignore it, so they are not given it. */
const PARAMETERISED_WIDGETS = ['tabulator', 'chart', 'pivot-table', 'value'];

/** The host element itself never appears inside its own template, and must never be fed to itself. */
const NOT_A_WIDGET = ['report', 'dashboard'];

const WIDGET_OPEN_TAG = /<rb-([a-z0-9-]+)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/gi;

/**
 * @returns the template with the host's credential, API base and parameters written onto every
 *          widget that can use them, and with an explanation in front of any widget that names a
 *          report this page's credential cannot open
 */
export function prepareDashboardHtml(template: string, host: DashboardHostContext): string {
  if (!template) return template;

  return template.replace(WIDGET_OPEN_TAG, (whole, tagRest: string, attrs: string, selfClosing: string) => {
    const tag = String(tagRest).toLowerCase();
    if (NOT_A_WIDGET.indexOf(tag) >= 0) return whole;

    const widgetReportId = attributeValue(attrs, 'report-id');

    // One link opens one report. A widget pointed at a second report is refused by the server
    // whatever we do here, so the page says so where the tile would have been — a blank tile is
    // what sends the author looking for a bug in their template.
    if (host.embedToken && widgetReportId && widgetReportId !== host.reportId)
      return refusalNote(tag, widgetReportId, host.reportId) + whole;

    let next = attrs;

    if (host.embedToken) next = withAttribute(next, 'embed-token', host.embedToken, false);
    if (host.apiBaseUrl) next = withAttribute(next, 'api-base-url', host.apiBaseUrl, true);

    if (PARAMETERISED_WIDGETS.indexOf(tag) >= 0 && host.reportParams
      && Object.keys(host.reportParams).length > 0)
      next = withAttribute(next, 'report-params', JSON.stringify(host.reportParams), false);

    return '<rb-' + tagRest + next + selfClosing + '>';
  });
}

/** What the visitor is shown instead of a tile that can never fill. */
function refusalNote(tag: string, widgetReportId: string, dashboardReportId: string): string {
  return '<div class="rb-widget-not-shared" role="note">'
    + 'This dashboard is open through a share link, which opens one report only ('
    + escapeText(dashboardReportId) + '). The widget below reads &quot;'
    + escapeText(widgetReportId) + '&quot; (' + escapeText('rb-' + tag)
    + '), so it cannot be shown here.</div>';
}

/** @returns the value of `name` in an attribute string, or `''` when it carries no such attribute */
function attributeValue(attrs: string, name: string): string {
  const match = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(attrs);
  if (!match) return '';
  return unescapeAttribute(match[2] !== undefined ? match[2] : (match[3] || ''));
}

/**
 * @param replaceExisting whether a value the template already carries is overwritten — true for the
 *                        API base, which the page knows better than the template does, and false
 *                        for anything a template author may have set deliberately
 */
function withAttribute(attrs: string, name: string, value: string, replaceExisting: boolean): string {
  const existing = new RegExp('(\\s' + name + '\\s*=\\s*)("[^"]*"|\'[^\']*\')', 'i');

  if (existing.test(attrs))
    return replaceExisting ? attrs.replace(existing, '$1"' + escapeAttribute(value) + '"') : attrs;

  return ' ' + name + '="' + escapeAttribute(value) + '"' + attrs;
}

function escapeAttribute(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function unescapeAttribute(value: string): string {
  return String(value).replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

function escapeText(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
