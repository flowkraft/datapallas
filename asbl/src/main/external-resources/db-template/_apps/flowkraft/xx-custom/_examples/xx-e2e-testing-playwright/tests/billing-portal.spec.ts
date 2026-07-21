/**
 * Billing-Portal E2E — an EXAMPLE of how to run REAL tests against a REAL running app, with nothing
 * but Docker on your machine: no Node, no Playwright install.
 *
 * Real logins, real authorization, real CRUD, real payments, real DOM ids — everything here drives
 * the running portal over HTTP. Copy this file, point it at your own app, and write your own.
 *
 * WHICH portal is tested is decided ONLY by BASE_URL — the test code below is shared, byte for
 * byte, by both stacks. The run pattern lives in docker-compose.yml's header:
 *
 *   Grails:   BASE_URL=http://host.docker.internal:8500 docker compose run --rm e2e \
 *               npx playwright test tests/billing-portal.spec.ts --project=chromium
 *   Next.js:  BASE_URL=http://host.docker.internal:8501 docker compose run --rm e2e \
 *               npx playwright test tests/billing-portal.spec.ts --project=chromium
 *
 * PRECONDITION: the portal is already running at BASE_URL with its seeded demo data.
 *
 * HARD RULE: every element is selected with `document.getElementById` (never a class, text or xpath
 * selector) — enforced by the `exists / text / setValue / clickById` helpers below, which all go
 * through `page.evaluate(document.getElementById(...))`.
 */

import { test, expect, Page } from '@playwright/test';
import { TAKE_SCREENSHOT, screenshotDir, captureScreenshotWithHighlight } from './helpers/screenshots';

// The ONE thing that decides which portal is driven (see docker-compose.yml's header).
const BASE_URL = process.env.BASE_URL || 'http://host.docker.internal:8500';

// ── Deterministic seed data (BootStrap / self-seed — see _custom/README.md) ────────────────────
const LOGIN = {
  admin: { user: 'admin', pass: 'admin123' },
  alice: { user: 'alice@demo.io', pass: 'demo1234' },
  bob: { user: 'bob@demo.io', pass: 'demo1234' },
  carol: { user: 'carol@demo.io', pass: 'demo1234' },
};
const INV = {
  alicePaid: 'INV-DEMO-0001',
  aliceOverdue: 'INV-DEMO-0002',
  bobDue: 'INV-DEMO-0003',
  carolPaid: 'INV-DEMO-0004',
  carolPayable: 'INV-DEMO-0005',
  bkendOverdue: 'INV-DEMO-0006', // seeded DUE but past due date — the bkend cron flips it OVERDUE
};
// The seeded customer names — what the delete confirmation names back to the admin (the row id is
// keyed on the email, the modal asks about the name).
const CUSTOMER_NAME = { alice: 'Alice Anderson', bob: 'Bob Brown', carol: 'Carol Clarke' };
const PAY_TOKEN = 'demo-pay-token-0005';

// ── getElementById-only helpers ────────────────────────────────────────────────────────────────
const exists = (page: Page, id: string) =>
  page.evaluate((i) => !!document.getElementById(i), id);
const textOf = (page: Page, id: string) =>
  page.evaluate((i) => (document.getElementById(i)?.textContent || '').trim(), id);
// Sets a value on an <input>/<textarea>/<select> in a way that works for BOTH stacks: the Grails
// pages use plain DOM listeners, the Next pages use React controlled inputs — React overrides the
// value setter, so we call the native prototype setter before dispatching input+change.
const setValue = (page: Page, id: string, val: string) =>
  page.evaluate(({ i, v }) => {
    const el = document.getElementById(i) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { i: id, v: val });
/**
 * Click an element that triggers a NAVIGATION, and wait for that navigation to actually commit.
 *
 * Never use `Promise.all([page.waitForLoadState('networkidle'), click])` for this: waitForLoadState
 * only waits for an ALREADY-COMMITTED navigation, so on an idle page it resolves instantly and the
 * next page.goto() cancels the in-flight POST. That is what made every login silently fail.
 */
async function clickAndNavigate(page: Page, id: string, timeout = 15_000) {
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout }),
    clickById(page, id),
  ]);
}

const clickById = (page: Page, id: string) =>
  page.evaluate((i) => (document.getElementById(i) as HTMLElement).click(), id);

async function waitForId(page: Page, id: string, timeout = 15000) {
  await page.waitForFunction((i) => !!document.getElementById(i), id, { timeout });
}

// ── the invoice document lives in its OWN iframe ────────────────────────────────────────────────
/**
 * The invoice renders inside #invoiceFrame — an iframe carrying a complete standalone document, so
 * the app's Tailwind 4 / daisyUI 5 stylesheet cannot reach it and its own CSS cannot leak out. Its
 * ids therefore live in the FRAME's document, and `document.getElementById('invoiceNumber')` on the
 * page returns null BY DESIGN — that is the isolation working, not a bug.
 *
 * srcdoc is same-origin, so contentDocument is reachable and this file's getElementById-only rule
 * still holds; these helpers just root it at the frame's document instead of the page's.
 */
const inDoc = (page: Page, id: string) =>
  page.evaluate((i) => {
    const f = document.getElementById('invoiceFrame') as HTMLIFrameElement | null;
    return !!f?.contentDocument?.getElementById(i);
  }, id);
const textInDoc = (page: Page, id: string) =>
  page.evaluate((i) => {
    const f = document.getElementById('invoiceFrame') as HTMLIFrameElement | null;
    return (f?.contentDocument?.getElementById(i)?.textContent || '').trim();
  }, id);
async function waitForInDoc(page: Page, id: string, timeout = 15000) {
  await page.waitForFunction((i) => {
    const f = document.getElementById('invoiceFrame') as HTMLIFrameElement | null;
    return !!f?.contentDocument?.getElementById(i);
  }, id, { timeout });
}

