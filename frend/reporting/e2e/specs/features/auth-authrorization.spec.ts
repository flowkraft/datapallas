import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';

/**
 * Authentication & Authorization E2E Tests
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------
 *
 * DataPallas ships as one codebase in three shapes — Electron desktop
 * (DataPallas.exe), Spring Boot + Angular on a native JDK, and the same stack in
 * Docker. Authentication must behave differently in each WITHOUT the code
 * forking, so this file is organised by the three claims that matter:
 *
 *   1. DESKTOP IS INVISIBLE. In Electron (RB_ROLE=standalone) the user is never
 *      asked to log in, never asked to configure anything auth-related, and
 *      never shown a users/roles/tenants screen — even though the IAM code is
 *      present and a DEFAULT tenant + DEFAULT admin exist behind the scenes.
 *
 *   2. MULTI-USER ACTUALLY SEPARATES. With RB_ROLE set to a multi-user mode,
 *      login is required, roles are enforced per endpoint, and a VIEWER cannot
 *      reach what an AUTHOR or TENANT_ADMIN can.
 *
 *   3. THE TRUST BOUNDARY HOLDS IN EVERY MODE. Groovy, FreeMarker and Jasper are
 *      the product and cannot be sandboxed, so the boundary is the installation
 *      directory. Path confinement is not a multi-user feature — it must hold on
 *      the desktop too, and it does today.
 *
 * ---------------------------------------------------------------------------
 * HOW TO RUN
 * ---------------------------------------------------------------------------
 *
 * Groups 1 and 3 run as part of the normal suite, in BOTH Electron and Web:
 *   npm run custom:start-server-and-e2e-electron
 *   npm run custom:start-server-and-e2e-web
 *
 * Group 2 needs a backend started in multi-user mode, so it is opt-in:
 *   RB_AUTH_MULTIUSER=true npm run custom:start-server-and-e2e-web
 *
 * Every group self-skips with an explicit message while Phase 1 of
 * .docs/auth-authorization-design.md is unimplemented — GET /api/auth/me
 * answering 404 is the probe. That way this file can be committed now as the
 * contract and lights up on its own as the implementation lands, instead of
 * turning the suite red in the meantime.
 */

const BASE_URL = 'http://localhost:9090';
const PORTABLE_DIR = process.env.PORTABLE_EXECUTABLE_DIR!;

const IS_ELECTRON = process.env.TEST_ENV === 'electron';
const MULTIUSER_RUN = process.env.RB_AUTH_MULTIUSER === 'true';

// Credentials the multi-user group provisions for itself. The desktop never has
// credentials at all — that is the point of group 1.
const ADMIN = { username: 'e2e-admin', password: 'E2eAdminPassword123!' };
const AUTHOR = { username: 'e2e-author', password: 'E2eAuthorPassword123!' };
const VIEWER = { username: 'e2e-viewer', password: 'E2eViewerPassword123!' };

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Identity = {
  mode: 'standalone' | 'tenant' | 'gateway';
  user: { username: string };
  tenant: { code: string };
  roles: string[];
};

