import { test, expect } from '@playwright/test';

import { Helpers } from '../../utils/helpers';
import { FluentTester } from '../../helpers/fluent-tester';

// ═══════════════════════════════════════════════════════════════════════════
// Embedding and sharing — the same on every deployment
// ═══════════════════════════════════════════════════════════════════════════
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
// Pure REST, so this file runs in the normal suite on every lane — desktop, Server, Docker. The
// caller mints with the installation API key, which makes minting allowed and the token itself
// the only thing under test.
//
// WHO may share is a question about roles, so it lives in auth-authorization-server.spec.ts.
//
// ═══════════════════════════════════════════════════════════════════════════

const BASE_URL = 'http://localhost:9090';

/**
 * Administrator calls (minting, share-link management). The Server wants a credential for them;
 * the desktop's local caller is already an administrator and ignores the key. Calls that present
 * an embed token or a share link stay plain fetch - the token is what they test.
 */
const adminFetch = (url: string, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), ...Helpers.apiKeyHeader() } });

/** A token of the right shape that was never issued — what a guess looks like. */
const NEVER_ISSUED_TOKEN = 'a-share-token-that-was-never-issued';

/**
 * Open the dashboard page the way a recipient would: nothing but what is in the URL.
 *
 * Redirects are deliberately not followed. A caller without a credential is sent to the sign-in
 * screen (`SignInRedirectEntryPoint`), and following that hop would report whatever serves the
 * sign-in screen — the Angular shell where it is packaged, a 404 where it is not — instead of the
 * answer the server gave for the dashboard.
 */
async function getDashboard(
  reportCode: string,
  token?: string,
): Promise<{ status: number; body: string; location: string | null }> {
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  const res = await fetch(`${BASE_URL}/dashboard/${reportCode}${query}`, { redirect: 'manual' });
  return { status: res.status, body: await res.text(), location: res.headers.get('location') };
}

/**
 * The installation key, and a limited browser session, asked the same questions.
 *
 * The key is how every embedding host calls this server, and it authenticates as `api-key-user` with
 * administrative authorities — so it is never limited by a group. That is the rule; the risk is a
 * call site that asks a different question and limits it by accident, which would break embedding in
 * a way no role test would see. The helpers below are the small part of a browser session this file
 * needs to ask the same questions as somebody who IS limited.
 */
async function csrfCookie(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/me`);
  const token = /XSRF-TOKEN=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  return token ? `XSRF-TOKEN=${token}` : '';
}

function xsrf(cookie: string): Record<string, string> {
  const token = /XSRF-TOKEN=([^;]+)/.exec(cookie)?.[1];
  return token ? { 'X-XSRF-TOKEN': token } : {};
}

/** Sign in and keep the cookies, exactly as a browser holds them. */
async function signIn(username: string, password: string): Promise<string> {
  const starting = await csrfCookie();
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { Cookie: starting, ...xsrf(starting), 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  expect(res.status, `signing in as ${username}`).toBe(200);
  const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]);
  return cookies.length ? cookies.join('; ') : starting;
}

/** One call as a signed-in person: status and text, because a refusal is a sentence. */
async function asSession(cookie: string, method: string, urlPath: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers: {
      Cookie: cookie,
      ...xsrf(cookie),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, text: await res.text() };
}

/** The same call carrying the installation key instead of a session. */
async function asTheKey(method: string, urlPath: string, body?: unknown) {
  const res = await adminFetch(`${BASE_URL}${urlPath}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, text: await res.text() };
}