/**
 * The invoice is shown, is genuinely self-contained, and can be printed. Asserted at EVERY surface
 * that renders it — the owner's page, the admin's page and the public checkout — because
 * "self-contained" is only a property if it holds in all three.
 *
 * This is the regression net for a real bug class: the status pill used to be daisyUI's .badge, so
 * the moment the document was isolated it rendered as bare text. Anything the document needs must be
 * in ITS stylesheet, and the only way to know is to read the computed style from inside the frame.
 */
async function expectSelfContainedInvoice(page: Page, invoiceNumber: string) {
  await waitForId(page, 'invoiceFrame');
  await waitForInDoc(page, 'invoiceDocument');
  expect(await textInDoc(page, 'invoiceNumber')).toBe(invoiceNumber);

  // Print is offered wherever the invoice is — including to a visitor who never signed in, who wants
  // a copy for their records just as much as the account holder. It sits OUTSIDE the frame, so it can
  // never print itself.
  expect(await exists(page, 'btn-print-invoice'), 'no Print button on this invoice').toBeTruthy();
  expect(await inDoc(page, 'btn-print-invoice'), 'Print button is inside the frame — it would print itself').toBeFalsy();

  const f = await page.evaluate(() => {
    const frame = document.getElementById('invoiceFrame') as HTMLIFrameElement;
    const d = frame.contentDocument!;
    const pill = d.getElementById('invoiceStatus')!;
    return {
      ownStyleTags: d.getElementsByTagName('style').length,
      externalSheets: Array.from(d.styleSheets).filter((s) => !!s.href).length,
      pillClass: pill.className,
      pillBg: d.defaultView!.getComputedStyle(pill).backgroundColor,
      height: Math.round(frame.getBoundingClientRect().height),
      leakedIntoPage: !!document.getElementById('invoiceDocument'),
    };
  });
  // The document brought its own stylesheet, and NOTHING of the app's crossed the boundary.
  expect(f.ownStyleTags, 'the invoice frame carries no stylesheet of its own').toBeGreaterThan(0);
  expect(f.externalSheets, "the app's stylesheet reached inside the invoice frame").toBe(0);
  expect(f.leakedIntoPage, 'the invoice is in the PAGE dom — app CSS is styling it').toBeFalsy();
  // The pill is painted by the document's own CSS, not by daisyUI.
  expect(f.pillClass).toContain('bp-status');
  expect(f.pillClass, 'status pill still leans on daisyUI .badge').not.toContain('badge');
  expect(f.pillBg, 'status pill is unstyled — its CSS never reached the frame').not.toBe('rgba(0, 0, 0, 0)');
  // Sized to its content rather than left at the iframe default — 150px would clip the invoice to a
  // porthole, which is exactly what a missed load event did.
  expect(f.height, 'the invoice frame was not sized to its content').toBeGreaterThan(300);
}

/**
 * How many invoice rows the CURRENT account can see. Rooted at getElementById per this file's hard
 * rule (`page.locator('#invoice-list tbody tr')` would be a CSS selector), and counts `<tr>` children
 * of the list's tbody — every row the portal renders, on both stacks.
 */
const invoiceRowCount = (page: Page) =>
  page.evaluate(() => {
    const list = document.getElementById('invoice-list');
    if (!list) return 0;
    const tbody = list.getElementsByTagName('tbody')[0];
    return tbody ? tbody.getElementsByTagName('tr').length : 0;
  });

/** The admin dashboard's two counters, as numbers. */
async function adminCounts(page: Page, baseUrl: string): Promise<{ invoices: number; customers: number }> {
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await waitForId(page, 'admin-invoice-count');
  return {
    invoices: Number(await textOf(page, 'admin-invoice-count')),
    customers: Number(await textOf(page, 'admin-customer-count')),
  };
}

/**
 * Sign in. Waits for the submit to actually NAVIGATE, whether it succeeds or is rejected.
 *
 * `expectSuccess: false` is for the deliberate bad-password case — a rejected login redirects
 * BACK to /login (LoginController.authenticate → flash.error → redirect(action:'index')), so it
 * still navigates; it just lands on /login again with #login-error.
 *
 * Do NOT use Promise.all([page.waitForLoadState('networkidle'), click]): waitForLoadState only
 * waits for an ALREADY-COMMITTED navigation, so on this idle page it resolves instantly, returns
 * while the POST is still in flight, and the caller's next page.goto() CANCELS it — the session is
 * never established and every later page silently bounces to /login.
 */
async function login(
  page: Page,
  baseUrl: string,
  who: { user: string; pass: string },
  expectSuccess = true,
) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await waitForId(page, 'btn-login');
  await setValue(page, 'login-username', who.user);
  await setValue(page, 'login-password', who.pass);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15_000 }),
    clickById(page, 'btn-login'),
  ]);

  // Fail HERE, loudly, when a login that was MEANT to work is rejected — never let it be
  // diagnosed three steps later as a missing element on some other page.
  if (expectSuccess && (await exists(page, 'login-error'))) {
    throw new Error(`Login failed for '${who.user}': ${await textOf(page, 'login-error')}`);
  }
}

async function logout(page: Page) {
  await Promise.all([
    page.waitForURL((u) => u.pathname.endsWith('/login'), { timeout: 15_000 }),
    clickById(page, 'btn-logout'),
  ]);
}

// Poll the portal invoice list until an invoice reaches an expected status (used to observe the
// billing-portal-bkend cron flip a past-due invoice to OVERDUE).
async function waitForStatus(page: Page, baseUrl: string, invoiceNumber: string, expected: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await page.goto(`${baseUrl}/portal/invoices`, { waitUntil: 'networkidle' });
    if (await exists(page, `invoice-status-${invoiceNumber}`)) {
      if ((await textOf(page, `invoice-status-${invoiceNumber}`)) === expected) return true;
    }
    await page.waitForTimeout(4000);
  }
  return false;
}

