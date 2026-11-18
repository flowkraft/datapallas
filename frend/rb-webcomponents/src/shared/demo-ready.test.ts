// Run: npm test (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/demo-ready.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseTheme, applyTheme, DEMO_THEME_TYPE, parseHowBuilt, howBuiltPageOf, howBuiltShow, applyHowBuilt, DEMO_HOWBUILT_TYPE, retargetDocsHref, getDocsOrigin, announceDemoReady, announceDemoEvent, DEMO_EVENT_TYPE, announceTourView, watchFramedPage, parseVisibleWindow, getVisibleWindow, DEMO_READY_TYPE, DEMO_TOUR_VIEW_TYPE, DEMO_HEIGHT_TYPE, DEMO_VIEW_TYPE } from './demo-ready.ts';

/** A window with a parent that records what it is told. */
function framedWindow() {
  const heard: Array<{ message: any; origin: string }> = [];
  const win: any = { parent: { postMessage: (message: any, origin: string) => heard.push({ message, origin }) } };
  return { win, heard };
}

describe('the ready word of a framed dashboard', () => {
  test('the page\'s own dashboard, framed: the type and the id go to any origin, and nothing else', () => {
    const { win, heard } = framedWindow();
    assert.equal(announceDemoReady(win, 'publishedDashboard', 'g-cube-country-sales'), true);
    assert.deepEqual(heard, [{ message: { type: DEMO_READY_TYPE, id: 'g-cube-country-sales' }, origin: '*' }]);
  });

  test('a page nobody framed says nothing', () => {
    const win: any = {};
    win.parent = win;
    assert.equal(announceDemoReady(win, 'publishedDashboard', 'g-cube-country-sales'), false);
  });

  test('a tile of a Gallery page, a host of its own in the same window, says nothing', () => {
    const { win, heard } = framedWindow();
    assert.equal(announceDemoReady(win, 'tile-3', 'g-dd-sales-overview'), false);
    assert.equal(announceDemoReady(win, null, 'g-dd-sales-overview'), false);
    assert.equal(heard.length, 0);
  });

  test('a dashboard with no id says nothing', () => {
    const { win, heard } = framedWindow();
    assert.equal(announceDemoReady(win, 'publishedDashboard', ''), false);
    assert.equal(announceDemoReady(win, 'publishedDashboard', undefined), false);
    assert.equal(heard.length, 0);
  });
});

describe('where a tour step is, for the page around the frame', () => {
  test('the lit box and the card are said as one span, top and bottom, and nothing else', () => {
    const { win, heard } = framedWindow();
    assert.equal(announceTourView(win, { top: 120, height: 80 }, { top: 220, height: 160 }), true);
    assert.deepEqual(heard, [{ message: { type: DEMO_TOUR_VIEW_TYPE, top: 120, bottom: 380 }, origin: '*' }]);
  });

  test('a card above the lit box widens the span upwards', () => {
    const { win, heard } = framedWindow();
    announceTourView(win, { top: 400, height: 50 }, { top: 100, height: 200 });
    assert.deepEqual(heard[0].message, { type: DEMO_TOUR_VIEW_TYPE, top: 100, bottom: 450 });
  });

  test('a step with no lit box says where its card is', () => {
    const { win, heard } = framedWindow();
    assert.equal(announceTourView(win, null, { top: 300, height: 180 }), true);
    assert.deepEqual(heard[0].message, { type: DEMO_TOUR_VIEW_TYPE, top: 300, bottom: 480 });
  });

  test('a page nobody framed, or nothing to say, says nothing', () => {
    const alone: any = {};
    alone.parent = alone;
    assert.equal(announceTourView(alone, { top: 1, height: 1 }, { top: 2, height: 2 }), false);
    const { win, heard } = framedWindow();
    assert.equal(announceTourView(win, null, null), false);
    assert.equal(announceTourView(win, { top: NaN, height: 5 }, null), false);
    assert.equal(heard.length, 0);
  });
});

