/**
 * Custom Billing-Portal E2E — ONE test body, run IDENTICALLY on every stack.
 *
 * The same scenario function (`runBillingPortalScenarios`) drives the Grails and the Next.js
 * billing-portal example apps: both ship the exact same routes, UI and — crucially — the same
 * DOM ids, so the assertions are 100% shared. Coverage:
 *   - login rejects a bad password
 *   - a customer sees ONLY their own invoices, with the correct statuses (PAID / DUE / OVERDUE)
 *   - the admin sees all invoices + all customers, and can create / update / delete either — a
 *     customer created by hand also gets the portal login the REST ingest would have given them
 *     (password `changeme`), and their email is read-only ever after
 *   - deleting is guarded by a confirm modal, driven from the list AND the record's own page, and
 *     answered BOTH ways — a customer who still has invoices is refused outright, only an emptied
 *     one is deleted, and their login goes with them
 *   - an invoice can be paid BOTH ways: unauthenticated via its pay-token link, and by the
 *     signed-in owner from their own account
 *   - AUTHORIZATION (runSecurityScenarios): a customer reaches only their OWN data — deep-linking
 *     another customer's invoice by its id is refused, not merely hidden from the list — no customer
 *     reaches /admin by any URL, a hand-made session cookie is not an admin login, an anonymous POST
 *     cannot settle an invoice it does not own, and the admin reaches BOTH /admin and the front end.
 *     The token pay link still works with no session at all, because that is a feature, not a hole
 *   - the invoice DOCUMENT is self-contained: it renders inside its own iframe carrying its own
 *     stylesheet, so the app's Tailwind/daisyUI cannot style it and its CSS cannot leak out, and
 *     Print is offered wherever it appears — signed in or not
 *   - a Burst pushes the Northwind invoices in (exact counts, each linked to the right customer,
 *     logins auto-created) — with and without the customer notification email
 *   - re-Bursting is idempotent: invoices/customers are updated in place, never duplicated
 *
 * Every pay/settle assertion re-reads the invoice in a FRESH request rather than trusting the
 * "Payment complete" panel: the pay page rendered that happily while the settle silently persisted
 * nothing (GORM dirty-checking), so believing the UI would have hidden the bug completely.
 *
 * HARD RULE: every element is selected with `document.getElementById` (never a class, text or
 * xpath selector) — enforced by the `exists / text / setValue / clickById` helpers below, which
 * all go through `page.evaluate(document.getElementById(...))`.
 *
 * Setup per app: run its Custom Seed Script (scaffold from the playground blueprint), start it
 * (Docker), drive it in an external browser, then stop + `docker compose down -v`.
 *
 * Which apps run: BOTH by default — every test is parametrised off the APPS table and runs once per
 * stack, so the two are held to the same behaviour, the same DOM ids and the same REST contract by
 * the identical test body. Scope a run while iterating with e.g.
 * `BILLING_PORTAL_APPS=billing-portal-grails`.
 */

import { test, expect, Browser, Page } from '@playwright/test';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { SelfServicePortalsTestHelper } from '../../helpers/areas/self-service-portals-test-helper';
import { ConnectionsTestHelper } from '../../helpers/areas/connections-test-helper';
import { ConfigurationTestHelper } from '../../helpers/areas/configuration-test-helper';

// The bundled Northwind sample connection. Its Orders / Order Details / Customers / Products /
// Categories tables ARE the DataPallas report INPUT — no seeding step: the app-seed writes a
// ds.scriptfile "Customer Invoices" report (the same one reporting.screens.ts builds) and binds
// this connection code into its `reporting.xml`.
const SAMPLE_CONNECTION_CODE = 'rbt-sample-northwind-sqlite-4f2';
const SAMPLE_VENDOR = 'sqlite';

// Teardown (`dockerComposeDownRmi`) cd's to `_apps/<stack>` — it MUST be the real compose dir.
// These FlowKraft examples live under _apps/flowkraft/xx-custom/_examples/, so a bare app id would
// point `docker compose down` at a nonexistent dir → silent no-op → LEAKED container on error.
const appStack = (id: string) => `flowkraft/xx-custom/_examples/${id}`;