// ── THE shared scenario body — identical for Grails + Next ──────────────────────────────────────
async function runBillingPortalScenarios(page: Page, baseUrl: string) {
  // 1) Bad password is rejected. expectSuccess=false: this login is SUPPOSED to fail, so it
  //    lands back on /login with #login-error — which is exactly what the next lines assert.
  await login(page, baseUrl, { user: LOGIN.alice.user, pass: 'wrong-password' }, false);
  await waitForId(page, 'login-error');
  expect(await exists(page, 'login-error')).toBeTruthy();

  // 2) Alice sees ONLY her invoices with the right statuses.
  await login(page, baseUrl, LOGIN.alice);
  await page.goto(`${baseUrl}/portal/invoices`, { waitUntil: 'networkidle' });
  await waitForId(page, `invoice-status-${INV.alicePaid}`);
  expect(await textOf(page, `invoice-status-${INV.alicePaid}`)).toBe('PAID');
  expect(await textOf(page, `invoice-status-${INV.aliceOverdue}`)).toBe('OVERDUE');
  expect(await exists(page, `invoice-row-${INV.bobDue}`)).toBeFalsy();      // not Alice's
  expect(await exists(page, `invoice-row-${INV.carolPaid}`)).toBeFalsy();
  await logout(page);

  // 3) Bob sees his single DUE invoice, and none of Alice's.
  await login(page, baseUrl, LOGIN.bob);
  await page.goto(`${baseUrl}/portal/invoices`, { waitUntil: 'networkidle' });
  await waitForId(page, `invoice-status-${INV.bobDue}`);
  expect(await textOf(page, `invoice-status-${INV.bobDue}`)).toBe('DUE');
  expect(await exists(page, `invoice-row-${INV.alicePaid}`)).toBeFalsy();
  await logout(page);

  // 4) Admin sees everything: dashboard counts + all invoices + all customers.
  await login(page, baseUrl, LOGIN.admin);
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await waitForId(page, 'admin-invoice-count');
  expect(Number(await textOf(page, 'admin-invoice-count'))).toBeGreaterThanOrEqual(5);
  expect(await textOf(page, 'admin-customer-count')).toBe('3');
  await page.goto(`${baseUrl}/admin/invoices`, { waitUntil: 'networkidle' });
  await waitForId(page, `invoice-row-${INV.alicePaid}`);
  expect(await exists(page, `invoice-row-${INV.bobDue}`)).toBeTruthy();     // admin sees others' too
  await page.goto(`${baseUrl}/admin/customers`, { waitUntil: 'networkidle' });
  await waitForId(page, `customer-row-${LOGIN.alice.user}`);
  expect(await exists(page, `customer-row-${LOGIN.bob.user}`)).toBeTruthy();
  await logout(page);

  // 5) Pay an invoice WITHOUT authentication, via its pay-token link.
  await page.goto(`${baseUrl}/portal/pay?token=${PAY_TOKEN}`, { waitUntil: 'networkidle' });
  await waitForId(page, 'pay-amount');
  expect(await exists(page, 'pay-amount')).toBeTruthy();
  // The checkout shows the REAL invoice — the same self-contained document the portal and admin
  // detail pages render — not just a number to hand money over for. Asserted in full HERE because
  // this is the surface with no session at all: whatever the invoice needs to look right and to
  // print has to travel with it.
  await expectSelfContainedInvoice(page, INV.carolPayable);
  await clickAndNavigate(page, 'btn-pay');
  await waitForId(page, 'pay-success');
  expect(await exists(page, 'pay-success')).toBeTruthy();
  // …and it survives the settle, as the receipt — still whole, still printable. The document is
  // rendered ABOVE the justPaid/payable branch precisely so it does not vanish here.
  await expectSelfContainedInvoice(page, INV.carolPayable);

  // …and the owner now sees it PAID. This re-read (fresh session, fresh query) is the assertion
  // that matters: the pay page rendered "Payment complete" even while the settle silently
  // persisted nothing, so believing #pay-success alone would have hidden the bug entirely.
  await login(page, baseUrl, LOGIN.carol);

  // The public checkout stays chrome-free even for a visitor who happens to be SIGNED IN — the pay
  // link is emailed, and whoever opens it need not own the session (an accountant may be paying on
  // a colleague's behalf). Carol being logged in here is the entire point: checked while logged
  // out, the nav is empty for the ordinary session reason and the guard could be missing outright
  // without this test noticing — which is exactly how the stray "Logout" shipped.
  // Ordered BEFORE the re-read below so logout() further down still lands on a page that has a nav.
  await page.goto(`${baseUrl}/portal/pay?token=${PAY_TOKEN}`, { waitUntil: 'networkidle' });
  expect(await exists(page, 'btn-logout'), 'public pay page offered Logout').toBeFalsy();
  expect(await exists(page, 'current-user'), 'public pay page leaked the session user').toBeFalsy();

  await page.goto(`${baseUrl}/portal/invoices`, { waitUntil: 'networkidle' });
  await waitForId(page, `invoice-status-${INV.carolPayable}`);
  expect(await textOf(page, `invoice-status-${INV.carolPayable}`)).toBe('PAID');
  await logout(page);

  // 6) Pay while AUTHENTICATED — the other half of the pay feature (PortalInvoiceController.pay /
  //    the Next pay route), reached from the customer's own invoice page rather than a token link.
  //    Bob's INV-DEMO-0003 is DUE and his own, so he may settle it from inside his account.
  await login(page, baseUrl, LOGIN.bob);
  await page.goto(`${baseUrl}/portal/invoices`, { waitUntil: 'networkidle' });
  await waitForId(page, `invoice-status-${INV.bobDue}`);
  expect(await textOf(page, `invoice-status-${INV.bobDue}`)).toBe('DUE');   // precondition
  await clickAndNavigate(page, `btn-pay-${INV.bobDue}`);                     // → his own pay page
  await waitForId(page, 'pay-amount');
  await clickAndNavigate(page, 'btn-pay');                                   // POST → settle
  // NO #pay-success here: that panel belongs to the TOKEN flow (pay.gsp renders it on
  // justPaid || !payable). The authenticated action redirects to the invoice instead
  // (PortalInvoiceController.pay → redirect(action:'show')). So assert where it counts — a fresh
  // read of his list, which is the only thing that proves the settle actually persisted.
  await page.goto(`${baseUrl}/portal/invoices`, { waitUntil: 'networkidle' });
  await waitForId(page, `invoice-status-${INV.bobDue}`);
  expect(await textOf(page, `invoice-status-${INV.bobDue}`)).toBe('PAID');
  await logout(page);
}