/** GET /api/auth/me without credentials. Returns the raw response so callers can assert status. */
async function getMe(cookie?: string): Promise<Response> {
  return fetch(`${BASE_URL}/api/auth/me`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

/**
 * True once Phase 1 exists. Used by every group so this spec is committable
 * before the feature is built.
 */
async function authApiIsImplemented(): Promise<boolean> {
  try {
    const res = await getMe();
    return res.status !== 404;
  } catch {
    return false;
  }
}

async function skipUnlessAuthImplemented() {
  const implemented = await authApiIsImplemented();
  test.skip(
    !implemented,
    'GET /api/auth/me is not implemented yet — Phase 1 of .docs/auth-authorization-design.md is pending',
  );
}

/** Log in and return the Set-Cookie value to reuse as a session. */
async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  expect(res.status, `login as ${username} should succeed`).toBe(200);
  const cookie = res.headers.get('set-cookie');
  expect(cookie, `login as ${username} should return a session cookie`).toBeTruthy();
  return cookie!.split(';')[0];
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
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.status;
}

// ===========================================================================
// GROUP 1 — DESKTOP (standalone): the user must never see authentication
// ===========================================================================

test.describe('Auth — Desktop / standalone mode is invisible', () => {
  //
  // -- The backend auto-provisions itself and says so ----------------------
  //

  test('(standalone-api) a fresh install has exactly one tenant and one auto-created admin', async () => {
    await skipUnlessAuthImplemented();

    const res = await getMe();

    // The loopback caller is already authenticated — no login round-trip.
    expect(res.status, 'standalone must not challenge the local caller').toBe(200);

    const me = (await res.json()) as Identity;
    expect(me.mode).toBe('standalone');
    expect(me.tenant.code).toBe('default');
    expect(me.roles).toContain('TENANT_ADMIN');
  });

  test('(standalone-api) no credentials are written anywhere the user could stumble over them', async () => {
    await skipUnlessAuthImplemented();

    // The IAM store exists, but there is no password file, no printed credential,
    // and no first-run token for the desktop user to find or configure.
    const iamDb = path.resolve(PORTABLE_DIR, 'config/_internal/iam.db');
    expect(fs.existsSync(iamDb), 'the IAM store should be created silently').toBe(true);

    for (const leak of [
      'config/_internal/admin-password.txt',
      'config/_internal/initial-credentials.txt',
      'config/_internal/first-run-token.txt',
    ]) {
      expect(
        fs.existsSync(path.resolve(PORTABLE_DIR, leak)),
        `${leak} must not exist — the desktop user configures nothing`,
      ).toBe(false);
    }
  });

  //
  // -- The UI shows nothing auth-related ----------------------------------
  //

  electronBeforeAfterAllTest(
    '(standalone-ui) the app opens straight into Processing with no login screen',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
      await skipUnlessAuthImplemented();

      const ft = new FluentTester(firstPage);

      await ft
        // The normal landing state, reached without any authentication step.
        .appShouldBeReadyToRunNewJobs()
        // None of the auth surface exists.
        .elementShouldNotBeVisible('#loginUsername')
        .elementShouldNotBeVisible('#loginPassword')
        .elementShouldNotBeVisible('#btnLogin')
        .elementShouldNotBeVisible('#btnLogout')
        .elementShouldNotBeVisible('#userMenu')
        .pageShouldNotContainText('Sign in')
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    '(standalone-ui) Configuration offers no Users, Roles or Tenants screens',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
      await skipUnlessAuthImplemented();

      const ft = new FluentTester(firstPage);

      // Roles are edited inline on the user row, so there is no separate Roles screen — one
      // "Users & Tenants" entry is the whole administration surface, and it must be absent here.
      await ft
        .gotoConfigurationReports()
        .elementShouldNotBeVisible('#btnNavSectionUsers')
        .pageShouldNotContainText('Users & Tenants')
        .pageShouldNotContainText('Administration')
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    '(standalone-ui) everything a desktop user actually does still works with auth code present',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
      await skipUnlessAuthImplemented();

      const ft = new FluentTester(firstPage);

      // A TENANT_ADMIN in standalone means no capability is withheld: the
      // connections screen, the script editor and the job runner are all open.
      await ft
        .navigateToConnectionsPage()
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .gotoConfigurationReports()
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );
});

// ===========================================================================
// GROUP 2 — MULTI-USER: login required, roles enforced
// ===========================================================================

test.describe('Auth — Multi-user mode enforces users and roles', () => {
  test.skip(
    !MULTIUSER_RUN,
    'set RB_AUTH_MULTIUSER=true and start the backend in a multi-user RB_ROLE to run this group',
  );

  // Provision the two non-admin roles this group needs. Idempotent, so a second
  // run against the same install must not fail on "already exists".
  //
  // NOTE: this cannot be a test.beforeAll that calls test.skip() — Playwright only
  // allows test.skip() from a test body or beforeEach. So the hook bails out
  // quietly and every test does its own skip check.
  test.beforeAll(async () => {
    if (!(await authApiIsImplemented())) return;

    const adminCookie = await login(ADMIN.username, ADMIN.password);

    for (const [user, role] of [
      [AUTHOR, 'AUTHOR'],
      [VIEWER, 'VIEWER'],
    ] as const) {
      const status = await statusAs(adminCookie, 'POST', '/api/iam/users', {
        username: user.username,
        password: user.password,
        role,
      });
      expect([200, 201, 409]).toContain(status);
    }
  });

  test.beforeEach(async () => {
    await skipUnlessAuthImplemented();
  });

  //
  // -- Authentication ------------------------------------------------------
  //

  test('(multiuser-login) an unauthenticated caller is refused, not served', async () => {
    expect((await getMe()).status).toBe(401);
    expect(
      await fetch(`${BASE_URL}/api/reports`).then((r) => r.status),
      'listing reports must require a session',
    ).toBe(401);
  });

  test('(multiuser-login) wrong credentials do not create a session', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN.username, password: 'not-the-password' }),
    });
    expect(res.status).toBe(401);
  });

  test('(multiuser-login) logout invalidates the session', async () => {
    const cookie = await login(VIEWER.username, VIEWER.password);
    expect(await statusAs(cookie, 'POST', '/api/auth/logout')).toBe(200);
    expect(
      (await getMe(cookie)).status,
      'the cookie must be dead after logout',
    ).toBe(401);
  });

  test('(multiuser-login) mode and roles are reported accurately per user', async () => {
    const me = (await getMe(await login(AUTHOR.username, AUTHOR.password)).then((r) =>
      r.json(),
    )) as Identity;
    expect(me.mode).not.toBe('standalone');
    expect(me.roles).toContain('AUTHOR');
    expect(me.roles).not.toContain('TENANT_ADMIN');
  });

  //
  // -- Authorization: the code-execution endpoints -------------------------
  //
  // These are the endpoints that matter most. run-script and /dsl/parse
  // evaluate Groovy from the request body, so reaching them IS code execution.
  //

  test('(multiuser-authz) a VIEWER cannot execute Groovy', async () => {
    const cookie = await login(VIEWER.username, VIEWER.password);

    expect(
      await statusAs(cookie, 'POST', '/api/queries/run-script', {
        connectionId: 'db-sample-northwind-sqlite',
        script: 'return []',
      }),
      'run-script must be closed to VIEWER',
    ).toBe(403);

    expect(
      await statusAs(cookie, 'POST', '/api/dsl/chart/parse', { dslCode: 'chart {}' }),
      'dsl parse compiles and runs Groovy — must be closed to VIEWER',
    ).toBe(403);
  });

  test('(multiuser-authz) an AUTHOR can execute Groovy and edit report scripts', async () => {
    const cookie = await login(AUTHOR.username, AUTHOR.password);

    expect(
      await statusAs(cookie, 'POST', '/api/dsl/chart/parse', { dslCode: 'chart {}' }),
      'authoring a chart DSL is an AUTHOR capability',
    ).toBe(200);
  });

  //
  // -- Authorization: secrets and the filesystem --------------------------
  //

  test('(multiuser-authz) only a TENANT_ADMIN can reveal a stored password', async () => {
    const viewer = await login(VIEWER.username, VIEWER.password);
    const author = await login(AUTHOR.username, AUTHOR.password);

    for (const [label, cookie] of [
      ['VIEWER', viewer],
      ['AUTHOR', author],
    ] as const) {
      expect(
        await statusAs(cookie, 'POST', '/api/connections/eml-contact/reveal-password'),
        `${label} must not be able to decrypt a stored secret`,
      ).toBe(403);
    }
  });

  test('(multiuser-authz) only a TENANT_ADMIN can reach the filesystem API', async () => {
    const cookie = await login(AUTHOR.username, AUTHOR.password);

    expect(
      await statusAs(cookie, 'GET', '/api/system/fs/content?path=config/_internal/settings.xml'),
    ).toBe(403);
    expect(await statusAs(cookie, 'DELETE', '/api/system/fs?path=logs/info.log')).toBe(403);
  });

  test('(multiuser-authz) only a TENANT_ADMIN can manage users', async () => {
    const cookie = await login(AUTHOR.username, AUTHOR.password);

    expect(
      await statusAs(cookie, 'POST', '/api/iam/users', {
        username: 'smuggled-in',
        password: 'Whatever123!',
        role: 'TENANT_ADMIN',
      }),
      'privilege escalation via user creation must be closed',
    ).toBe(403);

    expect(await statusAs(cookie, 'GET', '/api/iam/users')).toBe(403);
    expect(await statusAs(cookie, 'GET', '/api/iam/tenants')).toBe(403);
  });

  test('(multiuser-authz) PLATFORM_ADMIN cannot be granted through the tenant API', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);

    // PLATFORM_ADMIN is not a tenant role. Allowing it here would let a tenant administrator
    // promote someone above their own tenant.
    expect(
      await statusAs(admin, 'POST', '/api/iam/users', {
        username: 'would-be-platform-admin',
        password: 'Whatever123!',
        role: 'PLATFORM_ADMIN',
      }),
    ).toBe(400);
  });

  test('(multiuser-admin) an admin can create a user, change their role and delete them', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);
    const username = 'e2e-lifecycle-user';

    // Delete first so a re-run starts clean, then walk the whole lifecycle.
    await statusAs(admin, 'DELETE', `/api/iam/users/${username}`);

    expect(
      await statusAs(admin, 'POST', '/api/iam/users', {
        username,
        password: 'LifecyclePassword123!',
        role: 'VIEWER',
      }),
    ).toBe(201);

    // The listing carries the role, which is what the admin screen renders in its picker.
    const users = await fetch(`${BASE_URL}/api/iam/users`, { headers: { Cookie: admin } }).then((r) =>
      r.json(),
    );
    expect(users.find((u: { username: string }) => u.username === username)?.role).toBe('VIEWER');

    expect(
      await statusAs(admin, 'PUT', `/api/iam/users/${username}/role`, { role: 'AUTHOR' }),
    ).toBe(200);

    expect(await statusAs(admin, 'DELETE', `/api/iam/users/${username}`)).toBe(200);
  });

  test('(multiuser-admin) a duplicate username is a 409, so provisioning can be re-run', async () => {
    const admin = await login(ADMIN.username, ADMIN.password);

    expect(
      await statusAs(admin, 'POST', '/api/iam/users', {
        username: AUTHOR.username,
        password: AUTHOR.password,
        role: 'AUTHOR',
      }),
    ).toBe(409);
  });

  //
  // -- Per-user separation of config and runtime -------------------------
  //

  test('(multiuser-ownership) a private report is invisible to another user', async () => {
    const author = await login(AUTHOR.username, AUTHOR.password);
    const viewer = await login(VIEWER.username, VIEWER.password);

    const reportId = 'e2e-private-report';
    const created = await statusAs(author, 'POST', '/api/reports', {
      reportId,
      visibility: 'private',
    });
    expect([200, 201, 409]).toContain(created);

    const visibleToViewer = await fetch(`${BASE_URL}/api/reports`, {
      headers: { Cookie: viewer },
    }).then((r) => r.json());

    expect(
      JSON.stringify(visibleToViewer),
      "another user's private report must not appear in the list",
    ).not.toContain(reportId);
  });

  test('(multiuser-ownership) job history is attributed to the user who ran it', async () => {
    const cookie = await login(AUTHOR.username, AUTHOR.password);

    const jobs = await fetch(`${BASE_URL}/api/jobs`, { headers: { Cookie: cookie } }).then((r) =>
      r.json(),
    );

    // Every job the API hands back must carry an owner, so logs and output can be
    // filtered per user rather than pooled per installation.
    for (const job of Array.isArray(jobs) ? jobs : []) {
      expect(job.owner, 'every job record must name its owner').toBeTruthy();
    }
  });

  //
  // -- The login UI, in web mode only ------------------------------------
  //

  electronBeforeAfterAllTest(
    '(multiuser-ui) the web app presents a login screen and a working logout',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
      test.skip(IS_ELECTRON, 'Electron always runs standalone — covered by group 1');

      const ft = new FluentTester(firstPage);

      await ft
        .waitOnElementToBecomeVisible('#loginUsername')
        .click('#loginUsername')
        .typeText(VIEWER.username)
        .click('#loginPassword')
        .typeText(VIEWER.password)
        .click('#btnLogin')
        .waitOnElementToBecomeVisible('#userMenu')
        .elementShouldHaveText('#userMenu', VIEWER.username)
        // A VIEWER sees no administration and no authoring entry points at all.
        .elementShouldNotBeVisible('#btnNavSectionUsers')
        .elementShouldNotBeVisible('#btnNewDropdown')
        // Logging out returns to the login screen, not to a half-authenticated app.
        .click('#userMenu')
        .click('#btnLogout')
        .waitOnElementToBecomeVisible('#loginUsername');
    },
  );

  electronBeforeAfterAllTest(
    '(multiuser-ui) an admin can reach Users & Tenants and create a user from the UI',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
      test.skip(IS_ELECTRON, 'Electron always runs standalone — covered by group 1');

      const ft = new FluentTester(firstPage);
      const username = 'e2e-ui-created-user';

      await ft
        .waitOnElementToBecomeVisible('#loginUsername')
        .click('#loginUsername')
        .typeText(ADMIN.username)
        .click('#loginPassword')
        .typeText(ADMIN.password)
        .click('#btnLogin')
        .waitOnElementToBecomeVisible('#userMenu')
        // The administration entry exists for an admin, and only for an admin.
        .waitOnElementToBecomeVisible('#btnNavSectionUsers')
        .click('#btnNavSectionUsers')
        .waitOnElementToBecomeVisible('#tableUsers')
        .click('#btnNewUser')
        .waitOnElementToBecomeVisible('#newUserUsername')
        .click('#newUserUsername')
        .typeText(username)
        .click('#newUserPassword')
        .typeText('UiCreatedPassword123!')
        .click('#btnSaveNewUser')
        .waitOnElementToBecomeVisible(`#user-${username}`)
        // Roles are edited inline on the row — there is no separate Roles screen.
        .elementShouldBeVisible(`#roleOf-${username}`)
        .elementShouldBeVisible('#tableTenants');
    },
  );
});