// ── The apps under test (identical behaviour + ids; only the stack + port differ) ──────────────
// EVERY test below runs once per app, driven entirely off this table — same body, same ids, same
// assertions. That IS the parity contract: if the two stacks ever diverge in behaviour, UI, DOM ids
// or REST shape, the identical test body fails on one of them.
interface BillingApp {
  id: string;             // folder = compose service = container = app.json id = config/reports/<id>
  seedTemplateId: string; // #seedTemplateSelect option value (GenericSeedExecutor id = "app-" + folder)
  port: number;
  reportLabel: string;    // the push report's <template> — what #selectMailMergeClassicReport shows
}
const ALL_APPS: BillingApp[] = [
  { id: 'billing-portal-grails', seedTemplateId: 'app-billing-portal-grails', port: 8500, reportLabel: 'Bills Portal (Grails)' },
  { id: 'billing-portal-next',   seedTemplateId: 'app-billing-portal-next',   port: 8501, reportLabel: 'Bills Portal (Next.js)' },
];
// Both stacks by default — the whole point is that they mirror each other. Scope a run to one with
// e.g. BILLING_PORTAL_APPS=billing-portal-grails (handy while iterating on a single stack).
const WANTED = (process.env.BILLING_PORTAL_APPS || ALL_APPS.map((a) => a.id).join(','))
  .split(',').map((s) => s.trim());
const APPS = ALL_APPS.filter((a) => WANTED.includes(a.id));
const baseUrlOf = (app: BillingApp) => `http://localhost:${app.port}`;

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

// ── Per-app harness: scaffold (seed) → start → run shared scenarios → stop + down -v ────────────
for (const app of APPS) {
  test.describe(`Custom Billing Portal — ${app.id}`, () => {
    electronBeforeAfterAllTest(
      `${app.id}: seed → start → login/portal/admin/pay (getElementById only)`,
      async ({ beforeAfterEach: firstPage }) => {
        test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
        let externalBrowser: Browser | null = null;

        try {
          // Clean slate for the app's container/image.
          SelfServicePortalsTestHelper.dockerComposeDownRmi(appStack(app.id));

          // Scaffold the app: run its Custom Seed Script from the Seed Data tab against the
          // sample connection (copies the blueprint, applies overrides, flips visible:true).
          await scaffoldCustomApp(firstPage, app.seedTemplateId);

          // Start the app (Docker) from the Apps list, then wait for its HTTP port.
          await SelfServicePortalsTestHelper.startApp(new FluentTester(firstPage).gotoApps(), app.id);
          const baseUrl = `http://localhost:${app.port}`;

          const ext = await SelfServicePortalsTestHelper.createExternalBrowser();
          externalBrowser = ext.browser;
          const page = ext.page;
          await SelfServicePortalsTestHelper.waitForServerReady(page, `${baseUrl}/login`, 60, 2000);

          await runBillingPortalScenarios(page, baseUrl);
          await runInvoiceCrudScenarios(page, baseUrl);
          // Security BEFORE the customer-CRUD scenario, deliberately: that scenario's "allowed delete"
          // empties Carol's invoices — INV-DEMO-0005 among them — and then deletes Carol. Security's
          // token-pay control (step 7) needs INV-DEMO-0005 to still exist, so it must run first. This
          // ordering is safe both ways: security only clears/plants cookies and never deletes a row,
          // and the customer-CRUD scenario logs in fresh, so neither disturbs the other.
          await runSecurityScenarios(page, baseUrl);
          await runCustomerCrudScenarios(page, baseUrl);

          await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
          externalBrowser = null;
          await SelfServicePortalsTestHelper.stopApp(new FluentTester(firstPage).gotoApps(), app.id);
        } finally {
          if (externalBrowser) {
            await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser).catch(() => {});
          }
          // Nuclear cleanup — always runs.
          try { SelfServicePortalsTestHelper.dockerComposeDownRmi(appStack(app.id)); } catch (e) {
            console.error(`[CLEANUP] ${app.id} down failed:`, e);
          }
        }
      },
    );
  });
}