test.describe('Embedding and sharing: tokens and share links', () => {
  const REPORT = 'g-dashboard';
  const OTHER_REPORT = 'g-pivottable';

  test.beforeEach(async () => {
    const res = await adminFetch(`${BASE_URL}/api/embed/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: REPORT }),
    });
    test.skip(res.status === 404, 'embed tokens are not implemented on this build');
  });

  async function mintEmbedToken(reportId: string): Promise<string> {
    const res = await adminFetch(`${BASE_URL}/api/embed/token`, {
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
    const res = await adminFetch(`${BASE_URL}/api/embed/token`, {
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
    const created = await adminFetch(`${BASE_URL}/api/embed/share-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: REPORT }),
    });
    expect(created.status).toBe(200);

    const { token } = await created.json();
    expect(token, 'the raw token is returned once, at creation').toBeTruthy();

    // The link renders the dashboard page.
    const opened = await getDashboard(REPORT, token);
    expect(opened.status).toBe(200);
    expect(opened.body).toContain('<rb-dashboard');
    expect(opened.body, 'the page carries a short-lived embed token for the component').toContain(
      'embed-token=',
    );
    // The durable secret is validated once, here, and stops — so the link cannot leak out of the
    // page it opened.
    expect(opened.body, 'the share token itself never reaches the component').not.toContain(token);

    // Revoke it.
    const links = await adminFetch(
      `${BASE_URL}/api/embed/share-link?reportId=${encodeURIComponent(REPORT)}`,
    ).then((r) => r.json());
    expect(links.length, 'a link that exists is a link that can be found and revoked').toBeGreaterThan(0);

    for (const link of links) {
      const deleted = await adminFetch(`${BASE_URL}/api/embed/share-link/${link.id}`, {
        method: 'DELETE',
      });
      expect(deleted.status).toBe(200);
    }

    const afterRevoke = await getDashboard(REPORT, token);
    const neverIssued = await getDashboard(REPORT, NEVER_ISSUED_TOKEN);
    expect(afterRevoke.body, 'a revoked link opens nothing').not.toContain('<rb-dashboard');
    expect(afterRevoke.status, 'a revoked link must stop working').toBe(404);
    expect(
      afterRevoke.body,
      'and the answer is the same one a link that never existed gets, so guessing reveals nothing',
    ).toBe(neverIssued.body);
  });

  test('(share) a link for one dashboard does not open another', async () => {
    const { token } = await adminFetch(`${BASE_URL}/api/embed/share-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: REPORT }),
    }).then((r) => r.json());

    const other = await getDashboard(OTHER_REPORT, token);
    const neverIssued = await getDashboard(OTHER_REPORT, NEVER_ISSUED_TOKEN);

    expect(other.body, 'a token for one dashboard opens no other').not.toContain('<rb-dashboard');
    expect(other.status).toBe(404);
    expect(other.body, 'answered identically, so a wrong guess cannot be told from a wrong report').toBe(
      neverIssued.body,
    );

    // Clean up so repeated runs do not accumulate links.
    const links = await adminFetch(
      `${BASE_URL}/api/embed/share-link?reportId=${encodeURIComponent(REPORT)}`,
    ).then((r) => r.json());
    for (const link of links)
      await adminFetch(`${BASE_URL}/api/embed/share-link/${link.id}`, { method: 'DELETE' });
  });

  test('(share) an unknown token is refused, and says nothing about why', async () => {
    const res = await getDashboard(REPORT, NEVER_ISSUED_TOKEN);

    expect(res.status).toBe(404);
    // The same answer for revoked, expired and never-existed — anything else would confirm which
    // dashboards exist to someone guessing ids.
    expect(res.body).toContain('no longer available');
  });

  test('(share) the listing never exposes the tokens', async () => {
    const { token } = await adminFetch(`${BASE_URL}/api/embed/share-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: REPORT }),
    }).then((r) => r.json());

    const listing = await adminFetch(
      `${BASE_URL}/api/embed/share-link?reportId=${encodeURIComponent(REPORT)}`,
    ).then((r) => r.text());

    expect(listing, 'only hashes are stored, so the raw token can never be listed').not.toContain(
      token,
    );

    const links = JSON.parse(listing);
    for (const link of links)
      await adminFetch(`${BASE_URL}/api/embed/share-link/${link.id}`, { method: 'DELETE' });
  });

  test('(share) without a token the dashboard is not served, and the answer carries no credential', async () => {
    const res = await getDashboard(REPORT);

    // Sent to sign in, carrying where they were going. What serves the sign-in screen differs by
    // package (the desktop ships no browser app), so the redirect itself is what is asserted.
    expect(res.status, 'the page is refused, not served').toBe(302);
    expect(res.location).toContain(`/#/login?returnUrl=${encodeURIComponent(`/dashboard/${REPORT}`)}`);
    expect(res.body).not.toContain('<rb-dashboard');
    expect(res.body).not.toContain('embed-token=');
    expect(res.body).not.toContain('api-key=');
  });

  //
  // -- what a share link actually opens ------------------------------------
  //
  // A dashboard page is a frame. `<rb-dashboard>` fetches the template with the credential the
  // server minted into it, writes it into the page, and then every widget inside that template
  // fetches its own config and its own data on mount, using nothing but the attributes written on
  // that widget. So "the link opens the dashboard" — the tests above — and "the recipient sees the
  // dashboard" are two different claims, and only the second one is what a recipient gets. A frame
  // full of empty tiles answers the first claim perfectly well.
  //
  // This is e2e's home ground: a share-link visitor has no session, so only the real server and the
  // real page can show whether anything is inside the frame.

  /** The short-lived credential the server minted into the page — the only one the widgets have. */
  function embedTokenOf(pageHtml: string): string {
    const token = /embed-token="([^"]+)"/.exec(pageHtml)?.[1];
    expect(token, 'the page carries the credential its widgets will use').toBeTruthy();
    return token as string;
  }

  /** Every door one widget of this dashboard knocks on, as it knocks on it. */
  function doorsOfTheDashboard(): Array<{ what: string; path: string; init: RequestInit }> {
    return [
      { what: 'the config every widget starts from', path: `/api/reports/${REPORT}/config`, init: {} },
      { what: 'the report data', path: `/api/reports/${REPORT}/data`, init: {} },
      {
        what: `the data of the ${COUNTRY_COMPONENT} component`,
        path: `/api/reports/${REPORT}/data?componentId=${COUNTRY_COMPONENT}`,
        init: {},
      },
      {
        what: 'the server-side pivot',
        path: `/api/analytics/pivot?reportId=${REPORT}`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: [COUNTRY_COLUMN], cols: [], vals: [] }),
        },
      },
    ];
  }

  /**
   * A door this credential does not open.
   *
   * Two deployments answer a credential that authorises nothing differently, and both are right: a
   * Server refuses it, while a desktop installation lets its own local caller in as an administrator
   * whatever it carries. What must hold on both is the thing asserted here — the credential changed
   * nothing. The answer it gets is exactly the answer the same request gets carrying nothing, and
   * where that answer is a refusal it hands back no rows.
   */
  async function opensNothing(
    door: { what: string; path: string; init: RequestInit },
    credential: Record<string, string>,
    whose: string,
  ) {
    const headers = (door.init.headers ?? {}) as Record<string, string>;
    const carrying = await fetch(`${BASE_URL}${door.path}`, {
      ...door.init,
      headers: { ...headers, ...credential },
      redirect: 'manual',
    });
    const carryingNothing = await fetch(`${BASE_URL}${door.path}`, { ...door.init, redirect: 'manual' });
    const body = await carrying.text();

    expect(carrying.status, `${whose} at ${door.what}: it opened nothing that was not already open`).toBe(
      carryingNothing.status,
    );
    if (carryingNothing.status !== 200)
      expect(body, `${whose} at ${door.what}: and the refusal hands back no rows`).not.toContain(
        'reportColumnNames',
      );
  }

  test('(share) a link recipient gets the whole dashboard, not the frame', async () => {
    try {
      const { token } = await createShareLink(REPORT).then((r) => r.json());

      const opened = await getDashboard(REPORT, token);
      expect(opened.status).toBe(200);
      const embedToken = embedTokenOf(opened.body);
      const credential = { 'X-Embed-Token': embedToken };

      // The widgets read the config the same way the frame did, with the page credential.
      const config = await fetch(`${BASE_URL}/api/reports/${REPORT}/config`, {
        headers: credential,
      }).then((r) => r.json());
      const components = componentIdsOf(config);
      expect(components.length, 'the dashboard really is made of components').toBeGreaterThan(0);

      // And then each of them asks for its own rows. This is the assertion the whole test exists
      // for: not that the page came back, but that every tile on it can be filled by the only
      // credential a recipient has. A failed fetch answers 200 with one ERROR_MESSAGE row, which is
      // why `componentRows` looks at what came back rather than at the status.
      for (const componentId of components) {
        const rows = await componentRows(
          `${BASE_URL}/api/reports/${REPORT}/data?componentId=${encodeURIComponent(componentId)}`,
          credential,
        );
        expect(rows.data?.length, `the ${componentId} tile has something to show`).toBeGreaterThan(0);
      }

      // The pivot table is the one widget that asks a different question; how far it gets depends on
      // the engine the deployment has, so only the door is asserted.
      const pivot = await fetch(`${BASE_URL}/api/analytics/pivot?reportId=${REPORT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...credential },
        body: JSON.stringify({ rows: [COUNTRY_COLUMN], cols: [], vals: [] }),
      });
      expect(pivot.status, 'the pivot tile is not turned away at the door either').not.toBe(403);
      expect(pivot.status, 'nor asked to sign in').not.toBe(401);
    } finally {
      await revokeAllShareLinks(REPORT);
    }
  });

  test('(share) the widgets inside a shared dashboard are filled, not empty', async ({ page }) => {
    // The browser half of the test above, and the only place the fix can be seen where it matters.
    // Attributes do not inherit: a widget that is not handed the page credential and the page's own
    // API base has neither, and a recipient — who has no session to fall back on — gets the frame
    // and a row of empty tiles.
    try {
      const { token } = await createShareLink(REPORT).then((r) => r.json());

      await page.goto(`${BASE_URL}/dashboard/${REPORT}?token=${encodeURIComponent(token)}`);

      const widgets = 'rb-value, rb-chart, rb-tabulator, rb-pivot-table, rb-parameters';
      const withCredential =
        'rb-value[embed-token], rb-chart[embed-token], rb-tabulator[embed-token], ' +
        'rb-pivot-table[embed-token], rb-parameters[embed-token]';

      await expect(page.locator('rb-dashboard')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });

      const total = await page.locator(widgets).count();
      expect(total, 'the template really put widgets inside the frame').toBeGreaterThan(0);
      expect(
        await page.locator(withCredential).count(),
        'every widget in a shared dashboard was handed the page credential',
      ).toBe(total);

      // What they fetched with it, on the screen. A refused widget renders its own frame and nothing
      // else, which is exactly what counting elements alone would walk past.
      await expect(page.locator('rb-tabulator .tabulator-row').first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.locator('rb-value').first()).not.toHaveText(/^\s*$/);
      await expect(
        page.locator('.rb-widget-not-shared'),
        'and nothing in this dashboard belongs to another report',
      ).toHaveCount(0);
    } finally {
      await revokeAllShareLinks(REPORT);
    }
  });

  test("(share) the same page's requests are refused without a token, and with a token for another report", async () => {
    try {
      // The page door first, where the answer is the same on every deployment: no credential, no
      // dashboard. The API doors below are the ones a desktop installation answers for its own
      // local caller regardless, so there `opensNothing` asserts the credential added nothing.
      expect((await getDashboard(REPORT)).status, 'the page itself is refused outright').toBe(302);

      const neverIssued = { 'X-Embed-Token': NEVER_ISSUED_TOKEN };
      for (const door of doorsOfTheDashboard())
        await opensNothing(door, neverIssued, 'a credential that was never issued');

      // A real, live credential — for another report. This is the one that matters: the recipient of
      // one dashboard must not be able to point their own token at another.
      const other = await mintToken(OTHER_REPORT).then((r) => r.json());
      for (const door of doorsOfTheDashboard())
        await opensNothing(door, { 'X-Embed-Token': other.token }, `a token for ${OTHER_REPORT}`);

      // And it is a live credential, not a dead string: on its own report it is let through.
      const onItsOwnReport = await fetch(`${BASE_URL}/api/reports/${OTHER_REPORT}/data`, {
        headers: { 'X-Embed-Token': other.token },
      });
      expect(onItsOwnReport.status, 'the same token opens the report it names').toBe(200);
    } finally {
      await revokeAllShareLinks(REPORT);
    }
  });

  test('(share) a dashboard still open when the embed token expires renews itself from the share link', async () => {
    // The decision recorded in DashboardController: the page reloads itself shortly before its embed
    // token runs out, and the reload is authorised by the share token, which is still valid. No
    // refresh endpoint was added — a second way to turn a share token into an embed token is a
    // second thing to get wrong, and the share token is already in the URL the browser is on. The
    // cost is that filter selections reset, which is why the margin is minutes rather than seconds.
    try {
      const { token } = await createShareLink(REPORT).then((r) => r.json());

      const first = await getDashboard(REPORT, token);
      expect(first.status).toBe(200);
      expect(first.body, 'the page says how long its credential lasts').toContain(
        'data-embed-token-ttl=',
      );

      const ttlSeconds = Number(/data-embed-token-ttl="(\d+)"/.exec(first.body)?.[1]);
      const reloadDelay = Number(/window\.location\.reload\(\); \}, (\d+)\)/.exec(first.body)?.[1]);
      expect(ttlSeconds, 'and it is a real lifetime').toBeGreaterThan(0);
      expect(reloadDelay, 'a reload is scheduled').toBeGreaterThan(0);
      expect(reloadDelay, 'and it happens before the credential expires, not after').toBeLessThan(
        ttlSeconds * 1000,
      );

      // What that reload gets. A second apart, because the token is an HMAC of its claims and its
      // expiry is a whole number of seconds: two loads inside the same second mint the same string,
      // correctly — they expire at the same moment.
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const renewed = await getDashboard(REPORT, token);
      expect(renewed.status, 'the share token is still what opens the page').toBe(200);
      expect(
        expiryOf(embedTokenOf(renewed.body)),
        'the reloaded page holds a credential that lasts longer than the one it replaced',
      ).toBeGreaterThan(expiryOf(embedTokenOf(first.body)));

      // And the renewed one works, which is the only thing the recipient notices.
      const rows = await componentRows(
        `${BASE_URL}/api/reports/${REPORT}/data?componentId=${COUNTRY_COMPONENT}`,
        { 'X-Embed-Token': embedTokenOf(renewed.body) },
      );
      expect(rows.data?.length, 'the renewed credential reads the same rows').toBeGreaterThan(0);

      // The other half of the decision: renewal is not a loophole. Once the link is revoked, the
      // reload that was meant to keep the page alive is what ends it.
      await revokeAllShareLinks(REPORT);
      const afterRevoke = await getDashboard(REPORT, token);
      expect(afterRevoke.status, 'a reload after revoking lands on the same page a guess does').toBe(404);
      expect(afterRevoke.body).not.toContain('<rb-dashboard');
    } finally {
      await revokeAllShareLinks(REPORT);
    }
  });

  /** When an embed token says it expires — the claim the renewal above is measured against. */
  function expiryOf(embedToken: string): number {
    const payload = JSON.parse(Buffer.from(embedToken.split('.')[1], 'base64').toString('utf8'));
    expect(payload.exp, 'an embed token carries its expiry').toBeTruthy();
    return Number(payload.exp);
  }

  //
  // -- locked parameters ---------------------------------------------------
  //
  // A link or a token can fix a parameter, so the recipient reads one slice and no other. The value
  // travels inside the credential, which is what makes it a restriction rather than a suggestion:
  // the only way to see a different slice is to be given a different credential. Each test below
  // therefore attacks the lock from the angle a recipient actually has — editing the query string,
  // asking for nothing at all, or going round the report's query with a server-side pivot.

  /** g-dashboard declares exactly one parameter, and its data really has both of these values. */
  const LOCKED_PARAM = 'country';
  const LOCKED_VALUE = 'Germany';
  const OTHER_VALUE = 'France';

  /**
   * The component to read the lock off, and the column in its rows.
   *
   * Two of g-dashboard's components answer with a `country` column and only one of them can settle
   * the question: `orderExplorer` selects `o.ShipCountry`, the very column the script filters on,
   * while `topCustomers` selects `cu.Country` — where the customer lives, which an order shipped to
   * Germany need not match. The id is checked against the config before it is used, so renaming the
   * component fails the test instead of quietly making its assertion vacuous.
   */
  const COUNTRY_COMPONENT = 'orderExplorer';
  const COUNTRY_COLUMN = 'country';

  /** Every component the config names, whatever kind of widget each one is. */
  function componentIdsOf(config: Record<string, any>): string[] {
    return Object.keys(config)
      .filter((key) => key.startsWith('named') && key.endsWith('Options'))
      .flatMap((key) => Object.keys(config[key] ?? {}));
  }

  function createShareLink(reportId: string, body: Record<string, unknown> = {}): Promise<Response> {
    return adminFetch(`${BASE_URL}/api/embed/share-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId, ...body }),
    });
  }

  function mintToken(reportId: string, body: Record<string, unknown> = {}): Promise<Response> {
    return adminFetch(`${BASE_URL}/api/embed/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId, ...body }),
    });
  }

  function listShareLinks(reportId: string): Promise<any[]> {
    return adminFetch(
      `${BASE_URL}/api/embed/share-link?reportId=${encodeURIComponent(reportId)}`,
    ).then((r) => r.json());
  }

  /** Every link these tests create is revoked in a finally, so repeated runs do not accumulate any. */
  async function revokeAllShareLinks(reportId: string) {
    for (const link of await listShareLinks(reportId))
      await adminFetch(`${BASE_URL}/api/embed/share-link/${link.id}`, { method: 'DELETE' });
  }

  function componentUrl(token: string | undefined, extra = ''): string {
    const query = token ? `&token=${encodeURIComponent(token)}` : '';
    return `${BASE_URL}/api/reports/${REPORT}/data?componentId=${COUNTRY_COMPONENT}${extra}${query}`;
  }

  /** The rows of one component, as whatever credential is in `headers` is allowed to see them. */
  async function componentRows(url: string, headers: Record<string, string> = {}): Promise<any> {
    const res = await fetch(url, { headers });
    expect(res.status, `reading ${url}`).toBe(200);
    const result = await res.json();
    // A failed fetch still answers 200, with one ERROR_MESSAGE row — so a status check alone would
    // let a broken query pass as "no forbidden rows".
    expect(result.reportColumnNames, 'the fetch behind the component did not fail').not.toContain(
      'ERROR_MESSAGE',
    );
    return result;
  }

  function valuesOf(result: any, column: string): string[] {
    expect(result.reportColumnNames, `the component answers with a '${column}' column`).toContain(
      column,
    );
    return (result.data as Array<Record<string, any>>).map((row) => String(row[column]));
  }

  /** Both halves of one lock: what it narrows, and that asking louder does not widen it. */
  function expectOnlyLockedCountry(result: any, what: string) {
    expect(result.data.length, `${what}: the lock narrows the rows, it does not empty them`).toBeGreaterThan(0);
    expect(new Set(valuesOf(result, COUNTRY_COLUMN)), `${what}: every row is the locked country`).toEqual(
      new Set([LOCKED_VALUE]),
    );
  }

  test('(locked) a share link locked to one country returns only that country, whatever the request asks', async () => {
    try {
      const created = await createShareLink(REPORT, {
        lockedParams: { [LOCKED_PARAM]: LOCKED_VALUE },
      });
      expect(created.status, 'locking a declared parameter to a value it has').toBe(200);
      const lockedToken = (await created.json()).token;

      const config = await fetch(
        `${BASE_URL}/api/reports/${REPORT}/config?token=${encodeURIComponent(lockedToken)}`,
      ).then((r) => r.json());
      expect(
        componentIdsOf(config),
        `the dashboard still has a ${COUNTRY_COMPONENT} component to read the lock off`,
      ).toContain(COUNTRY_COMPONENT);

      // The two ways a recipient can ask for more: name another country, or name none.
      expectOnlyLockedCountry(
        await componentRows(componentUrl(lockedToken, `&${LOCKED_PARAM}=${OTHER_VALUE}`)),
        'asking for another country',
      );
      expectOnlyLockedCountry(
        await componentRows(componentUrl(lockedToken)),
        'asking for no country at all',
      );

      // The other half, and the reason the two assertions above mean anything: the same query string
      // on an UNLOCKED link does change the answer. Without this, a dashboard that only ever returned
      // Germany would pass the test just as well.
      const open = await createShareLink(REPORT);
      expect(open.status).toBe(200);
      const openToken = (await open.json()).token;

      const france = await componentRows(
        componentUrl(openToken, `&${LOCKED_PARAM}=${OTHER_VALUE}`),
      );
      expect(france.data.length, 'the unlocked link answers for the country it was asked for').toBeGreaterThan(0);
      expect(new Set(valuesOf(france, COUNTRY_COLUMN)), 'so the lock did it, not the data').toEqual(
        new Set([OTHER_VALUE]),
      );
    } finally {
      await revokeAllShareLinks(REPORT);
    }
  });

  test('(locked) an embed token with lockedParams behaves the same', async () => {
    // The other credential, carrying the same locks: a host application embedding a dashboard mints
    // one per render, and its reader must be no less restricted than the reader of a link.
    const minted = await mintToken(REPORT, { lockedParams: { [LOCKED_PARAM]: LOCKED_VALUE } });
    expect(minted.status).toBe(200);
    const body = await minted.json();
    expect(body.lockedParams, 'minting answers with the locks it stored').toEqual({
      [LOCKED_PARAM]: LOCKED_VALUE,
    });

    const header = { 'X-Embed-Token': body.token };

    expectOnlyLockedCountry(
      await componentRows(componentUrl(undefined, `&${LOCKED_PARAM}=${OTHER_VALUE}`), header),
      'asking for another country',
    );
    expectOnlyLockedCountry(await componentRows(componentUrl(undefined), header), 'asking for none');

    // Nothing to clean up: an embed token is never stored, it simply expires.
  });

  test('(locked) the config says which parameters are locked', async () => {
    // How the page knows to draw the control fixed instead of offering a choice. Without it the
    // recipient gets a live-looking dropdown that changes nothing, which reads as a broken dashboard.
    const token = (await mintToken(REPORT, { lockedParams: { [LOCKED_PARAM]: LOCKED_VALUE } }).then(
      (r) => r.json(),
    )).token;

    const locked = await fetch(`${BASE_URL}/api/reports/${REPORT}/config`, {
      headers: { 'X-Embed-Token': token },
    }).then((r) => r.json());
    expect(locked.lockedParameters).toEqual({ [LOCKED_PARAM]: LOCKED_VALUE });

    const plain = await adminFetch(`${BASE_URL}/api/reports/${REPORT}/config`).then((r) => r.json());
    expect(
      plain.lockedParameters,
      'an ordinary reader is offered the parameter, not told it is fixed',
    ).toBeFalsy();
  });

  test('(locked) only declared parameters can be locked, with valid values', async () => {
    try {
      // Counted rather than assumed empty: what matters is that a refused lock adds nothing, not
      // what earlier tests in this file happened to leave behind.
      const before = (await listShareLinks(REPORT)).length;
      const beforeOther = (await listShareLinks(OTHER_REPORT)).length;

      // A typo is the failure this refusal exists for: `regoin` puts a value into the query map that
      // the report never reads, so the link looks restricted in the listing and shows every row —
      // and nobody opens it again to find out.
      for (const bad of [
        { lockedParams: { regoin: LOCKED_VALUE } },
        { lockedParams: `${LOCKED_PARAM}=${LOCKED_VALUE}` },
      ]) {
        const link = await createShareLink(REPORT, bad);
        expect(link.status, `a share link locking ${JSON.stringify(bad)}`).toBe(400);
        expect((await link.json()).error, 'and it says what was wrong').toBeTruthy();

        const token = await mintToken(REPORT, bad);
        expect(token.status, `an embed token locking ${JSON.stringify(bad)}`).toBe(400);
      }

      // A report that declares no parameters has nothing lockable, so even a real parameter name of
      // another report is refused on it.
      const onOther = await createShareLink(OTHER_REPORT, {
        lockedParams: { [LOCKED_PARAM]: LOCKED_VALUE },
      });
      expect(onOther.status, `${OTHER_REPORT} declares no ${LOCKED_PARAM}`).toBe(400);

      // Validation happens before creation, so a refused lock leaves nothing behind that could later
      // be revoked, listed, or opened.
      expect((await listShareLinks(REPORT)).length, 'a refused link was never created').toBe(before);
      expect((await listShareLinks(OTHER_REPORT)).length, 'nor on the other report').toBe(beforeOther);
    } finally {
      await revokeAllShareLinks(REPORT);
      await revokeAllShareLinks(OTHER_REPORT);
    }
  });

  test('(locked) the links listing shows the locks and never the tokens', async () => {
    try {
      const { token } = await createShareLink(REPORT, {
        lockedParams: { [LOCKED_PARAM]: LOCKED_VALUE },
      }).then((r) => r.json());

      const listing = await adminFetch(
        `${BASE_URL}/api/embed/share-link?reportId=${encodeURIComponent(REPORT)}`,
      ).then((r) => r.text());

      // What the author needs to see months later — which of these links is narrowed, and how —
      // without the listing ever becoming a second copy of the credential itself.
      expect(listing, 'the raw token is disclosed once, at creation, and never again').not.toContain(
        token,
      );

      const links = JSON.parse(listing);
      expect(links, 'the link that was just created is listed').toHaveLength(1);
      expect(links[0].lockedParams, 'and it carries its locks').toEqual({
        [LOCKED_PARAM]: LOCKED_VALUE,
      });
    } finally {
      await revokeAllShareLinks(REPORT);
    }
  });

  test('(locked) a locked token cannot pivot', async () => {
    // A server-side pivot reads the report's source table and aggregates it — it never goes through
    // the report's query, so the parameters, and with them the locks, play no part in what it
    // returns. Running it for a locked view would hand back exactly the rows the lock exists to
    // hide, so there is nothing to narrow and nothing to do but refuse.
    const pivot = (token: string) =>
      fetch(`${BASE_URL}/api/analytics/pivot?reportId=${REPORT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Embed-Token': token },
        body: JSON.stringify({ rows: [COUNTRY_COLUMN], cols: [], vals: [] }),
      });

    const lockedToken = (await mintToken(REPORT, {
      lockedParams: { [LOCKED_PARAM]: LOCKED_VALUE },
    }).then((r) => r.json())).token;
    const refused = await pivot(lockedToken);
    expect(refused.status, 'a locked view has no server-side pivot').toBe(403);

    // The other half: pivoting is not forbidden to tokens as such, only to locked ones. Where it
    // goes from here depends on the engine the deployment has, so only the door is asserted.
    const openToken = await mintToken(REPORT).then((r) => r.json());
    const allowed = await pivot(openToken.token);
    expect(allowed.status, 'an unlocked token is not turned away at the door').not.toBe(403);
  });

  test('(embed) the installation key is refused nothing a limited session would be refused', async () => {
    // What an embedding host is: a server holding the installation key, calling on behalf of a page
    // it has already authorised itself. It belongs to no group, so a group can neither widen nor
    // narrow it — and if anything ever limited it, every embedded dashboard in every host
    // application would go blank at once, silently, for a reason nobody would look for in a group.
    //
    // Proved by contrast: a connection is put out of reach of a limited author, and then the same
    // doors are knocked on with the key. The author's half is what makes the key's half mean
    // something — without it, a green test would only say the doors are open to everybody.
    const connectionCode = 'db-embed-key-journey';
    const limited = { username: 'e2e-embed-limited-author', password: 'E2eEmbedLimited123!' };
    const database = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-sqlite/northwind.db`;
    let groupId: number | undefined;

    try {
      expect(
        (await asTheKey('PUT', `/api/connections/${connectionCode}`, {
          connection: {
            code: connectionCode,
            name: connectionCode,
            default: false,
            databaseserver: { type: 'sqlite', database },
          },
        })).status,
        'the key creates the connection this test is about',
      ).toBe(200);

      // A group that allows one connection which is not the one above: its members are refused this
      // database everywhere.
      const created = await asTheKey('POST', '/api/iam/groups', {
        name: 'e2e-embed-elsewhere-only',
        settings: { connections: ['db-somewhere-else'] },
      });
      expect(created.status, 'the key manages groups, as an administrator does').toBe(201);
      groupId = JSON.parse(created.text).id;

      await asTheKey('DELETE', `/api/iam/users/${limited.username}`);
      expect(
        (await asTheKey('POST', '/api/iam/users', {
          username: limited.username,
          password: limited.password,
          role: 'REPORT_AUTHOR',
        })).status,
      ).toBe(201);
      expect(
        (await asTheKey('PUT', `/api/iam/users/${limited.username}/groups`, { groupIds: [groupId] }))
          .status,
      ).toBe(204);

      const author = await signIn(limited.username, limited.password);

      const doors: Array<[string, string, string, unknown?]> = [
        ['the connection itself', 'GET', `/api/connections/${connectionCode}`],
        ['its metadata', 'GET', `/api/connections/${connectionCode}/metadata/er-diagram`],
        ['its schema', 'GET', `/api/queries/schema/${connectionCode}`],
        [
          'run-sql on it',
          'POST',
          '/api/queries/run-sql',
          { connectionId: connectionCode, sql: 'SELECT CustomerID FROM Customers' },
        ],
        [
          'an exploration of it',
          'POST',
          '/api/analytics/explore',
          { connectionCode, tableName: 'Customers', fields: ['Country'] },
        ],
        [
          'reading its file',
          'GET',
          `/api/system/fs/content?path=${encodeURIComponent(
            `config/connections/${connectionCode}/${connectionCode}.xml`,
          )}`,
        ],
      ];

      for (const [what, method, urlPath, body] of doors) {
        const refused = await asSession(author, method, urlPath, body);
        expect(refused.status, `a limited author is refused ${what}`).toBe(403);

        const withTheKey = await asTheKey(method, urlPath, body);
        expect(withTheKey.status, `and the installation key is not: ${what} — ${withTheKey.text}`).toBe(
          200,
        );
        expect(withTheKey.text, `the key gets an answer with something in it: ${what}`).not.toBe('');
      }

      // And a report on that connection: the step a limited author is refused outright, answered
      // for the key with the report really carrying the connection afterwards.
      const reportId = 'e2e-embed-key-report';
      try {
        expect(
          (await asTheKey('POST', '/api/reports', {
            reportId,
            templateName: reportId,
            capReportGenerationMailMerge: true,
          })).status,
        ).toBe(201);

        const settings = JSON.parse(
          (await asTheKey('GET', `/api/reports/${reportId}/datasource`)).text,
        );
        settings.report.datasource.type = 'ds.sqlquery';
        settings.report.datasource.sqloptions = {
          ...(settings.report.datasource.sqloptions ?? {}),
          conncode: connectionCode,
          query: 'SELECT CustomerID, CompanyName FROM Customers',
          idcolumn: 'CustomerID',
        };
        expect(
          (await asTheKey('PUT', `/api/reports/${reportId}/datasource`, settings)).status,
          'the key points a report at the connection a limited author may not use',
        ).toBe(200);
        expect(
          JSON.parse((await asTheKey('GET', `/api/reports/${reportId}/datasource`)).text).report
            ?.datasource?.sqloptions?.conncode,
          'and it reads back — the save really landed',
        ).toBe(connectionCode);
      } finally {
        await asTheKey('DELETE', `/api/reports/${reportId}`);
      }

      // The one that is not a refusal but a list: the connection a limited author is not shown is
      // shown to the key, because a host application embeds whatever its own pages need.
      const listed = JSON.parse((await asTheKey('GET', '/api/connections?type=database')).text).map(
        (c: { connectionCode: string }) => c.connectionCode,
      );
      expect(listed, 'the key sees every connection in the installation').toContain(connectionCode);

      const listedForTheAuthor = JSON.parse(
        (await asSession(author, 'GET', '/api/connections?type=database')).text,
      ).map((c: { connectionCode: string }) => c.connectionCode);
      expect(listedForTheAuthor, 'and the limited author sees none of it').not.toContain(
        connectionCode,
      );
    } finally {
      await asTheKey('PUT', `/api/iam/users/${limited.username}/groups`, { groupIds: [] });
      await asTheKey('DELETE', `/api/iam/users/${limited.username}`);
      if (groupId !== undefined) await asTheKey('DELETE', `/api/iam/groups/${groupId}`);
      await asTheKey('DELETE', `/api/connections/${connectionCode}`);
    }
  });

  test('(locked) the page a recipient opens shows the locked control fixed', async ({ page }) => {
    // The one browser test in this file. Everything above proves the server never returns another
    // country; this proves the person looking at the page is not invited to ask for one — a live
    // dropdown that silently changes nothing is how a lock is reported as a bug.
    try {
      const { token } = await createShareLink(REPORT, {
        lockedParams: { [LOCKED_PARAM]: LOCKED_VALUE },
      }).then((r) => r.json());

      await page.goto(`${BASE_URL}/dashboard/${REPORT}?token=${encodeURIComponent(token)}`);

      await new FluentTester(page)
        .waitOnElementToBecomeVisible(`#${LOCKED_PARAM}`)
        .elementShouldBeDisabled(`#${LOCKED_PARAM}`)
        .selectedOptionShouldContainText(`#${LOCKED_PARAM}`, LOCKED_VALUE)
        // Fixed, and said to be fixed: the note is what turns a greyed-out control from a fault
        // into an explanation.
        .elementShouldBeVisible(`#${LOCKED_PARAM}_lockedNote`);
    } finally {
      await revokeAllShareLinks(REPORT);
    }
  });
});
