// ═══════════════════════════════════════════════════════════════════════════
// DataPallas SERVER ONLY — login is required and roles are enforced
// ═══════════════════════════════════════════════════════════════════════════
//
// The other half of auth-authorization-desktop.spec.ts. That file proves the desktop
// never sees authentication; this one proves the Server does — same codebase,
// opposite claim, so they can only be checked against different backends.
//
// ── WHAT THIS FILE IS ─────────────────────────────────────────────────────
//
// One test per documented promise in
//   reportburster.com/content/docs/server/users-roles.mdx
//
// grouped in the same order as that page, so a red test points straight at the
// paragraph it defends. Every role gets both halves: that it CAN do its own job
// (a permission nobody notices until it breaks) and that it CANNOT do the next
// role's (the half people remember to test).
//
// ── HOW TO RUN ────────────────────────────────────────────────────────────
//
//   npm run custom:start-server-and-e2e-server-auth
//
// That script runs this file in a browser, against a fresh install of its own.
// The backend is not configured differently from any other run — there is one
// configuration — but this file CREATES accounts and changes roles, so it must
// not share a store with the rest of the suite. It also deliberately does NOT
// seed an administrator: a fresh install is meant to create `burst` / `burst` by
// itself, which is the first thing documented and the first thing tested here.
//
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect, type Page } from '@playwright/test';

import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { SelfServicePortalsTestHelper } from '../../helpers/areas/self-service-portals-test-helper';
import { InterfaceTestHelper } from '../../helpers/interface-test-helper';
import { ConnectionsTestHelper } from '../../helpers/areas/connections-test-helper';
import {
  CAPABILITY_DOORS,
  isDoorless,
  wasAdmitted,
  type CapabilityDoor,
  type NoDoor,
} from '../../helpers/capability-endpoints';
import {
  addTableToCanvas,
  createFreshCanvas,
  getLastWidgetId,
  publishDashboard,
  selectConnection,
  waitForWidgetData,
} from '../../helpers/explore-data-test-helper';

const BASE_URL = 'http://localhost:9090';
const APP_URL = process.env.E2E_BASE_URL || 'http://localhost:4201';

/** The account a fresh Server creates for itself. Documented, and never changed except by the very last test. */
const SHIPPED = { username: 'burst', password: 'burst' };

/** One user per role, created from the shipped account in beforeAll. */
const ADMIN = { username: 'e2e-admin', password: 'E2eAdminPassword123!' };
const AUTHOR = { username: 'e2e-author', password: 'E2eAuthorPassword123!' };
const OPERATOR = { username: 'e2e-operator', password: 'E2eOperatorPassword123!' };
const VIEWER = { username: 'e2e-viewer', password: 'E2eViewerPassword123!' };

/**
 * The one connection that ships with every installation, used as the ADMIN-only surface.
 *
 * It is an EMAIL connection, and it is used below even by the assertions about database-only
 * endpoints (`test-database`). That is not a mismatch: method security refuses the caller before the
 * controller ever looks at what kind of connection this is, which is the whole claim being made. No
 * database connection ships — `config/connections` contains this file and nothing else — so naming
 * an invented one would only look like it meant something.
 */
const SAMPLE_CONNECTION = 'eml-contact';

/**
 * The database connection an administrator creates in the CRUD test, and the author then builds a
 * report on. SQLite on purpose: it is file-based, so this needs no Docker and no starter pack. The
 * code is what ConnectionsTestHelper derives from the name — `db-${_.kebabCase(name)}-${vendor}`.
 *
 * The names here avoid digits deliberately. lodash's kebabCase treats a digit as its own word, so
 * "E2e Author Northwind" becomes `e-2-e-author-northwind`, not `e2e-author-northwind` — and a name
 * whose derived code is not what it looks like fails at the row id with nothing to point at.
 */
const AUTHOR_CONNECTION_NAME = 'Author Northwind';
const AUTHOR_CONNECTION_CODE = 'db-author-northwind-sqlite';

/**
 * The connection the AI Hub exploration tests read real rows through, and the Northwind table they
 * read. Separate from the CRUD connection above, which that test deletes as the D of its own CRUD.
 * Nothing ships a database connection — `eml-contact` is the only one installed by default — so an
 * administrator creating this one is itself a role doing its own job.
 */
const EXPLORE_CONNECTION_NAME = 'Explore Northwind';
const EXPLORE_CONNECTION_CODE = 'db-explore-northwind-sqlite';
const EXPLORE_TABLE = 'Orders';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Identity = {
  authenticated: boolean;
  user: { username: string };
  tenant: { code: string };
  roles: string[];
  capabilities: Record<string, boolean>;
};

async function getMe(cookie?: string): Promise<Response> {
  return fetch(`${BASE_URL}/api/auth/me`, { headers: cookie ? { Cookie: cookie } : {} });
}

/**
 * CSRF is ON for browser sessions and exempt for API-key callers (SecurityConfig.configureCsrf), so these tests
 * have to do what a browser does: read the XSRF-TOKEN cookie and echo it in a header on every
 * state-changing call. Without it Spring answers 403 — including on /api/auth/login, which is where
 * a suite that ignores this fails first and most confusingly.
 */
async function newCsrfCookie(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/me`);
  const token = /XSRF-TOKEN=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  expect(token, 'Server mode must issue an XSRF-TOKEN cookie').toBeTruthy();
  return `XSRF-TOKEN=${token}`;
}

function xsrfHeader(cookie: string): Record<string, string> {
  const token = /XSRF-TOKEN=([^;]+)/.exec(cookie)?.[1];
  return token ? { 'X-XSRF-TOKEN': token } : {};
}

/** Log in and return the cookies to reuse as a session — the JSESSIONID and the CSRF token. */
async function login(username: string, password: string): Promise<string> {
  const status = await loginStatus(username, password);
  expect(status.code, `login as ${username} should succeed`).toBe(200);
  return status.session!;
}

/** Attempt a login and report the status, for the tests that expect it to fail. */
async function loginStatus(
  username: string,
  password: string,
): Promise<{ code: number; session?: string }> {
  const csrf = await newCsrfCookie();

  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: csrf, ...xsrfHeader(csrf) },
    body: JSON.stringify({ username, password }),
  });

  if (res.status !== 200) return { code: res.status };

  // Spring Security replaces the CSRF token on successful authentication, so the one used to log in
  // is dead the moment login succeeds. Carry the NEW token forward when the response brings one, or
  // every state-changing call afterwards — starting with logout — answers 403.
  const cookies = res.headers.getSetCookie();
  const session = cookies.find((c) => c.startsWith('JSESSIONID='));
  const rotated = cookies.find((c) => c.startsWith('XSRF-TOKEN='));

  return {
    code: res.status,
    session: `${session!.split(';')[0]}; ${rotated ? rotated.split(';')[0] : csrf}`,
  };
}

/** Call an endpoint as a given session and return the status only. */
async function statusAs(
  cookie: string,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<number> {
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers: {
      Cookie: cookie,
      ...xsrfHeader(cookie),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.status;
}

async function jsonAs(cookie: string, urlPath: string): Promise<any> {
  return fetch(`${BASE_URL}${urlPath}`, { headers: { Cookie: cookie } }).then((r) => r.json());
}

/** Create a user, tolerating one that a previous run left behind. */
async function createUser(
  admin: string,
  username: string,
  password: string,
  role: string,
  email?: string,
) {
  await statusAs(admin, 'DELETE', `/api/iam/users/${username}`);
  const status = await statusAs(admin, 'POST', '/api/iam/users', {
    username,
    password,
    role,
    ...(email ? { email } : {}),
  });
  expect([200, 201], `creating ${username} as ${role}`).toContain(status);
}

/** What the listing says this user's role is — the same field the row's picker renders. */
async function roleOf(admin: string, username: string): Promise<string | undefined> {
  const users = await jsonAs(admin, '/api/iam/users');
  return users.find((u: { username: string }) => u.username === username)?.role;
}

// ── groups ────────────────────────────────────────────────────────────────
//
// A group is the only place limits and dashboard grants are written — never on a person — so that
// "what may this author reach" and "which dashboards does this viewer open" have one answer each,
// in one place, for everybody in the group.
//
// The tests below always make their own throwaway groups. A group that shipped would turn "this
// author is not limited" into "this author is not limited yet", which is a different claim.

/** Every group in the tenant, as the Groups tab lists them. */
async function listGroups(admin: string): Promise<any[]> {
  return jsonAs(admin, '/api/iam/groups');
}

/** Put a user in exactly these groups. An empty list takes them out of all of them. */
async function setUserGroups(admin: string, username: string, groupIds: number[]) {
  expect(
    await statusAs(admin, 'PUT', `/api/iam/users/${username}/groups`, { groupIds }),
    `putting ${username} in groups [${groupIds}]`,
  ).toBe(204);
}

/**
 * Delete a group, emptying it first.
 *
 * A group that still has members is refused on purpose — deleting it would silently change what
 * those people may do — so a cleanup has to take the members out before it can remove the group.
 * That is also why every `finally` below removes users first and groups second.
 */
async function deleteGroup(admin: string, groupId: number) {
  const group = (await listGroups(admin)).find((g) => g.id === groupId);
  for (const member of group?.members ?? []) await setUserGroups(admin, member, []);

  // 404 is as good as 204 to a cleanup: what matters is that the group is gone afterwards.
  expect([204, 404], `deleting group ${groupId}`).toContain(
    await statusAs(admin, 'DELETE', `/api/iam/groups/${groupId}`),
  );
}

/** Create a group, removing one of the same name that an interrupted run left behind. */
async function createGroup(
  admin: string,
  name: string,
  body: {
    settings?: { connections?: string[]; scripts?: boolean };
    reports?: string[];
    dashboards?: string[];
    defaultDashboard?: string;
  } = {},
): Promise<number> {
  const leftover = (await listGroups(admin)).find((g) => g.name === name);
  if (leftover) await deleteGroup(admin, leftover.id);

  const res = await fetch(`${BASE_URL}/api/iam/groups`, {
    method: 'POST',
    headers: { Cookie: admin, ...xsrfHeader(admin), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...body }),
  });
  expect(res.status, `creating the group ${name}`).toBe(201);
  return (await res.json()).id;
}

/**
 * Change a group, resending its grants.
 *
 * Deliberately not a partial update: a body that does not mention `dashboards` means "grants none",
 * so a rename that forgot them would quietly take every dashboard away from the group's members.
 * `reports` is the same shape and the opposite consequence: a body that does not mention it grants
 * no report, which — grants being a narrowing — hands the members every report back.
 */
async function updateGroup(
  admin: string,
  groupId: number,
  body: { name: string; reports?: string[]; dashboards?: string[]; defaultDashboard?: string },
) {
  expect(await statusAs(admin, 'PUT', `/api/iam/groups/${groupId}`, body), `updating group ${groupId}`).toBe(200);
}

/** What a signed-in person is offered: the dashboards they may open, and the one that opens first. */
async function myDashboards(
  cookie: string,
): Promise<{ defaultDashboard: string | null; dashboards: { id: string; name: string }[] }> {
  return jsonAs(cookie, '/api/me/dashboards');
}

/**
 * Every way of reading one dashboard, asked as one person: the page, the config and the pivot.
 *
 * The rows are left out on purpose. Which component a dashboard has differs between the two
 * samples, and a refusal has to be a refusal for the WHOLE dashboard — so the three probes here are
 * the ones that mean the same thing on any of them. The tests that assert rows really arrive name
 * the component they read.
 */
async function dashboardReadStatuses(
  cookie: string,
  reportId: string,
): Promise<{ page: number; config: number; pivot: number }> {
  const page = await fetch(`${BASE_URL}/dashboard/${reportId}`, {
    headers: { Cookie: cookie },
    redirect: 'manual',
  });

  return {
    page: page.status,
    config: await statusAs(cookie, 'GET', `/api/reports/${reportId}/config`),
    pivot: await statusAs(cookie, 'POST', `/api/analytics/pivot?reportId=${reportId}`, {
      rows: ['country'],
      cols: [],
      vals: [],
    }),
  };
}

/**
 * Open the Users screen from the signed-in user's own menu, and close that menu behind us.
 *
 * The closing is not tidiness. The menu is a daisyUI dropdown — a `tabindex` div held open by CSS
 * `:focus-within`, with no JavaScript state at all — and its panel sits over the top-right of the
 * page, which is exactly where the Users toolbar puts the search box (`ml-auto` pushes it there).
 * Left open, the panel covers #userSearch, so every click on it fails Playwright's "receives pointer
 * events" check and retries — scrolling the element in and out of view as it goes, which reads on
 * screen as the page twitching up and down until the test times out.
 *
 * Escape does NOT close it: nothing listens for the key, and the dropdown is open purely because
 * something inside it has focus. After clicking the link, that something is the LINK — so blurring
 * #userMenu would not help either. The active element is what has to let go.
 */
async function closeUserMenu(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function openUsersScreen(page: Page, ft: FluentTester) {
  await ft
    .click('#userMenu')
    .waitOnElementToBecomeVisible('#btnNavSectionUsers')
    .click('#btnNavSectionUsers')
    .waitOnElementToBecomeVisible('#tableUsers');

  await closeUserMenu(page);

  // Only once the panel has actually gone is the toolbar underneath it clickable.
  await ft.waitOnElementToBecomeInvisible('#btnNavSectionUsers');
}

/**
 * Open the Users screen and narrow it to one person.
 *
 * The search is not decoration here: the table pages at five rows, and by this point the suite has
 * created well over five users, so a row is only reliably on screen once it has been searched for.
 */
async function openUsersScreenFilteredTo(page: Page, ft: FluentTester, username: string) {
  await openUsersScreen(page, ft);

  await ft
    .click('#userSearch')
    .typeText(username)
    .waitOnElementToBecomeVisible(`#user-${username}`);
}

/**
 * Open the application and wait for its sign-in screen, reloading once if it does not appear.
 *
 * A plain goto is not enough against a dev server: `ng serve` recompiles while the suite runs and
 * pushes a reload to every client, so a navigation can land on a page that is about to be replaced.
 * When that happened, the run this guard was written for sat on `#loginUsername` for 100 seconds and
 * failed with `Received: undefined` — the locator resolving against a page that was going away.
 */
async function openApp(page: Page) {
  await page.goto(APP_URL);

  if (await page.locator('#loginUsername').isVisible().catch(() => false)) return;

  try {
    await page.locator('#loginUsername').waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    await page.reload();
    await page.locator('#loginUsername').waitFor({ state: 'visible', timeout: 30_000 });
  }
}

/** Sign in through the browser, leaving the app on its landing screen. */
async function signInThroughTheUi(ft: FluentTester, user: { username: string; password: string }) {
  await ft
    .waitOnElementToBecomeVisible('#loginUsername')
    .click('#loginUsername')
    .typeText(user.username)
    .click('#loginPassword')
    .typeText(user.password)
    .click('#btnLogin')
    .waitOnElementToBecomeVisible('#userMenu');
}

test.beforeAll(async () => {
  // Fail once with a clear message rather than in every test. /api/auth/me is deliberately public —
  // it is how the frontend learns who is calling — so it answers 200 whether or not anyone is signed
  // in, and what matters is WHO it says that is. Every test below starts from nobody, signs in as one
  // named account and checks where that account is stopped; a run that began already authenticated
  // would make the permissive half of every pair pass for the wrong reason.
  const identity = (await getMe().then((r) => r.json())) as Identity;
  if (identity.authenticated)
    throw new Error(
      `This suite must start from an unauthenticated caller, but /api/auth/me already reports ` +
        `"${(identity.user && identity.user.username) || 'somebody'}". Run it with ` +
        `\`npm run custom:start-server-and-e2e-server-auth\`, which gives it a fresh install.`,
    );

  // Everything below is created BY the shipped administrator, which is itself the first thing the
  // documentation promises exists.
  const shipped = await login(SHIPPED.username, SHIPPED.password);

  await createUser(shipped, ADMIN.username, ADMIN.password, 'ADMIN');
  await createUser(shipped, AUTHOR.username, AUTHOR.password, 'REPORT_AUTHOR');
  await createUser(shipped, OPERATOR.username, OPERATOR.password, 'JOB_OPERATOR');
  await createUser(shipped, VIEWER.username, VIEWER.password, 'DASHBOARD_VIEWER');
});