// ── Backend cron: billing-portal-bkend shares the portals' DB and marks overdue invoices ─────────
// Starts the portal (which writes its own <stack>-portal.db into the shared _shared-db/ dir) + the
// bkend (which mounts the same dir). INV-DEMO-0006 is seeded DUE but PAST its due date; the bkend's
// cron opens the shared DBs directly and flips it to OVERDUE. Asserted via the portal UI.
//
// Runs for BOTH stacks: the cron is deliberately stack-agnostic — it globs every *.db in the shared
// dir (grails-portal.db, next-portal.db) and maintains each, so one backend serves both portals.
for (const app of APPS) {
  test.describe(`Custom Billing Portal — backend cron (billing-portal-bkend + ${app.id})`, () => {
    electronBeforeAfterAllTest(
      `billing-portal-bkend flips ${app.id}'s past-due invoice to OVERDUE in the shared portal DB`,
      async ({ beforeAfterEach: firstPage }) => {
        test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
        let externalBrowser: Browser | null = null;
        const baseUrl = baseUrlOf(app);
        try {
          SelfServicePortalsTestHelper.dockerComposeDownRmi(appStack(app.id));
          SelfServicePortalsTestHelper.dockerComposeDownRmi(appStack('billing-portal-bkend'));

          // Re-sync with the UI before driving the top nav. dockerComposeDownRmi is spawnSync: it
          // FREEZES this process' event loop for as long as `docker compose down --rmi` takes, and
          // this is the only test that pays that toll TWICE while the Electron app keeps rendering.
          // Resuming straight into gotoConnections() raced the Burst page settling underneath, and
          // the Configuration dropdown click landed on #burstFile ("subtree intercepts pointer
          // events") instead of #topConfigurationCrud. Every test doing ONE teardown is unaffected.
          await new FluentTester(firstPage).appShouldBeReadyToRunNewJobs();

          // Start the portal (writes its own <stack>-portal.db into the shared dir).
          await scaffoldCustomApp(firstPage, app.seedTemplateId);
          await SelfServicePortalsTestHelper.startApp(new FluentTester(firstPage).gotoApps(), app.id);

          // Start the bkend (shares the dir; its cron marks overdue on startup + on schedule).
          await scaffoldCustomApp(firstPage, 'app-billing-portal-bkend');
          await SelfServicePortalsTestHelper.startApp(new FluentTester(firstPage).gotoApps(), 'billing-portal-bkend');

          const ext = await SelfServicePortalsTestHelper.createExternalBrowser();
          externalBrowser = ext.browser;
          const page = ext.page;
          await SelfServicePortalsTestHelper.waitForServerReady(page, `${baseUrl}/login`, 60, 2000);

          // The past-due DUE invoice should be flipped to OVERDUE by the cron — poll the portal UI.
          await login(page, baseUrl, LOGIN.bob);
          const becameOverdue = await waitForStatus(page, baseUrl, INV.bkendOverdue, 'OVERDUE', 120000);
          expect(becameOverdue).toBeTruthy();
          await logout(page);

          await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
          externalBrowser = null;
          await SelfServicePortalsTestHelper.stopApp(new FluentTester(firstPage).gotoApps(), 'billing-portal-bkend');
          await SelfServicePortalsTestHelper.stopApp(new FluentTester(firstPage).gotoApps(), app.id);
        } finally {
          if (externalBrowser) {
            await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser).catch(() => {});
          }
          try { SelfServicePortalsTestHelper.dockerComposeDownRmi(appStack('billing-portal-bkend')); } catch (e) { /* ignore */ }
          try { SelfServicePortalsTestHelper.dockerComposeDownRmi(appStack(app.id)); } catch (e) { /* ignore */ }
        }
      },
    );
  });
}