/** A framed window that also records what it listens to and what it observes. */
function talkingWindow() {
  const { win, heard } = framedWindow();
  const listeners: Array<(event: { source: unknown; data: unknown }) => void> = [];
  let resize: (() => void) | null = null;
  let observing = false;
  const watched: unknown[] = [];
  win.addEventListener = (_t: string, l: any) => listeners.push(l);
  win.removeEventListener = (_t: string, l: any) => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
  let changed: (() => void) | null = null;
  win.ResizeObserver = class { constructor(cb: () => void) { resize = cb; } observe(target: unknown) { observing = true; watched.push(target); } unobserve(target: unknown) { watched.splice(watched.indexOf(target), 1); } disconnect() { observing = false; } };
  let tick: (() => void) | null = null; let cleared = false;
  win.setInterval = (cb: () => void) => { tick = cb; return 7; };
  win.clearInterval = (id: unknown) => { cleared = id === 7; };
  win.MutationObserver = class { constructor(cb: () => void) { changed = cb; } observe() {} disconnect() {} };
  return { win, heard, listeners, resized: () => resize?.(), isObserving: () => observing, observed: () => watched, childChanged: () => changed?.(), ticked: () => tick?.(), pollCleared: () => cleared };
}

/** An element that is only as tall as it says. */
function boxOf(height: number) {
  return { getBoundingClientRect: () => ({ height }) };
}

describe('how tall a framed dashboard is, and what of it is seen', () => {
  test('its height is said at once and again each time it changes, never twice the same', () => {
    const { win, heard, resized, observed, childChanged, ticked, pollCleared } = talkingWindow();
    const inside = { id: 'the block inside' };
    const host: { height: number; firstElementChild: unknown; getBoundingClientRect(): { height: number } } = { height: 1234.2, firstElementChild: inside, getBoundingClientRect() { return { height: this.height }; } };
    const stop = watchFramedPage(win, host, 'publishedDashboard');
    assert.ok(stop);
    assert.deepEqual(observed(), [inside]);
    assert.deepEqual(heard.map((h) => h.message), [{ type: DEMO_HEIGHT_TYPE, height: 1235 }]);
    resized();
    assert.equal(heard.length, 1);
    host.height = 2000;
    resized();
    assert.deepEqual(heard[1], { message: { type: DEMO_HEIGHT_TYPE, height: 2000 }, origin: '*' });
    // The block inside is replaced (a placeholder, then the dashboard): the new one is watched, the old one let go.
    const replacement = { id: 'the dashboard' };
    host.firstElementChild = replacement as any;
    host.height = 2400;
    childChanged();
    assert.deepEqual(observed(), [replacement]);
    assert.equal(heard.at(-1)!.message.height, 2400);
    // Out of sight the observer is silent; the timer still notices growth.
    host.height = 3000;
    ticked();
    assert.equal(heard.at(-1)!.message.height, 3000);
    stop();
    assert.ok(pollCleared());
  });

  test('a tile, a page nobody framed, or no host starts nothing', () => {
    const { win, heard } = talkingWindow();
    assert.equal(watchFramedPage(win, boxOf(500), 'tile-3'), null);
    assert.equal(watchFramedPage(win, null, 'publishedDashboard'), null);
    const alone: any = {};
    alone.parent = alone;
    assert.equal(watchFramedPage(alone, boxOf(500), 'publishedDashboard'), null);
    assert.equal(heard.length, 0);
  });

  test('the visible window is heard from the framing page only, and forgotten when it stops', () => {
    const { win, listeners, isObserving } = talkingWindow();
    const stop = watchFramedPage(win, boxOf(900), 'publishedDashboard')!;
    assert.equal(isObserving(), true);
    listeners[0]({ source: {}, data: { type: DEMO_VIEW_TYPE, top: 50, height: 600 } });
    assert.equal(getVisibleWindow(), null);
    listeners[0]({ source: win.parent, data: { type: DEMO_VIEW_TYPE, top: 50, height: 600 } });
    assert.deepEqual(getVisibleWindow(), { top: 50, height: 600 });
    stop();
    assert.equal(getVisibleWindow(), null);
    assert.equal(listeners.length, 0);
    assert.equal(isObserving(), false);
  });

  test('only a whole, positive window is a window', () => {
    assert.deepEqual(parseVisibleWindow({ type: DEMO_VIEW_TYPE, top: 0, height: 10 }), { top: 0, height: 10 });
    assert.deepEqual(parseVisibleWindow({ type: DEMO_VIEW_TYPE, top: 0, height: 10, room: 700 }), { top: 0, height: 10, room: 700 });
    assert.deepEqual(parseVisibleWindow({ type: DEMO_VIEW_TYPE, top: 0, height: 10, room: -3 }), { top: 0, height: 10 });
    assert.equal(parseVisibleWindow({ type: DEMO_VIEW_TYPE, top: -1, height: 10 }), null);
    assert.equal(parseVisibleWindow({ type: DEMO_VIEW_TYPE, top: 0, height: 0 }), null);
    assert.equal(parseVisibleWindow({ type: DEMO_VIEW_TYPE, top: '5', height: 10 }), null);
    assert.equal(parseVisibleWindow({ type: 'other', top: 0, height: 10 }), null);
    assert.equal(parseVisibleWindow(null), null);
  });
});

