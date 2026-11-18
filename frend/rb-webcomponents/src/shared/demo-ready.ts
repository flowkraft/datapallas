/**
 * The one word a framed dashboard page says to the page that framed it: "I am here, and I drew."
 *
 * A site that shows a demo dashboard in an iframe cannot ask the iframe whether it loaded: browsers
 * hide the failure of a framed page from the page around it, and a demo that is down, or that
 * answers with some other page, looks the same as one that is up. A framed dashboard that says so
 * itself can be told from both, so the site shows the frame only once it has heard this.
 *
 * The message carries the type and the dashboard's id and nothing else (no data, no credential),
 * and goes to any origin for that reason: there is nothing in it to protect, and the receiving site
 * checks who sent it.
 *
 * It is the ONLY word said to any origin. Everything else a framed page says (its height, where a tour step is,
 * what the reader did) waits until the page around the frame has spoken this protocol itself (a theme, a "how was
 * this built" policy or a view message, from the parent window), and then goes to that page's origin only. A site
 * that frames a dashboard without speaking it hears "ready" and nothing more.
 */

export const DEMO_READY_TYPE = 'dp-demo-ready';

/** The host element of the page's own dashboard, as `DashboardController` writes it. */
export const PAGE_DASHBOARD_ID = 'publishedDashboard';

/** The slice of `window` this needs, so a test can stand in for it. */
export interface FramedWindow {
  parent: { postMessage(message: unknown, targetOrigin: string): void };
}

/** The origin of the page around the frame, once it has spoken the protocol (see watchFramedPage); null until then. */
let framingOrigin: string | null = null;

export function getFramingOrigin(): string | null {
  return framingOrigin;
}

/** Says something other than "ready": only framed, only once the page around has spoken, only to its origin. */
function tellFramingPage(win: FramedWindow & object, message: unknown): boolean {
  if (win.parent === win || !framingOrigin) return false;
  win.parent.postMessage(message, framingOrigin);
  return true;
}

/**
 * Says "ready" to the framing page, if there is one and this is the page's own dashboard.
 *
 * Not a nested one: a Gallery page holds other dashboards as tiles, each a host of its own in the
 * same window, and only the page's own host says it. Not a page nobody framed. Returns whether it
 * was said.
 */
export function announceDemoReady(win: FramedWindow & object, hostId: string | null | undefined,
    reportId: string | null | undefined): boolean {
  if (hostId !== PAGE_DASHBOARD_ID || !reportId) return false;
  if (win.parent === win) return false;
  win.parent.postMessage({ type: DEMO_READY_TYPE, id: reportId }, '*');
  return true;
}

export const DEMO_TOUR_VIEW_TYPE = 'dp-demo-tour-view';

/** A box in the framed page's own viewport, as `getBoundingClientRect` gives it. */
export interface ViewBox {
  top: number;
  height: number;
}

/**
 * Where a tour step is, for the page around the frame.
 *
 * A tour scrolls its step into the middle of the framed page's viewport, but when the frame is taller
 * than what the reader can see of it, that middle can be below the fold of the page around it. This is
 * what the tour says so the page can scroll the frame to where the step is: the top and the bottom of
 * everything the step shows (the lit box, if it has one, and the card), in the frame's own viewport,
 * and nothing else. Said only to a page around the frame that has spoken the protocol (tellFramingPage).
 * Returns whether it was said.
 */
export function announceTourView(win: FramedWindow & object, lit: ViewBox | null, card: ViewBox | null): boolean {
  const boxes = [lit, card].filter((box): box is ViewBox => !!box && Number.isFinite(box.top) && Number.isFinite(box.height));
  if (boxes.length === 0) return false;
  const top = Math.min(...boxes.map((box) => box.top));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));
  return tellFramingPage(win, { type: DEMO_TOUR_VIEW_TYPE, top, bottom });
}

export const DEMO_EVENT_TYPE = 'dp-demo-event';

/** What a framed demo can say the reader did. The page around the frame counts these in its own visitor statistics. */
export type DemoAction = 'tour-start' | 'tour-step' | 'tour-finished' | 'tour-closed' | 'filter' | 'story' | 'explore';

/**
 * Says what the reader did, to the page that framed this one: an action and a name - a dashboard, a cube, a
 * story's question - and for the tour a step number. Never a value from the data or the filters. Said only to a
 * page around the frame that has spoken the protocol (tellFramingPage). Returns whether it was said.
 */