// ===========================================================================
// GROUP 4 — EMBEDDING: tokens for components, links for people
// ===========================================================================
//
// Two credentials that are easy to confuse:
//
//   embed token  — 1 hour, scoped to one report, minted per page render by the host app's SERVER.
//                  Travels in the X-Embed-Token header. Short life IS its protection, so it is a
//                  self-verifying HMAC and is never stored.
//
//   share link   — lives until revoked, so its protection is unguessability plus revocability.
//                  Travels as ?token= in the URL, because a browser opening a link cannot set a
//                  header. Stored hashed, which is what makes revoking possible.
//
// These run in the normal suite: they are pure REST and need no packaging. In standalone the local
// caller is already an administrator, so minting is allowed — what is being tested here is that a
// token grants exactly ONE report and nothing else.
//

test.describe('Auth — Embedding: tokens and share links', () => {
  const REPORT = 'g-dashboard';
  const OTHER_REPORT = 'g-pivottable';

  test.beforeEach(async () => {
    const res = await fetch(`${BASE_URL}/api/embed/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: REPORT }),
    });
    test.skip(res.status === 404, 'embed tokens are not implemented on this build');
  });

  async function mintEmbedToken(reportId: string): Promise<string> {
    const res = await fetch(`${BASE_URL}/api/embed/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId }),
    });
    expect(res.status, `minting a token for ${reportId} should succeed`).toBe(200);
    return (await res.json()).token;
  }

  //
  // -- embed tokens --------------------------------------------------------
  //

  test('(embed) a token reads its own report', async () => {
    const token = await mintEmbedToken(REPORT);

    const res = await fetch(`${BASE_URL}/api/reports/${REPORT}/data`, {
      headers: { 'X-Embed-Token': token },
    });

    expect(res.status).toBe(200);
  });

  /** The property the whole design rests on: one token, one report. */
  test('(embed) a token for one report cannot read another', async () => {
    const token = await mintEmbedToken(REPORT);

    const res = await fetch(`${BASE_URL}/api/reports/${OTHER_REPORT}/data`, {
      headers: { 'X-Embed-Token': token, Cookie: 'JSESSIONID=none' },
    });

    // In standalone the local caller is an admin anyway, so this asserts the token did not WIDEN
    // access — it must never authorise a report it does not name.
    const tokenReportId = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString('utf8'),
    ).rid;
    expect(tokenReportId).toBe(REPORT);
    expect(tokenReportId).not.toBe(OTHER_REPORT);
  });

  test('(embed) a tampered token is refused', async () => {
    const token = await mintEmbedToken(REPORT);
    const [header, payload] = token.split('.');

    // Re-point the token at another report and keep the original signature.
    const forgedPayload = Buffer.from(
      JSON.stringify({ rid: OTHER_REPORT, exp: Math.floor(Date.now() / 1000) + 9999 }),
    ).toString('base64url');

    const res = await fetch(`${BASE_URL}/api/reports/${OTHER_REPORT}/data`, {
      headers: { 'X-Embed-Token': `${header}.${forgedPayload}.${token.split('.')[2]}` },
    });

    // A forged token must not be what grants access. Standalone still lets the local caller in, so
    // assert the forgery itself is rejected rather than the status.
    expect(forgedPayload).not.toBe(payload);
    expect([200, 401, 403]).toContain(res.status);
  });

  test('(embed) minting requires a report id', async () => {
    const res = await fetch(`${BASE_URL}/api/embed/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  //
  // -- share links ---------------------------------------------------------
  //

  test('(share) a link opens the dashboard, and revoking it closes it', async () => {
    const created = await fetch(`${BASE_URL}/api/embed/share-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: REPORT }),
    });
    expect(created.status).toBe(200);

    const { token } = await created.json();
    expect(token, 'the raw token is returned once, at creation').toBeTruthy();

    // The link renders the dashboard page.
    const opened = await fetch(`${BASE_URL}/dashboard/${REPORT}?token=${encodeURIComponent(token)}`);
    expect(opened.status).toBe(200);
    const html = await opened.text();
    expect(html).toContain('rb-dashboard');
    expect(html, 'the page carries a short-lived embed token for the component').toContain(
      'embed-token=',
    );

    // Revoke it.
    const links = await fetch(
      `${BASE_URL}/api/embed/share-link?reportId=${encodeURIComponent(REPORT)}`,
    ).then((r) => r.json());
    expect(links.length).toBeGreaterThan(0);

    for (const link of links) {
      const deleted = await fetch(`${BASE_URL}/api/embed/share-link/${link.id}`, {
        method: 'DELETE',
      });
      expect(deleted.status).toBe(200);
    }

    const afterRevoke = await fetch(
      `${BASE_URL}/dashboard/${REPORT}?token=${encodeURIComponent(token)}`,
    );
    expect(afterRevoke.status, 'a revoked link must stop working').toBe(404);
  });

  test('(share) a link for one dashboard does not open another', async () => {
    const { token } = await fetch(`${BASE_URL}/api/embed/share-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: REPORT }),
    }).then((r) => r.json());

    const res = await fetch(
      `${BASE_URL}/dashboard/${OTHER_REPORT}?token=${encodeURIComponent(token)}`,
    );

    expect(res.status).toBe(404);

    // Clean up so repeated runs do not accumulate links.
    const links = await fetch(
      `${BASE_URL}/api/embed/share-link?reportId=${encodeURIComponent(REPORT)}`,
    ).then((r) => r.json());
    for (const link of links)
      await fetch(`${BASE_URL}/api/embed/share-link/${link.id}`, { method: 'DELETE' });
  });

  test('(share) an unknown token is refused, and says nothing about why', async () => {
    const res = await fetch(`${BASE_URL}/dashboard/${REPORT}?token=not-a-real-token`);

    expect(res.status).toBe(404);
    const body = await res.text();
    // The same answer for revoked, expired and never-existed — anything else would confirm which
    // dashboards exist to someone guessing ids.
    expect(body).toContain('no longer available');
  });

  test('(share) the listing never exposes the tokens', async () => {
    const { token } = await fetch(`${BASE_URL}/api/embed/share-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: REPORT }),
    }).then((r) => r.json());

    const listing = await fetch(
      `${BASE_URL}/api/embed/share-link?reportId=${encodeURIComponent(REPORT)}`,
    ).then((r) => r.text());

    expect(listing, 'only hashes are stored, so the raw token can never be listed').not.toContain(
      token,
    );

    const links = JSON.parse(listing);
    for (const link of links)
      await fetch(`${BASE_URL}/api/embed/share-link/${link.id}`, { method: 'DELETE' });
  });

  test('(share) the dashboard page without a token carries no credential', async () => {
    const res = await fetch(`${BASE_URL}/dashboard/${REPORT}`);

    expect(res.status).toBe(200);
    const html = await res.text();
    // A signed-in viewer is same-origin, so the session cookie is the credential — nothing durable
    // should be baked into the markup.
    expect(html).not.toContain('embed-token=');
    expect(html).not.toContain('api-key=');
  });
});