// ── Generate-Reports Burst: DataPallas pushes the Northwind invoices into the portal ─────────
// The headline "one-run magic": scaffold the app (which writes a ds.scriptfile push report bound
// to the sample connection) → start the portal → Burst from the Generate Reports tab. NO seeding:
// the report is the SAME "Customer Invoices" report reporting.screens.ts builds — it reads the
// BUNDLED Northwind sample DB (Orders + Order Details for ALFKI + ANATR), so its input exists.
//
// TWO scenarios, because the report ships able to do both and email is opt-in:
//   A. UPLOAD ONLY — each invoice is rendered to JSON and curl-POSTed to POST /api/invoices,
//      which upserts the customer + invoice and auto-creates the customer's login. Nothing is
//      emailed (settings.xml ships <email>false</email>).
//   B. UPLOAD + EMAIL — additionally tick "Send documents by Email" so every customer gets the
//      "your invoice is available, please pay it at …" notification the app-seed wrote. Asserted
//      against the BUILT-IN test email server (MailHog: SMTP 1025, API 8025) — the same
//      #startTestEmailServer + doVerifyEmails path split-send-emails.spec.ts uses.
//
// Runs for BOTH stacks. Everything below is stack-independent by construction: the SAME Northwind
// rows, the same REST contract, the same ids — only the port and the report label differ, and both
// come from the APPS table.
for (const app of APPS) {
  const PORTAL_URL = baseUrlOf(app);
  const REPORT_LABEL = app.reportLabel;
  // The bundled Northwind sample holds 10 ALFKI+ANATR orders = 10 invoices = 10 pushes/emails.
  // Ground truth (db/sample-northwind-sqlite/northwind.db):
  //   SELECT CustomerID, COUNT(*) FROM Orders WHERE CustomerID IN ('ALFKI','ANATR') GROUP BY 1
  //   → ALFKI 5 (orders 1,4,8,33,58) · ANATR 5 (orders 2,5,9,34,59)
  const EXPECTED_INVOICES = 10;
  // The app-seed synthesises these from Northwind's CustomerID (it carries no email column),
  // and the portal keys its idempotent customer upsert + auto-created login on them.
  const PUSHED_CUSTOMER_EMAILS = ['alfki@northwind.example.com', 'anatr@northwind.example.com'];
  // Per-customer split — asserting these (not just ">0") is what proves each invoice is linked to
  // the RIGHT customer: a push that attached all 10 to one account would still pass a ">0" check.
  const EXPECTED_PER_CUSTOMER: Record<string, number> = {
    'alfki@northwind.example.com': 5,
    'anatr@northwind.example.com': 5,
  };
  // Which invoice belongs to whom. The invoice number IS the Northwind OrderID (<idcolumn>invoice_id</idcolumn>),
  // so these are the exact rows of the query above — used to prove each customer is emailed only
  // their OWN invoices.
  const EXPECTED_INVOICE_NUMBERS: Record<string, string[]> = {
    'alfki@northwind.example.com': ['1', '4', '8', '33', '58'],
    'anatr@northwind.example.com': ['2', '5', '9', '34', '59'],
  };

  /** Select the push report on Generate Reports and Burst it. */
  const burstPushReport = (firstPage: Page): FluentTester =>
    new FluentTester(firstPage)
      .gotoReportGenerationScreen()
      .click('#selectMailMergeClassicReport')
      .waitOnElementToBecomeVisible(`span.ng-option-label:has-text("${REPORT_LABEL}")`)
      .click(`span.ng-option-label:has-text("${REPORT_LABEL}")`)
      .waitOnElementToBecomeEnabled('#btnGenerateReports')
      // Clear Logs FIRST: starting the portal above filled the logs with the whole Docker build,
      // and processing.component.ts blockedByDirtyLogs() refuses EVERY job with an info dialog
      // until they are cleared — the Burst would never start and '.java-started' never appears.
      // The first click/Yes pair only dismisses that dialog. reporting.spec.ts:2087-2095 idiom.
      .click('#btnGenerateReports')
      .clickYesDoThis()
      .click('#btnClearLogs')
      .clickYesDoThis()
      .waitOnElementToBecomeDisabled('#btnClearLogs')
      .click('#btnGenerateReports')                       // the REAL Burst
      .clickYesDoThis()
      .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
      .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
      .appStatusShouldBeGreatNoErrorsNoWarnings();

  // ══════════════════════════════════════════════════════════════════════════════
  // SCENARIO A — upload only
  // ══════════════════════════════════════════════════════════════════════════════
  test.describe(`Custom Billing Portal — Burst pushes invoices (${app.id})`, () => {
    electronBeforeAfterAllTest(
      'scaffold → Burst → pushed Northwind invoices appear in the portal (no email)',
      async ({ beforeAfterEach: firstPage }) => {
        test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
        let externalBrowser: Browser | null = null;
        try {
          SelfServicePortalsTestHelper.dockerComposeDownRmi(appStack(app.id));

          // 1) Scaffold — writes config/reports/<app.id> (push report + its ds.scriptfile data
          //    script, bound to SAMPLE_CONNECTION_CODE) + reveals the card.
          await scaffoldCustomApp(firstPage, app.seedTemplateId);

          // 1b) The seed wires the email (SMTP, sender, subject/body, pay link) but leaves sending
          //     OFF. Assert that, because it is what makes the app work out of the box: nothing is
          //     listening on 1025 in this test, so a report that shipped notifications ON would
          //     fail 10 emails on this very first Burst. This scenario is the upload-ONLY half.
          await ConfigurationTestHelper.loadConfiguration(new FluentTester(firstPage), app.id)
            .click('#leftMenuEnableDisableDistribution')
            .waitOnElementToBecomeVisible('#btnSendDocumentsEmail')
            .elementCheckBoxShouldNotBeSelected('#btnSendDocumentsEmail');   // seed ships it quiet

          // 2) Start the portal so curl has a live target for the push.
          await SelfServicePortalsTestHelper.startApp(new FluentTester(firstPage).gotoApps(), app.id);
          const ext = await SelfServicePortalsTestHelper.createExternalBrowser();
          externalBrowser = ext.browser;
          const page = ext.page;
          await SelfServicePortalsTestHelper.waitForServerReady(page, `${PORTAL_URL}/login`, 60, 2000);

          // Record the pre-Burst counts (the self-seeded demo rows).
          await login(page, PORTAL_URL, LOGIN.admin);
          const before = await adminCounts(page, PORTAL_URL);

          // 3) Burst.
          await burstPushReport(firstPage);

          // 4) EXACTLY the 10 Northwind invoices landed — not "some". An exact count is the only
          //    thing that catches a partial push: web_upload.groovy runs `curl -s` with no `-f`, so
          //    curl exits 0 on an HTTP 500 and DataPallas still logs "web-uploaded successfully".
          //    A ">" assertion passes even when 9 of 10 silently died.
          await page.goto(`${PORTAL_URL}/admin`, { waitUntil: 'networkidle' });
          await waitForId(page, 'admin-invoice-count');
          await page.waitForFunction(
            (want) => Number((document.getElementById('admin-invoice-count')?.textContent || '0').trim()) === want,
            before.invoices + EXPECTED_INVOICES, { timeout: 120000 },
          );
          const after = await adminCounts(page, PORTAL_URL);
          expect(after.invoices).toBe(before.invoices + EXPECTED_INVOICES);
          // …and exactly the 2 pushed customers were auto-created alongside the 3 demo ones.
          expect(after.customers).toBe(before.customers + PUSHED_CUSTOMER_EMAILS.length);

          // 5) Each auto-created login works AND sees exactly ITS OWN invoices — this is what
          //    proves the push linked every invoice to the right customer. ">0" would pass even if
          //    all 10 had been attached to a single account.
          await logout(page);
          for (const email of PUSHED_CUSTOMER_EMAILS) {
            await login(page, PORTAL_URL, { user: email, pass: 'changeme' });
            await page.goto(`${PORTAL_URL}/portal/invoices`, { waitUntil: 'networkidle' });
            await waitForId(page, 'invoice-list');
            expect(await invoiceRowCount(page)).toBe(EXPECTED_PER_CUSTOMER[email]);
            await logout(page);
          }

          // 6) IDEMPOTENCY — Burst the very same report again. The portal upserts customer by email
          //    and invoice by number and only creates a login when none exists, so a re-push must
          //    UPDATE in place: same invoice count, same customer count, no duplicate logins. This
          //    is the "create the users/customers only if needed, otherwise just link" contract.
          await burstPushReport(firstPage);
          await login(page, PORTAL_URL, LOGIN.admin);
          const afterRerun = await adminCounts(page, PORTAL_URL);
          expect(afterRerun.invoices).toBe(after.invoices);     // re-pushed, not re-created
          expect(afterRerun.customers).toBe(after.customers);   // existing customers reused
          await logout(page);
          // The customer's own view is unchanged too (no duplicate rows on their account).
          await login(page, PORTAL_URL, { user: PUSHED_CUSTOMER_EMAILS[0], pass: 'changeme' });
          await page.goto(`${PORTAL_URL}/portal/invoices`, { waitUntil: 'networkidle' });
          await waitForId(page, 'invoice-list');
          expect(await invoiceRowCount(page)).toBe(EXPECTED_PER_CUSTOMER[PUSHED_CUSTOMER_EMAILS[0]]);
          await logout(page);

          await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
          externalBrowser = null;
          await SelfServicePortalsTestHelper.stopApp(new FluentTester(firstPage).gotoApps(), app.id);
        } finally {
          if (externalBrowser) {
            await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser).catch(() => {});
          }
          try { SelfServicePortalsTestHelper.dockerComposeDownRmi(appStack(app.id)); } catch (e) {
            console.error(`[CLEANUP] ${app.id} down failed:`, e);
          }
        }
      },
    );
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // SCENARIO B — upload + email the customer (the most useful one; 0015 video's story)
  // ══════════════════════════════════════════════════════════════════════════════
  test.describe(`Custom Billing Portal — Burst pushes invoices AND emails customers (${app.id})`, () => {
    electronBeforeAfterAllTest(
      'scaffold → enable email → Burst → invoices in the portal + "your invoice is available" emails',
      async ({ beforeAfterEach: firstPage }) => {
        test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
        let externalBrowser: Browser | null = null;
        try {
          SelfServicePortalsTestHelper.dockerComposeDownRmi(appStack(app.id));

          await scaffoldCustomApp(firstPage, app.seedTemplateId);

          // 1) app-seed.groovy already wrote the whole email setup into the report's settings.xml:
          //    manual SMTP (useconn=false) → the built-in test email server on 1025, the sender, and
          //    the subject/body carrying the per-invoice pay link. So don't re-enter any of it —
          //    ASSERT the seed did, which is the only check that the shipped report really arrives
          //    ready to notify. Then do the ONE thing a real user does once their mail server is
          //    up: tick "Send documents by Email". (The seed leaves it off precisely so a Burst
          //    never fails against an SMTP nobody started — see Scenario A.)
          await ConfigurationTestHelper.loadConfiguration(new FluentTester(firstPage), app.id)
            .click('#leftMenuEmailSettings')
            .elementCheckBoxShouldNotBeSelected('#btnUseExistingEmailConnection')  // seed → manual SMTP
            .inputValueShouldContainText('#emailServerHost', 'localhost')
            .inputValueShouldContainText('#smtpPort', '1025')
            .inputValueShouldContainText('#fromName', 'Northwind Traders')
            .click('#leftMenuEnableDisableDistribution')
            .waitOnElementToBecomeVisible('#btnSendDocumentsEmail')
            .elementCheckBoxShouldNotBeSelected('#btnSendDocumentsEmail')  // seed ships it off…
            .click('#btnSendDocumentsEmail');                              // …and this turns it on

          // 2) Start the built-in test email server (MailHog) — verbatim the
          //    split-send-emails.spec.ts:133-161 path, including the two non-obvious steps:
          //      • appShouldBeReadyToRunNewJobs + clean status, and
          //      • #testTokensRandom FIRST — #startTestEmailServer is
          //        [disabled]="…mode === 'ta'" (tab-quality-assurance.ts:140) and 'ta' is the
          //        DEFAULT (processing.service.ts:39), so without switching mode the button is
          //        disabled forever and the click just hangs on it.
          await new FluentTester(firstPage)
            .gotoBurstScreen()
            .click('#leftMenuQualityAssurance')
            .appShouldBeReadyToRunNewJobs()
            .appStatusShouldBeGreatNoErrorsNoWarnings()
            .click('#testTokensRandom')
            .waitOnElementToBecomeEnabled('#startTestEmailServer')
            .click('#startTestEmailServer')
            .clickYesDoThis()
            .waitOnElementToBecomeVisible('#stopTestEmailServer', Constants.DELAY_FIVE_THOUSANDS_SECONDS)
            .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR);

          // 3) Start the portal (curl's push target).
          await SelfServicePortalsTestHelper.startApp(new FluentTester(firstPage).gotoApps(), app.id);
          const ext = await SelfServicePortalsTestHelper.createExternalBrowser();
          externalBrowser = ext.browser;
          const page = ext.page;
          await SelfServicePortalsTestHelper.waitForServerReady(page, `${PORTAL_URL}/login`, 60, 2000);

          // 4) Burst — pushes over REST *and* emails each customer.
          await burstPushReport(firstPage);

          // 5) BOTH halves landed. First the emails: one per invoice, each addressed to the
          //    customer that invoice belongs to (<to>${email}</to>), carrying the portal link.
          await new FluentTester(firstPage).shouldHaveSentNCorrectEmails(EXPECTED_INVOICES);
          const emails = await assertInvoiceEmails(
            EXPECTED_INVOICES, PUSHED_CUSTOMER_EMAILS, PORTAL_URL, EXPECTED_INVOICE_NUMBERS);

          // 5b) The emailed pay link RESOLVES to its invoice. This is the only check that the token
          //     the data script generated is the token the push actually stored — get that wrong and
          //     every "Pay now" link in every customer's inbox silently bounces to /login, while
          //     the counts, the emails and the invoices all still look perfect.
          const sample = emails.find((e) => e.to === PUSHED_CUSTOMER_EMAILS[0])!;
          await page.goto(`${PORTAL_URL}/portal/pay?token=${sample.payToken}`, { waitUntil: 'networkidle' });
          expect(
            new URL(page.url()).pathname,
            `emailed pay link for invoice ${sample.invoiceNumber} bounced instead of opening it`,
          ).not.toBe('/login');
          // It opened THAT invoice: payable → the amount panel, already paid → the success panel.
          expect(
            (await exists(page, 'pay-amount')) || (await exists(page, 'pay-success')),
          ).toBeTruthy();

          // 6) …and the invoices are in the portal, on the same customer's account — exactly their
          //    own, so "emailed 10" and "stored 10 against the right accounts" are both proven.
          for (const email of PUSHED_CUSTOMER_EMAILS) {
            await login(page, PORTAL_URL, { user: email, pass: 'changeme' });
            await page.goto(`${PORTAL_URL}/portal/invoices`, { waitUntil: 'networkidle' });
            await waitForId(page, 'invoice-list');
            expect(await invoiceRowCount(page)).toBe(EXPECTED_PER_CUSTOMER[email]);
            await logout(page);
          }

          await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
          externalBrowser = null;
          await SelfServicePortalsTestHelper.stopApp(new FluentTester(firstPage).gotoApps(), app.id);
        } finally {
          if (externalBrowser) {
            await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser).catch(() => {});
          }
          // Always shut the test email server down, or the next run's MailHog port is taken.
          await new FluentTester(firstPage)
            .gotoBurstScreen()
            .click('#leftMenuQualityAssurance')
            .click('#stopTestEmailServer')
            .clickYesDoThis()
            .waitOnElementToBecomeVisible('#startTestEmailServer', Constants.DELAY_FIVE_THOUSANDS_SECONDS)
            .then(undefined, (e: unknown) => console.warn('[CLEANUP] test email server stop failed:', e));
          try { SelfServicePortalsTestHelper.dockerComposeDownRmi(appStack(app.id)); } catch (e) {
            console.error(`[CLEANUP] ${app.id} down failed:`, e);
          }
        }
      },
    );
  });
}