export function announceDemoEvent(win: FramedWindow & object, action: DemoAction, name: string, value?: number): boolean {
  const message: { type: string; action: DemoAction; name: string; value?: number } =
    { type: DEMO_EVENT_TYPE, action, name: String(name ?? '').trim().slice(0, 150) };
  if (typeof value === 'number' && Number.isFinite(value)) message.value = value;
  return tellFramingPage(win, message);
}

export const DEMO_HEIGHT_TYPE = 'dp-demo-height';
export const DEMO_VIEW_TYPE = 'dp-demo-view';

/** The part of this framed page the reader can see, in this page's own coordinates (see watchFramedPage). */
export interface VisibleWindow {
  top: number;
  height: number;
  /** How much of this page the reader can have in view at once, wherever the page is scrolled to. */
  room?: number;
}

let visibleWindow: VisibleWindow | null = null;

/** What the page around the frame last said it shows of this page, or null when nobody has said. */
export function getVisibleWindow(): VisibleWindow | null {
  return visibleWindow;
}

/** The window a `dp-demo-view` message names, or null when it is not a usable one. */
export function parseVisibleWindow(data: unknown): VisibleWindow | null {
  const d = data as { type?: unknown; top?: unknown; height?: unknown; room?: unknown } | null;
  if (!d || d.type !== DEMO_VIEW_TYPE) return null;
  if (typeof d.top !== 'number' || typeof d.height !== 'number') return null;
  if (!Number.isFinite(d.top) || !Number.isFinite(d.height) || d.top < 0 || d.height <= 0) return null;
  const room = typeof d.room === 'number' && Number.isFinite(d.room) && d.room > 0 ? d.room : undefined;
  return room === undefined ? { top: d.top, height: d.height } : { top: d.top, height: d.height, room };
}

/** Where the documentation links baked into the shipped dashboards point. */
export const DOCS_ORIGIN = 'https://datapallas.com';

/**
 * The same link, on the site that frames the page instead. A dashboard framed by a development site then opens that
 * site's documentation, and one framed by datapallas.com opens datapallas.com's. Null when the link is not one of the
 * documentation links, or when there is no usable origin.
 */
export function retargetDocsHref(href: string | null | undefined, origin: string | null | undefined): string | null {
  const prefix = DOCS_ORIGIN + '/docs/';
  if (!href || !href.startsWith(prefix) || !origin || !/^https?:\/\/[^/]+$/.test(origin) || origin === DOCS_ORIGIN) return null;
  return origin + '/docs/' + href.slice(prefix.length);
}

let docsOrigin: string | null = null;

/** The origin of the page that framed this one, once it has spoken; null before that and when not framed. */
export function getDocsOrigin(): string | null {
  return docsOrigin;
}

/** The slice of a document that the link retargeting and the "how was this built" blocks need, so a test can stand in for it. */
export interface LinkingDocument {
  addEventListener(type: string, listener: (event: any) => void, capture?: boolean): void;
  removeEventListener(type: string, listener: (event: any) => void, capture?: boolean): void;
  querySelectorAll?(selector: string): ArrayLike<any>;
  createElement?(tag: string): any;
  documentElement?: { setAttribute(name: string, value: string): void; style?: { setProperty(name: string, value: string): void } };
}

export const DEMO_THEME_TYPE = 'dp-demo-theme';

/** The colours of the page around the frame, in the framed dashboard's own theme variables. */
export interface FrameTheme {
  mode: 'dark' | 'light';
  vars: Record<string, string>;
}

/** What the page around the frame may set, by the name it says it with, and the variable that takes it. */
const THEME_VARIABLES: Record<string, string> = {
  surface: '--color-base-100',
  page: '--color-base-200',
  line: '--color-base-300',
  text: '--color-base-content',
  accent: '--color-primary',
  accentText: '--color-primary-content',
};
const HSL_TRIPLET = /^\d{1,3}(\.\d+)? \d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/;

/** The theme a `dp-demo-theme` message names ("h s% l%" triplets only, known names only), or null when it is not a usable one. */
export function parseTheme(data: unknown): FrameTheme | null {
  const d = data as { type?: unknown; mode?: unknown; colours?: unknown } | null;
  if (!d || d.type !== DEMO_THEME_TYPE || (d.mode !== 'dark' && d.mode !== 'light')) return null;
  const given = (d.colours && typeof d.colours === 'object' ? d.colours : {}) as Record<string, unknown>;
  const vars: Record<string, string> = {};
  for (const name of Object.keys(THEME_VARIABLES)) {
    const value = given[name];
    if (typeof value === 'string' && HSL_TRIPLET.test(value.trim())) vars[THEME_VARIABLES[name]] = `hsl(${value.trim()})`;
  }
  return { mode: d.mode, vars };
}

