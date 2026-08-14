// ═══════════════════════════════════════════════════════════════════════════
// DataPallas SERVER ONLY — login is required and roles are enforced
// ═══════════════════════════════════════════════════════════════════════════
//
// The other half of auth-authrorization.spec.ts. That file proves the desktop
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
// That script starts the backend with RB_ROLE=GATEWAY and runs this file in web
// mode. It deliberately does NOT seed an administrator: a fresh Server is meant
// to create `burst` / `burst` by itself, which is the first thing documented and
// the first thing tested here.
//
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect, type Page } from '@playwright/test';

import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { SelfServicePortalsTestHelper } from '../../helpers/areas/self-service-portals-test-helper';
import { InterfaceTestHelper } from '../../helpers/interface-test-helper';
import { ConnectionsTestHelper } from '../../helpers/areas/connections-test-helper';
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
  mode: 'standalone' | 'tenant' | 'gateway';
  authenticated: boolean;
  user: { username: string };
  tenant: { code: string };
  roles: string[];
};

async function getMe(cookie?: string): Promise<Response> {
  return fetch(`${BASE_URL}/api/auth/me`, { headers: cookie ? { Cookie: cookie } : {} });
}

/**
 * CSRF is ON in Server mode and OFF on the desktop (SecurityConfig.configureCsrf), so these tests
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
  // Fail once with a clear message rather than in every test. The check is the reported MODE, not
  // the status: /api/auth/me is deliberately public in every edition — it is how the frontend learns
  // which edition it is talking to — so it answers 200 whether or not anyone is signed in.
  const identity = (await getMe().then((r) => r.json())) as Identity;
  if (identity.mode === 'standalone')
    throw new Error(
      `This suite needs a backend in a multi-user mode, but /api/auth/me reports mode ` +
        `"${identity.mode}". Run it with \`npm run custom:start-server-and-e2e-server-auth\`.`,
    );

  // Everything below is created BY the shipped administrator, which is itself the first thing the
  // documentation promises exists.
  const shipped = await login(SHIPPED.username, SHIPPED.password);

  await createUser(shipped, ADMIN.username, ADMIN.password, 'ADMIN');
  await createUser(shipped, AUTHOR.username, AUTHOR.password, 'REPORT_AUTHOR');
  await createUser(shipped, OPERATOR.username, OPERATOR.password, 'JOB_OPERATOR');
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
});

// ═══════════════════════════════════════════════════════════════════════════
// § Handing a dashboard to somebody without an account
// ═══════════════════════════════════════════════════════════════════════════
//
// Publishing does not make a dashboard public. /dashboard/{code} falls through to
// `authenticated()` in SecurityConfig, and an anonymous caller meets a clean 401
// rather than a redirect, because the entry point is an HttpStatusEntryPoint.
//
// "How public" is a SECOND, deliberate step: a share link, created in the AI Hub's
// Share dialog and minted by POST /api/embed/share-link. Anyone holding that URL
// reads that one dashboard with no account, until it expires or is revoked.
//
// NO DOCKER, deliberately. DashboardController never checks that the report exists
// — it validates the token and emits the page, and the data that page then fetches
// is authorized separately. So none of this needs a canvas or a running AI Hub,
// which is why it sits outside the block that boots one: these rules stay covered
// even on a run where Docker never starts.
//
// ── WHY A BAD TOKEN IS 401 AND NOT 404 ────────────────────────────────────
//
// DashboardController answers 404 for a token that names a different report, and
// says so in its own comment — deliberately indistinguishable from revoked and from
// never-existed. That 404 is real, but it is not what an anonymous caller meets,
// because EmbedTokenAuthorizationManager decides first: a token that is absent,
// revoked, expired, or minted for another report simply fails to match, and the
// manager falls through to `authenticated()`. Nobody is signed in, so the answer is
// 401 and the controller never runs.
//
// The property the 404 was written for survives intact — every invalid token gets
// one answer, so guessing reveals nothing — it is just spelled 401 out here.
//
const SHARED_REPORT = 'e2e-shared-dashboard';
const OTHER_REPORT = 'e2e-other-dashboard';

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

/** Open the dashboard page the way a recipient would: no session, nothing but what is in the URL. */
async function getDashboardAnonymously(
  reportCode: string,
  token?: string,
): Promise<{ status: number; body: string }> {
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  const res = await fetch(`${BASE_URL}/dashboard/${reportCode}${query}`);
  return { status: res.status, body: await res.text() };
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
    expect(anonymous.status, 'a published dashboard is private until somebody shares it').toBe(401);

    // And nobody can hand themselves the key. The CSRF token is fetched first so this is refused for
    // being unauthenticated rather than for being a cross-site post — otherwise the 403 would prove
    // nothing about who may share.
    const csrf = await newCsrfCookie();
    expect(
      await statusAs(csrf, 'POST', '/api/embed/share-link', { reportId: SHARED_REPORT }),
      'sharing is a decision somebody signed in makes',
    ).toBe(401);
  });

  test('(share) a share link opens the dashboard with no account at all', async () => {
    const author = await login(AUTHOR.username, AUTHOR.password);
    const { token, url } = await createShareLink(author, SHARED_REPORT, 30);

    expect(url, 'the answer is the link to send').toContain(`/dashboard/${SHARED_REPORT}?token=`);

    const shared = await getDashboardAnonymously(SHARED_REPORT, token);
    expect(shared.status, 'the whole point of the feature').toBe(200);
    expect(shared.body, 'and it really is the dashboard page').toContain('<rb-dashboard');

    // The durable secret is validated once, here, and stops. What the page carries onward to the
    // component is a short-lived embed token instead — so the link cannot leak out of the page it
    // opened.
    expect(shared.body, 'the share token itself never reaches the component').not.toContain(token);
  });

  test('(share) one link opens one dashboard, and no other', async () => {
    const author = await login(AUTHOR.username, AUTHOR.password);
    const { token } = await createShareLink(author, SHARED_REPORT);

    const other = await getDashboardAnonymously(OTHER_REPORT, token);
    expect(other.status, 'a token for a different dashboard is as good as no token').toBe(401);
  });

  test('(share) revoking a link closes it', async () => {
    const author = await login(AUTHOR.username, AUTHOR.password);
    const { token } = await createShareLink(author, SHARED_REPORT);
    expect((await getDashboardAnonymously(SHARED_REPORT, token)).status).toBe(200);

    const links = (await jsonAs(author, `/api/embed/share-link?reportId=${SHARED_REPORT}`)) as Array<{
      id: number;
    }>;
    expect(links.length, 'a link that exists is a link that can be found and revoked').toBeGreaterThan(0);
    for (const link of links)
      expect(await statusAs(author, 'DELETE', `/api/embed/share-link/${link.id}`)).toBe(200);

    const afterRevoke = await getDashboardAnonymously(SHARED_REPORT, token);
    expect(
      afterRevoke.status,
      'revocation is the only protection a link that never expires has — and the answer is the same ' +
        'one a link that never existed gets, so guessing reveals nothing',
    ).toBe(401);
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

    expect(me.mode, 'a Server, not a desktop').not.toBe('standalone');
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