// ── Security — a customer reaches ONLY their own data, and nobody talks their way into /admin ────
/**
 * The authorization contract, asserted rather than assumed. Every check below is here because the
 * thing it tests was ACTUALLY broken on one of the stacks:
 *
 *   - the Next session cookie was plain base64 JSON, verified with nothing: pasting
 *     {"role":"ADMIN"} in made you an administrator, with no account. Grails was never exposed
 *     (its session is server-side, the cookie an opaque JSESSIONID), which is precisely why this
 *     runs on BOTH — a check only one stack can fail is still the check that catches the regression.
 *   - Next's POST /api/pay took an invoice id and settled it with NO check at all, and /api is not
 *     in the middleware matcher, so `curl -d id=3` marked any invoice paid.
 *   - Grails' AuthInterceptor ended in `return true`, so any controller the strip list forgot was
 *     public — SettingsController was an anonymous read/write of the settings table.
 *
 * Written as ONE body for both stacks, like every other scenario here. Where the two genuinely
 * differ (the settle endpoint), it fires BOTH shapes and asserts the OUTCOME — the invoice's status
 * — rather than a status code, so it cannot pass merely because a URL 404'd.
 *
 * Run LAST: it clears cookies and plants forged ones, so it must not disturb a scenario that assumes
 * a live session. By this point INV-DEMO-0005 is already PAID (the pay flow settled it), which is
 * why the token check below asserts the DOCUMENT renders rather than that it is still payable.
 */
async function runSecurityScenarios(page: Page, baseUrl: string) {
  const ctx = page.context();
  const onLoginPage = () => exists(page, 'btn-login');

  // 1) Signed OUT, every private surface bounces to /login — including deep links nobody links to.
  await ctx.clearCookies();
  for (const path of ['/', '/admin', '/admin/invoices', '/admin/customers', '/portal', '/portal/invoices']) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
    expect(await onLoginPage(), `an anonymous visitor reached ${path}`).toBeTruthy();
  }

  // 2) A HAND-MADE session cookie does not make you an administrator.
  //    Both stacks' cookie names are planted at once so this is one shared body: Grails ignores
  //    bp_session entirely and treats the JSESSIONID garbage as no session; Next checks the
  //    signature and finds none. Both must refuse. If Next ever ships an unsigned cookie again,
  //    THIS is what fails.
  const forged = Buffer.from(JSON.stringify({ userId: 1, username: 'admin', role: 'ADMIN', customerId: null }))
    .toString('base64');
  await ctx.clearCookies();
  await ctx.addCookies([
    { name: 'bp_session', value: forged, url: baseUrl },
    { name: 'JSESSIONID', value: forged, url: baseUrl },
  ]);
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  expect(await onLoginPage(), 'a forged session cookie was accepted as an ADMIN login').toBeTruthy();
  expect(await exists(page, 'admin-invoice-count'), 'the admin dashboard rendered for a forged cookie').toBeFalsy();
  await ctx.clearCookies();

  // 3) Bob's invoice id, learned the only legitimate way — from Bob. Guessing "3" would make this
  //    test pass for the wrong reason the day the ids shift.
  await login(page, baseUrl, LOGIN.bob);
  await page.goto(`${baseUrl}/portal/invoices`, { waitUntil: 'networkidle' });
  await waitForId(page, `btn-view-${INV.bobDue}`);
  const bobHref = await page.evaluate(
    (i) => (document.getElementById(i) as HTMLAnchorElement).getAttribute('href') || '',
    `btn-view-${INV.bobDue}`,
  );
  const bobId = bobHref.match(/(\d+)\/?$/)?.[1];
  expect(bobId, `could not read Bob's invoice id out of "${bobHref}"`).toBeTruthy();
  // He can open his own — the control. Without it, step 4 passing proves nothing: a URL that is
  // broken for EVERYONE would look identical to one that is properly refused.
  await page.goto(`${baseUrl}/portal/invoices/${bobId}`, { waitUntil: 'networkidle' });
  await expectSelfContainedInvoice(page, INV.bobDue);
  await logout(page);

  // 4) Alice CANNOT deep-link Bob's invoice — not the document, not its pay page. The list merely
  //    not showing it is no defence; the URL is a guessable integer.
  await login(page, baseUrl, LOGIN.alice);
  for (const path of [`/portal/invoices/${bobId}`, `/portal/invoices/${bobId}/pay`]) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
    expect(await exists(page, 'invoiceFrame'), `alice was served Bob's invoice at ${path}`).toBeFalsy();
    expect(await inDoc(page, 'invoiceNumber'), `Bob's invoice document leaked at ${path}`).toBeFalsy();
  }

  // 5) …nor reach ANY of /admin, however she spells it. The invariant is that she never sees the
  //    ADMIN AREA — NOT that she lands on the login form. An already-signed-in customer is bounced off
  //    /admin differently per stack: Next serves the login page, but Grails' LoginController forwards a
  //    logged-in user straight on to /portal (session.userId → redirect '/portal'), so she is on her
  //    OWN portal, not the login form. #adminSidebar lives on the admin LAYOUT, so it is present on
  //    every /admin/* page and absent wherever she is sent — the one assertion true for both stacks.
  for (const path of ['/admin', '/admin/invoices', '/admin/customers', '/admin/customers/new',
                      `/admin/invoices/${bobId}`, '/admin/customers/1']) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
    expect(await exists(page, 'adminSidebar'), `a CUSTOMER reached the admin area at ${path}`).toBeFalsy();
    expect(await exists(page, 'admin-invoice-count'), `admin dashboard rendered for a CUSTOMER at ${path}`).toBeFalsy();
  }
  // Sign alice out for the next step's login. clearCookies, NOT the logout button: she is on /login
  // (Next) or /portal (Grails) here, and #btn-logout is only on the latter — clicking a missing one
  // throws "Cannot read properties of null (reading 'click')". Clearing the cookie logs her out on
  // either stack, and the next login() then finds the form on a clean /login.
  await ctx.clearCookies();

  // 6) An ANONYMOUS settle of someone else's invoice changes nothing. Target INV-DEMO-0006 — bob's,
  //    and the ONLY invoice still unpaid by now: INV-DEMO-0003 (INV.bobDue) was settled back in the
  //    pay scenario, so it is PAID here and asserting it DUE would be wrong. Learn the target's id and
  //    record its status while signed in as bob, sign out, fire BOTH stacks' settle shapes with NO
  //    session (Grails posts to the invoice's own pay action, Next to /api/pay with the id; the shape
  //    a given stack lacks simply 404s), then re-read: the status must be UNCHANGED. Asserting the
  //    recorded status rather than a literal 'DUE' also survives the day the seed data shifts. Next's
  //    /api/pay used to settle any invoice for anyone — this is that regression's net.
  await login(page, baseUrl, LOGIN.bob);
  await page.goto(`${baseUrl}/portal/invoices`, { waitUntil: 'networkidle' });
  await waitForId(page, `invoice-status-${INV.bkendOverdue}`);
  const targetStatus = await textOf(page, `invoice-status-${INV.bkendOverdue}`);
  expect(targetStatus, 'precondition: the anon-settle target must be UNPAID to be a meaningful test').not.toBe('PAID');
  const dueHref = await page.evaluate(
    (i) => (document.getElementById(i) as HTMLAnchorElement).getAttribute('href') || '',
    `btn-view-${INV.bkendOverdue}`,
  );
  const dueId = dueHref.match(/(\d+)\/?$/)?.[1];
  expect(dueId, `could not read the target invoice's id out of "${dueHref}"`).toBeTruthy();
  await ctx.clearCookies();
  const anon = await page.context().browser()!.newContext();
  try {
    await anon.request.post(`${baseUrl}/api/pay`, { form: { id: String(dueId) }, failOnStatusCode: false });
    await anon.request.post(`${baseUrl}/portal/invoices/${dueId}/pay`, { form: {}, failOnStatusCode: false });
  } finally {
    await anon.close();
  }
  await login(page, baseUrl, LOGIN.bob);
  await page.goto(`${baseUrl}/portal/invoices`, { waitUntil: 'networkidle' });
  await waitForId(page, `invoice-status-${INV.bkendOverdue}`);
  expect(await textOf(page, `invoice-status-${INV.bkendOverdue}`),
    'an anonymous POST settled an invoice it does not own').toBe(targetStatus);
  await logout(page);

  // 7) The CONTROL for all of the above: locking the doors must not have bricked the front one.
  //    Paying without signing in is a FEATURE — the emailed pay link is a capability, exactly like a
  //    PayPal checkout URL — so a visitor holding the token still gets the whole invoice, and can
  //    still print it. If tightening authorization ever breaks this, that is a regression too.
  await ctx.clearCookies();
  await page.goto(`${baseUrl}/portal/pay?token=${PAY_TOKEN}`, { waitUntil: 'networkidle' });
  await expectSelfContainedInvoice(page, INV.carolPayable);
  expect(await exists(page, 'btn-print-invoice'), 'no Print for an unauthenticated payer').toBeTruthy();

  // 8) The admin reaches BOTH the admin area and the customer-facing front end.
  await login(page, baseUrl, LOGIN.admin);
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await waitForId(page, 'admin-invoice-count');
  expect(await exists(page, 'admin-invoice-count')).toBeTruthy();
  // "/" is the portal, on both stacks — Grails maps it to portalHome, Next redirects it to /portal.
  // It 404'd on Next until app/page.tsx was added (app-seed strips the (main) group that served it),
  // which mattered: the Burst's "sign in to your account" email points at exactly this URL.
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  expect(await onLoginPage(), 'the admin was bounced off the front end').toBeFalsy();
  expect(await exists(page, 'btn-logout'), 'the front end did not render for the admin').toBeTruthy();
  await logout(page);
}

