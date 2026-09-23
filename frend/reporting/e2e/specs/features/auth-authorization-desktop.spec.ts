import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { Helpers } from '../../utils/helpers';

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
 * forking, so this file is organised by the two claims that matter HERE:
 *
 *   1. DESKTOP IS INVISIBLE, NOT OPEN. In DataPallas.exe the user is never asked
 *      to log in, never asked to configure anything auth-related, and never shown
 *      a users/roles/tenants screen. Invisible to the person at the keyboard is not
 *      the same as open to the network: the desktop demands a credential like every
 *      other deployment, and the Electron SHELL presents the installation's API key
 *      on its behalf (main.ts attachInstallationCredential). A caller without it
 *      gets 401 — which matters because the same folder can also be a DataPallas
 *      Server, sharing one config/_internal/iam.db.
 *
 *      Note what is NOT in that sentence: a mode. Nothing tells the backend which
 *      deployment it is, and nothing tells the shell either. The difference between
 *      a desktop and a server is which credential arrives with the request.
 *
 *   2. THE TRUST BOUNDARY HOLDS EVERYWHERE. Groovy, FreeMarker and Jasper are
 *      the product and cannot be sandboxed, so the boundary is the installation
 *      directory. Path confinement is not a multi-user feature — it must hold on
 *      the desktop too, and it does today.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------
 *
 * Embed tokens and share links behave the same on every deployment, so they
 * live in auth-embed-share.spec.ts.
 *
 * The other half — real people signing in, each role stopped at the edge of its
 * own job — lives in auth-authorization-server.spec.ts and runs under its own
 * script:
 *
 *   npm run custom:start-server-and-e2e-server-auth
 *
 * Not because the backend there is configured differently — it is the same
 * backend, secured the same way — but because that file CREATES accounts and
 * changes roles. Every other spec in the suite would then find a store full of
 * colleagues it never made, so it gets a fresh install to itself.
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
  authenticated: boolean;
  /** True when the credential belongs to the installation rather than to a person. */
  machine: boolean;
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
 * The credential this installation authenticates its own processes with — the same file the Electron
 * main process reads. Written by the backend on its first start, owner-readable, one per install.
 */
function installationApiKey(): string {
  return fs
    .readFileSync(path.resolve(PORTABLE_DIR, 'config/_internal/api-key.txt'), 'utf-8')
    .trim();
}

/** GET /api/auth/me as this installation, the way DataPallas.exe does it. */
async function getMeAsTheInstallation(): Promise<Response> {
  return fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'X-API-Key': installationApiKey() },
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

/**
 * The UI tests below describe the shell that HOLDS the installation's credential and signs its own
 * requests with it: nobody is ever asked to sign in, and there is no account to administer. Only the
 * Electron shell can do that — a browser must not be handed a key the page could read, so the same
 * application, opened in one, correctly shows a login screen and then a user menu for whoever signed
 * in. The claim is about the CALLER, and these two callers are different.
 *
 * <p>TEST_ENV is which shell the harness launched, which is a choice the runner makes and not
 * something a test could infer — the same reason five other specs already read it. It says nothing
 * about how the backend is configured: there is one configuration.
 */
const isElectron = process.env.TEST_ENV === 'electron';

async function skipUnlessTheShellSignsItsOwnRequests() {
  await skipUnlessAuthImplemented();

  test.skip(
    !isElectron,
    'this group describes the shell that presents the installation key (DataPallas.exe); a browser ' +
      'signs in as a person instead, which is auth-authorization-server.spec.ts',
  );
}


// ===========================================================================
// GROUP 1 — THE DESKTOP: the user must never see authentication
// ===========================================================================