describe('documentation links of a framed dashboard', () => {
  test('a link to datapallas.com docs is moved to the site that frames the page, path kept', () => {
    assert.equal(retargetDocsHref('https://datapallas.com/docs/bi-analytics/dashboard-examples/dd-payroll', 'https://dp-www-dev.bkstg.flowkraft.com'),
      'https://dp-www-dev.bkstg.flowkraft.com/docs/bi-analytics/dashboard-examples/dd-payroll');
  });

  test('anything else is left alone', () => {
    const dev = 'https://dp-www-dev.bkstg.flowkraft.com';
    assert.equal(retargetDocsHref('https://datapallas.com/pricing', dev), null);
    assert.equal(retargetDocsHref('https://example.com/docs/x', dev), null);
    assert.equal(retargetDocsHref('/docs/x', dev), null);
    assert.equal(retargetDocsHref(null, dev), null);
    assert.equal(retargetDocsHref('https://datapallas.com/docs/x', 'https://datapallas.com'), null);
    assert.equal(retargetDocsHref('https://datapallas.com/docs/x', 'javascript:alert(1)'), null);
    assert.equal(retargetDocsHref('https://datapallas.com/docs/x', 'https://evil.example/path'), null);
    assert.equal(retargetDocsHref('https://datapallas.com/docs/x', null), null);
  });

  test('framed: the origin of the parent is learnt from its view message, and a link is retargeted when hovered', () => {
    const listeners: Record<string, (e: any) => void> = {};
    const doc = { addEventListener: (t: string, l: any) => { listeners[t] = l; }, removeEventListener: (t: string) => { delete listeners[t]; } };
    let onMessage: any;
    const parent = { postMessage: () => {} };
    const win: any = { parent, document: doc, addEventListener: (_t: string, l: any) => { onMessage = l; }, removeEventListener: () => {} };
    const link: any = { tagName: 'A', attrs: { href: 'https://datapallas.com/docs/semantic-layer/cube-examples' }, getAttribute(n: string) { return this.attrs[n]; }, setAttribute(n: string, v: string) { this.attrs[n] = v; } };
    const stop = watchFramedPage(win, { getBoundingClientRect: () => ({ height: 100 }) }, 'publishedDashboard')!;
    listeners.mouseover({ target: link });
    assert.equal(link.attrs.href, 'https://datapallas.com/docs/semantic-layer/cube-examples');
    onMessage({ source: parent, origin: 'https://dp-www-dev.bkstg.flowkraft.com', data: { type: DEMO_VIEW_TYPE, top: 0, height: 700 } });
    assert.equal(getDocsOrigin(), 'https://dp-www-dev.bkstg.flowkraft.com');
    listeners.mouseover({ target: link });
    assert.equal(link.attrs.href, 'https://dp-www-dev.bkstg.flowkraft.com/docs/semantic-layer/cube-examples');
    stop();
    assert.equal(getDocsOrigin(), null);
    assert.equal(Object.keys(listeners).length, 0);
  });

  test('a message from anyone but the parent does not set the origin', () => {
    let onMessage: any;
    const parent = { postMessage: () => {} };
    const win: any = { parent, addEventListener: (_t: string, l: any) => { onMessage = l; }, removeEventListener: () => {} };
    const stop = watchFramedPage(win, { getBoundingClientRect: () => ({ height: 100 }) }, 'publishedDashboard')!;
    onMessage({ source: {}, origin: 'https://evil.example', data: { type: DEMO_VIEW_TYPE, top: 0, height: 700 } });
    assert.equal(getDocsOrigin(), null);
    stop();
  });
});