// Numbers NOT in the demo/burst data — so the created rows are unambiguously ours. Two, because the
// delete is driven from BOTH the list and the invoice's own page, and each one consumes its invoice.
const CRUD_INV = 'INV-CRUD-9001';
const CRUD_INV_DETAIL = 'INV-CRUD-9002';
// Fixed dates (yyyy-MM-dd, what <input type="date"> holds). Both are mandatory in the domain, and
// the due date is in the FUTURE so the row stays DUE — a past one would let the bkend cron flip it
// to OVERDUE and turn this into a date-dependent flake.
const CRUD_INVOICE_DATE = '2026-07-15';
const CRUD_DUE_DATE = '2099-12-31';

// A customer NOT in the demo/burst data, made and retired entirely by the customer CRUD scenario —
// so it can create, edit and delete without disturbing the seeded rows the other scenarios count.
const CRUD_CUSTOMER = {
  name: 'Crud Customer',
  updatedName: 'Crud Customer Renamed',
  contactName: 'Crud Contact',
  email: 'crud-customer-9001@demo.io',
  address: '1 Crud Street',
  city: 'Cluj',
  country: 'RO',
};
// What a created customer's login gets — the same password the REST ingest hands a pushed one.
const NEW_CUSTOMER_PASSWORD = 'changeme';

/**
 * CREATE — new invoice for Alice, picking her through the modal picker, saved as DUE. Both stacks
 * redirect to the new invoice's own page, so this lands there and hands back that url.
 *
 * That url is the only way BACK to the detail page open to this file: the list's View link carries
 * no id, and a class/text selector is forbidden here.
 */