/** Dress the page in the theme. Safe to repeat. */
export function applyTheme(doc: LinkingDocument, theme: FrameTheme): void {
  const root = doc.documentElement;
  if (!root) return;
  root.setAttribute('data-theme', theme.mode);
  for (const name of Object.keys(theme.vars)) root.style?.setProperty(name, theme.vars[name]);
}

export const DEMO_HOWBUILT_TYPE = 'dp-demo-howbuilt';

/**
 * Which of the "How was this dashboard built?" pages the page around the frame has published. `published` lists the
 * pages by their last path segment (dd-executive-overview); `showAll` is the development site, which shows every
 * block with a mark saying whether its page is published.
 */
export interface HowBuiltPolicy {
  showAll: boolean;
  published: string[];
}

/** Nothing is offered until the page around the frame has said what may be. */
const OFFER_NOTHING: HowBuiltPolicy = { showAll: false, published: [] };

export function parseHowBuilt(data: unknown): HowBuiltPolicy | null {
  const d = data as { type?: unknown; showAll?: unknown; published?: unknown } | null;
  if (!d || d.type !== DEMO_HOWBUILT_TYPE || !Array.isArray(d.published)) return null;
  return { showAll: d.showAll === true, published: d.published.filter((p): p is string => typeof p === 'string') };
}

/** The page a "how was this built" link opens, by its last path segment. */
export function howBuiltPageOf(href: string | null | undefined): string {
  return (href ?? '').split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop() ?? '';
}

/** Whether the block of that page is shown, and with which mark: none on a site that shows only what is published. */
export function howBuiltShow(page: string, policy: HowBuiltPolicy): { visible: boolean; mark: string | null } {
  const published = policy.published.includes(page);
  if (published) return { visible: true, mark: policy.showAll ? '(PUBLISHED)' : null };
  return policy.showAll ? { visible: true, mark: '(NOT PUBLISHED)' } : { visible: false, mark: null };
}

const BADGE_CLASS = 'dp-howbuilt-badge';

/** Show, hide and mark every "Build this one yourself" block of the page, the way the policy says. Safe to repeat. */
export function applyHowBuilt(doc: LinkingDocument, policy: HowBuiltPolicy): void {
  if (!doc.querySelectorAll || !doc.createElement) return;
  const cards = doc.querySelectorAll('.card-build');
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const link = card.querySelector('a[id^="lnkHowBuilt-"]');
    if (!link) continue;
    const { visible, mark } = howBuiltShow(howBuiltPageOf(link.getAttribute('href')), policy);
    const display = visible ? '' : 'none';
    if (card.style.display !== display) card.style.display = display;
    let badge = card.querySelector('.' + BADGE_CLASS);
    if (!mark) {
      if (badge) badge.remove();
      continue;
    }
    if (!badge) {
      badge = doc.createElement('span');
      badge.className = BADGE_CLASS;
      badge.style.cssText = 'margin-left:12px;padding:3px 12px;border-radius:999px;font:700 12px/1.4 sans-serif;letter-spacing:.05em;color:#fff;white-space:nowrap;';
      card.appendChild(badge);
    }
    if (badge.textContent !== mark) badge.textContent = mark;
    const colour = mark === '(PUBLISHED)' ? '#2e7d32' : '#c62828';
    if (badge.style.background !== colour) badge.style.background = colour;
  }
}