describe('the "how was this dashboard built" blocks of a framed Gallery', () => {
  const href = (p: string) => `https://datapallas.com/docs/bi-analytics/dashboard-examples/${p}`;

  test('the page is the last segment of the link', () => {
    assert.equal(howBuiltPageOf(href('dd-payroll')), 'dd-payroll');
    assert.equal(howBuiltPageOf(href('dd-payroll') + '/?x=1#y'), 'dd-payroll');
    assert.equal(howBuiltPageOf(null), '');
  });

  test('a policy needs its type and a list; anything else is no policy', () => {
    assert.deepEqual(parseHowBuilt({ type: DEMO_HOWBUILT_TYPE, showAll: true, published: ['a', 3, 'b'] }), { showAll: true, published: ['a', 'b'] });
    assert.deepEqual(parseHowBuilt({ type: DEMO_HOWBUILT_TYPE, published: [] }), { showAll: false, published: [] });
    assert.equal(parseHowBuilt({ type: 'other', published: [] }), null);
    assert.equal(parseHowBuilt({ type: DEMO_HOWBUILT_TYPE }), null);
    assert.equal(parseHowBuilt(null), null);
  });

  test('production shows only what is published, unmarked; development shows all, marked', () => {
    const prod = { showAll: false, published: ['dd-a'] };
    assert.deepEqual(howBuiltShow('dd-a', prod), { visible: true, mark: null });
    assert.deepEqual(howBuiltShow('dd-b', prod), { visible: false, mark: null });
    const dev = { showAll: true, published: ['dd-a'] };
    assert.deepEqual(howBuiltShow('dd-a', dev), { visible: true, mark: '(PUBLISHED)' });
    assert.deepEqual(howBuiltShow('dd-b', dev), { visible: true, mark: '(NOT PUBLISHED)' });
  });

  function fakeDocument(pages: string[]) {
    const mk = (page: string) => {
      const link = { getAttribute: () => href(page) };
      const card: any = { style: { display: '' }, badge: null as any, children: [] as any[],
        querySelector(sel: string) { return sel.startsWith('a[') ? link : sel === '.dp-howbuilt-badge' ? this.badge : null; },
        appendChild(el: any) { this.badge = el; el.remove = () => { this.badge = null; }; } };
      return card;
    };
    const cards = pages.map(mk);
    const doc: any = { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => cards, createElement: () => ({ style: {} }) };
    return { doc, cards };
  }

  test('framed and told nothing: every block is hidden; development: all shown with a mark; production: only the published', () => {
    const { doc, cards } = fakeDocument(['dd-a', 'dd-b']);
    applyHowBuilt(doc, { showAll: false, published: [] });
    assert.deepEqual(cards.map((c) => c.style.display), ['none', 'none']);
    applyHowBuilt(doc, { showAll: true, published: ['dd-a'] });
    assert.deepEqual(cards.map((c) => c.style.display), ['', '']);
    assert.deepEqual(cards.map((c) => c.badge.textContent), ['(PUBLISHED)', '(NOT PUBLISHED)']);
    applyHowBuilt(doc, { showAll: true, published: ['dd-a'] });
    assert.deepEqual(cards.map((c) => c.badge.textContent), ['(PUBLISHED)', '(NOT PUBLISHED)']);
    applyHowBuilt(doc, { showAll: false, published: ['dd-a'] });
    assert.deepEqual(cards.map((c) => c.style.display), ['', 'none']);
    assert.deepEqual(cards.map((c) => c.badge), [null, null]);
  });

  test('a framed page hides the blocks at once, and a policy from the parent shows them', () => {
    const { doc, cards } = fakeDocument(['dd-a']);
    let onMessage: any;
    const parent = { postMessage: () => {} };
    const win: any = { parent, document: doc, addEventListener: (_t: string, l: any) => { onMessage = l; }, removeEventListener: () => {} };
    const stop = watchFramedPage(win, { getBoundingClientRect: () => ({ height: 100 }) }, 'publishedDashboard')!;
    assert.equal(cards[0].style.display, 'none');
    onMessage({ source: parent, origin: 'https://x.example', data: { type: DEMO_HOWBUILT_TYPE, showAll: false, published: ['dd-a'] } });
    assert.equal(cards[0].style.display, '');
    onMessage({ source: {}, data: { type: DEMO_HOWBUILT_TYPE, showAll: true, published: [] } });
    assert.equal(cards[0].badge, null);
    stop();
  });
});

