// Run with:
//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/session-request.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { cookieValue, refusalMessage, withCsrfHeader } from './session-request.ts';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const COOKIES = 'JSESSIONID=8A1; XSRF-TOKEN=tok-42; dp-theme=corporate';

describe('a write that rides on the browser session carries the token the server issued', () => {
  test('the token out of the cookie travels as X-XSRF-TOKEN', () => {
    const headers = withCsrfHeader(JSON_HEADERS, COOKIES);
    assert.equal(headers['X-XSRF-TOKEN'], 'tok-42');
    // and nothing else about the request changed
    assert.equal(headers['Content-Type'], 'application/json');
  });

  test('a cookie that arrived percent-encoded is sent as the server will read it', () => {
    assert.equal(withCsrfHeader(JSON_HEADERS, 'XSRF-TOKEN=a%2Fb%3Dc')['X-XSRF-TOKEN'], 'a/b=c');
  });

  test('a request that names its own caller is left exactly as it was', () => {
    // These three are the ones the server exempts from CSRF, so adding a token would be noise -
    // and an embedded page has no session cookie to take one from in the first place.
    for (const credential of ['X-Embed-Token', 'X-API-Key', 'Authorization']) {
      const asked = { ...JSON_HEADERS, [credential]: 'whatever' };
      const headers = withCsrfHeader(asked, COOKIES);
      assert.equal(headers['X-XSRF-TOKEN'], undefined, credential + ' needs no CSRF token');
      assert.deepEqual(headers, asked);
    }
    // The header's spelling is the server's business, not the caller's.
    assert.equal(withCsrfHeader({ 'x-api-key': 'k' }, COOKIES)['X-XSRF-TOKEN'], undefined);
  });

  test('with no such cookie nothing is invented', () => {
    assert.deepEqual(withCsrfHeader(JSON_HEADERS, 'JSESSIONID=8A1'), JSON_HEADERS);
    assert.deepEqual(withCsrfHeader(JSON_HEADERS, ''), JSON_HEADERS);
  });

  test('a cookie whose name merely ends in the one asked for is not it', () => {
    assert.equal(cookieValue('XSRF-TOKEN', 'MY-XSRF-TOKEN=no'), '');
    assert.equal(cookieValue('XSRF-TOKEN', 'MY-XSRF-TOKEN=no; XSRF-TOKEN=yes'), 'yes');
  });
});

describe('a refusal is shown to the reader in words', () => {
  test("the container's own body is not put on the screen as it came", () => {
    // What a session write without its token comes back as, and what the reader used to be shown:
    // the single word "Forbidden".
    const spring = { timestamp: '2026-09-29T10:00:00.000+00:00', status: 403, error: 'Forbidden',
      path: '/api/reports/r/cube/c/query' };
    const said = refusalMessage(spring, 403, 'This question could not be answered');
    assert.ok(!/^Forbidden\.?$/.test(said), 'the bare status name is not the message: ' + said);
    assert.ok(said.includes('Reload the page'), 'it says what to do about it: ' + said);
  });

  test('a sentence the application wrote is shown as it stands', () => {
    assert.equal(refusalMessage({ error: 'This cube does not show its SQL.' }, 403, 'fallback'),
      'This cube does not show its SQL.');
  });

  test('a session that has run out says so', () => {
    const said = refusalMessage({ status: 401, error: 'Unauthorized', path: '/api/x' }, 401, 'fallback');
    assert.ok(said.includes('signed in'), said);
  });

  test('anything else keeps the status, because there is nothing better to say', () => {
    assert.equal(refusalMessage(null, 500, 'This question could not be answered'),
      'This question could not be answered (500).');
  });
});