async function createInvoiceForAlice(page: Page, baseUrl: string, invoiceNumber: string): Promise<string> {
  await page.goto(`${baseUrl}/admin/invoices/new`, { waitUntil: 'networkidle' });
  await waitForId(page, 'invoice-number');
  await setValue(page, 'invoice-number', invoiceNumber);
  await setValue(page, 'invoice-status-select', 'DUE');
  // The dates are REQUIRED by the domain (invoiceDate/dueDate are nullable:false). Leave them empty
  // and InvoiceController.save() fails validation and re-renders 'create' — which still NAVIGATES,
  // so the save click looks fine and the failure only surfaces later as "the row never appeared".
  // yyyy-MM-dd is what <input type="date"> holds and what the controller parses.
  await setValue(page, 'invoice-date', CRUD_INVOICE_DATE);
  await setValue(page, 'due-date', CRUD_DUE_DATE);

  // Open the searchable customer picker, filter to Alice, pick her (debounced fetch → row button).
  await clickById(page, 'btn-choose-customer');
  await waitForId(page, 'customer-picker-search');
  await setValue(page, 'customer-picker-search', 'alice');
  await waitForId(page, `customer-picker-select-${LOGIN.alice.user}`);
  await clickById(page, `customer-picker-select-${LOGIN.alice.user}`);
  // The hidden customerId is now populated (modal closed).
  await page.waitForFunction(
    () => !!(document.getElementById('invoice-customer-id') as HTMLInputElement)?.value,
    undefined, { timeout: 10000 },
  );

  await clickAndNavigate(page, 'btn-save-invoice');
  return page.url();
}

// ── Admin invoice CRUD — Create (via the customer-picker modal) → Update → Delete ────────────────
// Same DOM ids on both stacks (Grails _form.gsp / index.gsp ↔ Next InvoiceForm/CustomerPicker/list),
// so this body is 100% shared. getElementById-only, per the file's hard rule.
async function runInvoiceCrudScenarios(page: Page, baseUrl: string) {
  await login(page, baseUrl, LOGIN.admin);

  await createInvoiceForAlice(page, baseUrl, CRUD_INV);

  // It appears in the admin list, DUE, and belongs to Alice.
  await page.goto(`${baseUrl}/admin/invoices?q=${CRUD_INV}`, { waitUntil: 'networkidle' });
  await waitForId(page, `invoice-row-${CRUD_INV}`);
  expect(await textOf(page, `invoice-status-${CRUD_INV}`)).toBe('DUE');

  // UPDATE — edit the invoice, flip its status to PAID.
  await clickAndNavigate(page, `btn-edit-${CRUD_INV}`);
  await waitForId(page, 'invoice-status-select');
  await setValue(page, 'invoice-status-select', 'PAID');
  await clickAndNavigate(page, 'btn-save-invoice');
  await page.goto(`${baseUrl}/admin/invoices?q=${CRUD_INV}`, { waitUntil: 'networkidle' });
  await waitForId(page, `invoice-status-${CRUD_INV}`);
  expect(await textOf(page, `invoice-status-${CRUD_INV}`)).toBe('PAID');

  // DELETE — remove it; the row is gone from the list.
  // Delete is guarded by a confirm modal — deleting cascades to the line items and cannot be undone.
  // Assert BOTH answers, or the guard is decorative: a "No" that still deletes, or a modal that
  // isn't wired to the row, would both sail through a Yes-only test.
  await clickById(page, `btn-delete-${CRUD_INV}`);          // opens the modal, deletes NOTHING yet
  await waitForId(page, 'btn-confirm-delete-no');
  expect(await textOf(page, 'confirm-delete-what')).toBe(CRUD_INV);   // …retargeted at THIS row
  await clickById(page, 'btn-confirm-delete-no');           // No → keep it
  await page.goto(`${baseUrl}/admin/invoices?q=${CRUD_INV}`, { waitUntil: 'networkidle' });
  expect(await exists(page, `invoice-row-${CRUD_INV}`)).toBeTruthy();  // still there — No means No

  await clickById(page, `btn-delete-${CRUD_INV}`);
  await waitForId(page, 'btn-confirm-delete-yes');
  await clickAndNavigate(page, 'btn-confirm-delete-yes');   // Yes → actually deletes
  await page.goto(`${baseUrl}/admin/invoices?q=${CRUD_INV}`, { waitUntil: 'networkidle' });
  expect(await exists(page, `invoice-row-${CRUD_INV}`)).toBeFalsy();

  // DELETE FROM THE INVOICE'S OWN PAGE — the other half of the same guard. The list and the detail
  // page render the SAME modal but wire it themselves, so each is driven here: whichever one is left
  // undriven is free to drift into asking differently, or into not asking at all.
  const detailUrl = await createInvoiceForAlice(page, baseUrl, CRUD_INV_DETAIL);   // …lands on it
  await waitForId(page, `btn-delete-${CRUD_INV_DETAIL}`);
  await clickById(page, `btn-delete-${CRUD_INV_DETAIL}`);   // opens the modal, deletes NOTHING yet
  await waitForId(page, 'btn-confirm-delete-no');
  expect(await textOf(page, 'confirm-delete-what')).toBe(CRUD_INV_DETAIL);   // …asks about THIS one
  await clickById(page, 'btn-confirm-delete-no');           // No → keep it
  await page.goto(`${baseUrl}/admin/invoices?q=${CRUD_INV_DETAIL}`, { waitUntil: 'networkidle' });
  expect(await exists(page, `invoice-row-${CRUD_INV_DETAIL}`)).toBeTruthy();  // still there — No means No

  await page.goto(detailUrl, { waitUntil: 'networkidle' });
  await waitForId(page, `btn-delete-${CRUD_INV_DETAIL}`);
  await clickById(page, `btn-delete-${CRUD_INV_DETAIL}`);
  await waitForId(page, 'btn-confirm-delete-yes');
  await clickAndNavigate(page, 'btn-confirm-delete-yes');   // Yes → actually deletes
  await page.goto(`${baseUrl}/admin/invoices?q=${CRUD_INV_DETAIL}`, { waitUntil: 'networkidle' });
  expect(await exists(page, `invoice-row-${CRUD_INV_DETAIL}`)).toBeFalsy();

  await logout(page);
}