test.describe('Auth — the desktop shell authenticates itself, invisibly', () => {
  //
  // -- The backend auto-provisions itself and says so ----------------------
  //

  // Every deployment, not just the desktop: this is the credential, and the credential behaves the
  // same way wherever it is presented.
  test('(auth-api) the installation key is an administrator, and nothing else is', async () => {
    await skipUnlessAuthImplemented();

    // Presenting this installation's key is what DataPallas.exe does on every request, and it is
    // what makes the desktop feel login-free.
    const res = await getMeAsTheInstallation();
    expect(res.status).toBe(200);

    const me = (await res.json()) as Identity;
    expect(me.tenant.code).toBe('default');
    // A machine, not a person: this is what keeps the desktop's window free of a user menu and a
    // "Sign out" it could not honour, without any part of the UI asking which deployment it is in.
    expect(me.machine, 'the installation key is not a person').toBe(true);
    // ADMIN, not TENANT_ADMIN: the rung was renamed and Role.parse keeps accepting the old name on
    // the way IN, for stores written before the rename. What comes OUT is always the current name.
    expect(me.roles).toContain('ADMIN');

    // And without it, nobody is anybody. /api/auth/me is public by design — it is how the frontend
    // learns which edition it is talking to — so it answers, and says "not signed in".
    const anonymous = (await (await getMe()).json()) as Identity;
    expect(anonymous.authenticated, 'an unauthenticated caller must not be an administrator').toBe(
      false,
    );
    expect(anonymous.machine, 'nobody is not a machine either').toBe(false);
  });

  /**
   * The regression this guards: a desktop used to authenticate whoever reached it as the default
   * administrator, on any interface, not just loopback. One installation folder can be started as a
   * desktop AND as a DataPallas Server — the compose bundle bind-mounts ./config, so both read the
   * same iam.db — which made launching DataPallas.exe a way to serve that server's data with no
   * credential at all. Nothing hands out an identity any more, here or anywhere else.
   */
  test('(auth-api) a caller with no credential is refused, even on the desktop', async () => {
    await skipUnlessAuthImplemented();

    const res = await fetch(`${BASE_URL}/api/iam/users`);

    expect(res.status, 'the desktop backend must challenge an unauthenticated caller').toBe(401);
  });

  test('(auth-api) no credentials are written anywhere the user could stumble over them', async () => {
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
    '(desktop-ui) the app opens straight into Processing with no login screen',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
      await skipUnlessTheShellSignsItsOwnRequests();

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
    '(desktop-ui) Configuration offers no Users, Roles or Tenants screens',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
      await skipUnlessTheShellSignsItsOwnRequests();

      const ft = new FluentTester(firstPage);

      // Roles are edited inline on the user row, so there is no separate Roles screen — one
      // "Users & Tenants" entry is the whole administration surface. It is absent here because the
      // caller is the installation itself: a machine, with nobody to administer. AuthService gates it
      // on isPersonSignedIn(), not on which deployment this is.
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
    '(desktop-ui) everything a desktop user actually does still works with auth code present',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
      await skipUnlessTheShellSignsItsOwnRequests();

      const ft = new FluentTester(firstPage);

      // The installation key holds ADMIN, so the backend withholds no capability: the
      // connections screen, the script editor and the job runner are all open.
      await ft
        .navigateToConnectionsPage()
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .gotoConfigurationReports()
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );
});

/**
 * Administrator calls (filesystem, scripts). The Server wants a credential for them; the desktop's
 * local caller is already an administrator and ignores the key.
 */
const adminFetch = (url: string, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), ...Helpers.apiKeyHeader() } });

// ===========================================================================
// GROUP 2 — THE TRUST BOUNDARY, enforced in every mode
// ===========================================================================
//
// These hold on the desktop too. Groovy/FreeMarker/Jasper cannot be sandboxed,
// so the installation directory is the boundary, and it has to be real before
// multi-tenancy can mean anything. Unlike group 1 these are implemented today
// (Phase 0) and must never regress.
//

test.describe('Auth — Installation directory is the trust boundary', () => {
  test('(boundary) the filesystem API refuses an absolute path outside the installation', async () => {
    const outside = process.platform === 'win32' ? 'C:/Windows/win.ini' : '/etc/passwd';

    const res = await adminFetch(
      `${BASE_URL}/api/system/fs/content?path=${encodeURIComponent(outside)}`,
    );

    expect(res.status, 'reading outside the install must be a 400, not a file').toBe(400);
  });

  test('(boundary) the filesystem API refuses a relative path that climbs out', async () => {
    for (const escape of ['../../config/_internal/.master-key', 'config/../../../etc/passwd', '..']) {
      const res = await adminFetch(
        `${BASE_URL}/api/system/fs/content?path=${encodeURIComponent(escape)}`,
      );
      expect(res.status, `'${escape}' must be refused`).toBe(400);
    }
  });

  test('(boundary) writing outside the installation is refused', async () => {
    const outside =
      process.platform === 'win32' ? 'C:/Windows/Temp/dp-escape.txt' : '/tmp/dp-escape.txt';

    const res = await adminFetch(
      `${BASE_URL}/api/system/fs/content?path=${encodeURIComponent(outside)}`,
      { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'escaped' },
    );

    expect(res.status).toBe(400);
    expect(fs.existsSync(outside), 'nothing may be written outside the install').toBe(false);
  });

  test('(boundary) a legitimate in-install path still works', async () => {
    // The control case: confinement must not cost the product anything.
    const res = await adminFetch(
      `${BASE_URL}/api/system/fs/content?path=${encodeURIComponent('config/_internal/settings.xml')}`,
    );

    expect(res.status, 'ordinary config reads must keep working').toBe(200);
    expect(await res.text()).toContain('<documentburster>');
  });

  test('(boundary) an inline script cannot shadow the ctx binding', async () => {
    // filterValues used to be able to overwrite ctx/log, which let a caller
    // replace the narrow DbSqlProxy with anything it liked.
    const res = await adminFetch(`${BASE_URL}/api/queries/run-script`, {
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