// ═══════════════════════════════════════════════════════════════════════════
// § Start Here — the `burst` / `burst` Account
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Auth — Server: the shipped administrator', () => {

  test('(first-run) a fresh Server creates one administrator, burst / burst', async () => {
    const status = await fetch(`${BASE_URL}/api/auth/first-run`).then((r) => r.json());

    expect(status.usingDefaultCredentials, 'a fresh install is still on its shipped password').toBe(true);
    expect(status.defaultUsername).toBe(SHIPPED.username);
    expect(status.defaultPassword).toBe(SHIPPED.password);
  });

  test('(first-run) the shipped administrator can sign in straight away', async () => {
    const me = (await getMe(await login(SHIPPED.username, SHIPPED.password)).then((r) =>
      r.json(),
    )) as Identity;

    expect(me.authenticated).toBe(true);
    expect(me.roles, 'the shipped account administers the server').toContain('ADMIN');
  });

  test('(first-run) the sign-in page states the credentials while they are still the default', async ({
    page,
  }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
    await openApp(page);

    await new FluentTester(page)
      .waitOnElementToBecomeVisible('#loginUsername')
      .elementShouldBeVisible('#defaultCredentialsNotice')
      .elementShouldBeVisible('#btnUseDefaultCredentials');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § Where Users Are Managed
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Auth — Server: where users are managed', () => {

  test('(where) user administration is reached from your own name', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
    await openApp(page);

    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, ADMIN);

    await openUsersScreen(page, ft);
  });

  test('(where) your own menu names the role you are signed in as', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
    await openApp(page);

    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, ADMIN);

    await ft.click('#userMenu').waitOnElementToBecomeVisible('#userMenuRoles');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § The Three Roles — what each one CAN do
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Auth — Server: each role can do its own job', () => {

  test('(roles) ADMIN — manages connections, credentials included', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);

    expect(
      await statusAs(admin, 'GET', '/api/connections'),
      'an administrator lists connections',
    ).toBe(200);
  });

  test('(roles) ADMIN — reveals a stored database password', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);

    expect(
      await statusAs(admin, 'POST', `/api/connections/${SAMPLE_CONNECTION}/reveal-password`, {}),
      'revealing a stored secret is exactly what an administrator is for',
    ).toBe(200);
  });

  test('(roles) REPORT_AUTHOR — uses a connection without being able to see its password', async () => {
    const author = await login(AUTHOR.username, AUTHOR.password);

    // Both halves of the documented split, in the order the sentence makes them: can use it…
    expect(
      await statusAs(author, 'GET', '/api/connections'),
      'the person building the report reads through the connection',
    ).toBe(200);

    // …cannot see the credential behind it.
    expect(
      await statusAs(author, 'POST', `/api/connections/${SAMPLE_CONNECTION}/reveal-password`, {}),
      'an author does not need the credential, only the ability to read through it',
    ).toBe(403);
  });

  test('(roles) REPORT_AUTHOR — compiles Groovy, which is what trusted-operator means', async () => {
    const author = await login(AUTHOR.username, AUTHOR.password);

    expect(
      await statusAs(author, 'POST', '/api/dsl/chart/parse', { dslCode: 'chart {}' }),
      'authoring compiles Groovy — a trusted-operator capability',
    ).toBe(200);
  });

  test('(roles) REPORT_AUTHOR — builds a report, and it is there afterwards', async () => {
    const author = await login(AUTHOR.username, AUTHOR.password);
    const reportId = 'e2e-author-built-this';

    // Building things is the whole role. A 200 on a listing does not prove it can.
    await statusAs(author, 'DELETE', `/api/reports/${reportId}`);

    expect(
      await statusAs(author, 'POST', '/api/reports', { reportId, templateName: reportId }),
      'an author creates a report',
    ).toBe(201);

    const reports = await jsonAs(author, '/api/reports');
    expect(
      JSON.stringify(reports),
      'and it exists afterwards — not just a 201 that wrote nothing',
    ).toContain(reportId);

    await statusAs(author, 'DELETE', `/api/reports/${reportId}`);
  });

  test('(roles) REPORT_AUTHOR — writes the script the server will run, and it is saved', async () => {
    const author = await login(AUTHOR.username, AUTHOR.password);
    const reportId = 'e2e-author-scripted-this';
    const script = '// written by the e2e author\nreturn []';

    await statusAs(author, 'DELETE', `/api/reports/${reportId}`);
    expect(
      await statusAs(author, 'POST', '/api/reports', { reportId, templateName: reportId }),
    ).toBe(201);

    // "Both can write report scripts and templates — Groovy, FreeMarker, JasperReports — which
    // DataPallas then runs on the server." That is the trusted-operator claim, and this is it
    // happening: the author writes a script and the server keeps it.
    const written = await fetch(`${BASE_URL}/api/reports/${reportId}/script/datasourceScript`, {
      method: 'PUT',
      headers: { Cookie: author, ...xsrfHeader(author), 'Content-Type': 'text/plain' },
      body: script,
    });
    expect(written.status, 'an author saves a script').toBe(200);

    const readBack = await fetch(
      `${BASE_URL}/api/reports/${reportId}/script/datasourceScript`,
      { headers: { Cookie: author } },
    );
    expect(await readBack.text(), 'and reads back what they wrote').toContain('written by the e2e author');

    await statusAs(author, 'DELETE', `/api/reports/${reportId}`);
  });

  test('(crud-connections) an ADMIN creates, lists and deletes a database connection', async ({
    page,
  }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // Connections are the ADMIN-only half of "manages connections, credentials included", and the
    // whole CRUD belongs to that role. Driven through the same helper the connections suite uses, so
    // this is the real screen, the real modal and the real file on disk.
    await openApp(page);
    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, ADMIN);

    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      ft,
      AUTHOR_CONNECTION_NAME,
      'sqlite',
    );

    // Read it back through the API the author will use it from.
    const admin = await login(ADMIN.username, ADMIN.password);
    const connections = await jsonAs(admin, '/api/connections?type=database');
    expect(
      JSON.stringify(connections),
      'the connection an administrator just created is there to be used',
    ).toContain(AUTHOR_CONNECTION_CODE);

    // The D of CRUD, and the cleanup, in one move — the same helper and the same escaped-filename
    // pattern explore-data-smart-defaults.spec.ts uses in its teardown. Without this the connection
    // survives the run, and the test's own title would be a lie.
    await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
      ft,
      `${AUTHOR_CONNECTION_CODE}\\.xml`,
      'sqlite',
    );
  });

  test('(roles) ADMIN — builds a report and removes it, like the author below', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const reportId = 'e2e-admin-built-this';

    // "ADMIN — Everything… plus everything the roles below can do." Inheriting a capability on
    // paper is not the same as holding it, and the ladder is expressed as an ordinal in Role.java —
    // reordering the enum would change who can do what without breaking a compile.
    await statusAs(admin, 'DELETE', `/api/reports/${reportId}`);

    expect(
      await statusAs(admin, 'POST', '/api/reports', { reportId, templateName: reportId }),
    ).toBe(201);

    const reports = await jsonAs(admin, '/api/reports');
    expect(JSON.stringify(reports)).toContain(reportId);

    expect(await statusAs(admin, 'DELETE', `/api/reports/${reportId}`)).toBe(200);
  });

  test('(roles) ADMIN — writes the script inside a report, as an author would', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const reportId = 'e2e-admin-scripted-this';
    const script = '// written by the e2e administrator\nreturn []';

    await statusAs(admin, 'DELETE', `/api/reports/${reportId}`);
    expect(
      await statusAs(admin, 'POST', '/api/reports', { reportId, templateName: reportId }),
    ).toBe(201);

    // The U of CRUD, and the one that matters most: writing Groovy the server will run. An admin
    // holds this by inheriting the author's rung, which is precisely the kind of claim that is true
    // until somebody reorders an enum.
    const written = await fetch(`${BASE_URL}/api/reports/${reportId}/script/datasourceScript`, {
      method: 'PUT',
      headers: { Cookie: admin, ...xsrfHeader(admin), 'Content-Type': 'text/plain' },
      body: script,
    });
    expect(written.status).toBe(200);

    const readBack = await fetch(`${BASE_URL}/api/reports/${reportId}/script/datasourceScript`, {
      headers: { Cookie: admin },
    });
    expect(await readBack.text()).toContain('written by the e2e administrator');

    await statusAs(admin, 'DELETE', `/api/reports/${reportId}`);
  });

  test('(roles) ADMIN — generates a report', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    const admin = await login(ADMIN.username, ADMIN.password);

    InterfaceTestHelper.cleanOutputAndLogs();

    expect(
      [200, 202],
      'an administrator runs what they administer',
    ).toContain(
      await statusAs(admin, 'POST', '/api/jobs', {
        type: 'generate',
        reportId: 'g-csv2htm',
        input: 'samples/reports/payslips/Payslips.csv',
      }),
    );

    await InterfaceTestHelper.waitForJobCompletion(120_000);
    await InterfaceTestHelper.assertOutputFiles(['0.html', '1.html', '2.html'], 'html');
  });

  test('(roles) REPORT_AUTHOR — deletes a report they built', async () => {
    const author = await login(AUTHOR.username, AUTHOR.password);
    const reportId = 'e2e-author-will-delete-this';

    await statusAs(author, 'DELETE', `/api/reports/${reportId}`);
    expect(
      await statusAs(author, 'POST', '/api/reports', { reportId, templateName: reportId }),
    ).toBe(201);

    // The D of CRUD, which every other report test leaves to cleanup and therefore never asserts.
    expect(await statusAs(author, 'DELETE', `/api/reports/${reportId}`)).toBe(200);

    const reports = await jsonAs(author, '/api/reports');
    expect(JSON.stringify(reports), 'and it is gone afterwards').not.toContain(reportId);
  });

  test('(roles) REPORT_AUTHOR — builds a report the server then generates', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    const author = await login(AUTHOR.username, AUTHOR.password);
    const reportId = 'e2e-author-generates-this';

    // The trusted-operator claim, end to end and in one test: an author writes Groovy, and this
    // server runs it. Everything above proves an author may SAVE things; this proves the saving
    // was not theatre.
    await statusAs(author, 'DELETE', `/api/reports/${reportId}`);
    expect(
      await statusAs(author, 'POST', '/api/reports', { reportId, templateName: reportId }),
    ).toBe(201);

    InterfaceTestHelper.cleanOutputAndLogs();

    // Generate from the sample CSV, the same shape interface-client-rest.spec.ts uses for its
    // generate cases. The author starts it with their OWN session — a REPORT_AUTHOR may run what
    // they build.
    expect(
      [200, 202],
      'an author generates the report they built',
    ).toContain(
      await statusAs(author, 'POST', '/api/jobs', {
        type: 'generate',
        reportId: 'g-csv2docx',
        input: 'samples/reports/payslips/Payslips.csv',
      }),
    );

    await InterfaceTestHelper.waitForJobCompletion(120_000);
    await InterfaceTestHelper.assertOutputFiles(['0.docx', '1.docx', '2.docx'], 'docx');

    await statusAs(author, 'DELETE', `/api/reports/${reportId}`);
  });

  test('(roles) JOB_OPERATOR — actually runs a job, and sees it in the job list', async () => {
    const operator = await login(OPERATOR.username, OPERATOR.password);

    // Start from a clean output folder, or the assertion below could be satisfied by files an
    // earlier test left there.
    InterfaceTestHelper.cleanOutputAndLogs();

    // The role exists to run things. The same payload interface-client-rest.spec.ts uses, so this is
    // a real burst of a real sample and not a permission probe dressed up as one. 202: the engine
    // answers Accepted immediately and gets on with it.
    expect(
      [200, 202],
      'an operator starts a job',
    ).toContain(
      await statusAs(operator, 'POST', '/api/jobs', {
        type: 'burst',
        inputFile: 'samples/burst/Payslips.pdf',
        reportId: 'split-only',
      }),
    );

    // 202 means "accepted", not "worked" — so wait for the engine the way interface-client-rest.spec
    // does (info.log saying Execution Ended) and then look at what came out. Without this the test
    // proves an operator may PRESS the button, which is not what the role is for.
    await InterfaceTestHelper.waitForJobCompletion(120_000);
    await InterfaceTestHelper.assertOutputFiles(
      Constants.PAYSLIPS_PDF_BURST_TOKENS.map((token: string) => `${token}.pdf`),
      'pdf',
    );

    expect(await statusAs(operator, 'GET', '/api/jobs'), 'and watches it').toBe(200);
    expect(
      await statusAs(operator, 'GET', '/api/reports'),
      'and reads the reports they are asked to run',
    ).toBe(200);
  });

  test('(journey) a JOB_OPERATOR entitled to a report does the whole operator job', async () => {
    // The test above proves the button works. This one walks the day around the button — the list
    // the Processing screen offers, the settings it reads before submitting, the run, the wait, the
    // output, the log files, the tailer, and the two housekeeping deletes — and asserts each step
    // ANSWERED, not merely that it was not refused. A 404 in the middle of an operator's day is a
    // failure in the middle, and it is not a 403: exactly what a status-only check walks past.
    const operator = await login(OPERATOR.username, OPERATOR.password);
    InterfaceTestHelper.cleanOutputAndLogs();

    const reports = await jsonAs(operator, '/api/reports');
    expect(
      reports.map((r: { folderName: string }) => r.folderName),
      'the report they are asked to run is one the list offers them',
    ).toContain('split-only');

    const settings = await answerAs(operator, 'GET', '/api/reports/split-only/settings');
    expect(settings.status, 'the screen reads the report settings before it submits').toBe(200);
    expect(settings.json?.settings?.template, 'and they are that report’s own settings').toBe(
      'split-only',
    );

    const submitted = await answerAs(operator, 'POST', '/api/jobs', {
      type: 'burst',
      inputFile: 'samples/burst/Payslips.pdf',
      reportId: 'split-only',
    });
    expect([200, 202], 'the job is accepted').toContain(submitted.status);
    const jobId = submitted.json?.jobId;
    expect(jobId, 'an accepted job comes back with an id to follow it by').toBeTruthy();

    await InterfaceTestHelper.waitForJobCompletion(120_000);
    await InterfaceTestHelper.assertOutputFiles(
      Constants.PAYSLIPS_PDF_BURST_TOKENS.map((token: string) => `${token}.pdf`),
      'pdf',
    );

    const job = await answerAs(operator, 'GET', `/api/jobs/${jobId}`);
    expect(job.status, 'the job they started is theirs to follow').toBe(200);

    // The log files the Processing screen lists before it tails one. Content-Type on a GET because
    // LogsController is mapped with a class-level consumes=application/json and no method-level
    // override — the same header interface-client-rest.spec.ts sends, and the renderer's client.
    const logs = await fetch(`${BASE_URL}/api/jobs/logs`, {
      headers: { Cookie: operator, Accept: 'application/json', 'Content-Type': 'application/json' },
    });
    expect(logs.status, 'the log files are listed to the person who ran the job').toBe(200);
    const logFiles = await logs.json();
    expect(logFiles.length, 'and a job that ran leaves logs behind').toBeGreaterThan(0);
    expect(
      logFiles.some((f: { fileSize: number }) => f.fileSize > 0),
      'with something written in them: an empty list of empty files is not a log',
    ).toBeTruthy();
    // The lines themselves arrive over the tailer's websocket, not over a REST call an operator may
    // make — /api/system/fs is REPORT_AUTHOR and above — so the door asserted here is the tailer.
    expect(
      await statusAs(operator, 'POST', '/api/jobs/logs/tailer', {
        command: 'start',
        fileName: logFiles[0].fileName,
      }),
      'and the tailer the log viewer starts is an operator’s own request',
    ).toBe(200);
    await statusAs(operator, 'POST', '/api/jobs/logs/tailer', {
      command: 'stop',
      fileName: logFiles[0].fileName,
    });

    // Housekeeping, the last thing the same screens offer. Both are destructive and both are an
    // operator's own business — and the temp delete needs the content type for the same reason
    // the logs list does.
    expect(
      await statusAs(operator, 'DELETE', '/api/jobs/quarantine'),
      'clearing quarantine is part of the job',
    ).toBe(200);
    const temp = await fetch(`${BASE_URL}/api/jobs/temp/${jobId}`, {
      method: 'DELETE',
      headers: { Cookie: operator, ...xsrfHeader(operator), 'Content-Type': 'application/json' },
    });
    expect(temp.status, 'and so is clearing the temp folder of the job they just ran').toBe(200);
  });

  test('(roles) JOB_OPERATOR — opens a published dashboard, and reads its data', async () => {
    // There is no read-only role: the operator IS the reader. A dashboard link sent to one must open,
    // and its widgets must get rows — not just an empty page shell.
    const operator = await login(OPERATOR.username, OPERATOR.password);

    const page = await fetch(`${BASE_URL}/dashboard/${SAMPLE_DASHBOARD}`, {
      headers: { Cookie: operator },
      redirect: 'manual',
    });
    expect(page.status, 'a signed-in operator is served the page, not sent to sign in').toBe(200);
    const html = await page.text();
    expect(html, 'and it really is the dashboard page').toContain('<rb-dashboard');
    expect(
      html,
      'a session needs no embed token; one here would mean the share path answered instead',
    ).not.toContain('embed-token=');

    const config = await fetch(`${BASE_URL}/api/reports/${SAMPLE_DASHBOARD}/config`, {
      headers: { Cookie: operator },
    });
    expect(config.status, 'the components read the config first').toBe(200);
    expect((await config.json()).outputType).toBe('output.dashboard');

    const data = await fetch(
      `${BASE_URL}/api/reports/${SAMPLE_DASHBOARD}/data?componentId=topCustomers`,
      { headers: { Cookie: operator } },
    );
    expect(data.status, 'then the rows the config describes').toBe(200);
    const result = await data.json();
    // A failed fetch still answers 200, with one ERROR_MESSAGE row (CliJob.doFetchData) — so the
    // status alone would pass while the operator got nothing.
    expect(result.reportColumnNames, 'the fetch did not fail').not.toContain('ERROR_MESSAGE');
    expect(result.data.length, 'and real rows reach the widget').toBeGreaterThan(0);
  });


  test('(roles) DASHBOARD_VIEWER — reads a dashboard granted to their group', async () => {
    // The one thing the bottom rung is for. A viewer has no job in the product: they open the
    // dashboards their groups grant, which is three requests — the page, the config every rb-*
    // component asks for first, and the rows that config describes.
    const admin = await login(ADMIN.username, ADMIN.password);
    const groupId = await createGroup(admin, 'e2e-can-read', {
      dashboards: [SAMPLE_DASHBOARD],
      defaultDashboard: SAMPLE_DASHBOARD,
    });

    try {
      await setUserGroups(admin, VIEWER.username, [groupId]);
      const viewer = await login(VIEWER.username, VIEWER.password);

      const mine = await myDashboards(viewer);
      expect(
        mine.dashboards.map((d) => d.id),
        'the grant is what they are offered',
      ).toContain(SAMPLE_DASHBOARD);
      expect(mine.defaultDashboard, 'and it is where they land').toBe(SAMPLE_DASHBOARD);

      const reads = await dashboardReadStatuses(viewer, SAMPLE_DASHBOARD);
      expect(reads.page, 'a granted viewer is served the page, not sent to sign in').toBe(200);
      expect(reads.config, 'and the config the components read first').toBe(200);

      const data = await fetch(
        `${BASE_URL}/api/reports/${SAMPLE_DASHBOARD}/data?componentId=topCustomers`,
        { headers: { Cookie: viewer } },
      );
      expect(data.status, 'then the rows the config describes').toBe(200);
      const result = await data.json();
      // A failed fetch still answers 200, with one ERROR_MESSAGE row (CliJob.doFetchData) — so the
      // status alone would pass while the viewer sat looking at an empty dashboard.
      expect(result.reportColumnNames, 'the fetch did not fail').not.toContain('ERROR_MESSAGE');
      expect(result.data.length, 'and real rows reach the widget').toBeGreaterThan(0);
    } finally {
      await setUserGroups(admin, VIEWER.username, []);
      await deleteGroup(admin, groupId);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § The Three Roles — what each one may NOT do
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Auth — Server: no role reaches past its rung', () => {

  test('(roles) REPORT_AUTHOR — cannot manage users', async () => {
    const author = await login(AUTHOR.username, AUTHOR.password);

    expect(
      await statusAs(author, 'POST', '/api/iam/users', {
        username: 'smuggled-in',
        password: 'Whatever123!',
        role: 'ADMIN',
      }),
      'privilege escalation via user creation must be closed',
    ).toBe(403);

    expect(await statusAs(author, 'GET', '/api/iam/users')).toBe(403);
  });

  test('(roles) REPORT_AUTHOR — cannot change, disable or delete an existing account', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const author = await login(AUTHOR.username, AUTHOR.password);
    const victim = 'e2e-untouchable-by-author';
    const victimPassword = 'UntouchableByAuthor123!';

    // Creating a user is only one of the seven ways to manage one. The other six take a username in
    // the path and each is its own @RequestMapping, so each has to be asked separately: a class-level
    // rule that a single method-level annotation widens would still pass a test that only tries POST.
    await createUser(admin, victim, victimPassword, 'JOB_OPERATOR');

    expect(
      await statusAs(author, 'PUT', `/api/iam/users/${victim}/role`, { role: 'ADMIN' }),
      'promoting somebody else is the shortest path to promoting yourself',
    ).toBe(403);
    expect(
      await statusAs(author, 'PUT', `/api/iam/users/${victim}/password`, {
        password: 'Hijacked123!',
      }),
      "setting somebody else's password is taking their account",
    ).toBe(403);
    expect(await statusAs(author, 'POST', `/api/iam/users/${victim}/disable`)).toBe(403);
    expect(await statusAs(author, 'POST', `/api/iam/users/${victim}/enable`)).toBe(403);
    expect(await statusAs(author, 'DELETE', `/api/iam/users/${victim}`)).toBe(403);

    // A 403 that nevertheless did the thing is the failure worth catching, so the account is read
    // back afterwards: same role, still there, and still opened by the password it was created with.
    expect(await roleOf(admin, victim), 'the role is still the one the administrator set').toBe(
      'JOB_OPERATOR',
    );
    expect(
      (await loginStatus(victim, victimPassword)).code,
      'and the original password still works, so no reset got through',
    ).toBe(200);

    expect(await statusAs(admin, 'DELETE', `/api/iam/users/${victim}`)).toBe(200);
  });

  test('(roles) JOB_OPERATOR — cannot manage users, by any of the seven ways there are', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const operator = await login(OPERATOR.username, OPERATOR.password);
    const victim = 'e2e-untouchable-by-operator';
    const victimPassword = 'UntouchableByOperator123!';

    await createUser(admin, victim, victimPassword, 'JOB_OPERATOR');

    // The bottom rung against the top surface. /api/iam is ADMIN at the class level, and this is the
    // test that fails if that annotation is ever relaxed to the ladder's floor.
    expect(
      await statusAs(operator, 'GET', '/api/iam/users'),
      'who else has an account here is not an operator\'s business',
    ).toBe(403);
    expect(
      await statusAs(operator, 'POST', '/api/iam/users', {
        username: 'smuggled-in-by-operator',
        password: 'Whatever123!',
        role: 'ADMIN',
      }),
    ).toBe(403);
    expect(
      await statusAs(operator, 'PUT', `/api/iam/users/${victim}/role`, { role: 'ADMIN' }),
    ).toBe(403);
    expect(
      await statusAs(operator, 'PUT', `/api/iam/users/${victim}/password`, {
        password: 'Hijacked123!',
      }),
    ).toBe(403);
    expect(await statusAs(operator, 'POST', `/api/iam/users/${victim}/disable`)).toBe(403);
    expect(await statusAs(operator, 'POST', `/api/iam/users/${victim}/enable`)).toBe(403);
    expect(await statusAs(operator, 'DELETE', `/api/iam/users/${victim}`)).toBe(403);

    expect(await roleOf(admin, victim)).toBe('JOB_OPERATOR');
    expect((await loginStatus(victim, victimPassword)).code).toBe(200);
    expect(
      await roleOf(admin, 'smuggled-in-by-operator'),
      'and the administrator the operator tried to create does not exist',
    ).toBeUndefined();

    expect(await statusAs(admin, 'DELETE', `/api/iam/users/${victim}`)).toBe(200);
  });

  test('(roles) REPORT_AUTHOR — cannot save a connection', async () => {
    const author = await login(AUTHOR.username, AUTHOR.password);

    expect(
      await statusAs(author, 'PUT', `/api/connections/${SAMPLE_CONNECTION}`, {}),
      'connections and their credentials belong to the administrator',
    ).toBe(403);
  });

  test('(roles) REPORT_AUTHOR — cannot delete a connection, test it, or rewrite its metadata', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const author = await login(AUTHOR.username, AUTHOR.password);

    // Saving is one of six ADMIN-only methods on a controller whose class-level floor is the author's
    // own role, so every one of them is a place where the floor could be left showing.
    expect(
      await statusAs(author, 'DELETE', `/api/connections/${SAMPLE_CONNECTION}`),
      'an author reads through a connection and destroys none',
    ).toBe(403);
    expect(
      await statusAs(author, 'POST', `/api/connections/${SAMPLE_CONNECTION}/test-database`, {}),
      'testing a connection makes the server use the stored credential on demand',
    ).toBe(403);
    expect(
      await statusAs(author, 'PUT', `/api/connections/${SAMPLE_CONNECTION}/metadata/schema`, {}),
      'metadata is part of the connection, and the connection is administered',
    ).toBe(403);

    // Read back as the administrator: a refused delete that deleted anyway is the failure that
    // matters, and it would leave the rest of the suite without its sample connection.
    expect(
      JSON.stringify(await jsonAs(admin, '/api/connections')),
      'the connection the author was refused is still installed',
    ).toContain(SAMPLE_CONNECTION);
  });

  test('(roles) JOB_OPERATOR — cannot even see the list of connections', async () => {
    const operator = await login(OPERATOR.username, OPERATOR.password);

    // The class-level floor itself: /api/connections admits REPORT_AUTHOR and up, so an operator is
    // refused before any per-method rule is consulted. Nothing else in the suite asks this question,
    // and relaxing that one annotation is exactly how it would be lost.
    expect(
      await statusAs(operator, 'GET', '/api/connections'),
      'an operator runs jobs somebody else configured, and browses no connections',
    ).toBe(403);
    expect(await statusAs(operator, 'GET', `/api/connections/${SAMPLE_CONNECTION}`)).toBe(403);
  });

  test('(roles) JOB_OPERATOR — cannot save, delete, test or unmask a connection', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const operator = await login(OPERATOR.username, OPERATOR.password);

    expect(await statusAs(operator, 'PUT', `/api/connections/${SAMPLE_CONNECTION}`, {})).toBe(403);
    expect(await statusAs(operator, 'DELETE', `/api/connections/${SAMPLE_CONNECTION}`)).toBe(403);
    expect(
      await statusAs(operator, 'POST', `/api/connections/${SAMPLE_CONNECTION}/test-database`, {}),
    ).toBe(403);
    expect(
      await statusAs(operator, 'POST', `/api/connections/${SAMPLE_CONNECTION}/reveal-password`, {}),
      'the stored secret is two rungs above an operator',
    ).toBe(403);

    expect(
      JSON.stringify(await jsonAs(admin, '/api/connections')),
      'and the connection the operator was refused is still installed',
    ).toContain(SAMPLE_CONNECTION);
  });

  test('(roles) JOB_OPERATOR — cannot author reports', async () => {
    const operator = await login(OPERATOR.username, OPERATOR.password);

    expect(
      await statusAs(operator, 'POST', '/api/reports', { reportId: 'e2e-operator-should-not' }),
      'an operator runs what exists, and creates nothing',
    ).toBe(403);
  });

  test("(roles) JOB_OPERATOR — cannot delete a report, nor overwrite the script inside one", async () => {
    const author = await login(AUTHOR.username, AUTHOR.password);
    const operator = await login(OPERATOR.username, OPERATOR.password);
    const reportId = 'e2e-operator-must-not-touch';

    await statusAs(author, 'DELETE', `/api/reports/${reportId}`);
    expect(
      await statusAs(author, 'POST', '/api/reports', { reportId, templateName: reportId }),
    ).toBe(201);

    expect(
      await statusAs(operator, 'DELETE', `/api/reports/${reportId}`),
      'an operator runs what exists and destroys nothing',
    ).toBe(403);

    // The interesting half. Writing a script into somebody else's report is how an operator would
    // get Groovy onto the server without ever calling an endpoint named "run".
    const smuggled = await fetch(`${BASE_URL}/api/reports/${reportId}/script/datasourceScript`, {
      method: 'PUT',
      headers: { Cookie: operator, ...xsrfHeader(operator), 'Content-Type': 'text/plain' },
      body: 'return "this must never be saved"',
    });
    expect(smuggled.status, 'authoring a script is not an operator capability').toBe(403);

    // Still there, and still the author's.
    expect(await statusAs(author, 'DELETE', `/api/reports/${reportId}`)).toBe(200);
  });

  test('(roles) JOB_OPERATOR — cannot execute Groovy', async () => {
    const operator = await login(OPERATOR.username, OPERATOR.password);

    expect(
      await statusAs(operator, 'POST', '/api/queries/run-script', {
        connectionId: SAMPLE_CONNECTION,
        script: 'return []',
      }),
      'run-script evaluates Groovy from the body — reaching it IS code execution',
    ).toBe(403);

    expect(
      await statusAs(operator, 'POST', '/api/dsl/chart/parse', { dslCode: 'chart {}' }),
    ).toBe(403);
  });

  test('(roles) JOB_OPERATOR — cannot reach the filesystem API', async () => {
    const operator = await login(OPERATOR.username, OPERATOR.password);

    // Which roles the filesystem endpoints admit is not a contract worth pinning — a path-taking API
    // ought not be public REST surface at all. What must not regress is the floor: an operator, who
    // cannot execute anything, must not be handed arbitrary reads and deletes inside the install.
    expect(
      await statusAs(operator, 'GET', '/api/system/fs/content?path=config/_internal/settings.xml'),
    ).toBe(403);
    expect(await statusAs(operator, 'DELETE', '/api/system/fs?path=logs/info.log')).toBe(403);
  });


  test('(roles) DASHBOARD_VIEWER — cannot run SQL, see connections, list reports, author, run a job, share, manage users or reach the filesystem', async () => {
    // The bottom rung, asked for everything on every rung above it. One test rather than eight
    // because the claim is a single one: this role reads dashboards, and there is no second thing
    // it can do. Every probe below is harmless if its guard is broken — the writes name throwaway
    // e2e- objects, and the one delete names a log file a run is expected to be able to lose.
    const viewer = await login(VIEWER.username, VIEWER.password);

    expect(
      await statusAs(viewer, 'POST', '/api/queries/run-sql', {
        connectionId: SAMPLE_CONNECTION,
        sql: 'SELECT 1',
      }),
      'ad-hoc SQL is author work, whatever the SQL says',
    ).toBe(403);

    expect(
      await statusAs(viewer, 'GET', '/api/connections?type=database'),
      'and so is seeing what the server connects to',
    ).toBe(403);
    expect(
      await statusAs(viewer, 'GET', `/api/connections/${SAMPLE_CONNECTION}`),
      'including one connection by name',
    ).toBe(403);

    expect(
      await statusAs(viewer, 'GET', '/api/reports'),
      'a viewer opens the dashboards they were granted, never the catalogue',
    ).toBe(403);

    expect(
      await statusAs(viewer, 'POST', '/api/reports', {
        reportId: 'e2e-viewer-should-not-create',
        templateName: 'Blank',
      }),
      'authoring a report is two rungs up',
    ).toBe(403);

    expect(
      await statusAs(viewer, 'POST', '/api/jobs', {
        type: 'burst',
        inputFile: 'samples/burst/Payslips.pdf',
        reportId: 'split-only',
      }),
      'running a job is what an operator is for',
    ).toBe(403);

    expect(
      await statusAs(viewer, 'POST', '/api/embed/share-link', { reportId: SAMPLE_DASHBOARD }),
      'being shown a dashboard is not being allowed to hand it out',
    ).toBe(403);

    expect(await statusAs(viewer, 'GET', '/api/iam/users'), 'users are an administrator matter').toBe(403);
    expect(await statusAs(viewer, 'GET', '/api/iam/groups'), 'and so are groups').toBe(403);
    expect(
      await statusAs(viewer, 'PUT', `/api/iam/users/${VIEWER.username}/groups`, { groupIds: [] }),
      'above all, a viewer may not edit the membership their own grants come from',
    ).toBe(403);

    expect(
      await statusAs(viewer, 'GET', '/api/system/fs/content?path=config/_internal/settings.xml'),
      'the filesystem API is not part of reading a dashboard',
    ).toBe(403);
    expect(await statusAs(viewer, 'DELETE', '/api/system/fs?path=logs/info.log')).toBe(403);

    expect(
      await statusAs(viewer, 'GET', '/api/system/test-url?url=http://localhost:9090'),
      'nor is making the server fetch a URL',
    ).toBe(403);
    expect(
      await statusAs(viewer, 'GET', '/api/system/services/status'),
      'nor reading what else is running',
    ).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § Creating a User
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Auth — Server: creating a user', () => {

  test('(create) an administrator creates a user with a username, password and role', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const username = 'e2e-created-by-api';

    await statusAs(admin, 'DELETE', `/api/iam/users/${username}`);

    expect(
      await statusAs(admin, 'POST', '/api/iam/users', {
        username,
        password: 'CreatedPassword123!',
        role: 'JOB_OPERATOR',
      }),
    ).toBe(201);

    const users = await jsonAs(admin, '/api/iam/users');
    expect(
      users.find((u: { username: string }) => u.username === username)?.role,
      'the listing carries the role, which is what the picker renders',
    ).toBe('JOB_OPERATOR');
  });

  test('(create) the new person can sign in immediately', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const username = 'e2e-signs-in-immediately';
    const password = 'ImmediatePassword123!';

    await createUser(admin, username, password, 'JOB_OPERATOR');

    const me = (await getMe(await login(username, password)).then((r) => r.json())) as Identity;
    expect(me.user.username).toBe(username);
  });

  test('(create) a duplicate username is refused, and nothing is created', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);

    expect(
      await statusAs(admin, 'POST', '/api/iam/users', {
        username: AUTHOR.username,
        password: AUTHOR.password,
        role: 'REPORT_AUTHOR',
      }),
      'so it is safe to try again, and so provisioning can be re-run',
    ).toBe(409);
  });

  test('(create) PLATFORM_ADMIN is not a tenant role', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);

    // Allowing it would let a tenant administrator promote somebody above their own tenant.
    expect(
      await statusAs(admin, 'POST', '/api/iam/users', {
        username: 'would-be-platform-admin',
        password: 'Whatever123!',
        role: 'PLATFORM_ADMIN',
      }),
    ).toBe(400);
  });

  test('(create) an administrator creates a user from the Users screen', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
    await openApp(page);

    const username = 'e2e-created-by-ui';
    const admin = await login(ADMIN.username, ADMIN.password);
    await statusAs(admin, 'DELETE', `/api/iam/users/${username}`);

    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, ADMIN);

    await openUsersScreen(page, ft);

    await ft
      .click('#btnNewUser')
      .waitOnElementToBecomeVisible('#newUserUsername')
      .click('#newUserUsername')
      .typeText(username)
      .click('#newUserPassword')
      .typeText('UiCreatedPassword123!')
      .click('#btnSaveNewUser')
      .waitOnElementToBecomeVisible(`#user-${username}`)
      // Roles are edited inline on the row — there is no separate Roles screen, and no Tenants
      // screen either: user administration is one table, reached from the signed-in user's menu.
      .elementShouldBeVisible(`#roleOf-${username}`);
  });

  test('(create) a user is created straight into groups, and an unknown group creates nobody', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const username = 'e2e-created-into-groups';
    const groupName = 'e2e-create-target';
    const groupId = await createGroup(admin, groupName);

    try {
      await statusAs(admin, 'DELETE', `/api/iam/users/${username}`);

      expect(
        [200, 201],
        'a viewer is created and placed in one call',
      ).toContain(
        await statusAs(admin, 'POST', '/api/iam/users', {
          username,
          password: 'CreatedIntoGroups123!',
          role: 'DASHBOARD_VIEWER',
          groupIds: [groupId],
        }),
      );

      const created = (await jsonAs(admin, '/api/iam/users')).find(
        (u: { username: string }) => u.username === username,
      );
      expect(
        created.groups.map((g: { name: string }) => g.name),
        'the membership is part of creating them, not a second screen afterwards',
      ).toEqual([groupName]);

      // The other half, and the reason the ids are checked before anything is written: a viewer
      // created into a group that does not exist is a person with a password and no way in — and
      // whoever typed the id would be told nothing.
      const orphan = 'e2e-created-by-a-bad-group';
      await statusAs(admin, 'DELETE', `/api/iam/users/${orphan}`);

      expect(
        await statusAs(admin, 'POST', '/api/iam/users', {
          username: orphan,
          password: 'CreatedIntoGroups123!',
          role: 'DASHBOARD_VIEWER',
          groupIds: [999999],
        }),
      ).toBe(400);

      expect(
        (await jsonAs(admin, '/api/iam/users')).some((u: { username: string }) => u.username === orphan),
        'and nobody was created',
      ).toBe(false);
    } finally {
      await statusAs(admin, 'DELETE', `/api/iam/users/${username}`);
      await deleteGroup(admin, groupId);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § Everyday Tasks — one test per row of the documented list
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Auth — Server: everyday tasks', () => {

  test('(everyday) Reset Password — a new password works, without knowing the old one', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const username = 'e2e-password-reset';

    await createUser(admin, username, 'FirstPassword123!', 'JOB_OPERATOR');

    expect(
      await statusAs(admin, 'PUT', `/api/iam/users/${username}/password`, {
        password: 'SecondPassword123!',
      }),
    ).toBe(200);

    expect((await loginStatus(username, 'SecondPassword123!')).code, 'the new password signs in').toBe(200);
    expect((await loginStatus(username, 'FirstPassword123!')).code, 'the old one no longer does').toBe(401);
  });

  test('(everyday) Change role — the change takes effect on the next screen they load', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const username = 'e2e-role-change';

    await createUser(admin, username, 'RolePassword123!', 'JOB_OPERATOR');

    // As an operator, authoring is closed.
    expect(
      await statusAs(await login(username, 'RolePassword123!'), 'POST', '/api/dsl/chart/parse', {
        dslCode: 'chart {}',
      }),
    ).toBe(403);

    expect(
      await statusAs(admin, 'PUT', `/api/iam/users/${username}/role`, { role: 'REPORT_AUTHOR' }),
    ).toBe(200);

    // The same person, one role later, may author.
    expect(
      await statusAs(await login(username, 'RolePassword123!'), 'POST', '/api/dsl/chart/parse', {
        dslCode: 'chart {}',
      }),
      'the new role applies to the next session',
    ).toBe(200);
  });

  test('(everyday) Disable — stops them signing in, and keeps the account intact', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const username = 'e2e-disabled';

    await createUser(admin, username, 'DisablePassword123!', 'JOB_OPERATOR');

    expect(await statusAs(admin, 'POST', `/api/iam/users/${username}/disable`)).toBe(200);
    expect((await loginStatus(username, 'DisablePassword123!')).code).toBe(401);

    const users = await jsonAs(admin, '/api/iam/users');
    expect(
      users.find((u: { username: string }) => u.username === username),
      'disabling is not deleting — the account is still there',
    ).toBeTruthy();
  });

  test('(everyday) Enable — lets a disabled account back in, with the role it had', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const username = 'e2e-re-enabled';

    await createUser(admin, username, 'EnablePassword123!', 'REPORT_AUTHOR');
    await statusAs(admin, 'POST', `/api/iam/users/${username}/disable`);
    expect((await loginStatus(username, 'EnablePassword123!')).code).toBe(401);

    expect(await statusAs(admin, 'POST', `/api/iam/users/${username}/enable`)).toBe(200);

    const me = (await getMe(await login(username, 'EnablePassword123!')).then((r) =>
      r.json(),
    )) as Identity;
    expect(me.roles, 'the role and memberships were never touched').toContain('REPORT_AUTHOR');
  });

  test('(everyday) your own row cannot change your role, disable you or delete you', async ({
    page,
  }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
    await openApp(page);

    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, ADMIN);

    // Searched, not scrolled: the table pages at five and this suite creates far more users than
    // that, so an unsearched row is on whichever page the alphabet put it.
    await openUsersScreenFilteredTo(page, ft, ADMIN.username);

    await ft
      // Switched off on your own row — the simplest way to keep the last administrator from
      // locking everyone out of the server.
      .elementShouldBeDisabled(`#roleOf-${ADMIN.username}`)
      .elementShouldNotBeVisible(`#btnDisableUser-${ADMIN.username}`)
      .elementShouldNotBeVisible(`#btnDeleteUser-${ADMIN.username}`);

    // The other half — that these same controls DO work on somebody else's row — is the four
    // (everyday-ui) tests further down, each of which presses one of them and checks the outcome.
    //
    // NOTE: this is a UI guarantee only. There is no equivalent check in UsersController or
    // IamService, so DELETE /api/iam/users/<your-own-name> still succeeds. Asserting the API rule
    // would mean asserting a rule that does not exist yet.
  });

  test('(everyday) Delete — removes the account for good', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const username = 'e2e-deleted';

    await createUser(admin, username, 'DeletePassword123!', 'JOB_OPERATOR');

    expect(await statusAs(admin, 'DELETE', `/api/iam/users/${username}`)).toBe(200);
    expect((await loginStatus(username, 'DeletePassword123!')).code).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § Everyday Tasks, from the row — "All of these are on the row of the person
//   concerned, in your name → Users"
// ═══════════════════════════════════════════════════════════════════════════
//
// The § above proves each task works. These prove the CONTROL that performs it
// works — the two are not the same thing, and a row whose button is wired to the
// wrong username, or whose confirmation never resolves, passes every API test.
//
test.describe('Auth — Server: the row controls on the Users screen', () => {

  test('(everyday-ui) Change role — from the picker on their row', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

    const admin = await login(ADMIN.username, ADMIN.password);
    const username = 'e2e-ui-role-change';
    await createUser(admin, username, 'UiRolePassword123!', 'JOB_OPERATOR');

    await openApp(page);
    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, ADMIN);
    await openUsersScreenFilteredTo(page, ft, username);

    // A <select>, so it is driven as one — still addressed by id.
    await page.locator(`#roleOf-${username}`).selectOption('REPORT_AUTHOR');

    await expect
      .poll(() => roleOf(admin, username), { timeout: 10_000 })
      .toBe('REPORT_AUTHOR');
  });

  test('(everyday-ui) Disable, then Enable — from their row', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

    const admin = await login(ADMIN.username, ADMIN.password);
    const username = 'e2e-ui-disable';
    const password = 'UiDisablePassword123!';
    await createUser(admin, username, password, 'JOB_OPERATOR');

    await openApp(page);
    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, ADMIN);
    await openUsersScreenFilteredTo(page, ft, username);

    await ft.waitOnElementToContainText(`#statusOf-${username}`, 'Active');

    // Disabling asks first — "They will no longer be able to sign in".
    await ft.click(`#btnDisableUser-${username}`).clickYesDoThis();

    // Both halves of what Disable means: the row says so, and the person cannot get in.
    await ft.waitOnElementToContainText(`#statusOf-${username}`, 'Disabled');
    await expect.poll(() => loginStatus(username, password).then((r) => r.code), {
      timeout: 10_000,
    }).toBe(401);

    // The row swaps Disable for Enable, which is the way back. Enabling asks nothing.
    await ft.waitOnElementToBecomeVisible(`#btnEnableUser-${username}`).click(`#btnEnableUser-${username}`);

    await ft.waitOnElementToContainText(`#statusOf-${username}`, 'Active');
    await expect.poll(() => loginStatus(username, password).then((r) => r.code), {
      timeout: 10_000,
    }).toBe(200);
  });

  test('(everyday-ui) Reset Password — from their row', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

    const admin = await login(ADMIN.username, ADMIN.password);
    const username = 'e2e-ui-password';
    await createUser(admin, username, 'UiFirstPassword123!', 'JOB_OPERATOR');

    await openApp(page);
    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, ADMIN);
    await openUsersScreenFilteredTo(page, ft, username);

    await ft
      .click(`#btnResetPassword-${username}`)
      .waitOnElementToBecomeVisible('#resetPasswordValue')
      .click('#resetPasswordValue')
      .typeText('UiSecondPassword123!')
      .click('#btnSaveResetPassword');

    await expect.poll(() => loginStatus(username, 'UiSecondPassword123!').then((r) => r.code), {
      timeout: 10_000,
    }).toBe(200);
    expect((await loginStatus(username, 'UiFirstPassword123!')).code, 'the old one is gone').toBe(401);
  });

  test('(everyday-ui) Delete — from their row', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

    const admin = await login(ADMIN.username, ADMIN.password);
    const username = 'e2e-ui-delete';
    const password = 'UiDeletePassword123!';
    await createUser(admin, username, password, 'JOB_OPERATOR');

    await openApp(page);
    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, ADMIN);
    await openUsersScreenFilteredTo(page, ft, username);

    // "This cannot be undone" — so it asks.
    await ft.click(`#btnDeleteUser-${username}`).clickYesDoThis();

    await ft.waitOnElementToBecomeInvisible(`#user-${username}`);
    expect((await loginStatus(username, password)).code, 'the account is gone for good').toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § Finding people — "the search box matches on name, email address and role"
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Auth — Server: searching and paging the Users screen', () => {

  test('(users-list) the search box matches on name, email address and role', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

    const admin = await login(ADMIN.username, ADMIN.password);

    // One person to find by each of the three fields, and one who must NOT come back with them.
    const wanted = 'e2e-findable';
    const other = 'e2e-not-findable';
    await createUser(admin, wanted, 'FindPassword123!', 'REPORT_AUTHOR', 'maria@example.com');
    await createUser(admin, other, 'OtherPassword123!', 'JOB_OPERATOR');

    await openApp(page);
    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, ADMIN);

    await openUsersScreen(page, ft);

    // ── by name ──
    await ft
      .click('#userSearch')
      .typeText('findable')
      .waitOnElementToBecomeVisible(`#user-${wanted}`);

    // ── by email address — "who is maria@…?" ──
    await ft
      .click('#btnClearUserSearch')
      .click('#userSearch')
      .typeText('maria@')
      .waitOnElementToBecomeVisible(`#user-${wanted}`)
      .elementShouldNotBeVisible(`#user-${other}`);

    // ── by role — "who are my administrators?" ──
    await ft
      .click('#btnClearUserSearch')
      .click('#userSearch')
      .typeText('REPORT_AUTHOR')
      .waitOnElementToBecomeVisible(`#user-${wanted}`)
      .elementShouldNotBeVisible(`#user-${other}`);
  });

  test('(users-list) searching and paging appear once the list grows past a page', async ({
    page,
  }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

    const admin = await login(ADMIN.username, ADMIN.password);

    // The table pages at five (configuration-users.component: pageSize = 5), and the controls are
    // rendered only when there is more than one page — "a three-user install sees none of it". Six
    // users of our own make the threshold certain rather than a side effect of what ran before.
    for (let i = 1; i <= 6; i++) {
      await createUser(admin, `e2e-paged-${i}`, `PagedPassword12${i}!`, 'JOB_OPERATOR');
    }

    await openApp(page);
    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, ADMIN);

    await openUsersScreen(page, ft);

    await ft
      // They "appear on their own" — nothing was switched on to get them.
      .elementShouldBeVisible('#userSearch')
      .elementShouldBeVisible('#usersPageSummary')
      .elementShouldBeVisible('#btnUsersNextPage')
      .elementShouldBeVisible('#usersPageSize')
      // The first page cannot go back, which is what says the pager knows where it is.
      .elementShouldBeDisabled('#btnUsersPrevPage')
      .click('#btnUsersNextPage')
      .waitOnElementToBecomeEnabled('#btnUsersPrevPage');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § Who Is Allowed To Do What — what each role SEES
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Auth — Server: the menus follow the role', () => {

  // Every role gets BOTH halves. A test that only checks what is hidden passes just as well on an
  // application that renders nothing at all; a test that only checks what is shown passes on one
  // that shows everything to everybody. The pair is what pins the row of the documented table.

  test('(menus) an ADMIN is shown administration, configuration and authoring', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
    await openApp(page);

    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, ADMIN);

    await ft
      .elementShouldBeVisible('#topMenuConfiguration')
      .click('#userMenu')
      .elementShouldBeVisible('#btnNavSectionUsers');

    // "Only an ADMIN sees the Users and Connections screens at all" — the second half of that
    // sentence, one level down in the Configuration area. The menu is closed first: its panel is
    // held open by focus and covers the top-right of every screen underneath it.
    await closeUserMenu(page);

    await ft
      .hover('#topMenuConfiguration')
      .click('#topMenuConfiguration')
      .hover('#topConfigurationCrud')
      .click('#topConfigurationCrud')
      .waitOnElementToBecomeVisible('#btnNavSectionConnections');
  });

  test('(menus) a REPORT_AUTHOR is shown configuration and authoring, but no administration', async ({
    page,
  }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
    await openApp(page);

    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, AUTHOR);

    await ft
      // Shown: building things is what the role is for.
      .elementShouldBeVisible('#topMenuConfiguration')
      // Hidden: users are somebody else's job.
      .click('#userMenu')
      .elementShouldNotBeVisible('#btnNavSectionUsers');

    // And Connections with them — an author uses a connection without ever seeing the screen that
    // holds its credentials.
    await closeUserMenu(page);

    await ft
      .hover('#topMenuConfiguration')
      .click('#topMenuConfiguration')
      .hover('#topConfigurationCrud')
      .click('#topConfigurationCrud')
      .elementShouldNotBeVisible('#btnNavSectionConnections');
  });

  test('(menus) a JOB_OPERATOR is shown the Processing screens only', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
    await openApp(page);

    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, OPERATOR);

    await ft
      // Shown: what an operator came for.
      .elementShouldBeVisible('#topMenuBurst')
      // Hidden — "not hidden behind a warning, simply not in their menu".
      .elementShouldNotBeVisible('#topMenuConfiguration')
      .elementShouldNotBeVisible('#btnNewDropdown')
      .click('#userMenu')
      .elementShouldNotBeVisible('#btnNavSectionUsers');
  });

  test('(menus) a JOB_OPERATOR who deep-links to Connections lands on Processing instead', async ({
    page,
  }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
    await openApp(page);

    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, OPERATOR);

    // The other two roles are asked about Connections by opening the screen that holds it. An operator
    // has no Configuration menu to open, so the only way to ask is the way a bookmark would — by URL.
    // CapabilityGuard answers it: `viewConfiguration` is false for this role, so the navigation is
    // turned into a redirect to Processing rather than to the login screen, because the session is
    // perfectly good. The `#` is there because the app routes on the hash (withHashLocation).
    await page.goto(`${APP_URL}/#/configuration-crud/connections`);
    await page.waitForURL(/processing/, { timeout: 30_000 });

    await ft
      .waitOnElementToBecomeVisible('#topMenuBurst')
      // Not the Connections screen — and not the configuration area at all.
      .elementShouldNotBeVisible('#btnNavSectionConnections')
      .elementShouldNotBeVisible('#btnNavSectionReports');
  });

  test('(menus) a DASHBOARD_VIEWER is shown the way to the AI Hub and nothing else', async ({
    page,
  }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
    await openApp(page);

    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, VIEWER);

    await ft
      // Shown: where their dashboards actually are. This application is not where a viewer works, so
      // the one thing it owes them is the address of the place that is — an empty screen would read
      // as an account somebody had broken.
      .waitOnElementToBecomeVisible('#dashboardsOnlyNotice')
      .elementShouldContainText('#dashboardsOnlyNotice', 'AI Hub')
      // Hidden: not behind a warning, simply not in their menu.
      .elementShouldNotBeVisible('#topMenuBurst')
      .elementShouldNotBeVisible('#topMenuConfiguration')
      .click('#userMenu')
      .elementShouldNotBeVisible('#btnNavSectionUsers');

    // And a bookmark somebody sent them lands on the same notice, rather than on a screen whose every
    // call the server would refuse. The capability decides this, not the route.
    await closeUserMenu(page);
    await page.goto(`${APP_URL}/#/configuration-crud/connections`);

    await ft
      .waitOnElementToBecomeVisible('#dashboardsOnlyNotice')
      .elementShouldNotBeVisible('#btnNavSectionConnections');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// § Groups — where limits and dashboard grants are written
// ═══════════════════════════════════════════════════════════════════════════

/** The Groups tab has no id of its own; it is the second tab of the Users screen, by its heading. */
const GROUPS_TAB = 'button[role="tab"]:has-text("Groups")';

test.describe('Auth — Server: groups', () => {

  test('(groups) an ADMIN creates, renames and deletes a group, and a duplicate name is refused', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const groupId = await createGroup(admin, 'e2e-crud-group', {
      settings: { connections: [SAMPLE_CONNECTION] },
    });
    let second: number | undefined;

    try {
      const created = (await listGroups(admin)).find((g) => g.id === groupId);
      expect(created.name).toBe('e2e-crud-group');
      expect(
        created.settings.connections,
        'a group is created with its limits, not created and then limited',
      ).toEqual([SAMPLE_CONNECTION]);

      await updateGroup(admin, groupId, { name: 'e2e-crud-group-renamed' });
      expect(
        (await listGroups(admin)).find((g) => g.id === groupId).name,
        'renaming a group keeps the group — the members and their limits are unchanged',
      ).toBe('e2e-crud-group-renamed');

      // A name is how an admin tells two groups apart in every picker in the product, so two groups
      // may not share one. 409 and not 400: the request is well formed, the tenant is not.
      second = await createGroup(admin, 'e2e-crud-group-other');
      expect(
        await statusAs(admin, 'PUT', `/api/iam/groups/${second}`, { name: 'e2e-crud-group-renamed' }),
        'and a rename onto a name that is taken is refused as well',
      ).toBe(409);

      const duplicate = await fetch(`${BASE_URL}/api/iam/groups`, {
        method: 'POST',
        headers: { Cookie: admin, ...xsrfHeader(admin), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'e2e-crud-group-renamed' }),
      });
      expect(duplicate.status, 'a second group of the same name is refused').toBe(409);

      expect(await statusAs(admin, 'DELETE', `/api/iam/groups/${groupId}`), 'and an empty group goes').toBe(204);
      expect(
        (await listGroups(admin)).some((g) => g.id === groupId),
        'really goes — the listing is the same one every picker reads',
      ).toBe(false);
    } finally {
      if (second !== undefined) await deleteGroup(admin, second);
      await statusAs(admin, 'DELETE', `/api/iam/groups/${groupId}`);
    }
  });

  test('(groups) a group that still has members cannot be deleted, and can once it is empty', async () => {
    // Deleting a group changes what its members may do, and nothing on the screen would say so. The
    // refusal is what turns that into a decision somebody makes on purpose.
    const admin = await login(ADMIN.username, ADMIN.password);
    const member = { username: 'e2e-group-member', password: 'E2eGroupMemberPass123!' };
    const groupId = await createGroup(admin, 'e2e-group-with-members');

    try {
      await createUser(admin, member.username, member.password, 'REPORT_AUTHOR');
      await setUserGroups(admin, member.username, [groupId]);

      expect(
        await statusAs(admin, 'DELETE', `/api/iam/groups/${groupId}`),
        'a group somebody is in is not deleted by accident',
      ).toBe(409);
      expect(
        (await listGroups(admin)).some((g) => g.id === groupId),
        'and it is still there afterwards',
      ).toBe(true);

      await setUserGroups(admin, member.username, []);
      expect(
        await statusAs(admin, 'DELETE', `/api/iam/groups/${groupId}`),
        'once it is empty, deleting it takes nothing away from anybody',
      ).toBe(204);
    } finally {
      await statusAs(admin, 'DELETE', `/api/iam/users/${member.username}`);
      await statusAs(admin, 'DELETE', `/api/iam/groups/${groupId}`);
    }
  });

  test('(groups) only an ADMIN manages groups', async () => {
    // A group is what limits an author and what a viewer's dashboards come from. An author who could
    // edit groups would be an author who could lift their own limits, so this is the guard the whole
    // feature rests on — asked of every endpoint, not only of the one that writes.
    const admin = await login(ADMIN.username, ADMIN.password);
    const groupId = await createGroup(admin, 'e2e-admins-only');

    try {
      for (const who of [AUTHOR, OPERATOR, VIEWER]) {
        const cookie = await login(who.username, who.password);

        expect(await statusAs(cookie, 'GET', '/api/iam/groups'), `${who.username} lists groups`).toBe(403);
        expect(
          await statusAs(cookie, 'POST', '/api/iam/groups', { name: `e2e-${who.username}-should-not` }),
          `${who.username} creates a group`,
        ).toBe(403);
        expect(
          await statusAs(cookie, 'PUT', `/api/iam/groups/${groupId}`, { name: 'e2e-taken-over' }),
          `${who.username} edits a group`,
        ).toBe(403);
        expect(
          await statusAs(cookie, 'DELETE', `/api/iam/groups/${groupId}`),
          `${who.username} deletes a group`,
        ).toBe(403);
        expect(
          await statusAs(cookie, 'PUT', `/api/iam/users/${who.username}/groups`, { groupIds: [groupId] }),
          `${who.username} puts themselves in one`,
        ).toBe(403);
      }

      const group = (await listGroups(admin)).find((g) => g.id === groupId);
      expect(group, 'and after all of that the group is untouched').toBeTruthy();
      expect(group.name).toBe('e2e-admins-only');
      expect(group.members, 'with nobody in it').toEqual([]);
    } finally {
      await deleteGroup(admin, groupId);
    }
  });

  test('(groups-ui) an ADMIN creates a limiting group from the Groups tab, and puts a user in it from Edit User', async ({
    page,
  }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // The whole screen, in the order an administrator meets it: make the group, tick what it allows,
    // then open the person and put them in it. The connection has to exist first — the dialog lists
    // the database connections there are, and a list with nothing in it would let this test pass
    // while the ticking did nothing.
    const admin = await login(ADMIN.username, ADMIN.password);
    const member = { username: 'e2e-groups-ui-author', password: 'E2eGroupsUiPassword123!' };
    const connectionName = 'Groups Ui Northwind';
    const connectionCode = 'db-groups-ui-northwind-sqlite';
    const groupName = 'e2e-groups-ui';

    await createUser(admin, member.username, member.password, 'REPORT_AUTHOR');
    const leftover = (await listGroups(admin)).find((g) => g.name === groupName);
    if (leftover) await deleteGroup(admin, leftover.id);

    await openApp(page);
    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, ADMIN);

    try {
      await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(ft, connectionName, 'sqlite');

      await openUsersScreen(page, ft);
      await ft
        .click(GROUPS_TAB)
        .waitOnElementToBecomeVisible('#btnNewGroup')
        .click('#btnNewGroup')
        .waitOnElementToBecomeVisible('#groupDialog')
        .elementShouldBeDisabled('#btnSaveGroup')
        .click('#groupName')
        .typeText(groupName)
        // Limits are off until somebody turns them on: a new group grants what it always granted.
        .click('#groupLimitsEnabled')
        .click('#groupConnectionsSome')
        .click(`#groupConnection-${connectionCode}`)
        // "May run scripts" is on by default — this group is the one that says no.
        .click('#groupScripts')
        .waitOnElementToBecomeVisible('#groupScriptsNote')
        .click('#btnSaveGroup')
        .waitOnElementToBecomeInvisible('#groupDialog')
        .waitOnElementWithTextToBecomeVisible(groupName);

      const groupId = (await listGroups(admin)).find((g) => g.name === groupName).id;

      await openUsersScreenFilteredTo(page, ft, member.username);
      await ft
        .click(`#btnEditUser-${member.username}`)
        .waitOnElementToBecomeVisible('#editUserDialog')
        .click(`#userGroup-${groupId}`)
        .click('#btnSaveUser')
        .waitOnElementToBecomeInvisible('#editUserDialog')
        // The Groups column is the answer to "who is in this group", read from the same listing the
        // server decides with.
        .elementShouldContainText(`#groupsOf-${member.username}`, groupName);

      await ft
        .click(`#btnEditUser-${member.username}`)
        .waitOnElementToBecomeVisible('#editUserDialog')
        // Effective limits, not the group's settings: what this person may actually do, which is the
        // question somebody opening this dialog is asking. By code, because a code is what a limit is
        // written with and what every refusal names.
        .elementShouldContainText('#editUserEffectiveLimits', connectionCode)
        .elementShouldContainText('#editUserEffectiveLimits', 'Scripts: off')
        .click('#btnCancelUser');
    } finally {
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(ft, `${connectionCode}\\.xml`, 'sqlite');
      await statusAs(admin, 'DELETE', `/api/iam/users/${member.username}`);
      const created = (await listGroups(admin)).find((g) => g.name === groupName);
      if (created) await deleteGroup(admin, created.id);
    }
  });

  test('(groups-ui) an ADMIN grants dashboards and a default from the group dialog', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // The other half of the same dialog, and the only place a viewer's dashboards are decided. A
    // viewer is used as the member because "Opens on" is shown for that role alone — it is the one
    // role whose whole session is the dashboard it lands on.
    const admin = await login(ADMIN.username, ADMIN.password);
    const groupName = 'e2e-groups-ui-dashboards';
    const leftover = (await listGroups(admin)).find((g) => g.name === groupName);
    if (leftover) await deleteGroup(admin, leftover.id);

    await openApp(page);
    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, ADMIN);

    try {
      await openUsersScreen(page, ft);
      await ft
        .click(GROUPS_TAB)
        .waitOnElementToBecomeVisible('#btnNewGroup')
        .click('#btnNewGroup')
        .waitOnElementToBecomeVisible('#groupDialog')
        .click('#groupName')
        .typeText(groupName)
        .click(`#groupDashboard-${SAMPLE_DASHBOARD}`)
        .click(`#groupDashboard-${PIVOT_DASHBOARD}`)
        // The default is chosen from what this group grants, so the radio only appears once the box
        // above it is ticked.
        .click(`#groupDefaultDashboard-${PIVOT_DASHBOARD}`)
        .click('#btnSaveGroup')
        .waitOnElementToBecomeInvisible('#groupDialog');

      const saved = (await listGroups(admin)).find((g) => g.name === groupName);
      expect(saved.dashboards.sort(), 'both ticked dashboards are granted').toEqual(
        [SAMPLE_DASHBOARD, PIVOT_DASHBOARD].sort(),
      );
      expect(saved.defaultDashboard, 'and the one picked is where its members land').toBe(PIVOT_DASHBOARD);

      await setUserGroups(admin, VIEWER.username, [saved.id]);
      // "Opens on" puts a name on the report id, so the name is read from the same catalogue the
      // screen reads rather than assumed to be the id.
      const pivotName =
        (await myDashboards(admin)).dashboards.find((d) => d.id === PIVOT_DASHBOARD)?.name ??
        PIVOT_DASHBOARD;

      await openUsersScreenFilteredTo(page, ft, VIEWER.username);
      await ft
        .click(`#btnEditUser-${VIEWER.username}`)
        .waitOnElementToBecomeVisible('#editUserDialog')
        .elementShouldContainText('#editUserOpensOn', pivotName)
        .click('#btnCancelUser');
    } finally {
      await setUserGroups(admin, VIEWER.username, []);
      const created = (await listGroups(admin)).find((g) => g.name === groupName);
      if (created) await deleteGroup(admin, created.id);
    }
  });

  test('(report-grants-ui) an ADMIN grants reports to a group from the group dialog', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // The same dialog, one block lower: the reports this group hands its members. Two reports are
    // copied in first, because a picker with nothing in it would let the ticking do nothing and the
    // test pass anyway; two different samples, because the two rows must carry two different names
    // and the name is what Edit User prints.
    const admin = await login(ADMIN.username, ADMIN.password);
    const member = {
      username: 'e2e-report-grants-ui-operator',
      password: 'E2eReportGrantsUiPass123!',
    };
    const groupName = 'e2e-report-grants-ui';
    const sqlReport = 'e2e-grants-ui-sql';
    const fileReport = 'e2e-grants-ui-file';

    await copySampleReport(admin, SQL_SAMPLE, sqlReport);
    await copySampleReport(admin, FILE_SAMPLE, fileReport);
    await createUser(admin, member.username, member.password, 'JOB_OPERATOR');
    const leftover = (await listGroups(admin)).find((g) => g.name === groupName);
    if (leftover) await deleteGroup(admin, leftover.id);

    // The names the screen prints, read from the catalogue the screen itself is built from rather
    // than guessed from the ids.
    const catalogue: { id: string; name: string }[] = await jsonAs(admin, '/api/iam/reports');
    const nameOf = (id: string) => catalogue.find((report) => report.id === id)?.name ?? id;

    await openApp(page);
    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, ADMIN);

    try {
      await openUsersScreen(page, ft);
      await ft
        .click(GROUPS_TAB)
        .waitOnElementToBecomeVisible('#btnNewGroup')
        .click('#btnNewGroup')
        .waitOnElementToBecomeVisible('#groupDialog')
        .click('#groupName')
        .typeText(groupName)
        // Nothing is ticked to begin with, and that is the default this design turns on its head: a
        // group that names no report hands its members every report. The note beside the boxes is
        // the only place an administrator is told so.
        .elementCheckBoxShouldNotBeSelected(`#groupReport-${sqlReport}`)
        .waitOnElementToBecomeVisible('#groupReportsNote')
        .click(`#groupReport-${sqlReport}`)
        .click(`#groupReport-${fileReport}`)
        .click('#btnSaveGroup')
        .waitOnElementToBecomeInvisible('#groupDialog')
        .waitOnElementWithTextToBecomeVisible(groupName);

      const saved = (await listGroups(admin)).find((g) => g.name === groupName);
      expect(saved.reports.sort(), 'both ticked reports are granted').toEqual(
        [sqlReport, fileReport].sort(),
      );

      // Reopened: the ticks come back from the server, not from what the dialog happened to remember.
      await ft
        .click(`#btnEditGroup-${saved.id}`)
        .waitOnElementToBecomeVisible('#groupDialog')
        .elementCheckBoxShouldBeSelected(`#groupReport-${sqlReport}`)
        .elementCheckBoxShouldBeSelected(`#groupReport-${fileReport}`)
        .click('#btnCancelGroup');

      await setUserGroups(admin, member.username, [saved.id]);
      await openUsersScreenFilteredTo(page, ft, member.username);
      await ft
        .click(`#btnEditUser-${member.username}`)
        .waitOnElementToBecomeVisible('#editUserDialog')
        // Effective reports, by name, and not the group's grants: what this person may actually
        // open is the question somebody opening this dialog is asking.
        .elementShouldContainText('#editUserEffectiveReports', nameOf(sqlReport))
        .elementShouldContainText('#editUserEffectiveReports', nameOf(fileReport))
        .click('#btnCancelUser');
    } finally {
      await statusAs(admin, 'DELETE', `/api/iam/users/${member.username}`);
      const created = (await listGroups(admin)).find((g) => g.name === groupName);
      if (created) await deleteGroup(admin, created.id);
      for (const reportId of [sqlReport, fileReport])
        await statusAs(admin, 'DELETE', `/api/reports/${reportId}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § run-sql, and what a group's limits do to an author
// ═══════════════════════════════════════════════════════════════════════════
//
// Two throwaway SQLite connections, both pointing at the shipped Northwind sample: one a group will
// allow, one it will not. Nothing here runs against `eml-contact` — an email connection cannot
// answer SQL — but it is asked about, because the connections an author may see has to include
// the ones no group ever mentions.
//
// The names carry no digits on purpose: a connection's code is `db-<kebabCase(name)>-<vendor>`, and
// kebabCase would split "Limits 1" into `limits-1`, which is not what a reader of the name expects.

const ALLOWED_CONNECTION_NAME = 'Limits Allowed';
const ALLOWED_CONNECTION = 'db-limits-allowed-sqlite';
const BLOCKED_CONNECTION_NAME = 'Limits Blocked';
const BLOCKED_CONNECTION = 'db-limits-blocked-sqlite';

/** The sample database every SQLite connection in the suite reads, as the file browser writes it. */
const NORTHWIND_DB = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-sqlite/northwind.db`;

/**
 * Create a SQLite connection through the API an administrator's Save uses.
 *
 * The CRUD test drives the same save through the screen, which is where that promise belongs. Here a
 * connection is scaffolding for a question about limits, and a browser round trip per connection
 * would add two screens' worth of ways to fail to a REST-only block.
 */
async function createSqliteConnection(admin: string, name: string, code: string) {
  const status = await statusAs(admin, 'PUT', `/api/connections/${code}`, {
    connection: {
      code,
      name,
      default: false,
      databaseserver: { type: 'sqlite', database: NORTHWIND_DB },
    },
  });
  expect(status, `creating the connection ${code}`).toBe(200);
}

/** Ad-hoc SQL as a given person: the whole answer, because a refusal is in the body. */
async function runSql(cookie: string, connectionId: string, sql: string) {
  const res = await fetch(`${BASE_URL}/api/queries/run-sql`, {
    method: 'POST',
    headers: { Cookie: cookie, ...xsrfHeader(cookie), 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, sql }),
  });
  return { status: res.status, body: await res.json() };
}

/** How many orders the sample has right now — the number every "nothing was changed" check reads. */
async function orderCount(cookie: string, connectionId: string): Promise<number> {
  const { body } = await runSql(cookie, connectionId, 'SELECT COUNT(*) AS n FROM Orders');
  expect(body.error, 'counting the rows must itself work').toBeUndefined();
  return Number(Object.values(body.data[0])[0]);
}

/**
 * One call as one person, whole: status, text and parsed body.
 *
 * The journey tests below assert what came back, never merely a 2xx, and a refusal is a sentence —
 * so both halves need the answer itself, not the status `statusAs` returns.
 */
async function answerAs(cookie: string, method: string, urlPath: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers: {
      Cookie: cookie,
      ...xsrfHeader(cookie),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, text, json };
}

/** How many cells a pivot answered with, whichever of its two shapes it used. */
function pivotCellCount(answer: any): number {
  const data = answer?.data ?? answer;
  if (Array.isArray(data)) return data.reduce((n: number, row: any) => n + Object.keys(row ?? {}).length, 0);
  return data && typeof data === 'object' ? Object.keys(data).length : 0;
}

/** The chart DSL the server's parser really accepts — the shape the JUnit journey proved. */
const CHART_DSL = [
  'chart {',
  "  type 'bar'",
  '  data {',
  "    labelField 'Country'",
  '    datasets {',
  '      dataset {',
  "        field 'CustomerID'",
  "        label 'Customers'",
  '      }',
  '    }',
  '  }',
  '}',
].join('\n');

test.describe('Auth — Server: run-sql and author limits', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    await createSqliteConnection(admin, ALLOWED_CONNECTION_NAME, ALLOWED_CONNECTION);
    await createSqliteConnection(admin, BLOCKED_CONNECTION_NAME, BLOCKED_CONNECTION);
  });

  test.afterAll(async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    await statusAs(admin, 'DELETE', `/api/connections/${ALLOWED_CONNECTION}`);
    await statusAs(admin, 'DELETE', `/api/connections/${BLOCKED_CONNECTION}`);
  });

  test('(run-sql) a SELECT answers rows, for an author and an ADMIN alike', async () => {
    // The permitted half of everything below. The guard added in front of run-sql reads every
    // statement, so the first thing to pin is that ordinary SQL still comes back with data.
    for (const who of [AUTHOR, ADMIN]) {
      const { status, body } = await runSql(
        await login(who.username, who.password),
        ALLOWED_CONNECTION,
        'SELECT ShipCountry FROM Orders ORDER BY OrderID LIMIT 3',
      );

      expect(status, `run-sql answers ${who.username}`).toBe(200);
      expect(body.error, 'and answers with rows, not with a refusal').toBeUndefined();
      expect(body.rowCount).toBe(3);
      expect(Object.keys(body.data[0]), 'the columns asked for are the columns returned').toContain(
        'ShipCountry',
      );
    }

    // A WITH query is a SELECT with a preamble, and explorations lean on it — it must not be read as
    // "a statement that is not SELECT".
    const { body } = await runSql(
      await login(AUTHOR.username, AUTHOR.password),
      ALLOWED_CONNECTION,
      'WITH c AS (SELECT ShipCountry FROM Orders) SELECT COUNT(*) AS n FROM c',
    );
    expect(body.error, 'a common table expression is still a read').toBeUndefined();
    expect(body.rowCount).toBe(1);
  });

  test('(run-sql) even an ADMIN cannot change data through run-sql', async () => {
    // Not a role question: there is no role this endpoint executes a write for. An ADMIN is used
    // precisely because they are the caller nothing else stops — if the refusal came from a role
    // check rather than from the statement, this test would go green for the wrong reason.
    const admin = await login(ADMIN.username, ADMIN.password);
    const before = await orderCount(admin, ALLOWED_CONNECTION);

    const writes = [
      'DELETE FROM Orders',
      "UPDATE Orders SET ShipCountry = 'Nowhere'",
      'SELECT 1; DROP TABLE Orders',
      'WITH doomed AS (SELECT OrderID FROM Orders) DELETE FROM Orders',
    ];

    for (const sql of writes) {
      const { status, body } = await runSql(admin, ALLOWED_CONNECTION, sql);

      expect(status, `${sql} is refused in the body, the shape the SQL editor already renders`).toBe(200);
      expect(body.error, `${sql} is refused`).toBeTruthy();
      expect(
        body.error,
        'and the refusal says where it came from, so the author is not left guessing',
      ).toContain('not allowed in run-sql');
      expect(body.data, 'a refused statement returns nothing at all').toBeUndefined();
    }

    expect(
      await orderCount(admin, ALLOWED_CONNECTION),
      'and the table is exactly as it was — the guard refused before the database saw anything',
    ).toBe(before);
  });

  test('(limits) an author in no limiting group works as before', async () => {
    // The whole feature is opt-in. An author nobody has limited must not notice that limits exist.
    const author = await login(AUTHOR.username, AUTHOR.password);
    const codes = (await jsonAs(author, '/api/connections?type=database')).map(
      (c: { connectionCode: string }) => c.connectionCode,
    );

    expect(codes, 'both databases are theirs to use').toEqual(
      expect.arrayContaining([ALLOWED_CONNECTION, BLOCKED_CONNECTION]),
    );

    for (const code of [ALLOWED_CONNECTION, BLOCKED_CONNECTION])
      expect((await runSql(author, code, 'SELECT 1 AS one')).body.error).toBeUndefined();
  });

  test('(limits) a limited author uses only the connections their group allows', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const limited = { username: 'e2e-limited-author', password: 'E2eLimitedPassword123!' };
    const groupId = await createGroup(admin, 'e2e-allowed-only', {
      settings: { connections: [ALLOWED_CONNECTION] },
    });

    try {
      await createUser(admin, limited.username, limited.password, 'REPORT_AUTHOR');
      await setUserGroups(admin, limited.username, [groupId]);
      const author = await login(limited.username, limited.password);

      expect(
        (await runSql(author, ALLOWED_CONNECTION, 'SELECT 1 AS one')).body.error,
        'the allowed database answers exactly as it does for anybody else',
      ).toBeUndefined();
      expect(
        await statusAs(author, 'GET', `/api/queries/schema/${ALLOWED_CONNECTION}`),
        'and its schema loads, so the SQL editor can still help them write the query',
      ).toBe(200);

      expect(
        (await runSql(author, BLOCKED_CONNECTION, 'SELECT 1 AS one')).status,
        'the blocked one is a refusal, not an error rendered beside the SQL',
      ).toBe(403);
      expect(await statusAs(author, 'GET', `/api/queries/schema/${BLOCKED_CONNECTION}`)).toBe(403);

      const codes = (await jsonAs(author, '/api/connections?type=database')).map(
        (c: { connectionCode: string }) => c.connectionCode,
      );
      expect(codes, 'the list shows what they may use').toContain(ALLOWED_CONNECTION);
      expect(
        codes,
        'and does not show what they may not — a name they cannot use is a name they should not read',
      ).not.toContain(BLOCKED_CONNECTION);
      expect(
        (await jsonAs(author, '/api/connections')).map((c: { connectionCode: string }) => c.connectionCode),
        'a connection no group mentions is nobody\'s to lose: limits name what is allowed among databases',
      ).toContain(SAMPLE_CONNECTION);

      expect(
        await statusAs(author, 'GET', `/api/connections/${BLOCKED_CONNECTION}`),
        'and asking for it by name is refused too, not answered from the file',
      ).toBe(403);
    } finally {
      await statusAs(admin, 'DELETE', `/api/iam/users/${limited.username}`);
      await deleteGroup(admin, groupId);
    }
  });

  test('(limits) two groups add up', async () => {
    // Groups are additive, which is the only reading that makes "put them in another group" a way to
    // give somebody more. The opposite reading — an intersection — would make a second group a way to
    // take work away, silently.
    const admin = await login(ADMIN.username, ADMIN.password);
    const limited = { username: 'e2e-two-groups-author', password: 'E2eTwoGroupsPassword123!' };
    const first = await createGroup(admin, 'e2e-allows-allowed', {
      settings: { connections: [ALLOWED_CONNECTION] },
    });
    const second = await createGroup(admin, 'e2e-allows-blocked', {
      settings: { connections: [BLOCKED_CONNECTION] },
    });

    try {
      await createUser(admin, limited.username, limited.password, 'REPORT_AUTHOR');

      await setUserGroups(admin, limited.username, [first]);
      expect(
        (await runSql(await login(limited.username, limited.password), BLOCKED_CONNECTION, 'SELECT 1 AS one'))
          .status,
        'in one group only, the second database is out of reach',
      ).toBe(403);

      await setUserGroups(admin, limited.username, [first, second]);
      const author = await login(limited.username, limited.password);

      for (const code of [ALLOWED_CONNECTION, BLOCKED_CONNECTION])
        expect(
          (await runSql(author, code, 'SELECT 1 AS one')).body.error,
          `${code} is allowed by one of their groups, which is enough`,
        ).toBeUndefined();

      const codes = (await jsonAs(author, '/api/connections?type=database')).map(
        (c: { connectionCode: string }) => c.connectionCode,
      );
      expect(codes).toEqual(expect.arrayContaining([ALLOWED_CONNECTION, BLOCKED_CONNECTION]));
      expect(
        codes.filter((c: string) => c === ALLOWED_CONNECTION),
        'and a database two groups both allow is listed once',
      ).toHaveLength(1);
    } finally {
      await statusAs(admin, 'DELETE', `/api/iam/users/${limited.username}`);
      await deleteGroup(admin, first);
      await deleteGroup(admin, second);
    }
  });

  test('(limits) a limited author cannot point a report at a blocked connection', async () => {
    // The way round the SQL editor: never run the query yourself, save a report that runs it. The
    // datasource save is therefore checked with the same question the editor is.
    const admin = await login(ADMIN.username, ADMIN.password);
    const limited = { username: 'e2e-limited-reporter', password: 'E2eLimitedReporter123!' };
    const groupId = await createGroup(admin, 'e2e-reporter-allowed-only', {
      settings: { connections: [ALLOWED_CONNECTION] },
    });
    const reportId = 'e2e-limited-reporter-report';

    try {
      await createUser(admin, limited.username, limited.password, 'REPORT_AUTHOR');
      await setUserGroups(admin, limited.username, [groupId]);
      const author = await login(limited.username, limited.password);

      expect(
        [200, 201],
        'a limited author still authors reports — that is not what limits are about',
      ).toContain(await statusAs(author, 'POST', '/api/reports', { reportId, templateName: reportId }));

      const settings = await jsonAs(author, `/api/reports/${reportId}/datasource`);
      settings.report.datasource.sqloptions = {
        ...(settings.report.datasource.sqloptions ?? {}),
        conncode: BLOCKED_CONNECTION,
        query: 'SELECT ShipCountry FROM Orders',
      };

      expect(
        await statusAs(author, 'PUT', `/api/reports/${reportId}/datasource`, settings),
        'saving the report against a database they may not use is refused',
      ).toBe(403);

      settings.report.datasource.sqloptions.conncode = ALLOWED_CONNECTION;
      expect(
        await statusAs(author, 'PUT', `/api/reports/${reportId}/datasource`, settings),
        'and the same save against an allowed one goes through',
      ).toBe(200);

      // The other door into the same file: reporting.xml is where conncode lives on disk, so a write
      // to it through the filesystem API would be the datasource save with the check left out.
      const written = await fetch(
        `${BASE_URL}/api/system/fs/content?path=config/reports/${reportId}/reporting.xml`,
        {
          method: 'PUT',
          headers: { Cookie: author, ...xsrfHeader(author), 'Content-Type': 'text/plain' },
          body: '<documentburster/>',
        },
      );
      expect(written.status, 'writing the same file by hand is refused as well').toBe(403);
    } finally {
      await statusAs(admin, 'DELETE', `/api/reports/${reportId}`);
      await statusAs(admin, 'DELETE', `/api/iam/users/${limited.username}`);
      await deleteGroup(admin, groupId);
    }
  });

  // ── The journey, both halves (TODO 18) ───────────────────────────────────────────────────────
  //
  // The tests above each hold one door. These two walk the whole way between them, through the real
  // server, because JUnit drives the controllers directly: `@PreAuthorize` and the filter chain only
  // exist here. A check that fires in the middle of authoring is worse than one that refuses at the
  // start — half a report has been configured by then — so the positive half asserts every step
  // actually happened, and the negative half asserts that nothing was half-written afterwards.

  test('(journey) a limited author walks the whole authoring chain on an allowed connection', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    const admin = await login(ADMIN.username, ADMIN.password);
    const limited = { username: 'e2e-limited-author', password: 'E2eLimitedPassword123!' };
    const groupId = await createGroup(admin, 'e2e-journey-allowed-only', {
      settings: { connections: [ALLOWED_CONNECTION] },
    });
    const reportId = 'e2e-journey-report';
    const query = 'SELECT CustomerID, CompanyName, Country FROM Customers';

    try {
      await createUser(admin, limited.username, limited.password, 'REPORT_AUTHOR');
      await setUserGroups(admin, limited.username, [groupId]);
      const author = await login(limited.username, limited.password);

      // 1 — the list they open the morning on.
      const codes = (await jsonAs(author, '/api/connections?type=database')).map(
        (c: { connectionCode: string }) => c.connectionCode,
      );
      expect(codes, 'the connection their group allows is offered').toContain(ALLOWED_CONNECTION);
      expect(codes, 'and the one it does not is not').not.toContain(BLOCKED_CONNECTION);

      // 2 — the connection itself, its metadata and its schema.
      const connection = await answerAs(author, 'GET', `/api/connections/${ALLOWED_CONNECTION}`);
      expect(connection.status).toBe(200);
      expect(connection.json?.connection?.code, 'the connection they picked really opened').toBe(
        ALLOWED_CONNECTION,
      );

      const metadata = await answerAs(
        author,
        'GET',
        `/api/connections/${ALLOWED_CONNECTION}/metadata/er-diagram`,
      );
      expect(metadata.status, 'the metadata door answers them').toBe(200);
      expect(metadata.json, 'and answers with its own shape, not an empty body').toBeTruthy();

      const schema = await answerAs(author, 'GET', `/api/queries/schema/${ALLOWED_CONNECTION}`);
      expect(schema.status).toBe(200);
      expect(
        (schema.json?.tables ?? []).map((t: { tableName: string }) => t.tableName),
        'the schema really came from this database',
      ).toContain('Customers');

      // 3 — the four ways an author interrogates a database before writing anything.
      const rows = await runSql(author, ALLOWED_CONNECTION, query);
      expect(rows.body.error, 'run-sql is theirs to use').toBeUndefined();
      expect(rows.body.rowCount, 'and it comes back with rows, not an empty shell').toBeGreaterThan(0);
      expect(Object.keys(rows.body.data[0]), 'carrying the columns asked for').toContain('CompanyName');

      const chart = await answerAs(author, 'POST', '/api/dsl/chart/parse', {
        dslCode: CHART_DSL,
        connectionCode: ALLOWED_CONNECTION,
      });
      expect(chart.status).toBe(200);
      expect(chart.json?.options?.type, 'the DSL parsed into the chart it describes').toBe('bar');

      const explored = await answerAs(author, 'POST', '/api/analytics/explore', {
        connectionCode: ALLOWED_CONNECTION,
        tableName: 'Customers',
        fields: ['Country'],
      });
      expect(explored.status).toBe(200);
      expect(explored.text, 'the explore answered about the field it was asked about').toContain(
        'Country',
      );

      const pivotOfATable = await answerAs(author, 'POST', '/api/analytics/pivot', {
        connectionCode: ALLOWED_CONNECTION,
        tableName: 'Customers',
        rows: ['Country'],
        vals: ['CustomerID'],
        aggregatorName: 'Count',
      });
      expect(pivotOfATable.status).toBe(200);
      expect(pivotCellCount(pivotOfATable.json), 'a pivot with no cells is not a pivot').toBeGreaterThan(0);

      // 4 — the report itself, pointed at the connection they are allowed to use.
      expect(
        [200, 201],
        'a limited author still authors reports — that is not what limits are about',
      ).toContain(
        await statusAs(author, 'POST', '/api/reports', {
          reportId,
          templateName: reportId,
          capReportGenerationMailMerge: true,
        }),
      );

      const settings = await jsonAs(author, `/api/reports/${reportId}/datasource`);
      settings.report.datasource.type = 'ds.sqlquery';
      settings.report.datasource.sqloptions = {
        ...(settings.report.datasource.sqloptions ?? {}),
        conncode: ALLOWED_CONNECTION,
        query,
        idcolumn: 'CustomerID',
      };
      expect(
        await statusAs(author, 'PUT', `/api/reports/${reportId}/datasource`, settings),
        'pointing their report at their own connection goes through',
      ).toBe(200);
      expect(
        (await jsonAs(author, `/api/reports/${reportId}/datasource`)).report?.datasource?.sqloptions
          ?.conncode,
        'and it reads back — the save really landed on disk',
      ).toBe(ALLOWED_CONNECTION);

      // 5 — its template.
      const template = await fetch(`${BASE_URL}/api/reports/${reportId}/template/html`, {
        method: 'PUT',
        headers: { Cookie: author, ...xsrfHeader(author), 'Content-Type': 'text/plain' },
        body: '<html><body>${CustomerID}</body></html>',
      });
      expect(template.status, 'saving the template of their own report').toBe(200);

      // 6 — running it, reading its data, and pivoting what it returned.
      const submitted = await answerAs(author, 'POST', '/api/jobs', { type: 'generate', reportId });
      expect([200, 202], 'their own report starts').toContain(submitted.status);
      expect(submitted.json?.jobId, 'an accepted job comes back with an id').toBeTruthy();

      const data = await answerAs(author, 'GET', `/api/reports/${reportId}/data`);
      expect(data.status).toBe(200);
      expect(
        data.json?.reportColumnNames,
        'the columns the report asked the database for are the columns that came back',
      ).toEqual(['CustomerID', 'CompanyName', 'Country']);
      expect((data.json?.data ?? []).length, 'a data door that answers with no rows').toBeGreaterThan(0);
      expect(
        String(data.json?.data?.[0]?.CompanyName ?? '').trim(),
        'the rows carry real values, not empty cells',
      ).not.toBe('');

      const pivotOfTheReport = await answerAs(author, 'POST', `/api/analytics/pivot?reportId=${reportId}`, {
        rows: ['Country'],
        vals: ['CustomerID'],
        aggregatorName: 'Count',
      });
      expect(pivotOfTheReport.status).toBe(200);
      expect(
        pivotCellCount(pivotOfTheReport.json),
        'pivoting the report they just built returned cells',
      ).toBeGreaterThan(0);
    } finally {
      await statusAs(admin, 'DELETE', `/api/reports/${reportId}`);
      await statusAs(admin, 'DELETE', `/api/iam/users/${limited.username}`);
      await deleteGroup(admin, groupId);
    }
  });

  test('(journey) the same chain on a connection the author\'s group does not allow is refused at every step, and the refusal names the connection', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    const admin = await login(ADMIN.username, ADMIN.password);
    const limited = { username: 'e2e-limited-author', password: 'E2eLimitedPassword123!' };
    const groupId = await createGroup(admin, 'e2e-journey-refused', {
      settings: { connections: [ALLOWED_CONNECTION] },
    });
    const reportId = 'e2e-journey-refused-report';
    const query = 'SELECT CustomerID, CompanyName, Country FROM Customers';

    try {
      await createUser(admin, limited.username, limited.password, 'REPORT_AUTHOR');
      await setUserGroups(admin, limited.username, [groupId]);
      const author = await login(limited.username, limited.password);

      // Created first, on the connection they are allowed to use: the last assertion of this test is
      // that nothing was half-written while the refusals were happening.
      expect([200, 201]).toContain(
        await statusAs(author, 'POST', '/api/reports', {
          reportId,
          templateName: reportId,
          capReportGenerationMailMerge: true,
        }),
      );
      const settings = await jsonAs(author, `/api/reports/${reportId}/datasource`);
      settings.report.datasource.type = 'ds.sqlquery';
      settings.report.datasource.sqloptions = {
        ...(settings.report.datasource.sqloptions ?? {}),
        conncode: ALLOWED_CONNECTION,
        query,
        idcolumn: 'CustomerID',
      };
      expect(await statusAs(author, 'PUT', `/api/reports/${reportId}/datasource`, settings)).toBe(200);

      const blockedSettings = JSON.parse(JSON.stringify(settings));
      blockedSettings.report.datasource.sqloptions.conncode = BLOCKED_CONNECTION;

      const doors: Array<[string, () => Promise<{ status: number; text: string }>]> = [
        ['the schema', () => answerAs(author, 'GET', `/api/queries/schema/${BLOCKED_CONNECTION}`)],
        ['the connection itself', () => answerAs(author, 'GET', `/api/connections/${BLOCKED_CONNECTION}`)],
        [
          'its metadata',
          () => answerAs(author, 'GET', `/api/connections/${BLOCKED_CONNECTION}/metadata/er-diagram`),
        ],
        ['the DSL parser', () => answerAs(author, 'POST', '/api/dsl/chart/parse', {
          dslCode: CHART_DSL,
          connectionCode: BLOCKED_CONNECTION,
        })],
        ['the explore', () => answerAs(author, 'POST', '/api/analytics/explore', {
          connectionCode: BLOCKED_CONNECTION,
          tableName: 'Customers',
          fields: ['Country'],
        })],
        ['a pivot by table', () => answerAs(author, 'POST', '/api/analytics/pivot', {
          connectionCode: BLOCKED_CONNECTION,
          tableName: 'Customers',
          rows: ['Country'],
          vals: ['CustomerID'],
          aggregatorName: 'Count',
        })],
        [
          'the datasource save',
          () => answerAs(author, 'PUT', `/api/reports/${reportId}/datasource`, blockedSettings),
        ],
        // The short way round every check above: read the connection off disk. The file is the
        // connection — its server, its database and its credentials — so the filesystem guard
        // refuses the read the same way the list refuses to show it.
        [
          'reading the connection file',
          () => answerAs(
            author,
            'GET',
            `/api/system/fs/content?path=${encodeURIComponent(
              `config/connections/${BLOCKED_CONNECTION}/${BLOCKED_CONNECTION}.xml`,
            )}`,
          ),
        ],
      ];

      for (const [what, call] of doors) {
        const answer = await call();
        // run-sql is the one door that renders its refusal beside the SQL; every other one is a 403.
        expect(answer.status, `${what} must refuse a connection this author may not use`).toBe(403);
        expect(
          answer.text,
          `${what} must name the connection, so the author knows what to ask their administrator for`,
        ).toContain(BLOCKED_CONNECTION);
      }

      const refusedSql = await runSql(author, BLOCKED_CONNECTION, query);
      expect(refusedSql.status, 'run-sql refuses it too').toBe(403);

      // Nothing was half-written: the report is still on the connection it was saved with.
      expect(
        (await jsonAs(author, `/api/reports/${reportId}/datasource`)).report?.datasource?.sqloptions
          ?.conncode,
        'a refused datasource save left the report exactly as it was',
      ).toBe(ALLOWED_CONNECTION);
    } finally {
      await statusAs(admin, 'DELETE', `/api/reports/${reportId}`);
      await statusAs(admin, 'DELETE', `/api/iam/users/${limited.username}`);
      await deleteGroup(admin, groupId);
    }
  });

  test('(journey) an ADMIN walks the same chain on every connection, blocked ones included', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // The other half of the journey above, and the one with no way back: an administrator who is
    // limited by accident has nobody above them to unblock it. `BLOCKED_CONNECTION` is blocked for
    // the author of the previous test and for nobody else — so every step here reads what came
    // back, never merely that nothing was refused.
    const admin = await login(ADMIN.username, ADMIN.password);
    const reportId = 'e2e-admin-journey-report';
    const query = 'SELECT CustomerID, CompanyName, Country FROM Customers';

    try {
      const codes = (await jsonAs(admin, '/api/connections?type=database')).map(
        (c: { connectionCode: string }) => c.connectionCode,
      );
      expect(codes, 'an administrator is offered every connection there is').toEqual(
        expect.arrayContaining([ALLOWED_CONNECTION, BLOCKED_CONNECTION]),
      );

      for (const code of [ALLOWED_CONNECTION, BLOCKED_CONNECTION]) {
        const connection = await answerAs(admin, 'GET', `/api/connections/${code}`);
        expect(connection.status, `opening ${code}`).toBe(200);
        expect(connection.json?.connection?.code).toBe(code);

        const metadata = await answerAs(admin, 'GET', `/api/connections/${code}/metadata/er-diagram`);
        expect(metadata.status, `the metadata of ${code}`).toBe(200);
        expect(metadata.json, 'answered with its own shape, not an empty body').toBeTruthy();

        const schema = await answerAs(admin, 'GET', `/api/queries/schema/${code}`);
        expect(schema.status, `the schema of ${code}`).toBe(200);
        expect(
          (schema.json?.tables ?? []).map((t: { tableName: string }) => t.tableName),
          'really read from the database behind it',
        ).toContain('Customers');

        const rows = await runSql(admin, code, query);
        expect(rows.body.error, `run-sql on ${code}`).toBeUndefined();
        expect(rows.body.rowCount, 'came back with rows').toBeGreaterThan(0);

        const chart = await answerAs(admin, 'POST', '/api/dsl/chart/parse', {
          dslCode: CHART_DSL,
          connectionCode: code,
        });
        expect(chart.status, `the DSL parser on ${code}`).toBe(200);
        expect(chart.json?.options?.type).toBe('bar');

        const explored = await answerAs(admin, 'POST', '/api/analytics/explore', {
          connectionCode: code,
          tableName: 'Customers',
          fields: ['Country'],
        });
        expect(explored.status, `explore on ${code}`).toBe(200);
        expect(explored.text).toContain('Country');

        const pivot = await answerAs(admin, 'POST', '/api/analytics/pivot', {
          connectionCode: code,
          tableName: 'Customers',
          rows: ['Country'],
          vals: ['CustomerID'],
          aggregatorName: 'Count',
        });
        expect(pivot.status, `a pivot by table on ${code}`).toBe(200);
        expect(pivotCellCount(pivot.json), 'with cells in it').toBeGreaterThan(0);

        // The two folders a limited author may not read at all. For an administrator they are
        // ordinary files, and the content is what proves the read really happened.
        expect(
          await fsRead(admin, `config/connections/${code}/${code}.xml`),
          `the connection file of ${code} is an administrator's to read`,
        ).toContain(code);
      }

      // And the whole authoring chain on the connection the limited author was refused.
      expect([200, 201]).toContain(
        await statusAs(admin, 'POST', '/api/reports', {
          reportId,
          templateName: reportId,
          capReportGenerationMailMerge: true,
        }),
      );

      const settings = await jsonAs(admin, `/api/reports/${reportId}/datasource`);
      settings.report.datasource.type = 'ds.sqlquery';
      settings.report.datasource.sqloptions = {
        ...(settings.report.datasource.sqloptions ?? {}),
        conncode: BLOCKED_CONNECTION,
        query,
        idcolumn: 'CustomerID',
      };
      expect(
        await statusAs(admin, 'PUT', `/api/reports/${reportId}/datasource`, settings),
        'an administrator points a report at any connection in the installation',
      ).toBe(200);
      expect(
        (await jsonAs(admin, `/api/reports/${reportId}/datasource`)).report?.datasource?.sqloptions
          ?.conncode,
        'and it reads back',
      ).toBe(BLOCKED_CONNECTION);

      // Server code: saved inside the report, and run ad-hoc on the connection the limited author
      // was refused. A group with scripts off is what refuses this to somebody else; nothing
      // refuses it to an administrator.
      const savedScript = await fetch(
        `${BASE_URL}/api/reports/${reportId}/script/datasourceScript`,
        {
          method: 'PUT',
          headers: { Cookie: admin, ...xsrfHeader(admin), 'Content-Type': 'text/plain' },
          body: 'return []',
        },
      );
      expect(savedScript.status, 'an administrator saves server code').toBe(200);

      const ranScript = await answerAs(admin, 'POST', '/api/queries/run-script', {
        connectionId: BLOCKED_CONNECTION,
        script: 'return [[one: 1]]',
      });
      expect(ranScript.status, `running it on ${BLOCKED_CONNECTION}`).toBe(200);
      expect(ranScript.json?.rowCount, 'and it really ran, returning its row').toBe(1);

      const submitted = await submitJob(admin, { type: 'generate', reportId });
      expect([200, 202], `running it: ${submitted.text}`).toContain(submitted.status);

      const data = await answerAs(admin, 'GET', `/api/reports/${reportId}/data`);
      expect(data.status, 'and reading what it produced').toBe(200);
      expect(data.json?.data?.length, 'which is rows, not an empty shell').toBeGreaterThan(0);
    } finally {
      await statusAs(admin, 'DELETE', `/api/reports/${reportId}`);
    }
  });

  test('(journey) a REPORT_AUTHOR in no group, and one in a group that sets no limits, are refused nothing', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // Limits are opt-in, and these two are the people nobody opted in for. A group that names no
    // connection organises people and limits nothing — if it were ever read as "allowed: none", its
    // members would lose every database in the installation, which is the loudest way this feature
    // can go wrong and the quietest to miss.
    const admin = await login(ADMIN.username, ADMIN.password);
    const solo = { username: 'e2e-no-group-author', password: 'E2eNoGroupPassword123!' };
    const grouped = { username: 'e2e-empty-group-author', password: 'E2eEmptyGroupPassword123!' };
    const groupId = await createGroup(admin, 'e2e-organisational-no-limits', {});

    try {
      await createUser(admin, solo.username, solo.password, 'REPORT_AUTHOR');
      await createUser(admin, grouped.username, grouped.password, 'REPORT_AUTHOR');
      await setUserGroups(admin, grouped.username, [groupId]);

      for (const who of [solo, grouped]) {
        const author = await login(who.username, who.password);

        const codes = (await jsonAs(author, '/api/connections?type=database')).map(
          (c: { connectionCode: string }) => c.connectionCode,
        );
        expect(codes, `${who.username} is offered every connection`).toEqual(
          expect.arrayContaining([ALLOWED_CONNECTION, BLOCKED_CONNECTION]),
        );

        // The connection that is blocked for the limited author of the tests above: for these two
        // it is an ordinary database, and every door on it answers with what it holds.
        const connection = await answerAs(author, 'GET', `/api/connections/${BLOCKED_CONNECTION}`);
        expect(connection.status, `${who.username} opens it`).toBe(200);
        expect(connection.json?.connection?.code).toBe(BLOCKED_CONNECTION);

        expect(
          (await answerAs(author, 'GET', `/api/connections/${BLOCKED_CONNECTION}/metadata/er-diagram`))
            .status,
        ).toBe(200);

        const schema = await answerAs(author, 'GET', `/api/queries/schema/${BLOCKED_CONNECTION}`);
        expect(schema.status).toBe(200);
        expect(
          (schema.json?.tables ?? []).map((t: { tableName: string }) => t.tableName),
        ).toContain('Customers');

        const rows = await runSql(author, BLOCKED_CONNECTION, 'SELECT CustomerID FROM Customers');
        expect(rows.body.error, `${who.username} runs SQL on it`).toBeUndefined();
        expect(rows.body.rowCount).toBeGreaterThan(0);

        const explored = await answerAs(author, 'POST', '/api/analytics/explore', {
          connectionCode: BLOCKED_CONNECTION,
          tableName: 'Customers',
          fields: ['Country'],
        });
        expect(explored.status).toBe(200);
        expect(explored.text).toContain('Country');

        const pivot = await answerAs(author, 'POST', '/api/analytics/pivot', {
          connectionCode: BLOCKED_CONNECTION,
          tableName: 'Customers',
          rows: ['Country'],
          vals: ['CustomerID'],
          aggregatorName: 'Count',
        });
        expect(pivot.status).toBe(200);
        expect(pivotCellCount(pivot.json)).toBeGreaterThan(0);

        // The file guard is the same question asked of a path: nobody limited these two, so the
        // connection file is theirs to read like any other file in the installation.
        expect(
          await fsRead(author, `config/connections/${BLOCKED_CONNECTION}/${BLOCKED_CONNECTION}.xml`),
          'the connection file reads for an author nobody limited',
        ).toContain(BLOCKED_CONNECTION);
      }
    } finally {
      await statusAs(admin, 'DELETE', `/api/iam/users/${solo.username}`);
      await statusAs(admin, 'DELETE', `/api/iam/users/${grouped.username}`);
      await deleteGroup(admin, groupId);
    }
  });

  test('(limits) with scripts off, a limited author cannot get server code run', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const limited = { username: 'e2e-no-scripts-author', password: 'E2eNoScriptsPassword123!' };
    const groupId = await createGroup(admin, 'e2e-no-scripts', {
      settings: { connections: [ALLOWED_CONNECTION], scripts: false },
    });
    const reportId = 'e2e-no-scripts-report';

    try {
      await createUser(admin, limited.username, limited.password, 'REPORT_AUTHOR');
      await setUserGroups(admin, limited.username, [groupId]);
      const author = await login(limited.username, limited.password);

      expect(
        await statusAs(author, 'POST', '/api/queries/run-script', {
          connectionId: ALLOWED_CONNECTION,
          script: 'return []',
        }),
        'run-script hands the body to a GroovyShell, on an allowed connection or not',
      ).toBe(403);

      expect(
        [200, 201],
      ).toContain(await statusAs(author, 'POST', '/api/reports', { reportId, templateName: reportId }));
      const saved = await fetch(`${BASE_URL}/api/reports/${reportId}/script/datasourceScript`, {
        method: 'PUT',
        headers: { Cookie: author, ...xsrfHeader(author), 'Content-Type': 'text/plain' },
        body: 'return "this must never be saved"',
      });
      expect(
        saved.status,
        'nor may they leave Groovy in a report for the engine to run later',
      ).toBe(403);

      expect(
        await statusAs(author, 'POST', '/api/dsl/chart/parse', {
          dslCode: 'chart { Runtime.getRuntime() }',
        }),
        'and the DSL is Groovy too, whatever it is called',
      ).toBe(403);

      // The permitted half, and the reason this is a setting rather than a role: reading data is
      // exactly what this author is still for.
      expect(
        (await runSql(author, ALLOWED_CONNECTION, 'SELECT 1 AS one')).body.error,
        'plain SQL on their own connection is untouched',
      ).toBeUndefined();
    } finally {
      await statusAs(admin, 'DELETE', `/api/reports/${reportId}`);
      await statusAs(admin, 'DELETE', `/api/iam/users/${limited.username}`);
      await deleteGroup(admin, groupId);
    }
  });

  test('(limits) a limited author cannot touch the store or the connection files', async () => {
    // Where limits are kept, and where credentials are kept. Both are files inside the installation,
    // and every filesystem endpoint is REPORT_AUTHOR — so without this rule a limited author edits
    // their own group, or reads the key that carries ROLE_ADMIN, and the limits mean nothing.
    const admin = await login(ADMIN.username, ADMIN.password);
    const limited = { username: 'e2e-fs-limited-author', password: 'E2eFsLimitedPassword123!' };
    const groupId = await createGroup(admin, 'e2e-fs-allowed-only', {
      settings: { connections: [ALLOWED_CONNECTION] },
    });

    const write = (cookie: string, path: string) =>
      fetch(`${BASE_URL}/api/system/fs/content?path=${encodeURIComponent(path)}`, {
        method: 'PUT',
        headers: { Cookie: cookie, ...xsrfHeader(cookie), 'Content-Type': 'text/plain' },
        body: 'e2e probe',
      }).then((r) => r.status);

    try {
      await createUser(admin, limited.username, limited.password, 'REPORT_AUTHOR');
      await setUserGroups(admin, limited.username, [groupId]);
      const author = await login(limited.username, limited.password);

      expect(
        await statusAs(author, 'GET', '/api/system/fs/content?path=config/_internal/api-key.txt'),
        'not even a read of the internal folder: the key in it carries ROLE_ADMIN',
      ).toBe(403);
      expect(
        await write(author, 'config/_internal/e2e-probe.txt'),
        'and nothing written into it either — that folder holds the user store',
      ).toBe(403);
      expect(
        await write(author, 'config/connections/e2e-probe.xml'),
        'nor a new connection file, which would be a database of their own choosing',
      ).toBe(403);

      // The permitted half: an ordinary report file is still an author's to write, limited or not.
      // Without this the test would pass just as well if every fs write were refused for everybody.
      expect(
        await write(await login(AUTHOR.username, AUTHOR.password), 'config/reports/e2e-fs-probe.txt'),
        'an unlimited author still writes an ordinary file',
      ).toBe(200);
    } finally {
      await statusAs(admin, 'DELETE', '/api/system/fs?path=config/reports/e2e-fs-probe.txt');
      await statusAs(admin, 'DELETE', `/api/iam/users/${limited.username}`);
      await deleteGroup(admin, groupId);
    }
  });

  test('(explorer) the file explorer refuses what the filesystem guard refuses', async () => {
    // The file explorer opens on `db/`, which is where a SQLite or DuckDB connection keeps its file —
    // and for those the file IS the connection: whoever downloads it queries it at home, whatever the
    // connection list showed them. Beside the files sits the compose file that names and credentials
    // the containerized databases. Every probe below asserts the status and nothing else, and not one
    // of them changes anything.
    const admin = await login(ADMIN.username, ADMIN.password);
    const limited = { username: 'e2e-explorer-author', password: 'E2eExplorerAuthor123!' };
    const operator = { username: 'e2e-explorer-operator', password: 'E2eExplorerOperator123!' };
    const groupId = await createGroup(admin, 'e2e-explorer-allowed-only', {
      settings: { connections: [ALLOWED_CONNECTION] },
    });
    const hiddenConnection = 'db-explorer-hidden-sqlite';
    const hiddenDb = 'e2e-explorer-hidden/hidden.db';

    const download = (cookie: string, file: string) =>
      statusAs(cookie, 'GET', `/api/system/fs/explorer/file-downloader?file=${encodeURIComponent(file)}`);

    try {
      // A database file of its own: the two connections this block creates both point at the shipped
      // northwind file, so a probe against that file could not tell the rule from a coincidence.
      // Written as a plain file and never opened as a database by anything in this test.
      expect(await fsWrite(admin, `db/${hiddenDb}`, 'e2e fixture, never opened as a database')).toBe(200);
      expect(
        await statusAs(admin, 'PUT', `/api/connections/${hiddenConnection}`, {
          connection: {
            code: hiddenConnection,
            name: 'Explorer Hidden',
            default: false,
            databaseserver: {
              type: 'sqlite',
              database: `${process.env.PORTABLE_EXECUTABLE_DIR}/db/${hiddenDb}`,
            },
          },
        }),
      ).toBe(200);

      await createUser(admin, limited.username, limited.password, 'REPORT_AUTHOR');
      await setUserGroups(admin, limited.username, [groupId]);
      const author = await login(limited.username, limited.password);

      expect(
        await download(author, hiddenDb),
        'the file behind a connection their groups do not name is that connection, in one piece',
      ).toBe(403);
      expect(
        await statusAs(
          author,
          'GET',
          `/api/system/fs/explorer/file-viewer?file=${encodeURIComponent(hiddenDb)}`,
        ),
        'and the viewer is the downloader with a different Content-Type',
      ).toBe(403);
      expect(
        await download(author, 'docker-compose.yml'),
        'nor the compose file, which names and credentials every database beside it',
      ).toBe(403);

      // The explorer is REPORT_AUTHOR now, like every other /api/system/fs/* endpoint. It used to be
      // JOB_OPERATOR — a wider door than the rest of the filesystem, onto the folder the databases
      // live in, that no operator screen ever opens.
      await createUser(admin, operator.username, operator.password, 'JOB_OPERATOR');
      const runner = await login(operator.username, operator.password);
      expect(
        await statusAs(runner, 'GET', '/api/system/fs/explorer/file-tree?dir='),
        'an operator does not open the file explorer at all any more',
      ).toBe(403);
    } finally {
      await statusAs(admin, 'DELETE', `/api/connections/${hiddenConnection}`);
      await statusAs(admin, 'DELETE', `/api/system/fs?path=db/${hiddenDb}`);
      await statusAs(admin, 'DELETE', `/api/iam/users/${limited.username}`);
      await statusAs(admin, 'DELETE', `/api/iam/users/${operator.username}`);
      await deleteGroup(admin, groupId);
    }
  });

  test('(explorer) a limited author still reaches the database their own connection points at', async () => {
    // The half that says the rule is a rule and not a closed folder: closing `db/` altogether would
    // pass the test above and break the Data Tables screens, which is what the explorer is for.
    const admin = await login(ADMIN.username, ADMIN.password);
    const limited = { username: 'e2e-explorer-allowed-author', password: 'E2eExplorerAllowed123!' };
    const groupId = await createGroup(admin, 'e2e-explorer-northwind-only', {
      settings: { connections: [ALLOWED_CONNECTION] },
    });

    try {
      await createUser(admin, limited.username, limited.password, 'REPORT_AUTHOR');
      await setUserGroups(admin, limited.username, [groupId]);
      const author = await login(limited.username, limited.password);

      expect(
        await statusAs(author, 'GET', '/api/system/fs/explorer/meta-info'),
        'the explorer still opens for a limited author',
      ).toBe(200);
      expect(
        await statusAs(author, 'GET', '/api/system/fs/explorer/file-tree?dir='),
        'and the db folder still lists',
      ).toBe(200);
      expect(
        await statusAs(
          author,
          'GET',
          '/api/system/fs/explorer/file-downloader?file=' +
            encodeURIComponent('sample-northwind-sqlite/northwind.db'),
        ),
        'the database their own connection points at is theirs to take',
      ).toBe(200);

      const unlimited = await login(AUTHOR.username, AUTHOR.password);
      expect(
        await statusAs(unlimited, 'GET', '/api/system/fs/explorer/file-tree?dir='),
        "and an unlimited author keeps today's explorer",
      ).toBe(200);
    } finally {
      await statusAs(admin, 'DELETE', `/api/iam/users/${limited.username}`);
      await deleteGroup(admin, groupId);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § The reports a caller may run — layer 1 at the four doors that run a report
// ═══════════════════════════════════════════════════════════════════════════
//
// The limits above are about the SQL a person writes. These are about the SQL somebody else already
// wrote: a saved report carries a connection inside it, so running that report reads a database
// without ever naming it. Every door that makes the engine run a report therefore asks the same
// question the SQL editor asks — and the report list stops offering what the answer would refuse.
//
// The caller here is a JOB_OPERATOR on purpose. They author nothing and never see the SQL editor,
// which is exactly why the first version of this feature let them through.

/** A report the limited caller may run, an identical one they may not, and one that reads no database. */
const RUNNABLE_REPORT = 'e2e-limits-runnable-report';
const NOT_RUNNABLE_REPORT = 'e2e-limits-blocked-report';
const FILE_REPORT = 'e2e-limits-file-report';

/** The shipped samples the three above are copies of, and the connection code written inside the first. */
const SQL_SAMPLE = 'g-sql2xls-cst-sles';
const FILE_SAMPLE = 'g-csv2htm';
const SAMPLE_DB_CONNECTION = 'rbt-sample-northwind-sqlite-4f2';

/** Where a paused burst job leaves its progress file — AppPaths.JOBS_DIR_PATH is `temp`. */
const RESUME_PROGRESS_FILE = 'temp/e2e-limits-resume.progress';

async function fsRead(cookie: string, path: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/system/fs/content?path=${encodeURIComponent(path)}`, {
    headers: { Cookie: cookie },
  });
  expect(res.status, `reading ${path}`).toBe(200);
  return res.text();
}

async function fsWrite(cookie: string, path: string, body: string): Promise<number> {
  return fetch(`${BASE_URL}/api/system/fs/content?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { Cookie: cookie, ...xsrfHeader(cookie), 'Content-Type': 'text/plain' },
    body,
  }).then((r) => r.status);
}

/**
 * Copy a shipped sample into a throwaway report, optionally repointing its connection.
 *
 * Copied rather than created from the defaults because these tests have to RUN the report: a report
 * built from `config/_defaults` has no query and no output to assert. The copy is the same folder
 * the CLI suite generates from, so "it produced output" means the same thing here as it does there.
 */
async function copySampleReport(admin: string, sampleId: string, reportId: string, connectionCode?: string) {
  expect(
    await statusAs(
      admin,
      'POST',
      `/api/system/fs/copy?fromPath=${encodeURIComponent(`config/samples/${sampleId}`)}` +
        `&toPath=${encodeURIComponent(`config/reports/${reportId}`)}&overwrite=true`,
    ),
    `copying the sample ${sampleId} into ${reportId}`,
  ).toBe(200);

  if (!connectionCode) return;

  // The one thing that differs between the two SQL copies: which connection the report reads
  // through. Everything else — the query, the template, the output name — stays the sample's, so a
  // refusal below can only be about the connection.
  const reporting = await fsRead(admin, `config/reports/${reportId}/reporting.xml`);
  expect(reporting, `${sampleId} must name the sample connection to begin with`).toContain(
    SAMPLE_DB_CONNECTION,
  );
  expect(
    await fsWrite(
      admin,
      `config/reports/${reportId}/reporting.xml`,
      reporting.split(SAMPLE_DB_CONNECTION).join(connectionCode),
    ),
    `pointing ${reportId} at ${connectionCode}`,
  ).toBe(200);
}

/** Submit a job and keep the whole answer: a refusal is a 403 with a sentence in it. */
async function submitJob(cookie: string, body: unknown): Promise<{ status: number; text: string }> {
  const res = await fetch(`${BASE_URL}/api/jobs`, {
    method: 'POST',
    headers: { Cookie: cookie, ...xsrfHeader(cookie), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

/** How many jobs the server is tracking right now — the number a refusal must not change. */
async function jobCount(admin: string): Promise<number> {
  // The listing defaults to the last 20 jobs; asked for more than this file ever creates, its length
  // is "how many jobs exist", which is what a refusal must leave untouched.
  return (await jsonAs(admin, '/api/jobs?limit=100')).length;
}

test.describe('Auth — Server: the reports a caller may run', () => {
  test.describe.configure({ mode: 'serial' });

  const RUNNER = { username: 'e2e-limits-runner', password: 'E2eLimitsRunnerPass123!' };
  /** The same limits held by a REPORT_AUTHOR: the two screens that offer reports sit on two rungs. */
  const PICKER = { username: 'e2e-pickers-author', password: 'E2ePickersAuthorPass123!' };
  let groupId: number;

  test.beforeAll(async () => {
    const admin = await login(ADMIN.username, ADMIN.password);

    // The same two throwaway databases the block above uses. Both are the shipped Northwind file, so
    // the two SQL reports below are the same report in every respect but the connection they name —
    // which is the only difference the check is allowed to notice.
    await createSqliteConnection(admin, ALLOWED_CONNECTION_NAME, ALLOWED_CONNECTION);
    await createSqliteConnection(admin, BLOCKED_CONNECTION_NAME, BLOCKED_CONNECTION);

    await copySampleReport(admin, SQL_SAMPLE, RUNNABLE_REPORT, ALLOWED_CONNECTION);
    await copySampleReport(admin, SQL_SAMPLE, NOT_RUNNABLE_REPORT, BLOCKED_CONNECTION);
    await copySampleReport(admin, FILE_SAMPLE, FILE_REPORT);

    await createUser(admin, RUNNER.username, RUNNER.password, 'JOB_OPERATOR');
    groupId = await createGroup(admin, 'e2e-limits-runner-group', {
      settings: { connections: [ALLOWED_CONNECTION] },
    });
    await setUserGroups(admin, RUNNER.username, [groupId]);

    // The Processing picker is an operator's screen and the Configuration list is an author's, so
    // the same group limits a second person one rung higher — otherwise half of what a limited
    // person is offered would never be looked at.
    await createUser(admin, PICKER.username, PICKER.password, 'REPORT_AUTHOR');
    await setUserGroups(admin, PICKER.username, [groupId]);
  });

  test.afterAll(async () => {
    const admin = await login(ADMIN.username, ADMIN.password);

    // Users first, then groups: a group with members is refused, and a report left behind would be
    // listed to everybody by the next run of this file.
    await statusAs(admin, 'DELETE', `/api/iam/users/${RUNNER.username}`);
    await statusAs(admin, 'DELETE', `/api/iam/users/${PICKER.username}`);
    await deleteGroup(admin, groupId);

    for (const reportId of [RUNNABLE_REPORT, NOT_RUNNABLE_REPORT, FILE_REPORT])
      await statusAs(admin, 'DELETE', `/api/reports/${reportId}`);

    await statusAs(admin, 'DELETE', `/api/system/fs?path=${encodeURIComponent(RESUME_PROGRESS_FILE)}`);
    await statusAs(admin, 'DELETE', `/api/connections/${ALLOWED_CONNECTION}`);
    await statusAs(admin, 'DELETE', `/api/connections/${BLOCKED_CONNECTION}`);
  });

  test('(reports) a report on a connection the caller may not use is not in their list', async () => {
    // The list is where this is kindest: an operator is never offered a report that would refuse
    // them. It is also where it is weakest as a claim on its own — hence the next test.
    const runner = await login(RUNNER.username, RUNNER.password);
    const ids = (await jsonAs(runner, '/api/reports')).map(
      (r: { folderName: string }) => r.folderName,
    );

    expect(ids, 'the report on their own database is theirs to run').toContain(RUNNABLE_REPORT);
    expect(ids, 'the identical one on the other database is not offered').not.toContain(
      NOT_RUNNABLE_REPORT,
    );
    expect(ids, 'and a report that reads no database is nobody to keep from').toContain(FILE_REPORT);

    const adminIds = (await jsonAs(await login(ADMIN.username, ADMIN.password), '/api/reports')).map(
      (r: { folderName: string }) => r.folderName,
    );
    expect(
      adminIds,
      'the report exists — it is hidden from this caller, not missing from the installation',
    ).toEqual(expect.arrayContaining([RUNNABLE_REPORT, NOT_RUNNABLE_REPORT, FILE_REPORT]));
  });

  test('(reports) submitting that report by id is refused, names the connection, and leaves no job behind', async () => {
    // A list that omits a report is a courtesy; the id is guessable and the API is open to anyone
    // who may run jobs at all. This is the check that actually holds.
    const admin = await login(ADMIN.username, ADMIN.password);
    const runner = await login(RUNNER.username, RUNNER.password);
    const before = await jobCount(admin);

    // Emptied first so that "nothing came out" below is about this submission and not about what an
    // earlier test happened to leave behind.
    InterfaceTestHelper.cleanOutputAndLogs();

    const refused = await submitJob(runner, { type: 'generate', reportId: NOT_RUNNABLE_REPORT });

    expect(refused.status, 'refused, and refused as a permission answer').toBe(403);
    expect(
      refused.text,
      'the message says which connection stopped it, or the operator cannot ask for the right thing',
    ).toContain(BLOCKED_CONNECTION);
    expect(refused.text, 'and what they do have, so the answer is actionable').toContain(
      ALLOWED_CONNECTION,
    );

    expect(
      await jobCount(admin),
      'and no job was ever created: the refusal happens before the job store, not halfway through a run',
    ).toBe(before);
    await InterfaceTestHelper.assertOutputFileCount(0, 'xlsx');
  });

  test('(reports) a report on an allowed connection lists, submits, runs and produces output', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // The permitted half, and the one that would catch a check that simply refuses everybody. The
    // same sample the CLI suite generates, through the same door, by a limited caller.
    const runner = await login(RUNNER.username, RUNNER.password);

    InterfaceTestHelper.cleanOutputAndLogs();

    const accepted = await submitJob(runner, { type: 'generate', reportId: RUNNABLE_REPORT });
    expect([200, 202], 'their own report starts').toContain(accepted.status);

    await InterfaceTestHelper.waitForJobCompletion(120_000);
    await InterfaceTestHelper.assertOutputFiles(['CustomerSalesSummary.xlsx'], 'xlsx');
  });

  test('(reports) a report with a file datasource runs for everybody', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // A CSV report names no connection at all. "Names none" must read as "limits nobody" — the
    // opposite reading would make every limit a ban on the reports that have nothing to do with
    // databases.
    for (const who of [RUNNER, AUTHOR, ADMIN]) {
      const cookie = await login(who.username, who.password);

      InterfaceTestHelper.cleanOutputAndLogs();

      const accepted = await submitJob(cookie, {
        type: 'generate',
        reportId: FILE_REPORT,
        input: 'samples/reports/payslips/Payslips.csv',
      });
      expect(
        [200, 202],
        `${who.username}: a report that reads a file is not a report that reads a database`,
      ).toContain(accepted.status);

      await InterfaceTestHelper.waitForJobCompletion(120_000);
      await InterfaceTestHelper.assertOutputFiles(['0.html', '1.html', '2.html'], 'html');
    }
  });

  test("(reports) a dashboard granted to a viewer's group still opens although its connection is not theirs", async () => {
    // The carve-out, and the only place the two layers meet. g-dashboard reads the built-in sample
    // connection, which this group does not allow — so under layer 1 alone the grant its
    // administrator just made would open a page with no rows in it. A grant is a decision about
    // this dashboard, and it has to win for this dashboard.
    const admin = await login(ADMIN.username, ADMIN.password);
    const grantId = await createGroup(admin, 'e2e-limits-granted-dashboard', {
      settings: { connections: [ALLOWED_CONNECTION] },
      dashboards: [SAMPLE_DASHBOARD],
      defaultDashboard: SAMPLE_DASHBOARD,
    });

    try {
      await setUserGroups(admin, VIEWER.username, [grantId]);
      const viewer = await login(VIEWER.username, VIEWER.password);

      const granted = await dashboardReadStatuses(viewer, SAMPLE_DASHBOARD);
      expect(granted, 'the granted dashboard opens and answers, connection or no connection').toEqual({
        page: 200,
        config: 200,
        pivot: 200,
      });

      const rows = await fetch(
        `${BASE_URL}/api/reports/${SAMPLE_DASHBOARD}/data?componentId=topCustomers`,
        { headers: { Cookie: viewer } },
      );
      expect(rows.status, 'with real rows: an empty page would pass a status-only check').toBe(200);
      expect((await rows.json()).data?.length, 'and the widget has something in it').toBeGreaterThan(0);

      // The carve-out is that dashboard's, not a way out of the limits. The other shipped dashboard
      // is on the same connection and is not granted — so it must stay shut.
      const ungranted = await dashboardReadStatuses(viewer, PIVOT_DASHBOARD);
      expect(ungranted.config, 'a dashboard nobody granted stays refused').toBe(403);
      expect(ungranted.pivot).toBe(403);
    } finally {
      await setUserGroups(admin, VIEWER.username, []);
      await deleteGroup(admin, grantId);
    }
  });

  test('(reports) resuming a paused job is refused when its report needs a connection the caller may not use', async () => {
    // The fourth door, and the only one that names no report: resume is handed a .progress file, and
    // the report it runs is whatever `configurationFilePath` inside it says. A check that keyed on
    // the request would find nothing to look at here — which is exactly why this test exists.
    const admin = await login(ADMIN.username, ADMIN.password);

    // What AbstractBurster leaves behind when a burst is paused: JobProgressDetails, marshalled by
    // JAXB as <jobprogress>. Written here by the administrator rather than by pausing a real job,
    // because what is being checked is which report the resume would run, not how it came to be paused.
    expect(
      await fsWrite(
        admin,
        RESUME_PROGRESS_FILE,
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
          '<jobprogress>\n' +
          '  <jobtype>burst</jobtype>\n' +
          `  <configurationFilePath>config/reports/${NOT_RUNNABLE_REPORT}/settings.xml</configurationFilePath>\n` +
          '  <filepath>samples/burst/Payslips.pdf</filepath>\n' +
          '</jobprogress>\n',
      ),
      'the administrator writes the paused job file',
    ).toBe(200);

    const runner = await login(RUNNER.username, RUNNER.password);
    const before = await jobCount(admin);

    const refused = await fetch(`${BASE_URL}/api/jobs/resume`, {
      method: 'POST',
      headers: { Cookie: runner, ...xsrfHeader(runner), 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobFilePath: RESUME_PROGRESS_FILE }),
    });

    expect(
      refused.status,
      'resuming a job whose report reads a database they may not use is refused',
    ).toBe(403);
    expect(
      await refused.text(),
      'and says which connection stopped it, exactly as the submission door does',
    ).toContain(BLOCKED_CONNECTION);
    expect(await jobCount(admin), 'and starts nothing').toBe(before);
  });

  test('(reports) the same resume runs for the admin', async () => {
    // The other half, on the same file: if resume were simply broken, the test above would pass
    // anyway. An administrator is never limited, so the endpoint must accept exactly this request.
    // Accepted, not finished — resume answers as soon as it has handed the file to the engine.
    const admin = await login(ADMIN.username, ADMIN.password);

    expect(
      await statusAs(admin, 'POST', '/api/jobs/resume', { jobFilePath: RESUME_PROGRESS_FILE }),
      'an administrator resumes the very job the limited caller could not',
    ).toBe(200);
  });

  test('(operator) the report settings endpoint does not name a connection the caller may not use', async () => {
    // The list hides the blocked report, but this endpoint takes the id straight from the caller and
    // answers with the settings file — the connection code inside it included. Status only: a refusal
    // is proven by its status, and the body of one is nothing this test needs to look at.
    const runner = await login(RUNNER.username, RUNNER.password);

    expect(
      await statusAs(runner, 'GET', `/api/reports/${NOT_RUNNABLE_REPORT}/settings`),
      'the settings of a report they may not run are refused before the file is read',
    ).toBe(403);

    const admin = await login(ADMIN.username, ADMIN.password);
    expect(
      await statusAs(admin, 'GET', `/api/reports/${NOT_RUNNABLE_REPORT}/settings`),
      'and an administrator still reads the same file, as they always could',
    ).toBe(200);
  });

  test('(operator) an operator still gets the settings they need to run their own report', async () => {
    // Emptying the endpoint would pass the test above just as well. This is the half that says the
    // answer is still the whole settings file for the report they are allowed to run.
    const runner = await login(RUNNER.username, RUNNER.password);

    const settings = await jsonAs(runner, `/api/reports/${RUNNABLE_REPORT}/settings`);

    expect(settings?.settings, 'the answer is the settings file, not an emptied shell').toBeDefined();
    expect(
      JSON.stringify(settings),
      'and it names no connection they may not use',
    ).not.toContain(BLOCKED_CONNECTION);
  });

  test('(pickers-ui) the Processing screens offer only the reports the signed-in person can run', async ({
    page,
  }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // `/api/reports` is filtered five tests above. This is the same question asked of the screens,
    // because a picker that built its list from somewhere else would pass that test and still offer
    // a report the first click refuses. Both halves are asserted on both screens: a screen that
    // listed nothing at all would satisfy the absence on its own.
    const offeredOption = `#${RUNNABLE_REPORT}_ds\\.sqlquery`;
    const refusedOption = `#${NOT_RUNNABLE_REPORT}_ds\\.sqlquery`;
    const offeredRow = `#${RUNNABLE_REPORT}_settings\\.xml`;
    const refusedRow = `#${NOT_RUNNABLE_REPORT}_settings\\.xml`;

    await openApp(page);
    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, PICKER);

    await ft
      // Processing -> Generate Reports: the dropdown a person actually chooses a report from.
      .gotoReportGenerationScreen()
      .click('#selectMailMergeClassicReport')
      .waitOnElementToBecomeVisible(offeredOption)
      .elementShouldNotBeVisible(refusedOption)
      // Closed again, or the open dropdown covers the menu the next step needs.
      .click('#selectMailMergeClassicReport')
      // Configuration -> Reports: the other list, one rung up, built from the same call.
      .gotoConfigurationReports()
      .setValue('#reportsListSearch', 'e2e-limits')
      .sleep(400)
      .waitOnElementToBecomeVisible(offeredRow)
      .elementShouldNotBeVisible(refusedRow)
      // And the same two screens for somebody nobody limited: the blocked report is hidden from
      // this person, not missing from the installation.
      .click('#userMenu')
      .click('#btnLogout')
      .waitOnElementToBecomeVisible('#loginUsername');

    await signInThroughTheUi(ft, ADMIN);

    await ft
      .gotoReportGenerationScreen()
      .click('#selectMailMergeClassicReport')
      .waitOnElementToBecomeVisible(offeredOption)
      .waitOnElementToBecomeVisible(refusedOption)
      .click('#selectMailMergeClassicReport')
      .gotoConfigurationReports()
      .setValue('#reportsListSearch', 'e2e-limits')
      .sleep(400)
      .waitOnElementToBecomeVisible(offeredRow)
      .waitOnElementToBecomeVisible(refusedRow);
  });

  test('(pickers) a report id typed straight into the API is refused although the UI never offered it', async () => {
    // The pair the owner asked for: a filtered list is a courtesy, the check is the rule. Every door
    // that takes a report id straight from the caller is asked here, each with the permitted half
    // beside it so that a door which simply refused everybody could not pass.
    const runner = await login(RUNNER.username, RUNNER.password);
    const author = await login(PICKER.username, PICKER.password);
    const admin = await login(ADMIN.username, ADMIN.password);

    // Reading one report by id — where the screens go with an id read out of the filtered list, and
    // where anyone can go with an id they typed.
    const typed = await fetch(`${BASE_URL}/api/reports/${NOT_RUNNABLE_REPORT}`, {
      headers: { Cookie: runner },
    });
    expect(typed.status, 'the id the list never offered is refused, not served').toBe(403);
    expect(
      await typed.text(),
      'and says which connection stopped it, exactly as the submission door does',
    ).toContain(BLOCKED_CONNECTION);

    expect(
      await statusAs(runner, 'GET', `/api/reports/${RUNNABLE_REPORT}`),
      'their own report still opens by id',
    ).toBe(200);
    expect(
      await statusAs(admin, 'GET', `/api/reports/${NOT_RUNNABLE_REPORT}`),
      'and the report is there: refused to this caller, not missing from the installation',
    ).toBe(200);

    // Minting an embed token is reading the report through a second door: the token read path is
    // exempt by design, so whoever mints has to be the one who is asked.
    expect(
      await statusAs(runner, 'POST', '/api/embed/token', { reportId: NOT_RUNNABLE_REPORT }),
      'no token for a report this caller may not run',
    ).toBe(403);
    expect(
      await statusAs(runner, 'POST', '/api/embed/token', { reportId: RUNNABLE_REPORT }),
      'and a token for their own report is still minted',
    ).toBe(200);

    // A share link hands a report to somebody with no account at all. An author may only give away
    // what they could open themselves.
    expect(
      await statusAs(author, 'POST', '/api/embed/share-link', { reportId: NOT_RUNNABLE_REPORT }),
      'no link to a report its author may not open',
    ).toBe(403);
    expect(
      await statusAs(author, 'POST', '/api/embed/share-link', { reportId: RUNNABLE_REPORT }),
      'and the link an author may hand out is still created',
    ).toBe(200);

    // The link just created would otherwise outlive the report it points at.
    for (const link of await jsonAs(author, `/api/embed/share-link?reportId=${RUNNABLE_REPORT}`))
      await statusAs(author, 'DELETE', `/api/embed/share-link/${link.id}`);
  });

  test("(scenario) an author limited to two connections: the third connection's report is invisible and refuses by id, the allowed one runs end to end", async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // The whole story in one test, in the order the person lives it. The tests above each hold one
    // door; this one is the walk between them, and it is here because a suite can have every door
    // green and still be wrong about the journey — the list agreeing with the refusal, the refusal
    // agreeing with what the group actually allows, and the allowed report really producing its
    // report at the end rather than merely not being refused.
    const admin = await login(ADMIN.username, ADMIN.password);

    const SECOND_CONNECTION = 'db-limits-second-sqlite';
    const SCENARIO = {
      username: 'e2e-scenario-author',
      password: 'E2eScenarioAuthorPass123!',
    };
    let scenarioGroupId = 0;

    try {
      // Two connections granted, a third that exists and works and is not theirs. All three are the
      // same Northwind file, so nothing below can be explained by one database being different.
      await createSqliteConnection(admin, 'Limits Second', SECOND_CONNECTION);

      scenarioGroupId = await createGroup(admin, 'e2e-scenario-two-connections', {
        settings: { connections: [ALLOWED_CONNECTION, SECOND_CONNECTION] },
      });
      await createUser(admin, SCENARIO.username, SCENARIO.password, 'REPORT_AUTHOR');
      await setUserGroups(admin, SCENARIO.username, [scenarioGroupId]);

      const author = await login(SCENARIO.username, SCENARIO.password);

      // 1. They open the Reports screen. The third connection's report is not offered.
      const listed = await reportIdsOf(author);
      expect(
        listed,
        'a report they would be refused is not put in front of them in the first place',
      ).not.toContain(NOT_RUNNABLE_REPORT);
      expect(listed, 'the one on a connection of theirs is').toContain(RUNNABLE_REPORT);

      // 2. They have the id anyway — from a colleague, a bookmark, a link. The refusal holds, and
      //    it says which connection, because "403" alone gives them nothing to ask their
      //    administrator for.
      InterfaceTestHelper.cleanOutputAndLogs();
      const jobsBefore = await jobCount(admin);

      const refused = await submitJob(author, { type: 'generate', reportId: NOT_RUNNABLE_REPORT });
      expect(refused.status).toBe(403);
      expect(refused.text, 'the connection that stopped it is named').toContain(BLOCKED_CONNECTION);
      expect(refused.text, 'and so is what they do have').toContain(ALLOWED_CONNECTION);
      expect(refused.text).toContain(SECOND_CONNECTION);

      expect(
        await jobCount(admin),
        'the refusal came before the job store, so there is nothing for them to find in the job list',
      ).toBe(jobsBefore);
      await InterfaceTestHelper.assertOutputFileCount(0, 'xlsx');

      // 3. The report that is theirs: submitted, run, and its output read. This is the half that
      //    fails if the check ever degenerates into refusing everybody.
      const accepted = await submitJob(author, { type: 'generate', reportId: RUNNABLE_REPORT });
      expect([200, 202], 'their own report starts').toContain(accepted.status);

      await InterfaceTestHelper.waitForJobCompletion(120_000);
      await InterfaceTestHelper.assertOutputFiles(['CustomerSalesSummary.xlsx'], 'xlsx');

      // 4. And the rows behind it, through the data door, so "it ran" is backed by data that came
      //    out of the database this person is allowed to read.
      const data = await jsonAs(author, `/api/reports/${RUNNABLE_REPORT}/data`);
      expect(
        data.reportData?.length ?? 0,
        'the report they may run gives them real rows, not an empty shell',
      ).toBeGreaterThan(0);
    } finally {
      await statusAs(admin, 'DELETE', `/api/iam/users/${SCENARIO.username}`);
      if (scenarioGroupId) await deleteGroup(admin, scenarioGroupId);
      await statusAs(admin, 'DELETE', `/api/connections/${SECOND_CONNECTION}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § Report grants — the reports a group hands its members
// ═══════════════════════════════════════════════════════════════════════════
//
// Layer 2. The limits above are derived from the connections a report reads; these grants are
// written down by an administrator, report by report. The default is inverted on purpose: a group
// that names no report takes nothing away, and the question is asked per person, over everything
// all of their groups name together.

const GRANTED_REPORT = 'e2e-grants-granted';
const UNGRANTED_REPORT = 'e2e-grants-ungranted';
const BLOCKED_GRANTED_REPORT = 'e2e-grants-blocked';

/** The reports one person is offered, by id — the list the Reports screen is built from. */
async function reportIdsOf(cookie: string): Promise<string[]> {
  return (await jsonAs(cookie, '/api/reports')).map((r: { folderName: string }) => r.folderName);
}

test.describe('Auth — Server: the reports a group grants', () => {
  test.describe.configure({ mode: 'serial' });

  const GRANTEE = { username: 'e2e-grants-operator', password: 'E2eGrantsOperatorPass123!' };

  test.beforeAll(async () => {
    const admin = await login(ADMIN.username, ADMIN.password);

    await createSqliteConnection(admin, ALLOWED_CONNECTION_NAME, ALLOWED_CONNECTION);
    await createSqliteConnection(admin, BLOCKED_CONNECTION_NAME, BLOCKED_CONNECTION);

    // Two reports layer 1 keeps nobody from — one SQL on a connection the groups here allow, one
    // that reads a file and names no connection at all — so a report missing from a list below can
    // only be the grants' doing. The third is the meeting point: granted, and still unusable.
    await copySampleReport(admin, SQL_SAMPLE, GRANTED_REPORT, ALLOWED_CONNECTION);
    await copySampleReport(admin, FILE_SAMPLE, UNGRANTED_REPORT);
    await copySampleReport(admin, SQL_SAMPLE, BLOCKED_GRANTED_REPORT, BLOCKED_CONNECTION);

    await createUser(admin, GRANTEE.username, GRANTEE.password, 'JOB_OPERATOR');
  });

  test.afterAll(async () => {
    const admin = await login(ADMIN.username, ADMIN.password);

    await statusAs(admin, 'DELETE', `/api/iam/users/${GRANTEE.username}`);
    for (const reportId of [GRANTED_REPORT, UNGRANTED_REPORT, BLOCKED_GRANTED_REPORT])
      await statusAs(admin, 'DELETE', `/api/reports/${reportId}`);
    await statusAs(admin, 'DELETE', `/api/connections/${ALLOWED_CONNECTION}`);
    await statusAs(admin, 'DELETE', `/api/connections/${BLOCKED_CONNECTION}`);
  });

  test('(report-grants) only an ADMIN grants reports', async () => {
    // Granting yourself a report is the self-service this door exists to prevent, so everybody who
    // is not an administrator is asked at each of the three places a grant is read or written: the
    // catalogue the dialog is built from, the create, and the update.
    const admin = await login(ADMIN.username, ADMIN.password);
    const groupId = await createGroup(admin, 'e2e-grants-role-check', { reports: [GRANTED_REPORT] });

    try {
      for (const who of [AUTHOR, OPERATOR, VIEWER]) {
        const cookie = await login(who.username, who.password);

        expect(
          await statusAs(cookie, 'GET', '/api/iam/reports'),
          `${who.username} may not even read the catalogue the grant dialog is built from`,
        ).toBe(403);
        expect(
          await statusAs(cookie, 'POST', '/api/iam/groups', {
            name: `e2e-grants-by-${who.username}`,
            reports: [GRANTED_REPORT],
          }),
          `${who.username} may not create a group that grants reports`,
        ).toBe(403);
        expect(
          await statusAs(cookie, 'PUT', `/api/iam/groups/${groupId}`, {
            name: 'e2e-grants-role-check',
            reports: [GRANTED_REPORT, UNGRANTED_REPORT],
          }),
          `${who.username} may not widen a group that already grants`,
        ).toBe(403);
      }

      expect(
        (await listGroups(admin)).find((g) => g.id === groupId).reports,
        'and after all that the group grants exactly what its administrator gave it',
      ).toEqual([GRANTED_REPORT]);
    } finally {
      await deleteGroup(admin, groupId);
    }
  });

  test('(report-grants) a member of a granting group sees the union of what their groups name, and somebody in no granting group still sees everything', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const granting = await createGroup(admin, 'e2e-grants-naming-one', {
      reports: [GRANTED_REPORT],
    });
    const silent = await createGroup(admin, 'e2e-grants-naming-none', {});

    try {
      // In the silent group alone: it names no report, so it takes no report away.
      await setUserGroups(admin, GRANTEE.username, [silent]);
      expect(
        await reportIdsOf(await login(GRANTEE.username, GRANTEE.password)),
        'a group that grants no report grants every report',
      ).toEqual(expect.arrayContaining([GRANTED_REPORT, UNGRANTED_REPORT]));

      // In both: what they get is the union of what their groups name, and the silent group adds
      // nothing to it. An implementation that judged the question group by group would hand
      // everything back through that group — which is the mistake this test is here for.
      await setUserGroups(admin, GRANTEE.username, [granting, silent]);
      const cookie = await login(GRANTEE.username, GRANTEE.password);
      const ids = await reportIdsOf(cookie);

      expect(ids, 'the granted report is theirs').toContain(GRANTED_REPORT);
      expect(
        ids,
        'and nothing else is, although one of their two groups names no report at all',
      ).not.toContain(UNGRANTED_REPORT);

      const refused = await submitJob(cookie, {
        type: 'generate',
        reportId: UNGRANTED_REPORT,
        input: 'samples/reports/payslips/Payslips.csv',
      });
      expect(refused.status, 'and the id is refused, not merely left out of a list').toBe(403);
      expect(
        refused.text,
        'with a sentence that says whose decision it was, so the answer is actionable',
      ).toContain('groups');

      // Taken out of the granting group they are back to everything: a grant narrows a group, it
      // does not leave a mark on the person.
      await setUserGroups(admin, GRANTEE.username, []);
      expect(
        await reportIdsOf(await login(GRANTEE.username, GRANTEE.password)),
        'somebody in no group at all is narrowed by nothing',
      ).toEqual(expect.arrayContaining([GRANTED_REPORT, UNGRANTED_REPORT]));
    } finally {
      await setUserGroups(admin, GRANTEE.username, []);
      await deleteGroup(admin, granting);
      await deleteGroup(admin, silent);
    }
  });

  test('(report-grants) a granted report on a connection the caller may not use is still refused', async () => {
    // Where the two layers meet, and the mistake this design most invites: a grant reads like
    // permission, and it is not — it can only take reports away. The group below grants the report
    // by name and forbids the database it reads.
    const admin = await login(ADMIN.username, ADMIN.password);
    const groupId = await createGroup(admin, 'e2e-grants-over-limits', {
      settings: { connections: [ALLOWED_CONNECTION] },
      reports: [GRANTED_REPORT, BLOCKED_GRANTED_REPORT],
    });

    try {
      await setUserGroups(admin, GRANTEE.username, [groupId]);
      const cookie = await login(GRANTEE.username, GRANTEE.password);
      const before = await jobCount(admin);

      const ids = await reportIdsOf(cookie);
      expect(ids, 'the granted report they also have the connection for is offered').toContain(
        GRANTED_REPORT,
      );
      expect(
        ids,
        'the other one is granted and still listed nowhere: layer 2 never widens layer 1',
      ).not.toContain(BLOCKED_GRANTED_REPORT);

      const refused = await submitJob(cookie, {
        type: 'generate',
        reportId: BLOCKED_GRANTED_REPORT,
      });
      expect(refused.status, 'and asked for by id it is refused all the same').toBe(403);
      expect(
        refused.text,
        'by the connection — the older answer, and the one that says what is actually wrong',
      ).toContain(BLOCKED_CONNECTION);
      expect(await jobCount(admin), 'and no job was created').toBe(before);
    } finally {
      await setUserGroups(admin, GRANTEE.username, []);
      await deleteGroup(admin, groupId);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § The dashboard viewer — what their groups grant, and nothing else
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Auth — Server: the dashboard viewer', () => {

  test.afterEach(async () => {
    // Every test here puts the viewer in throwaway groups. Left behind, the next test would start
    // with grants nobody in it asked for — and "sees no dashboards" would be the first to go red.
    const admin = await login(ADMIN.username, ADMIN.password);
    await setUserGroups(admin, VIEWER.username, []);
    for (const group of await listGroups(admin))
      if (group.name.startsWith('e2e-viewer-')) await deleteGroup(admin, group.id);
  });

  test('(viewer) a viewer in no granting group sees no dashboards', async () => {
    // Nothing is granted by default. The opposite — a viewer who sees everything until somebody
    // restricts them — would hand out every dashboard on the server the moment an account is made.
    const viewer = await login(VIEWER.username, VIEWER.password);

    const mine = await myDashboards(viewer);
    expect(mine.dashboards, 'nobody has shared anything with them yet').toEqual([]);
    expect(mine.defaultDashboard, 'so there is nowhere for them to land').toBeNull();

    const reads = await dashboardReadStatuses(viewer, SAMPLE_DASHBOARD);
    expect(reads.page, 'and the page is refused, not served empty').toBe(403);
    expect(reads.config).toBe(403);
    expect(
      await statusAs(viewer, 'GET', `/api/reports/${SAMPLE_DASHBOARD}/data?componentId=topCustomers`),
      'above all the rows, which are the data itself',
    ).toBe(403);
  });

  test('(viewer) a viewer reads the dashboards granted to their group, and only those', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const groupId = await createGroup(admin, 'e2e-viewer-one-dashboard', {
      dashboards: [SAMPLE_DASHBOARD],
      defaultDashboard: SAMPLE_DASHBOARD,
    });

    await setUserGroups(admin, VIEWER.username, [groupId]);
    const viewer = await login(VIEWER.username, VIEWER.password);

    const mine = await myDashboards(viewer);
    expect(mine.dashboards.map((d) => d.id)).toEqual([SAMPLE_DASHBOARD]);
    expect(mine.defaultDashboard).toBe(SAMPLE_DASHBOARD);

    const granted = await dashboardReadStatuses(viewer, SAMPLE_DASHBOARD);
    expect(granted.page, 'the granted dashboard opens').toBe(200);
    expect(granted.config).toBe(200);

    // The one that was not granted, asked for every way it can be asked for — a refusal that covered
    // the page but not the data would hand out the data to anybody who guessed the id.
    const ungranted = await dashboardReadStatuses(viewer, PIVOT_DASHBOARD);
    expect(ungranted.page, 'and the other dashboard is not theirs, by URL either').toBe(403);
    expect(ungranted.config).toBe(403);
    expect(ungranted.pivot, 'pivoting is a read of the same data by another name').toBe(403);
    expect(
      await statusAs(viewer, 'GET', `/api/reports/${PIVOT_DASHBOARD}/data?componentId=pivot`),
      'and its rows are refused whatever component is named',
    ).toBe(403);
  });

  test('(viewer) every door a granted dashboard’s own template opens answers for the viewer, in one test', async () => {
    // The doors are not guessed: they are read off g-dashboard-template.html, which holds
    // <rb-parameters>, four <rb-value component-id="atomicValues">, two <rb-chart> (revenueTrend,
    // revenueByCategory), one <rb-tabulator component-id="topCustomers"> and one
    // <rb-pivot-table component-id="orderExplorer">. Between them those components call three
    // endpoints — /dashboard/{id}, /api/reports/{id}/config and /api/reports/{id}/data per
    // component — plus /api/analytics/pivot when the pivot aggregates server-side.
    //
    // All of it in ONE test on purpose: a dashboard that renders half is what this is about, and a
    // test per door would go green on the doors that work.
    const admin = await login(ADMIN.username, ADMIN.password);
    const groupId = await createGroup(admin, 'e2e-viewer-whole-dashboard', {
      dashboards: [SAMPLE_DASHBOARD],
      defaultDashboard: SAMPLE_DASHBOARD,
    });
    await setUserGroups(admin, VIEWER.username, [groupId]);
    const viewer = await login(VIEWER.username, VIEWER.password);

    const shut: string[] = [];
    const door = async (what: string, check: () => Promise<void>) => {
      try {
        await check();
      } catch (whyItIsShut) {
        shut.push(`  - ${what}: ${(whyItIsShut as Error).message}`);
      }
    };

    await door('the dashboard page', async () => {
      const page = await fetch(`${BASE_URL}/dashboard/${SAMPLE_DASHBOARD}`, {
        headers: { Cookie: viewer },
        redirect: 'manual',
      });
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('<rb-dashboard');
    });

    await door('the config every rb-* component reads first', async () => {
      const config = await answerAs(viewer, 'GET', `/api/reports/${SAMPLE_DASHBOARD}/config`);
      expect(config.status).toBe(200);
      expect(config.json?.outputType).toBe('output.dashboard');
    });

    for (const componentId of [
      'atomicValues',
      'revenueTrend',
      'revenueByCategory',
      'topCustomers',
      'orderExplorer',
    ]) {
      await door(`the rows of the ${componentId} widget`, async () => {
        const data = await answerAs(
          viewer,
          'GET',
          `/api/reports/${SAMPLE_DASHBOARD}/data?componentId=${componentId}`,
        );
        expect(data.status).toBe(200);
        // A failed fetch answers 200 with one ERROR_MESSAGE row (CliJob.doFetchData), so the status
        // alone would report an empty widget as an open door.
        expect(data.json?.reportColumnNames ?? []).not.toContain('ERROR_MESSAGE');
        expect(data.json?.data?.length ?? 0).toBeGreaterThan(0);
      });
    }

    await door('the server-side pivot the pivot widget can ask for', async () => {
      const pivot = await answerAs(viewer, 'POST', `/api/analytics/pivot?reportId=${SAMPLE_DASHBOARD}`, {
        rows: ['country'],
        cols: [],
        vals: ['revenue'],
        aggregatorName: 'Sum',
      });
      expect(pivot.status).toBe(200);
      expect(pivotCellCount(pivot.json)).toBeGreaterThan(0);
    });

    expect(
      shut,
      `a dashboard a viewer was granted must open completely, and these doors did not:\n${shut.join('\n')}`,
    ).toEqual([]);
  });

  test('(viewer) an ungranted dashboard refuses at every one of those doors and leaks nothing', async () => {
    // The same enumerated set as the test above, on the dashboard nobody granted them. Every door
    // 403, and no body carrying rows, a column name of theirs, or the page itself — a refusal that
    // says what it is refusing hands out half of what it refuses.
    const admin = await login(ADMIN.username, ADMIN.password);
    const groupId = await createGroup(admin, 'e2e-viewer-other-dashboard', {
      dashboards: [SAMPLE_DASHBOARD],
      defaultDashboard: SAMPLE_DASHBOARD,
    });
    await setUserGroups(admin, VIEWER.username, [groupId]);
    const viewer = await login(VIEWER.username, VIEWER.password);

    const leaked: string[] = [];
    const saysNothing = (what: string, status: number, body: string) => {
      if (status !== 403) leaked.push(`  - ${what} answered ${status}, not a refusal`);
      for (const giveaway of ['<rb-dashboard', 'CompanyName', 'companyName', 'revenue', 'conncode'])
        if (body.includes(giveaway)) leaked.push(`  - ${what} leaked ${giveaway}: ${body.slice(0, 200)}`);
    };

    const page = await fetch(`${BASE_URL}/dashboard/${PIVOT_DASHBOARD}`, {
      headers: { Cookie: viewer },
      redirect: 'manual',
    });
    saysNothing('the dashboard page', page.status, await page.text());

    const config = await answerAs(viewer, 'GET', `/api/reports/${PIVOT_DASHBOARD}/config`);
    saysNothing('the config', config.status, config.text);

    for (const componentId of ['atomicValues', 'revenueTrend', 'topCustomers', 'orderExplorer']) {
      const data = await answerAs(
        viewer,
        'GET',
        `/api/reports/${PIVOT_DASHBOARD}/data?componentId=${componentId}`,
      );
      saysNothing(`the rows of the ${componentId} widget`, data.status, data.text);
    }

    const pivot = await answerAs(viewer, 'POST', `/api/analytics/pivot?reportId=${PIVOT_DASHBOARD}`, {
      rows: ['country'],
      cols: [],
      vals: ['revenue'],
      aggregatorName: 'Sum',
    });
    saysNothing('the server-side pivot', pivot.status, pivot.text);

    expect(leaked, `an ungranted dashboard must refuse at every door and leak nothing:\n${leaked.join('\n')}`).toEqual(
      [],
    );

    // And the refusal is about that one dashboard, not about dashboards: the granted one still
    // opens in the same session.
    expect(
      (await dashboardReadStatuses(viewer, SAMPLE_DASHBOARD)).config,
      'while the dashboard they were granted is still theirs',
    ).toBe(200);
  });

  test('(viewer) two groups give the distinct union, and the default comes from the first group by name', async () => {
    // Two groups overlap as soon as a second one exists, and somebody has to decide which default
    // wins. By group name, because that is the one thing an administrator can see and change on the
    // screen — a hidden order (creation date, id) would make the answer unexplainable.
    const admin = await login(ADMIN.username, ADMIN.password);
    const first = await createGroup(admin, 'e2e-viewer-a-finance', {
      dashboards: [SAMPLE_DASHBOARD],
      defaultDashboard: SAMPLE_DASHBOARD,
    });
    const second = await createGroup(admin, 'e2e-viewer-b-sales', {
      dashboards: [SAMPLE_DASHBOARD, PIVOT_DASHBOARD],
      defaultDashboard: PIVOT_DASHBOARD,
    });

    await setUserGroups(admin, VIEWER.username, [first, second]);
    const mine = await myDashboards(await login(VIEWER.username, VIEWER.password));

    expect(
      mine.dashboards.map((d) => d.id).sort(),
      'a dashboard both groups grant is offered once',
    ).toEqual([SAMPLE_DASHBOARD, PIVOT_DASHBOARD].sort());
    expect(
      mine.dashboards.map((d) => d.name),
      'and the switcher is handed them in the order it shows them: by name',
    ).toEqual([...mine.dashboards.map((d) => d.name)].sort());
    expect(mine.defaultDashboard, 'the first group by name decides where they land').toBe(
      SAMPLE_DASHBOARD,
    );

    // Renaming is the whole proof: nothing else changes, so a default that moves can only have come
    // from the order of the names.
    await updateGroup(admin, first, {
      name: 'e2e-viewer-c-finance',
      dashboards: [SAMPLE_DASHBOARD],
      defaultDashboard: SAMPLE_DASHBOARD,
    });

    expect(
      (await myDashboards(await login(VIEWER.username, VIEWER.password))).defaultDashboard,
      'now that the other group sorts first, its default is the one that opens',
    ).toBe(PIVOT_DASHBOARD);
  });

  test('(viewer) a group default must be one of its own dashboards', async () => {
    // A default the group does not grant is a landing page its members are refused — an empty screen
    // on sign-in, and nothing on it saying why. Refused where it is written instead.
    const admin = await login(ADMIN.username, ADMIN.password);
    const groupId = await createGroup(admin, 'e2e-viewer-bad-default', {
      dashboards: [SAMPLE_DASHBOARD],
      defaultDashboard: SAMPLE_DASHBOARD,
    });

    expect(
      await statusAs(admin, 'PUT', `/api/iam/groups/${groupId}`, {
        name: 'e2e-viewer-bad-default',
        dashboards: [SAMPLE_DASHBOARD],
        defaultDashboard: PIVOT_DASHBOARD,
      }),
      'a default outside the grants is refused',
    ).toBe(400);

    const group = (await listGroups(admin)).find((g) => g.id === groupId);
    expect(group.defaultDashboard, 'and the group is left exactly as it was').toBe(SAMPLE_DASHBOARD);
    expect(group.dashboards).toEqual([SAMPLE_DASHBOARD]);
  });

  test('(viewer) grants restrict viewers only', async () => {
    // Grants are how a viewer is given something, not how everybody else is taken from. No role above
    // the bottom rung has ever been restricted to a list of dashboards, and this is not where that
    // would start — an author who published a dashboard must not lose it by not being in a group.
    for (const who of [AUTHOR, OPERATOR]) {
      const cookie = await login(who.username, who.password);

      const reads = await dashboardReadStatuses(cookie, PIVOT_DASHBOARD);
      expect(reads.page, `${who.username} opens a dashboard no group of theirs grants`).toBe(200);
      expect(reads.config).toBe(200);
    }

    const author = await login(AUTHOR.username, AUTHOR.password);
    const mine = await myDashboards(author);
    expect(
      mine.dashboards.map((d) => d.id),
      'and the catalogue an author is offered is every published dashboard',
    ).toEqual(expect.arrayContaining([SAMPLE_DASHBOARD, PIVOT_DASHBOARD]));
    expect(
      mine.defaultDashboard,
      'with no default: an author does not land on a dashboard, they work in the product',
    ).toBeNull();
  });

  test('(viewer) a share link still opens a dashboard the viewer was not granted', async () => {
    // A share link is a capability on its own: it carries the report it was made for, and it is not
    // read as "this person may see this". Somebody holding the link is a recipient, not a viewer —
    // so grants have nothing to say about them, and a link must not stop working because a viewer
    // exists who was never granted that dashboard.
    const admin = await login(ADMIN.username, ADMIN.password);
    const author = await login(AUTHOR.username, AUTHOR.password);

    try {
      const { token } = await createShareLink(author, PIVOT_DASHBOARD, 1);

      const shared = await getDashboardAnonymously(PIVOT_DASHBOARD, token);
      expect(shared.status, 'the link opens for a caller with no account at all').toBe(200);
      expect(shared.body, 'and it is the dashboard, not the sign-in page').toContain('<rb-dashboard');

      // The viewer, in no group granting it, is still refused — which is what makes the line above a
      // statement about the link rather than about the dashboard being public.
      const viewer = await login(VIEWER.username, VIEWER.password);
      expect(
        (await dashboardReadStatuses(viewer, PIVOT_DASHBOARD)).page,
        'a session is judged by grants, a link by the link',
      ).toBe(403);
    } finally {
      await revokeAllShareLinks(admin, PIVOT_DASHBOARD);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § The AI Hub is behind the same sign-in
// ═══════════════════════════════════════════════════════════════════════════
//
// The AI Hub runs on its own port but has no accounts of its own. Its middleware
// forwards the caller's DataPallas cookie to /api/auth/me — cookies are scoped by
// host, not by port — and decides from the answer:
//
//   not signed in            → 401 on its API
//   signed in, cannot author → 403 ("You need to be ADMIN or REPORT_AUTHOR")
//   ADMIN or REPORT_AUTHOR   → through
//
// So the door is asserted the way the middleware decides it: by sending the very
// same session cookie a browser would. Its own API paths are used because page
// routes fall through to the app's client-side sign-in form, which is a UI state
// rather than a status code.
//
// NEEDS DOCKER — this block boots the AI Hub container.
//
const AI_HUB_APP_ID = 'flowkraft-data-canvas';
const AI_HUB_URL = 'http://localhost:8440';
/** Not in the middleware's ALWAYS_PUBLIC list, so the decision is actually exercised. */
const AI_HUB_GUARDED_PATH = '/api/explorations';

/**
 * The smallest complete piece of work the AI Hub exists for, done end to end and cleaned up after.
 *
 * A canvas that merely opens proves the door and nothing past it. Everything past it goes back to
 * the DataPallas backend under the same session — listing the schema, the implicit SELECT the widget
 * fires when a table is dropped on the canvas, and the export that writes a dashboard report — so
 * this is what fails if `editReports` lets a role into the app whose API calls are then refused one
 * at a time.
 *
 * `waitForWidgetData` is the assertion that carries the weight: it throws on the widget's error
 * state, so a refused query fails here with its message rather than quietly rendering an empty box.
 */
async function exploreAndPublishAs(
  page: Page,
  user: { username: string; password: string },
  canvasName: string,
  afterPublish?: (publishedReportId: string) => Promise<void>,
) {
  let canvasId: string | undefined;
  let reportId: string | undefined;

  try {
    await openApp(page);
    await signInThroughTheUi(new FluentTester(page), user);

    await createFreshCanvas(page, `${AI_HUB_URL}/explore-data`, canvasName);
    canvasId = new URL(page.url()).pathname.split('/').filter(Boolean).pop();

    await selectConnection(page, EXPLORE_CONNECTION_NAME, 'sqlite');
    await addTableToCanvas(page, EXPLORE_TABLE);
    await waitForWidgetData(page, await getLastWidgetId(page));

    const published = await publishDashboard(page);
    reportId = published.reportId;
    expect(reportId, 'publishing answers with the report it wrote').toBeTruthy();

    // …and it really wrote one. A dashboard URL naming a report that does not exist is the failure
    // this catches — the same "not just a 201 that wrote nothing" check the report tests make.
    const admin = await login(ADMIN.username, ADMIN.password);
    expect(
      JSON.stringify(await jsonAs(admin, '/api/reports')),
      'the published dashboard is a report on the server afterwards',
    ).toContain(reportId);

    // Anything that can only be asked while the canvas is open AND published — the Share button is
    // the case this exists for, since it renders only once `exportedReportCode` is set.
    if (afterPublish) await afterPublish(reportId);
  } finally {
    // In a finally because a failure partway through still leaves a canvas — and, if it got that
    // far, a published report — behind. Removed as the administrator: whether the ROLE may delete
    // them is a different question, asked by the tests that ask it.
    const admin = await login(ADMIN.username, ADMIN.password);
    if (reportId) await statusAs(admin, 'DELETE', `/api/reports/${reportId}`);
    if (canvasId) await statusAs(admin, 'DELETE', `/api/explorations/${canvasId}`);
  }
}

test.describe('Auth — Server: the AI Hub door', () => {

  test.beforeAll(async ({ browser }) => {
    // A hook inherits the 180s test timeout, and this one can be starting the AI Hub for the first
    // time on a machine — which means docker BUILDING letta, chat2db, baibot, code-server and the
    // frontend before a single container starts. That is minutes, not seconds, and when the hook
    // times out mid-build teardown tears down a half-started stack: the run this replaces died with
    // `dependency failed to start: container flowkraft-ai-hub-letta exited (137)`.
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    const page = await browser.newPage();

    // try/finally, not a bare sequence: startApp really boots a container, so a failure between
    // booting it and reaching the tests must still give the page back. The container itself is
    // afterAll's problem, and afterAll runs even when this hook throws.
    try {
      await openApp(page);

      const ft = new FluentTester(page);
      await signInThroughTheUi(ft, ADMIN);

      // The exploration tests below read real rows, which needs a real database connection — and no
      // installation ships one. Created here rather than inside either test so both roles explore the
      // same data, and so the cost is paid once. Creating it is an ADMIN capability, which is why the
      // hook is signed in as one.
      //
      // BEFORE the app is started, and that order is not cosmetic: waitForServerReady below drives
      // this same page to the AI Hub with page.goto, and gotoConnections() navigates by clicking the
      // DataPallas menus rather than by URL. Run afterwards, it waits for a menu that does not exist
      // on an AI Hub page — silently, until the hook's own five-thousand-second budget runs out.
      await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
        ft,
        EXPLORE_CONNECTION_NAME,
        'sqlite',
      );

      await SelfServicePortalsTestHelper.startApp(ft.gotoApps(), AI_HUB_APP_ID);
      await SelfServicePortalsTestHelper.waitForServerReady(page, AI_HUB_URL);
    } finally {
      await page.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    // Same reason as beforeAll: stopping a stack of eight containers is not a 180-second job either,
    // and a teardown that times out is a teardown that leaves them running.
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // Each step is caught on its own, so one failure cannot skip the ones after it. The pattern is
    // explore-data-smart-defaults.spec.ts's: ask the app to stop, then take the stack down anyway.
    // Stopping through the UI needs a working sign-in, and a suite that failed mid-way is exactly
    // when that is least likely — which is why it is not the only thing standing between a run and
    // a container left running on the developer's machine.
    const page = await browser.newPage();

    try {
      await openApp(page);

      const ft = new FluentTester(page);
      await signInThroughTheUi(ft, ADMIN);

      // Caught on its own, so failing to remove the connection cannot leave the container running,
      // and failing to stop the container cannot leave the connection behind for the next run to
      // collide with.
      try {
        await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
          ft,
          `${EXPLORE_CONNECTION_CODE}\\.xml`,
          'sqlite',
        );
      } catch (e) {
        console.error('Failed to remove the exploration database connection:', e);
      }

      await SelfServicePortalsTestHelper.stopApp(ft.gotoApps(), AI_HUB_APP_ID);
    } catch (e) {
      console.error('Failed to stop the AI Hub through the UI:', e);
    } finally {
      try {
        await page.close();
      } catch (e) {
        console.error('Failed to close the teardown page:', e);
      }
    }

    // The backstop. `down -v` rather than `down -v --rmi local`: this suite only needs the
    // containers gone, and dropping the built image would make every subsequent run rebuild it.
    try {
      SelfServicePortalsTestHelper.dockerComposeDownKeepImage('flowkraft/_ai-hub');
    } catch (e) {
      console.error('Failed to take the AI Hub stack down:', e);
    }
  });

  test('(aihub) nobody signed in is turned away', async () => {
    const res = await fetch(`${AI_HUB_URL}${AI_HUB_GUARDED_PATH}`);

    expect(res.status, 'the AI Hub has no anonymous mode').toBe(401);
  });

  test('(aihub) an ADMIN is let in', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);

    const res = await fetch(`${AI_HUB_URL}${AI_HUB_GUARDED_PATH}`, { headers: { Cookie: admin } });

    expect([401, 403], 'an administrator authors').not.toContain(res.status);
  });

  test('(aihub) a REPORT_AUTHOR is let in', async () => {
    const author = await login(AUTHOR.username, AUTHOR.password);

    const res = await fetch(`${AI_HUB_URL}${AI_HUB_GUARDED_PATH}`, { headers: { Cookie: author } });

    expect([401, 403], 'authoring is exactly what this app is for').not.toContain(res.status);
  });

  test('(aihub) the shipped burst / burst account is let in', async () => {
    const shipped = await login(SHIPPED.username, SHIPPED.password);

    const res = await fetch(`${AI_HUB_URL}${AI_HUB_GUARDED_PATH}`, { headers: { Cookie: shipped } });

    expect([401, 403], 'the account a fresh Server ships with administers everything').not.toContain(
      res.status,
    );
  });

  test('(aihub) a JOB_OPERATOR is turned away at the door', async () => {
    const operator = await login(OPERATOR.username, OPERATOR.password);

    const res = await fetch(`${AI_HUB_URL}${AI_HUB_GUARDED_PATH}`, {
      headers: { Cookie: operator },
    });

    // Signed in perfectly well, and still refused: there is nothing here an operator can do, so they
    // are turned away rather than let into a shell where every panel refuses them.
    expect(res.status).toBe(403);
  });

  // The status codes above are only half the door. On a PAGE route the middleware deliberately falls
  // through (NextResponse.next()) and lets the app explain itself, so what a person actually meets
  // is a screen — and a screen is what these two assert.

  test('(aihub) somebody not signed in meets a sign-in form', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

    // No DataPallas sign-in first: this context carries no session cookie at all.
    await page.goto(AI_HUB_URL);

    await new FluentTester(page)
      .waitOnElementToBecomeVisible('#dp-username')
      .elementShouldBeVisible('#dp-password')
      // Not signed in is not the same as signed in under the wrong role, and the screen must not
      // confuse the two.
      .elementShouldNotBeVisible('#aiHubRoleNotice');
  });

  test('(aihub) an ADMIN gets the app itself, not the sign-in form', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

    // The administrator's counterpart of the author test below. Both are let in for the same
    // reason — the backend's editReports capability — but "let in" was only ever asserted here as
    // a status code that was not 401 or 403, which a page that never rendered would also satisfy.
    await openApp(page);
    await signInThroughTheUi(new FluentTester(page), ADMIN);

    await page.goto(AI_HUB_URL);

    await new FluentTester(page)
      .waitOnElementToBecomeInvisible('#dp-username')
      .elementShouldNotBeVisible('#aiHubRoleNotice');
  });

  test('(aihub) a REPORT_AUTHOR gets the app itself, not the sign-in form', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

    // The positive counterpart of the two refusals below it. Without this, "an author may explore
    // data" is proven only as "the middleware did not answer 401 or 403" — which an app that fails
    // to render at all would also satisfy.
    await openApp(page);
    await signInThroughTheUi(new FluentTester(page), AUTHOR);

    await page.goto(AI_HUB_URL);

    await new FluentTester(page)
      .waitOnElementToBecomeInvisible('#dp-username')
      .elementShouldNotBeVisible('#aiHubRoleNotice');
  });

  test('(aihub) an ADMIN explores real data and publishes a dashboard', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // Both roles the middleware admits get the same test, because they are admitted by the same
    // capability (editReports) but hold it for different reasons — an author by their own rung, an
    // administrator by inheriting it. A regression in the ladder would take one and not the other.
    await exploreAndPublishAs(page, ADMIN, 'e2e-admin-canvas');
  });

  test('(aihub) a REPORT_AUTHOR explores real data, publishes a dashboard and shares it', async ({
    page,
  }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // The one thing explore-data-smart-defaults.spec.ts cannot show. That file proves the mechanics
    // of exploring in far more depth than this does — but it runs on the desktop, where there is no
    // authentication at all, so every call it makes is made by nobody in particular. This asks the
    // same flow the only way that matters here: as a signed-in REPORT_AUTHOR, whose reach ends one
    // rung below the administrator's.
    await exploreAndPublishAs(page, AUTHOR, 'e2e-author-canvas', async (reportId) => {
      // The sharing rules themselves are asserted over HTTP further down, where they need no browser
      // and no container. What only a browser can answer is whether the feature is REACHABLE: the
      // Share button renders solely when publishing has set `exportedReportCode`, so this is the one
      // moment it can be checked. If it ever stops rendering, every API test below stays green while
      // nobody in the product can hand out a link — the exact failure an API-only suite is blind to.
      // Only ids that already ship. The AI Hub is served from a prebuilt Docker image, and neither
      // `clean-testground` (which excludes testground/e2e/_apps) nor `startApp` (which recreates the
      // container without --build) refreshes it — so an id added to the React source today is not in
      // the running app, and a test depending on one would pass only on a machine where somebody had
      // rebuilt the image by hand.
      const ft = new FluentTester(page);
      await ft
        .waitOnElementToBecomeVisible('#btnShareDashboard')
        .click('#btnShareDashboard')
        .waitOnElementToBecomeVisible('#shareDialog')
        .elementShouldBeVisible('#tableShareLinks')
        .dropDownSelectOptionHavingValue('#shareExpiry', '7')
        .click('#btnCreateShareLink')
        // The URL appearing IS the link having been created — it is shown once and never again,
        // because the server stores only a hash. That the link is then listed, and that revoking it
        // works, are asserted over HTTP further down, where the row's server-generated id can be read
        // instead of guessed at through a selector.
        .waitOnElementToBecomeVisible('#shareNewUrl')
        .waitOnInputValueToContainText('#shareNewUrl', '/dashboard/');

      // The dialog is deliberately left open. Closing it would click #btnShareClose, and on any build
      // where ShareDialog is not rendered through a portal the canvas widgets paint over that corner
      // of it — so the click waits for pointer events that never arrive, forever. Nothing after this
      // needs the page: the test ends here and its cleanup is HTTP.

      // Revoked over HTTP rather than from the row, because a row is addressed by the link id the
      // server generated and there is no id to write for it — and revocation itself is asserted in
      // full further down. What this had to prove is that the door into sharing exists at all.
      const author = await login(AUTHOR.username, AUTHOR.password);
      await revokeAllShareLinks(author, reportId);
    });
  });

  test('(aihub) a JOB_OPERATOR is told which roles the app needs', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

    // Sign in to DataPallas first. The session cookie is scoped to the host, not the port, so the
    // browser carries it to the AI Hub on :8440 by itself — which is the whole mechanism.
    await openApp(page);
    await signInThroughTheUi(new FluentTester(page), OPERATOR);

    await page.goto(AI_HUB_URL);

    await new FluentTester(page)
      .waitOnElementToBecomeVisible('#aiHubRoleNotice')
      // …and the way out is offered straight away: sign in as somebody who may author.
      .elementShouldBeVisible('#dp-username');
  });

  // ── the dashboard viewer's AI Hub ─────────────────────────────────────────
  //
  // NOTE, for a red run here: every id these tests use — #dashboardSwitcher, #viewNoDashboards,
  // #view-page-heading — is part of the viewer page added by this plan, and the AI Hub is served
  // from a prebuilt Docker image. Neither `clean-testground` nor `startApp` rebuilds that image, so
  // on a machine whose image predates this work these tests fail on ids that do exist in the source.
  // Rebuild the AI Hub image before reading their failure as a regression.

  /** Put the viewer in throwaway groups granting exactly these dashboards, landing on the first. */
  async function grantViewer(name: string, dashboards: string[], defaultDashboard?: string) {
    const admin = await login(ADMIN.username, ADMIN.password);
    const groupId = await createGroup(admin, name, {
      dashboards,
      ...(defaultDashboard ? { defaultDashboard } : {}),
    });
    await setUserGroups(admin, VIEWER.username, [groupId]);
    return groupId;
  }

  /** Take the viewer out of every group and remove the throwaway ones. */
  async function ungrantViewer() {
    const admin = await login(ADMIN.username, ADMIN.password);
    await setUserGroups(admin, VIEWER.username, []);
    for (const group of await listGroups(admin))
      if (group.name.startsWith('e2e-aihub-')) await deleteGroup(admin, group.id);
  }

  test('(aihub) a DASHBOARD_VIEWER is let in to /view, and any other page sends them to /view', async () => {
    const viewer = await login(VIEWER.username, VIEWER.password);
    const ask = (path: string) =>
      fetch(`${AI_HUB_URL}${path}`, { headers: { Cookie: viewer }, redirect: 'manual' });

    const view = await ask('/view');
    expect(view.status, 'their own page is served, not redirected and not refused').toBe(200);

    // A viewer typing /explore-data has not done anything wrong — they have gone to a part of the
    // product that is not theirs, and their dashboards say that better than an error page would.
    const explore = await ask('/explore-data');
    expect([307, 308, 302], 'any other page is a redirect').toContain(explore.status);
    expect(explore.headers.get('location'), 'and it goes to their dashboards').toContain('/view');

    // The app's own API is the authoring tool, and is refused exactly as it is for an operator.
    expect((await ask(AI_HUB_GUARDED_PATH)).status).toBe(403);

    // The proxy is the one API they must keep: every call through it is authorised by the backend as
    // this very person, dashboard grants included, so a second copy of those rules here could only
    // disagree with them.
    expect(
      [401, 403],
      'the backend proxy stays open — it is where their dashboard reads its data',
    ).not.toContain((await ask('/api/dp/auth/me')).status);
  });

  test('(aihub) a DASHBOARD_VIEWER lands on their default dashboard', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    await grantViewer('e2e-aihub-default', [SAMPLE_DASHBOARD], SAMPLE_DASHBOARD);

    try {
      await openApp(page);
      await signInThroughTheUi(new FluentTester(page), VIEWER);

      // The bare address, the way a bookmark or a link from an administrator would arrive.
      await page.goto(AI_HUB_URL);
      await page.waitForURL(/\/view/, { timeout: 60_000 });

      await expect(
        page.locator(`rb-dashboard[report-id="${SAMPLE_DASHBOARD}"]`),
        'the dashboard their groups land them on, chosen by the backend',
      ).toBeVisible({ timeout: 60_000 });

      // Rendered rows, not just the element: the page shell appears whether or not the data behind it
      // was authorised, and an empty dashboard is exactly what a grant that did not reach the data
      // would look like.
      await expect(
        page.locator('rb-dashboard .tabulator-row').first(),
        'with real rows in it',
      ).toBeVisible({ timeout: 60_000 });

      // The parameter control is fed by its own SELECT, run as this person. It listing more than the
      // empty option is the proof that the run-sql audit closed nothing a dashboard needs.
      await expect
        .poll(() => page.locator('#country option').count(), { timeout: 60_000 })
        .toBeGreaterThan(1);
    } finally {
      await ungrantViewer();
    }
  });

  test('(aihub) the switcher lists every dashboard from all their groups once, and switches', async ({
    page,
  }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // Two groups that overlap, which is the only interesting case: the switcher is built from the
    // union, and a dashboard granted twice must not be offered twice.
    const admin = await login(ADMIN.username, ADMIN.password);
    const first = await createGroup(admin, 'e2e-aihub-a-finance', {
      dashboards: [SAMPLE_DASHBOARD],
      defaultDashboard: SAMPLE_DASHBOARD,
    });
    const second = await createGroup(admin, 'e2e-aihub-b-sales', {
      dashboards: [SAMPLE_DASHBOARD, PIVOT_DASHBOARD],
      defaultDashboard: PIVOT_DASHBOARD,
    });
    await setUserGroups(admin, VIEWER.username, [first, second]);

    try {
      const expected = (await myDashboards(await login(VIEWER.username, VIEWER.password))).dashboards;
      expect(expected, 'the two groups grant two distinct dashboards').toHaveLength(2);

      await openApp(page);
      await signInThroughTheUi(new FluentTester(page), VIEWER);
      await page.goto(`${AI_HUB_URL}/view`);

      const switcher = page.locator('#dashboardSwitcher');
      await expect(switcher).toBeVisible({ timeout: 60_000 });
      await expect(
        switcher.locator('option'),
        'each dashboard once, in the order the backend sorted them',
      ).toHaveText(expected.map((d) => d.name));
      await expect(switcher, 'and the one on screen is the one selected').toHaveValue(
        SAMPLE_DASHBOARD,
      );

      await switcher.selectOption(PIVOT_DASHBOARD);
      await page.waitForURL(new RegExp(`/view\\?d=${PIVOT_DASHBOARD}`), { timeout: 60_000 });
      await expect(page.locator(`rb-dashboard[report-id="${PIVOT_DASHBOARD}"]`)).toBeVisible({
        timeout: 60_000,
      });

      // The id is in the query string so that the choice survives a reload and can be sent to a
      // colleague — a switcher that forgot it on F5 would be a switcher nobody could link from.
      await page.reload();
      await expect(page.locator(`rb-dashboard[report-id="${PIVOT_DASHBOARD}"]`)).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.locator('#dashboardSwitcher')).toHaveValue(PIVOT_DASHBOARD);
    } finally {
      await ungrantViewer();
    }
  });

  test('(aihub) a DASHBOARD_VIEWER sees no nav links and no settings gear, and signs out', async ({
    page,
  }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    await grantViewer('e2e-aihub-navbar', [SAMPLE_DASHBOARD], SAMPLE_DASHBOARD);

    try {
      await openApp(page);
      await signInThroughTheUi(new FluentTester(page), VIEWER);
      await page.goto(`${AI_HUB_URL}/view`);

      const ft = new FluentTester(page);
      await ft
        .waitOnElementToBecomeVisible('#dashboardSwitcher')
        // Explore, Canvases, Agents: the authoring app, which this person has no use for. Absent
        // rather than disabled — a menu of dead ends is worse than no menu.
        .elementShouldNotBeVisible('nav .menu-horizontal')
        .elementShouldNotBeVisible('#navbar-settings-button')
        // What stays: their own name, and the way out. Signing out is through the proxy, so it ends
        // the very session DataPallas itself holds.
        .elementShouldBeVisible('#userMenu')
        .click('#userMenu')
        .click('#btnLogout')
        .waitOnElementToBecomeVisible('#dp-username');
    } finally {
      await ungrantViewer();
    }
  });

  test('(aihub) a DASHBOARD_VIEWER with no dashboards is told so', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // An account made before anybody shared anything — the first thing a new viewer meets. Silence
    // here reads as a broken installation; the screen says who can fix it instead.
    await ungrantViewer();

    await openApp(page);
    await signInThroughTheUi(new FluentTester(page), VIEWER);
    await page.goto(`${AI_HUB_URL}/view`);

    await new FluentTester(page)
      .waitOnElementToBecomeVisible('#viewNoDashboards')
      // A picker with nothing in it only takes up room next to their name.
      .elementShouldNotBeVisible('#dashboardSwitcher');
  });

  test('(aihub) a viewer asking for a dashboard they were not granted is not shown it', async ({
    page,
  }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    await grantViewer('e2e-aihub-one-only', [SAMPLE_DASHBOARD], SAMPLE_DASHBOARD);

    try {
      await openApp(page);
      await signInThroughTheUi(new FluentTester(page), VIEWER);

      // A stale link, or a guess. Not an error worth a screen of its own — their own dashboard is a
      // better answer than a refusal they cannot act on — but it must not be the other dashboard.
      await page.goto(`${AI_HUB_URL}/view?d=${PIVOT_DASHBOARD}`);

      await expect(page.locator(`rb-dashboard[report-id="${SAMPLE_DASHBOARD}"]`)).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        page.locator(`rb-dashboard[report-id="${PIVOT_DASHBOARD}"]`),
        'the dashboard they asked for is not rendered at all',
      ).toHaveCount(0);

      // And the backend agrees, which is what actually protects the data: the page choosing a
      // different dashboard is a kindness, not the enforcement.
      const viewer = await login(VIEWER.username, VIEWER.password);
      expect((await dashboardReadStatuses(viewer, PIVOT_DASHBOARD)).config).toBe(403);
    } finally {
      await ungrantViewer();
    }
  });

  test("(aihub) an ADMIN's AI Hub is unchanged", async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // The other half of every test above: nothing the viewer page added may take anything away from
    // the people this app was built for. The operator's side of that is already covered by
    // "(aihub) a JOB_OPERATOR is turned away at the door".
    await openApp(page);
    await signInThroughTheUi(new FluentTester(page), ADMIN);
    await page.goto(AI_HUB_URL);

    await new FluentTester(page)
      .waitOnElementToBecomeInvisible('#dp-username')
      .elementShouldBeVisible('nav .menu-horizontal')
      .elementShouldBeVisible('#navbar-settings-button')
      // The switcher is the viewer's whole navigation, and an administrator has a menu instead.
      .elementShouldNotBeVisible('#dashboardSwitcher');
  });

  /**
   * Give a published report one `select` parameter, exactly the way the shipped `g-dashboard`
   * sample declares its own: a `<reportId>-report-parameters-spec.groovy` next to its settings.
   *
   * A canvas published from the AI Hub declares no parameters — there is no UI for that yet — so a
   * lock has nothing to bite on until one is wired here. `loadReportConfig` reads that file by name
   * and resolves its SQL-driven options through the report's own connection, so writing the file is
   * the whole of it; nothing in reporting.xml has to change.
   */
  async function giveReportACountryParameter(admin: string, reportId: string) {
    const groovy = `reportParameters {
    parameter(id: 'country', type: String, label: 'Country', defaultValue: '-- All --') {
        constraints(required: false)
        ui(control: 'select',
           options: "SELECT '-- All --' AS ShipCountry UNION ALL SELECT DISTINCT ShipCountry FROM Orders WHERE ShipCountry IS NOT NULL ORDER BY ShipCountry")
    }
}
`;
    const res = await fetch(`${BASE_URL}/api/reports/${reportId}/script/paramsSpecScript`, {
      method: 'PUT',
      headers: { Cookie: admin, ...xsrfHeader(admin), 'Content-Type': 'text/plain' },
      body: groovy,
    });
    expect(res.status, 'the parameter spec is saved on the report').toBe(200);

    // Saved is not the same as visible: the Share dialog offers what /config reports, and that is
    // the file having been found, parsed AND its options resolved against the connection.
    const config = await jsonAs(admin, `/api/reports/${reportId}/config`);
    expect(
      (config.parameters ?? []).map((p: any) => p.id),
      'and the report now reports it as a parameter',
    ).toContain('country');
  }

  test('(share-ui) a dashboard without parameters says a link always shows all of its data', async ({
    page,
  }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // The ordinary case, and the one that would be most confusing if it were silent: a canvas
    // published from the AI Hub declares no parameters, so the lock section has nothing to offer.
    // An empty box reads as "this is broken"; the sentence tells the author what their link will do.
    await exploreAndPublishAs(page, AUTHOR, 'e2e-shareui-noparams', async (reportId) => {
      const ft = new FluentTester(page);
      await ft
        .waitOnElementToBecomeVisible('#btnShareDashboard')
        .click('#btnShareDashboard')
        .waitOnElementToBecomeVisible('#shareDialog')
        .waitOnElementToBecomeVisible('#shareLockParams')
        .elementShouldContainText('#shareLockParams', 'no parameters')
        .elementShouldContainText('#shareLockParams', 'shows all of its data');

      // No control to lock with, either — the sentence is instead of them, not next to them.
      await expect(page.locator('#shareLockParams input[type="checkbox"]')).toHaveCount(0);

      // Left open on purpose, like the sharing test above: closing it clicks a button the canvas
      // widgets can paint over. Cleanup is HTTP.
      const author = await login(AUTHOR.username, AUTHOR.password);
      await revokeAllShareLinks(author, reportId);
    });
  });

  test('(share-ui) the author locks a parameter in the Share dialog, and the recipient sees it fixed', async ({
    page,
    browser,
  }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    await exploreAndPublishAs(page, AUTHOR, 'e2e-shareui-locked', async (reportId) => {
      const admin = await login(ADMIN.username, ADMIN.password);
      await giveReportACountryParameter(admin, reportId);

      // After the spec is written, because the dialog reads the report's parameters when it opens.
      const ft = new FluentTester(page);
      await ft
        .waitOnElementToBecomeVisible('#btnShareDashboard')
        .click('#btnShareDashboard')
        .waitOnElementToBecomeVisible('#shareDialog')
        .waitOnElementToBecomeVisible('#shareLockParam-country')
        .click('#shareLockParam-country');

      // The value is chosen with the report's OWN control — the same <rb-parameters> the viewer
      // gets — so the options here are the ones the SQL returned, not a second list written by the
      // dialog. Waiting for them is waiting for that round trip.
      const lockValue = page.locator('#shareLockValue-country #country');
      await expect(lockValue).toBeVisible({ timeout: 60_000 });
      await expect
        .poll(() => lockValue.locator('option').count(), { timeout: 60_000 })
        .toBeGreaterThan(1);
      await lockValue.selectOption('Germany');

      await page.locator('#btnCreateShareLink').click();
      await expect(page.locator('#shareNewUrl')).toBeVisible({ timeout: 60_000 });

      // The link is shown once and never again, so the table is where an author checks afterwards
      // what a link they already handed out will show.
      await expect(
        page.locator('#tableShareLinks'),
        'the links table says what this link is fixed to',
      ).toContainText('country = Germany');

      const shareUrl = await page.locator('#shareNewUrl').inputValue();
      expect(shareUrl, 'the link points at the dashboard that was just published').toContain(
        `/dashboard/${reportId}`,
      );

      // A separate context, which is the only honest way to ask this: the same browser profile still
      // holds the author's session cookie, and a page opened with it would prove nothing about what
      // somebody without an account sees.
      const recipientContext = await browser.newContext();
      try {
        const recipient = await recipientContext.newPage();
        await recipient.goto(shareUrl, { timeout: 60_000, waitUntil: 'networkidle' });

        const control = recipient.locator('#formReportParameters #country');
        await expect(control, 'the recipient is shown the parameter').toBeVisible({
          timeout: 60_000,
        });
        await expect(control, 'holding the value the author fixed').toHaveValue('Germany');
        await expect(control, 'and they cannot change it').toBeDisabled();
        // A dead control with no explanation reads as a broken page.
        await expect(recipient.locator('#country_lockedNote')).toBeVisible();
      } finally {
        await recipientContext.close();
      }

      const author = await login(AUTHOR.username, AUTHOR.password);
      await revokeAllShareLinks(author, reportId);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § Handing a dashboard to somebody without an account
// ═══════════════════════════════════════════════════════════════════════════
//
// Publishing does not make a dashboard public. An anonymous /dashboard/{code} is
// sent to the sign-in screen (`SignInRedirectEntryPoint`).
//
// "How public" is a SECOND, deliberate step: a share link, created in the AI Hub's
// Share dialog and minted by POST /api/embed/share-link. Anyone holding that URL
// reads that one dashboard with no account, until it expires or is revoked.
//
// Only WHO may share is tested here. How a link behaves once it exists — one link,
// one dashboard; revoking closes it; a bad token says nothing — is the same on
// every deployment, so it lives in auth-embed-share.spec.ts and runs everywhere.
//
// NO DOCKER, deliberately. DashboardController never checks that the report exists
// — it validates the token and emits the page, and the data that page then fetches
// is authorized separately. So none of this needs a canvas or a running AI Hub,
// which is why it sits outside the block that boots one: these rules stay covered
// even on a run where Docker never starts.
//
const SHARED_REPORT = 'e2e-shared-dashboard';
const OTHER_REPORT = 'e2e-other-dashboard';

/**
 * A dashboard that really exists, with real rows behind it. The two above are only codes: the page
 * shell is served for any code, so they prove who may OPEN a link, never who may READ what it shows.
 * g-dashboard ships in config/samples and reads the built-in rbt-sample-northwind-sqlite-4f2
 * connection (db/sample-northwind-sqlite/northwind.db) — no Docker, no starter pack.
 */
const SAMPLE_DASHBOARD = 'g-dashboard';
/** The other shipped dashboard, used wherever "granted this one and not that one" has to be said. */
const PIVOT_DASHBOARD = 'g-pivottable';

/** Create a share link. Returns the raw token — the only time the server ever discloses it. */
async function createShareLink(
  session: string,
  reportId: string,
  expiresInDays?: number,
): Promise<{ token: string; url: string }> {
  const res = await fetch(`${BASE_URL}/api/embed/share-link`, {
    method: 'POST',
    headers: { Cookie: session, ...xsrfHeader(session), 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId, ...(expiresInDays ? { expiresInDays } : {}) }),
  });
  expect(res.status, `creating a share link for ${reportId}`).toBe(200);
  return res.json();
}

/**
 * Open the dashboard page the way a recipient would: no session, nothing but what is in the URL.
 *
 * Redirects are deliberately not followed. A caller without a credential is sent to the sign-in
 * screen (`SignInRedirectEntryPoint`), and following that hop would report the Angular shell's 200
 * as though the dashboard itself had been served — which is the one answer these tests exist to
 * tell apart. What is asserted below is the answer the server gave, not where it leads.
 */
async function getDashboardAnonymously(
  reportCode: string,
  token?: string,
): Promise<{ status: number; body: string; location: string | null }> {
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  const res = await fetch(`${BASE_URL}/dashboard/${reportCode}${query}`, { redirect: 'manual' });
  return { status: res.status, body: await res.text(), location: res.headers.get('location') };
}

/** Remove every link for a report, so a re-run starts from nothing being shared. */
async function revokeAllShareLinks(session: string, reportId: string) {
  const links = (await jsonAs(session, `/api/embed/share-link?reportId=${reportId}`)) as Array<{
    id: number;
  }>;
  for (const link of links) await statusAs(session, 'DELETE', `/api/embed/share-link/${link.id}`);
}

test.describe('Auth — Server: handing a dashboard to somebody without an account', () => {

  test.afterAll(async () => {
    // Nothing this block created may outlive it. A share link that survives the run is an open door
    // left open, and the next run would find links it did not make.
    const admin = await login(ADMIN.username, ADMIN.password);
    await revokeAllShareLinks(admin, SHARED_REPORT);
    await revokeAllShareLinks(admin, OTHER_REPORT);
  });

  test('(share) publishing puts a dashboard on the server, not on the internet', async () => {
    const anonymous = await getDashboardAnonymously(SHARED_REPORT);
    expect(anonymous.body, 'a published dashboard is private until somebody shares it').not.toContain(
      '<rb-dashboard',
    );

    // Turned away, but not into a dead end: whoever opened the link in a browser is a reader, so they
    // are sent to the sign-in screen carrying where they were going, and land on the dashboard once
    // signed in. Only somebody with an account can take that route, which is the point.
    expect(anonymous.status, 'the page is refused, not served').toBe(302);
    expect(anonymous.location, 'and the reader is told where to sign in, and what they came for').toContain(
      `/#/login?returnUrl=${encodeURIComponent(`/dashboard/${SHARED_REPORT}`)}`,
    );

    // And nobody can hand themselves the key. The CSRF token is fetched first so this is refused for
    // being unauthenticated rather than for being a cross-site post — otherwise the 403 would prove
    // nothing about who may share.
    const csrf = await newCsrfCookie();
    expect(
      await statusAs(csrf, 'POST', '/api/embed/share-link', { reportId: SHARED_REPORT }),
      'sharing is a decision somebody signed in makes',
    ).toBe(401);
  });

  test('(share) a REPORT_AUTHOR shares a dashboard, and it opens with no account at all', async () => {
    const author = await login(AUTHOR.username, AUTHOR.password);
    const { token, url } = await createShareLink(author, SHARED_REPORT, 30);

    expect(url, 'the answer is the link to send').toContain(`/dashboard/${SHARED_REPORT}?token=`);

    const shared = await getDashboardAnonymously(SHARED_REPORT, token);
    expect(shared.status, 'the whole point of the feature').toBe(200);
    expect(shared.body, 'and it really is the dashboard page').toContain('<rb-dashboard');
  });

  test('(share) an ADMIN shares too, by inheriting the rung that may', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);

    // Sharing is REPORT_AUTHOR at the annotation, and an administrator holds every weaker role. That
    // is a property of the ladder in Role.java, not of this endpoint, which is exactly why it is
    // asserted rather than assumed.
    const { token } = await createShareLink(admin, OTHER_REPORT);
    expect((await getDashboardAnonymously(OTHER_REPORT, token)).status).toBe(200);

    await revokeAllShareLinks(admin, OTHER_REPORT);
  });

  test('(share) a JOB_OPERATOR cannot hand out a dashboard', async () => {
    const operator = await login(OPERATOR.username, OPERATOR.password);

    expect(
      await statusAs(operator, 'POST', '/api/embed/share-link', { reportId: SHARED_REPORT }),
      'making a dashboard readable without an account is an authoring decision, not an operating one',
    ).toBe(403);
    expect(
      await statusAs(operator, 'GET', `/api/embed/share-link?reportId=${SHARED_REPORT}`),
      'nor may an operator see what has been shared',
    ).toBe(403);
  });

  test("(share) without a link, nobody reads a dashboard's data — not its config, its rows, or its pivot", async () => {
    // This block's first test proves the PAGE is refused. The page is only a shell: what
    // a stranger would actually want is behind the three calls its components make. Each must refuse
    // on its own, on a dashboard that really has data.
    const csrf = await newCsrfCookie();
    const pivotBody = { rows: [], cols: [], vals: [], aggregatorName: 'Count' };

    const page = await getDashboardAnonymously(SAMPLE_DASHBOARD);
    expect(page.status, 'the page sends a stranger to sign in').toBe(302);
    expect(page.location).toContain(
      `/#/login?returnUrl=${encodeURIComponent(`/dashboard/${SAMPLE_DASHBOARD}`)}`,
    );

    // The CSRF cookie makes the POST fail for having no credential, not for being cross-site —
    // otherwise a 403 would prove nothing about who may read.
    expect(await statusAs(csrf, 'GET', `/api/reports/${SAMPLE_DASHBOARD}/config`), 'no config').toBe(401);
    expect(
      await statusAs(csrf, 'GET', `/api/reports/${SAMPLE_DASHBOARD}/data?componentId=topCustomers`),
      'no rows',
    ).toBe(401);
    expect(
      await statusAs(csrf, 'POST', `/api/analytics/pivot?reportId=${SAMPLE_DASHBOARD}`, pivotBody),
      'no pivot — the one endpoint whose rule turns on the report id',
    ).toBe(401);

    // A token that opens nothing must fall back to "sign in", never through.
    const bogus = 'not-a-real-share-token';
    expect(
      (await getDashboardAnonymously(SAMPLE_DASHBOARD, bogus)).status,
      'a dead link says so, and nothing more',
    ).toBe(404);
    expect(
      await statusAs(csrf, 'GET', `/api/reports/${SAMPLE_DASHBOARD}/config?token=${bogus}`),
      'a bad token earns no config',
    ).toBe(401);
    expect(
      await statusAs(
        csrf,
        'GET',
        `/api/reports/${SAMPLE_DASHBOARD}/data?componentId=topCustomers&token=${bogus}`,
      ),
      'nor rows',
    ).toBe(401);
    expect(
      await statusAs(
        csrf,
        'POST',
        `/api/analytics/pivot?reportId=${SAMPLE_DASHBOARD}&token=${bogus}`,
        pivotBody,
      ),
      'nor a pivot',
    ).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § Sign in and sign out
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Auth — Server: signing in and out', () => {

  // One per account that must be able to get in, each asserting the role it is reported as. A
  // sign-in that succeeds under the wrong role is not a sign-in that works.

  test('(signin) an ADMIN signs in and is reported as one', async () => {
    const me = (await getMe(await login(ADMIN.username, ADMIN.password)).then((r) =>
      r.json(),
    )) as Identity;

    expect(me.authenticated, 'a real sign-in, not the answer given to nobody').toBe(true);
    expect(me.user.username).toBe(ADMIN.username);
    expect(me.roles).toContain('ADMIN');
  });

  test('(signin) a REPORT_AUTHOR signs in and is reported as one', async () => {
    const me = (await getMe(await login(AUTHOR.username, AUTHOR.password)).then((r) =>
      r.json(),
    )) as Identity;

    expect(me.roles).toContain('REPORT_AUTHOR');
    // The ladder runs downwards only — an author is not an administrator.
    expect(me.roles).not.toContain('ADMIN');
  });

  test('(signin) a JOB_OPERATOR signs in and is reported as one', async () => {
    const me = (await getMe(await login(OPERATOR.username, OPERATOR.password)).then((r) =>
      r.json(),
    )) as Identity;

    expect(me.roles).toContain('JOB_OPERATOR');
    expect(me.roles).not.toContain('REPORT_AUTHOR');
    expect(me.roles).not.toContain('ADMIN');
  });

  test('(signin) an unauthenticated caller is refused, not served', async () => {
    // /api/auth/me is the one deliberate exception: public, because the frontend has to be able to
    // ask which edition it is talking to before anyone can sign in. So the assertion is that it
    // admits to nothing — not that it refuses to answer.
    const me = (await getMe().then((r) => r.json())) as Identity;
    expect(me.authenticated, 'nobody is signed in yet').toBe(false);
    expect(me.roles, 'an anonymous caller holds no roles').toEqual([]);

    // Everything that carries data does refuse.
    expect(
      await fetch(`${BASE_URL}/api/reports`).then((r) => r.status),
      'listing reports must require a session',
    ).toBe(401);
  });

  test('(signin) wrong credentials do not create a session', async () => {
    expect((await loginStatus(ADMIN.username, 'not-the-password')).code).toBe(401);
  });

  test('(signin) signing out invalidates the session', async () => {
    const cookie = await login(OPERATOR.username, OPERATOR.password);

    expect(await statusAs(cookie, 'POST', '/api/auth/logout')).toBe(200);

    // /api/auth/me is public and answers 200 to everybody — that is its contract. So a dead session
    // does not show up as a 401 here; it shows up as the identity going anonymous, and as the
    // endpoints that actually carry data refusing the cookie.
    const me = (await getMe(cookie).then((r) => r.json())) as Identity;
    expect(me.authenticated, 'the cookie must no longer name anybody').toBe(false);

    expect(
      await statusAs(cookie, 'GET', '/api/reports'),
      'and it must not open anything either',
    ).toBe(401);
  });

  test('(signin) the app presents a sign-in screen and a working sign-out', async ({ page }) => {
    test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
    await openApp(page);

    const ft = new FluentTester(page);
    await signInThroughTheUi(ft, OPERATOR);

    await ft
      .elementShouldHaveText('#userMenu', OPERATOR.username)
      // Signing out returns to the sign-in screen, not to a half-authenticated app.
      .click('#userMenu')
      .click('#btnLogout')
      .waitOnElementToBecomeVisible('#loginUsername');
  });

  test('(signin) a DASHBOARD_VIEWER signs in and is reported as one', async () => {
    const me = (await getMe(await login(VIEWER.username, VIEWER.password)).then((r) =>
      r.json(),
    )) as Identity;

    expect(me.authenticated, 'a real sign-in, not the answer given to nobody').toBe(true);
    expect(me.roles).toContain('DASHBOARD_VIEWER');
    expect(me.roles, 'the bottom rung inherits nothing').not.toContain('JOB_OPERATOR');

    // Every role holds ROLE_DASHBOARD_VIEWER, because each rung is granted every weaker one too.
    // What makes somebody a viewer is holding it and NOTHING above it — a distinction that is worth
    // making once, in a flag, rather than in every place that has to draw a screen for them.
    expect(me.capabilities.dashboardsOnly, 'this person has their dashboards and nothing else').toBe(true);
    expect(me.capabilities.runJobs).toBe(false);
    expect(me.capabilities.editReports).toBe(false);

    const operator = (await getMe(await login(OPERATOR.username, OPERATOR.password)).then((r) =>
      r.json(),
    )) as Identity;
    expect(operator.roles, 'an operator holds the viewer rung as well').toContain('DASHBOARD_VIEWER');
    expect(
      operator.capabilities.dashboardsOnly,
      'but the product is not reduced to dashboards for them',
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// § Start Here, concluded — the reminder goes away on its own
// ═══════════════════════════════════════════════════════════════════════════
//
// LAST ON PURPOSE. This is the only test that changes the shipped account, and
// every test above signs in as `burst` or is created by it. Playwright runs a
// file in declaration order with one worker, so leaving it here keeps the rest
// reading against the fresh install the documentation describes.
//
test.describe('Auth — Server: the shipped credentials stop being the default', () => {

  test('(first-run) the reminder disappears the moment the password changes', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);

    expect(
      await statusAs(admin, 'PUT', `/api/iam/users/${SHIPPED.username}/password`, {
        password: 'NoLongerTheDefault123!',
      }),
    ).toBe(200);

    const status = await fetch(`${BASE_URL}/api/auth/first-run`).then((r) => r.json());
    expect(
      status.usingDefaultCredentials,
      'the server checks the password itself — there is nothing to switch off',
    ).toBe(false);
  });
});

/**
 * The capability table says what the product believes each role can do; the matrix in
 * EndpointRoleMatrixTest says what the annotations allow. Both can be right about themselves and
 * still disagree with each other, and only a running server can say which one the user meets. These
 * two tests are that meeting: every capability reported true is called and must be admitted, every
 * capability reported false is called and must be refused, both driven off the same map so a
 * capability added later is covered here without anybody editing a list.
 */
test.describe('Auth — Server: the capability table and the doors behind it', () => {

  const EVERY_ROLE = [
    { who: 'ADMIN', user: ADMIN },
    { who: 'REPORT_AUTHOR', user: AUTHOR },
    { who: 'JOB_OPERATOR', user: OPERATOR },
    { who: 'DASHBOARD_VIEWER', user: VIEWER },
  ];

  /** The door for a capability, or a failure that says what decision is missing. */
  function doorFor(capability: string): CapabilityDoor | NoDoor {
    const door = CAPABILITY_DOORS[capability];
    expect(
      door,
      `the server reports a capability called "${capability}" that capability-endpoints.ts knows` +
        ' nothing about. Decide which endpoint stands for it, or record there that it stands for' +
        ' none — a capability nobody decided about is exactly the drift these tests exist to catch',
    ).toBeTruthy();
    return door;
  }

  test('(capabilities) what the capability table promises each role, the running server admits', async () => {
    for (const role of EVERY_ROLE) {
      const session = await login(role.user.username, role.user.password);
      const me = (await jsonAs(session, '/api/auth/me')) as Identity;

      const promised = Object.entries(me.capabilities).filter(([, allowed]) => allowed);
      if (role.who !== 'DASHBOARD_VIEWER')
        expect(
          promised.length,
          `${role.who} is promised nothing at all — either /api/auth/me stopped reporting` +
            ' capabilities or this role lost its own, and both are worth failing over',
        ).toBeGreaterThan(0);

      for (const [capability] of promised) {
        const door = doorFor(capability);
        if (isDoorless(door)) continue;

        const status = await statusAs(session, door.method, door.path);
        expect(
          wasAdmitted(status),
          `${role.who} is promised ${capability}, but ${door.method} ${door.path} answered ` +
            `${status}. ${door.because}. A screen offered to a role whose API refuses it is the` +
            ' failure that reaches the user instead of the test suite',
        ).toBe(true);
      }
    }
  });

  test('(capabilities) a capability reported false has no door left open behind it', async () => {
    for (const role of EVERY_ROLE) {
      const session = await login(role.user.username, role.user.password);
      const me = (await jsonAs(session, '/api/auth/me')) as Identity;

      const withheld = Object.entries(me.capabilities).filter(([, allowed]) => !allowed);
      if (role.who !== 'ADMIN')
        expect(
          withheld.length,
          `${role.who} is withheld nothing — every capability true for every role means the table` +
            ' stopped saying anything, and the negative half of this pair would pass vacuously',
        ).toBeGreaterThan(0);

      for (const [capability] of withheld) {
        const door = doorFor(capability);
        if (isDoorless(door)) continue;

        const status = await statusAs(session, door.method, door.path);
        expect(
          status,
          `${role.who} is not promised ${capability}, yet ${door.method} ${door.path} answered ` +
            `${status} rather than 403. ${door.because}. A door open behind a capability the` +
            ' product says it does not have is the quiet half of the same drift',
        ).toBe(403);
      }
    }
  });
});