/**
 * Asserts the "your invoice is available" notifications in the BUILT-IN test email server
 * (MailHog's API on :8025 — the same endpoint FluentTester.doVerifyEmails reads).
 *
 * Every message must be addressed to one of the auto-created customers (never to a burst
 * token or a literal '${email}'), and must carry the invoice number, the portal pay link
 * and the Northwind Traders sign-off the app-seed wrote into settings.xml.
 */
/**
 * Decode an RFC 2047 "encoded-word" header — `=?UTF-8?Q?Invoice_59_from_Northwind_Tra?= =?UTF-8?B?…?=`.
 *
 * ONE non-ASCII character (an em-dash, a curly quote, £/€ — e.g. in a customer name) makes the mailer
 * encode the WHOLE subject, and it splits mid-word, so a raw toContain('Northwind Traders') can never
 * match even though the customer sees exactly that. Q-encoding is per-BYTE, so hex escapes are folded
 * to raw bytes first and only then read as UTF-8 — decoding them as characters would mangle anything
 * non-ASCII. A plain-ASCII header contains no encoded words and passes through untouched.
 */
function decodeMimeHeader(s: string): string {
  return s.replace(
    /=\?[^?]+\?([QqBb])\?([^?]*)\?=(?:\s+(?==\?))?/g,
    (_match, enc: string, text: string) => {
      if (enc.toUpperCase() === 'B') return Buffer.from(text, 'base64').toString('utf8');
      const raw = text
        .replace(/_/g, ' ')                                                   // Q: '_' IS a space
        .replace(/=([0-9A-Fa-f]{2})/g, (_x, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      return Buffer.from(raw, 'binary').toString('utf8');
    },
  );
}

async function assertInvoiceEmails(
  expectedCount: number,
  customerEmails: string[],
  portalUrl: string,
  expectedNumbersPerCustomer: Record<string, string[]>,
): Promise<Array<{ to: string; invoiceNumber: string; payToken: string }>> {
  const res = await fetch('http://localhost:8025/api/v2/messages');
  expect(res.status).toBe(200);
  const messages = await res.json();
  expect(messages.total).toBe(expectedCount);

  const numbersSeenPerCustomer: Record<string, string[]> = {};
  const parsed: Array<{ to: string; invoiceNumber: string; payToken: string }> = [];

  for (const item of messages.items) {
    const to = `${item.To[0].Mailbox}@${item.To[0].Domain}`;
    expect(customerEmails).toContain(to);

    // MailHog hands back the RAW MIME body. Undo quoted-printable so the long pay URL can be
    // matched (and its token read) in one piece: soft line breaks "=\r\n" split it, and "=" is
    // encoded as "=3D" — which would otherwise turn ?token=abc into ?token=3Dabc.
    const body: string = (item.Content?.Body ?? '').replace(/=\r?\n/g, '').replace(/=3D/gi, '=');
    const subject: string = decodeMimeHeader(item.Content?.Headers?.Subject?.[0] ?? '');

    // FreeMarker actually rendered — no ${…} may survive into a customer's inbox.
    expect(subject).toContain('Northwind Traders');
    expect(subject).not.toContain('${');
    expect(body).not.toContain('${');

    // The subject names the invoice: "Invoice <n> from Northwind Traders — $<total> due <date>".
    const named = subject.match(/^Invoice (\S+) from Northwind Traders/);
    expect(named, `subject must name its invoice, got: "${subject}"`).toBeTruthy();
    const invoiceNumber = named![1];
    (numbersSeenPerCustomer[to] ||= []).push(invoiceNumber);

    // …and the body carries that same invoice plus the two things the customer needs: a one-click
    // pay link for THIS invoice (token → no login) and the portal to see the rest.
    // Anchored to the pay CTA, NOT a bare toContain(invoiceNumber): these numbers are Northwind
    // OrderIDs, so "1" or "5" matches any date or amount on the page and would assert nothing.
    expect(body).toContain(`Pay invoice ${invoiceNumber} now`);
    // The sign-in CTA points at the portal ROOT, not a deep link: AuthInterceptor forgets the
    // requested URL and login always lands on /portal, so a /portal/invoices link in an email would
    // never open the page it names.
    expect(body).toContain('sign in to your account');
    expect(body).toContain('Northwind Traders');

    const payLink = body.match(new RegExp(`${portalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/portal/pay\\?token=([\\w-]+)`));
    expect(payLink, `body must carry a one-click pay link, got: "${body.slice(0, 300)}"`).toBeTruthy();
    parsed.push({ to, invoiceNumber, payToken: payLink![1] });
  }

  // Every customer got THEIR OWN invoices — exactly, and nobody else's. Membership alone ("the To
  // is one of ours") would happily pass an email that sent ANATR's invoice to ALFKI.
  for (const email of customerEmails) {
    expect((numbersSeenPerCustomer[email] ?? []).sort()).toEqual([...expectedNumbersPerCustomer[email]].sort());
  }
  return parsed;
}

/**
 * Scaffold a custom app by running its `_custom/app-seed.groovy` from the Seed Data tab, exactly as
 * a user would: open the sample connection's Seed Data tab → pick the app template in
 * `#seedTemplateSelect` → Copy → paste into My Script → Run → wait. This copies the playground
 * blueprint, applies `_custom/overrides`, writes the DataPallas push report (bound to the sample
 * connection) and flips `app.json` `visible:false→true`. Idempotent — safe to re-run.
 *
 * The seed-template value is `app-<folder>` (GenericSeedExecutor id); the folder name doubles as the
 * codejar marker (it appears in the seed's `APP_ID`).
 */
async function scaffoldCustomApp(firstPage: Page, seedTemplateId: string) {
  const marker = seedTemplateId.replace(/^app-/, '');
  await ConnectionsTestHelper.scaffoldCustomAppViaConnectionDetails(
    new FluentTester(firstPage),
    SAMPLE_CONNECTION_CODE,
    SAMPLE_VENDOR,
    seedTemplateId,
    marker,
  );
}