describe('what the reader did, said to the page around the frame', () => {
  test('framed: the action, the name and a step number, to any origin', () => {
    const { win, heard } = framedWindow();
    assert.equal(announceDemoEvent(win, 'tour-step', 'g-cube-country-sales', 3), true);
    assert.deepEqual(heard, [{ message: { type: DEMO_EVENT_TYPE, action: 'tour-step', name: 'g-cube-country-sales', value: 3 }, origin: '*' }]);
  });
  test('no value unless it is a number; the name is trimmed and kept short', () => {
    const { win, heard } = framedWindow();
    announceDemoEvent(win, 'story', '  ' + 'x'.repeat(400) + '  ', NaN);
    assert.equal(heard[0].message.value, undefined);
    assert.equal(heard[0].message.name, 'x'.repeat(150));
  });
  test('not framed: nothing is said', () => {
    const win: any = {};
    win.parent = win;
    win.parent.postMessage = () => assert.fail('nothing should be posted');
    assert.equal(announceDemoEvent(win, 'filter', 'dd-a'), false);
  });
});

describe('the colours the page around a frame gives the dashboard', () => {
  test('known names with hue saturation lightness triplets become theme variables', () => {
    const t = parseTheme({ type: DEMO_THEME_TYPE, mode: 'light', colours: { surface: '42 30% 97%', accent: '18 50% 48%' } });
    assert.deepEqual(t, { mode: 'light', vars: { '--color-base-100': 'hsl(42 30% 97%)', '--color-primary': 'hsl(18 50% 48%)' } });
  });
  test('anything else is dropped: other names, other value shapes, a bad mode, another type', () => {
    assert.deepEqual(parseTheme({ type: DEMO_THEME_TYPE, mode: 'dark', colours: { surface: 'red', page: 'url(x)', evil: '1 2% 3%', text: '42 35% 92%; x:y' } }), { mode: 'dark', vars: {} });
    assert.equal(parseTheme({ type: DEMO_THEME_TYPE, mode: 'blue', colours: {} }), null);
    assert.equal(parseTheme({ type: 'other', mode: 'dark' }), null);
    assert.equal(parseTheme(null), null);
  });
  test('applyTheme sets the mode and the variables on the root, and is safe to repeat', () => {
    const set: Record<string, string> = {};
    const doc: any = { documentElement: { setAttribute: (n: string, v: string) => { set[n] = v; }, style: { setProperty: (n: string, v: string) => { set[n] = v; } } } };
    const theme = { mode: 'dark' as const, vars: { '--color-primary': 'hsl(18 55% 60%)' } };
    applyTheme(doc, theme);
    applyTheme(doc, theme);
    assert.deepEqual(set, { 'data-theme': 'dark', '--color-primary': 'hsl(18 55% 60%)' });
    applyTheme({} as any, theme);
  });
});