// ── Admin customer CRUD — Create → Update → Delete, plus the delete that is REFUSED ─────────────
// The same modal and the same ids as the invoice delete above (Grails _confirmDeleteCustomer.gsp ↔
// Next DeleteCustomer.tsx), and the same rule on both stacks: a customer who still has invoices is
// REFUSED outright; one with none is deleted, and their login goes with them.
//
// Runs LAST of the shared scenarios — it deletes seeded rows the earlier ones assert on.
async function runCustomerCrudScenarios(page: Page, baseUrl: string) {
  await login(page, baseUrl, LOGIN.admin);
  expect((await adminCounts(page, baseUrl)).customers).toBe(3);   // precondition: the 3 demo customers

  // 1) CREATE / UPDATE / DELETE, on a customer of this scenario's OWN making. It is created and
  //    retired within this block, so the seeded counts the steps below assert are left exactly as
  //    they were found.
  await page.goto(`${baseUrl}/admin/customers`, { waitUntil: 'networkidle' });
  await waitForId(page, 'btn-new-customer');
  await clickAndNavigate(page, 'btn-new-customer');
  await waitForId(page, 'customer-name');
  await setValue(page, 'customer-name', CRUD_CUSTOMER.name);
  await setValue(page, 'customer-contact-name', CRUD_CUSTOMER.contactName);
  await setValue(page, 'customer-email', CRUD_CUSTOMER.email);
  await setValue(page, 'customer-address', CRUD_CUSTOMER.address);
  await setValue(page, 'customer-city', CRUD_CUSTOMER.city);
  await setValue(page, 'customer-country', CRUD_CUSTOMER.country);
  await clickAndNavigate(page, 'btn-save-customer');

  // Both stacks land on the new customer's own page, which offers the two actions only it has.
  await waitForId(page, `btn-edit-${CRUD_CUSTOMER.email}`);
  expect(await exists(page, `btn-reset-password-${CRUD_CUSTOMER.email}`)).toBeTruthy();
  // …and they are in the list.
  await page.goto(`${baseUrl}/admin/customers?q=${CRUD_CUSTOMER.email}`, { waitUntil: 'networkidle' });
  await waitForId(page, `customer-row-${CRUD_CUSTOMER.email}`);
  expect((await adminCounts(page, baseUrl)).customers).toBe(4);

  // Creating them created their PORTAL LOGIN too — username = email, password `changeme`, the same
  // pair the REST ingest gives a pushed customer. Nothing on the admin pages can see that row, so a
  // create that silently made no login would sail through every assertion above. login() throws on
  // #login-error, so reaching their own invoice list IS the assertion.
  await logout(page);
  await login(page, baseUrl, { user: CRUD_CUSTOMER.email, pass: NEW_CUSTOMER_PASSWORD });
  await page.goto(`${baseUrl}/portal/invoices`, { waitUntil: 'networkidle' });
  await waitForId(page, 'invoice-list');                    // their own portal, not a bounce to /login
  await logout(page);
  await login(page, baseUrl, LOGIN.admin);

  // UPDATE — the email is READ-ONLY here: it is the REST upsert key AND the login username, so a
  // rename would make the next Burst miss this customer and create a DUPLICATE under the old
  // address, stranding the login that still carries it.
  await page.goto(`${baseUrl}/admin/customers?q=${CRUD_CUSTOMER.email}`, { waitUntil: 'networkidle' });
  await waitForId(page, `btn-edit-${CRUD_CUSTOMER.email}`);
  await clickAndNavigate(page, `btn-edit-${CRUD_CUSTOMER.email}`);
  await waitForId(page, 'customer-email');
  expect(
    await page.evaluate(() => (document.getElementById('customer-email') as HTMLInputElement).readOnly),
    'the email is editable on the edit form — a rename would strand the login and duplicate the customer',
  ).toBeTruthy();
  await setValue(page, 'customer-name', CRUD_CUSTOMER.updatedName);
  await clickAndNavigate(page, 'btn-save-customer');
  // The new name shows in the list — read off the row itself, per this file's getElementById rule.
  await page.goto(`${baseUrl}/admin/customers?q=${CRUD_CUSTOMER.email}`, { waitUntil: 'networkidle' });
  await waitForId(page, `customer-row-${CRUD_CUSTOMER.email}`);
  expect(await textOf(page, `customer-row-${CRUD_CUSTOMER.email}`)).toContain(CRUD_CUSTOMER.updatedName);

  // DELETE — ours has no invoices, so the refusal asserted below does not apply and they go.
  await clickById(page, `btn-delete-${CRUD_CUSTOMER.email}`);
  await waitForId(page, 'btn-confirm-delete-yes');
  expect(await textOf(page, 'confirm-delete-what')).toBe(CRUD_CUSTOMER.updatedName);   // …asks about THEM
  await clickAndNavigate(page, 'btn-confirm-delete-yes');
  await page.goto(`${baseUrl}/admin/customers?q=${CRUD_CUSTOMER.email}`, { waitUntil: 'networkidle' });
  expect(await exists(page, `customer-row-${CRUD_CUSTOMER.email}`)).toBeFalsy();
  expect((await adminCounts(page, baseUrl)).customers).toBe(3);   // …and the seeded rows are untouched

  // 2) REFUSED — Alice still has her demo invoices, so she must survive her own delete. This is the
  //    assertion that carries this test: a delete that quietly went through would take a real
  //    billing record with it, and "it deleted her" would look like a pass.
  //    The list is opened FILTERED (?q=alice) so the refusal's redirect back to the bare
  //    /admin/customers is a url CHANGE on both stacks — the same shape the invoice deletes above
  //    rely on to know the POST landed.
  await page.goto(`${baseUrl}/admin/customers?q=alice`, { waitUntil: 'networkidle' });
  await waitForId(page, `customer-row-${LOGIN.alice.user}`);
  await clickById(page, `btn-delete-${LOGIN.alice.user}`);
  await waitForId(page, 'btn-confirm-delete-yes');
  expect(await textOf(page, 'confirm-delete-what')).toBe(CUSTOMER_NAME.alice);   // …asks about HER
  await clickAndNavigate(page, 'btn-confirm-delete-yes');   // Yes — and the app says no
  await waitForId(page, 'admin-customers');                 // back on a working list, not a 500
  await page.goto(`${baseUrl}/admin/customers?q=alice`, { waitUntil: 'networkidle' });
  expect(
    await exists(page, `customer-row-${LOGIN.alice.user}`),
    'a customer WITH invoices was deleted — the refusal is not enforced',
  ).toBeTruthy();
  expect((await adminCounts(page, baseUrl)).customers).toBe(3);

  // 3) ALLOWED — a SEEDED customer, made deletable the way the refusal above demands: empty Carol's
  //    account first, deleting her two demo invoices exactly as an admin would before retiring her.
  //    Step 1's customer was born with none; this one has to be emptied, which is the path an admin
  //    actually walks.
  for (const number of [INV.carolPaid, INV.carolPayable]) {
    await page.goto(`${baseUrl}/admin/invoices?q=${number}`, { waitUntil: 'networkidle' });
    await waitForId(page, `btn-delete-${number}`);
    await clickById(page, `btn-delete-${number}`);
    await waitForId(page, 'btn-confirm-delete-yes');
    await clickAndNavigate(page, 'btn-confirm-delete-yes');
  }

  await page.goto(`${baseUrl}/admin/customers?q=carol`, { waitUntil: 'networkidle' });
  await waitForId(page, `customer-row-${LOGIN.carol.user}`);
  await clickById(page, `btn-delete-${LOGIN.carol.user}`);
  await waitForId(page, 'btn-confirm-delete-yes');
  expect(await textOf(page, 'confirm-delete-what')).toBe(CUSTOMER_NAME.carol);
  await clickAndNavigate(page, 'btn-confirm-delete-yes');   // Yes → nothing left to hold her back
  await page.goto(`${baseUrl}/admin/customers?q=carol`, { waitUntil: 'networkidle' });
  expect(await exists(page, `customer-row-${LOGIN.carol.user}`)).toBeFalsy();
  expect((await adminCounts(page, baseUrl)).customers).toBe(2);
  await logout(page);

  // 4) …and her login went with her. The counts above cannot see that: bp_app_user is a row of its
  //    own, and one left behind would still sign in — against a customer who no longer exists.
  await login(page, baseUrl, LOGIN.carol, false);
  expect(await exists(page, 'login-error'), "a deleted customer's login still works").toBeTruthy();
}

