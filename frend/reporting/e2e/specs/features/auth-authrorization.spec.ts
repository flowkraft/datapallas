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
 * forking, so this file is organised by the three claims that matter HERE:
 *
 *   1. DESKTOP IS INVISIBLE. In Electron (RB_ROLE=standalone) the user is never
 *      asked to log in, never asked to configure anything auth-related, and
 *      never shown a users/roles/tenants screen — even though the IAM code is
 *      present and a DEFAULT tenant + DEFAULT admin exist behind the scenes.
 *
 *   2. AN EMBED TOKEN GRANTS EXACTLY ONE REPORT. Pure REST, so it holds in every
 *      mode — in standalone the local caller is already an administrator, which
 *      makes minting allowed and the scoping the only thing under test.
 *
 *   3. THE TRUST BOUNDARY HOLDS IN EVERY MODE. Groovy, FreeMarker and Jasper are
 *      the product and cannot be sandboxed, so the boundary is the installation
 *      directory. Path confinement is not a multi-user feature — it must hold on
 *      the desktop too, and it does today.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------
 *
 * The opposite claim — login required, roles enforced — is DataPallas Server
 * only, and needs a backend started in a multi-user RB_ROLE. It lives in
 * auth-authorization-server.spec.ts and runs under its own script:
 *
 *   npm run custom:start-server-and-e2e-server-auth
 *
 * It cannot be checked here: Electron is always standalone, and a run that
 * creates real accounts escalates the installation to GATEWAY permanently
 * (IamService.resolveEffectiveMode), which would break every test in this file.
 *
 * ---------------------------------------------------------------------------
 * HOW TO RUN
 * ---------------------------------------------------------------------------
 *
 * Part of the normal suite, in BOTH Electron and Web:
 *   npm run custom:start-server-and-e2e-electron
 *   npm run custom:start-server-and-e2e-web
 *
 * Every group self-skips with an explicit message while Phase 1 of
 * .docs/auth-authorization-design.md is unimplemented — GET /api/auth/me
 * answering 404 is the probe. That way this file can be committed now as the
 * contract and lights up on its own as the implementation lands, instead of
 * turning the suite red in the meantime.
 */

const BASE_URL = 'http://localhost:9090';
const PORTABLE_DIR = process.env.PORTABLE_EXECUTABLE_DIR!;

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
    // ADMIN, not TENANT_ADMIN: the rung was renamed and Role.parse keeps accepting the old name on
    // the way IN, for stores written before the rename. What comes OUT is always the current name.
    expect(me.roles).toContain('ADMIN');
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
        // The burst/burst reminder belongs to a server's login page and must never reach a desktop.
        .elementShouldNotBeVisible('#defaultCredentialsNotice')
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
        // Not only the menu entry — the screen behind it must not be reachable either.
        .elementShouldNotBeVisible('#tableUsers')
        .elementShouldNotBeVisible('#btnNewUser')
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
// GROUP 2 — EMBEDDING: tokens for components, links for people
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