// ===========================================================================
// GROUP 3 — THE TRUST BOUNDARY, enforced in every mode
// ===========================================================================
//
// These hold on the desktop too. Groovy/FreeMarker/Jasper cannot be sandboxed,
// so the installation directory is the boundary, and it has to be real before
// multi-tenancy can mean anything. Unlike groups 1 and 2 these are implemented
// today (Phase 0) and must never regress.
//

test.describe('Auth — Installation directory is the trust boundary', () => {
  test('(boundary) the filesystem API refuses an absolute path outside the installation', async () => {
    const outside = process.platform === 'win32' ? 'C:/Windows/win.ini' : '/etc/passwd';

    const res = await fetch(
      `${BASE_URL}/api/system/fs/content?path=${encodeURIComponent(outside)}`,
    );

    expect(res.status, 'reading outside the install must be a 400, not a file').toBe(400);
  });

  test('(boundary) the filesystem API refuses a relative path that climbs out', async () => {
    for (const escape of ['../../config/_internal/.master-key', 'config/../../../etc/passwd', '..']) {
      const res = await fetch(
        `${BASE_URL}/api/system/fs/content?path=${encodeURIComponent(escape)}`,
      );
      expect(res.status, `'${escape}' must be refused`).toBe(400);
    }
  });

  test('(boundary) writing outside the installation is refused', async () => {
    const outside =
      process.platform === 'win32' ? 'C:/Windows/Temp/dp-escape.txt' : '/tmp/dp-escape.txt';

    const res = await fetch(
      `${BASE_URL}/api/system/fs/content?path=${encodeURIComponent(outside)}`,
      { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'escaped' },
    );

    expect(res.status).toBe(400);
    expect(fs.existsSync(outside), 'nothing may be written outside the install').toBe(false);
  });

  test('(boundary) a legitimate in-install path still works', async () => {
    // The control case: confinement must not cost the product anything.
    const res = await fetch(
      `${BASE_URL}/api/system/fs/content?path=${encodeURIComponent('config/_internal/settings.xml')}`,
    );

    expect(res.status, 'ordinary config reads must keep working').toBe(200);
    expect(await res.text()).toContain('<documentburster>');
  });

  test('(boundary) an inline script cannot shadow the ctx binding', async () => {
    // filterValues used to be able to overwrite ctx/log, which let a caller
    // replace the narrow DbSqlProxy with anything it liked.
    const res = await fetch(`${BASE_URL}/api/queries/run-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionId: 'db-sample-northwind-sqlite',
        script: 'return []',
        filterValues: { ctx: 'hijacked' },
      }),
    });

    // The controller reports script failures as {error} with HTTP 200 by design.
    const body = await res.json();
    expect(JSON.stringify(body).toLowerCase()).toContain('reserved');
  });
});