// ── OPTIONAL screenshots — the demo for tests/helpers/screenshots.ts ───────────────────────────
/**
 * Two shots that show how to ring ONE specific element of the app and say why it matters.
 *
 * Runs FIRST, while the seeded data is still pristine: the customer-CRUD scenario below deletes
 * Carol and empties her invoices, so anything captured after it would show a half-dismantled portal.
 *
 * WHERE the PNGs land — screenshots/<spec-file>/<yyyy.MM.dd_HH.mm.ss.SSS>/ — is entirely the
 * helper's business. This function only names the files; it knows nothing about paths, and a
 * re-run can never overwrite a previous one.
 */
async function captureDemoScreenshots(page: Page, baseUrl: string) {
  // 1) The ADMIN dashboard — ring the invoice counter.
  await login(page, baseUrl, LOGIN.admin);
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await waitForId(page, 'admin-invoice-count');
  await captureScreenshotWithHighlight(page, '01-admin-invoice-count.png', {
    target: page.locator('#admin-invoice-count'),
    calloutText: 'Invoices in the portal\nEvery invoice pushed in over REST lands here. A re-push updates in place — it never double-counts.',
  });
  await logout(page);

  // 2) The CUSTOMER's own list — ring Alice's OVERDUE status pill.
  await login(page, baseUrl, LOGIN.alice);
  await page.goto(`${baseUrl}/portal/invoices`, { waitUntil: 'networkidle' });
  await waitForId(page, `invoice-status-${INV.aliceOverdue}`);
  await captureScreenshotWithHighlight(page, '02-customer-overdue-status.png', {
    target: page.locator(`#invoice-status-${INV.aliceOverdue}`),
    calloutText: `${INV.aliceOverdue} is OVERDUE\nAlice sees only her OWN invoices here — Bob's never appear on this list.`,
  });
  await logout(page);

  console.log(`[screenshots] this run wrote to ${screenshotDir()}`);
}

// ── The one test body — the same scenarios, in the same order the original runs them ────────────
// ONE test, not four: they share a page and, more importantly, they share the portal's DATABASE
// STATE (the pay flow settles invoices, the customer CRUD deletes seeded rows). Splitting them
// would let Playwright parallelise/reorder them and each would find the data another had moved.
test('billing portal — login/portal/admin/pay, invoice CRUD, security, customer CRUD', async ({ page }) => {
  // The original leans on Constants.DELAY_FIVE_THOUSANDS_SECONDS; four scenarios against a real
  // Dockerised portal need far more than Playwright's 30s default.
  test.setTimeout(900_000);

  // Opt-in only (TAKE_SCREENSHOT=true), and FIRST while the seeded data is pristine. Gated as a
  // whole so an ordinary run doesn't even pay for the two extra logins.
  if (TAKE_SCREENSHOT) await captureDemoScreenshots(page, BASE_URL);

  await runBillingPortalScenarios(page, BASE_URL);
  await runInvoiceCrudScenarios(page, BASE_URL);
  // Security BEFORE the customer-CRUD scenario, deliberately: that scenario's "allowed delete"
  // empties Carol's invoices — INV-DEMO-0005 among them — and then deletes Carol. Security's
  // token-pay control (step 7) needs INV-DEMO-0005 to still exist, so it must run first. This
  // ordering is safe both ways: security only clears/plants cookies and never deletes a row,
  // and the customer-CRUD scenario logs in fresh, so neither disturbs the other.
  await runSecurityScenarios(page, BASE_URL);
  await runCustomerCrudScenarios(page, BASE_URL);
});
