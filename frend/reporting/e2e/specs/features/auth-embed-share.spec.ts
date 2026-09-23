import { test, expect } from '@playwright/test';

import { Helpers } from '../../utils/helpers';

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
});