/** The slice of a window the framed page's two-way talk needs, so a test can stand in for it. */
export interface TalkingWindow extends FramedWindow {
  document?: LinkingDocument;
  addEventListener(type: 'message', listener: (event: { source: unknown; data: unknown; origin?: string }) => void): void;
  removeEventListener(type: 'message', listener: (event: { source: unknown; data: unknown; origin?: string }) => void): void;
  ResizeObserver?: new (callback: () => void) => { observe(target: unknown): void; unobserve(target: unknown): void; disconnect(): void };
  setInterval?: (callback: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
  MutationObserver?: new (callback: () => void) => { observe(target: unknown, options: { childList: boolean }): void; disconnect(): void };
}

/**
 * What a framed dashboard page says to the page that framed it, and hears back, for as long as it is shown.
 *
 * It says how tall it is, each time that changes, so the frame can be exactly as tall as the dashboard
 * and the page around it has the only scroll bar. It hears which part of itself the reader can see, so a
 * card that has no target (the tour's first) is drawn in what is seen, not in the middle of a page that
 * may be thousands of pixels tall. Only the page's own dashboard does either, and only when framed;
 * nothing is said or heard otherwise. Returns what stops it, or null when it did not start.
 */
export function watchFramedPage(win: TalkingWindow & object, host: { getBoundingClientRect(): { height: number }; firstElementChild?: unknown } | null,
    hostId: string | null | undefined): (() => void) | null {
  if (!host || hostId !== PAGE_DASHBOARD_ID || win.parent === win) return null;

  // Until the page around the frame says which pages are published, no "how was this built" block is offered.
  let howBuilt: HowBuiltPolicy = OFFER_NOTHING;
  // The page's own colours stay until the page around the frame has sent its own.
  let theme: FrameTheme | null = null;
  const showHowBuilt = () => {
    if (!win.document) return;
    applyHowBuilt(win.document, howBuilt);
    if (theme) applyTheme(win.document, theme);
  };
  showHowBuilt();

  let last = -1;
  const sayHeight = () => {
    // The box of the element, not its scrollHeight: the host draws inline, and an inline box reports a scrollHeight of 0.
    const height = Math.ceil(host.getBoundingClientRect().height);
    if (!(height > 0) || height === last) return;
    // Not said (the page around has not spoken yet): not remembered either, so it is said as soon as it has.
    if (tellFramingPage(win, { type: DEMO_HEIGHT_TYPE, height })) last = height;
  };
  const observer = win.ResizeObserver ? new win.ResizeObserver(sayHeight) : null;
  // The block inside the host is what is watched: an inline host is never reported as resized. That block is
  // replaced while the page loads (a placeholder, then the dashboard), so what is watched follows it.
  let watched: unknown = null;
  const watchBlock = () => {
    const block = host.firstElementChild ?? host;
    if (block === watched) return;
    if (watched) observer?.unobserve(watched);
    watched = block;
    observer?.observe(block);
  };
  const changes = win.MutationObserver ? new win.MutationObserver(() => { watchBlock(); sayHeight(); }) : null;
  changes?.observe(host, { childList: true });
  watchBlock();
  sayHeight();
  // A browser does not run resize observers of a frame that is out of sight (a frame of another origin, below
  // the fold), yet the page inside goes on growing as its tiles load. A light timer covers exactly that.
  // The same beat re-applies the blocks, which the Gallery draws a little after it says it is ready.
  const poll = win.setInterval ? win.setInterval(() => { showHowBuilt(); sayHeight(); }, 250) : null;

  const hear = (event: { source: unknown; data: unknown; origin?: string }) => {
    if (event.source !== win.parent) return;
    const dressed = parseTheme(event.data);
    const policy = dressed ? null : parseHowBuilt(event.data);
    const seen = dressed || policy ? null : parseVisibleWindow(event.data);
    if (!dressed && !policy && !seen) return;
    // The page around has spoken the protocol: from now on it is told the rest, at its own origin only.
    const firstWord = !framingOrigin;
    if (event.origin && /^https?:\/\/[^/]+$/.test(event.origin)) framingOrigin = event.origin;
    if (dressed) {
      theme = dressed;
      showHowBuilt();
    } else if (policy) {
      howBuilt = policy;
      showHowBuilt();
      sayHeight();
    } else if (seen) {
      visibleWindow = seen;
      // The browser only lets the sites named in the page's frame-ancestors policy frame it, so whoever speaks
      // from the parent window is one of them, and its origin is where the documentation links should go.
      if (event.origin) docsOrigin = event.origin;
    }
    if (firstWord && framingOrigin) sayHeight();
  };
  win.addEventListener('message', hear);

  // A link is pointed at that site's documentation just before it is used: hovered, pressed or focused.
  const retarget = (event: { composedPath?: () => any[]; target?: any }) => {
    if (!docsOrigin) return;
    const path = event.composedPath ? event.composedPath() : [event.target];
    const link = path.find((node) => node && node.tagName === 'A' && node.getAttribute);
    const next = link ? retargetDocsHref(link.getAttribute('href'), docsOrigin) : null;
    if (next) link.setAttribute('href', next);
  };
  const linking = win.document;
  for (const type of ['mouseover', 'pointerdown', 'focusin']) linking?.addEventListener(type, retarget, true);

  return () => {
    observer?.disconnect();
    changes?.disconnect();
    if (poll !== null) win.clearInterval?.(poll);
    win.removeEventListener('message', hear);
    for (const type of ['mouseover', 'pointerdown', 'focusin']) linking?.removeEventListener(type, retarget, true);
    visibleWindow = null;
    docsOrigin = null;
    framingOrigin = null;
  };
}
