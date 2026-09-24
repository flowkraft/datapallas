import { NextRequest, NextResponse } from 'next/server';

/**
 * What the Chat2DB routes ask DataPallas before they forward anything to the Chat2DB sidecar:
 * may this caller use this connection, and who are they. Server-side only.
 */

/**
 * Where the DataPallas backend lives, as seen FROM THIS CONTAINER — the same value, read the same
 * way, as the backend proxy in `app/api/dp/[...path]/route.ts`. Server-side only, for the reason
 * given there: a `NEXT_PUBLIC_` value is inlined into the browser bundle.
 */
const DP_TARGET = process.env.DP_API_URL || 'http://localhost:9090/api';

/**
 * Ask DataPallas whether this caller may use this connection, and answer as DataPallas does.
 *
 * WHY THIS CHECK IS HERE
 *
 * The connection picker on this page is filled from `GET /api/connections?type=database`, which
 * already hides the database connections the signed-in author's groups do not allow. That makes the
 * dropdown right, and the dropdown alone is not a rule: this route is an ordinary HTTP endpoint, and
 * a request that names a connection the author was not offered used to be forwarded like any other.
 *
 * So the same question is asked again here, of the one component that owns the answer.
 * `GET /api/connections/{id}` already refuses a connection the caller's limits hide (403), so this
 * holds no copy of the rule and cannot drift from it — it forwards the caller's own session cookie
 * and relays the verdict. Cookies are scoped by host and not by port, so the cookie DataPallas set
 * on :9090 arrives here on :8440; the `/api/dp` proxy relies on the same thing and explains it at
 * length. On the desktop, where the backend authenticates the local caller and there is no cookie to
 * send, the check passes exactly as every other backend call does.
 *
 * It fails closed. A backend that cannot be reached, a redirect to a sign-in page, an unexpected
 * status — none of them are a yes, and none of them forward.
 *
 * WHERE IT IS ASKED
 *
 * On connect, and again on every question that names a connection (`POST /api/chat2db`). The
 * Chat2DB sidecar keeps one connection per connection code, shared by everybody who asks about that
 * database, and it does not know who is asking — so it is not itself a boundary. A question naming a
 * code somebody else connected must be refused here exactly as the connect would have been.
 */
export async function refuseUnlessAllowed(request: NextRequest, connectionCode: string): Promise<Response | null> {
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);

  let verdict: Response;
  try {
    verdict = await fetch(`${DP_TARGET}/connections/${encodeURIComponent(connectionCode)}`, {
      method: 'GET',
      headers,
      redirect: 'manual',
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        detail: 'DataPallas is not reachable, so this connection could not be checked.',
        target: DP_TARGET,
        error: String(e?.message || e),
      },
      { status: 502 },
    );
  }

  if (verdict.ok) return null;

  // 401 and 403 are DataPallas's own answers and are passed through as they are. Anything else —
  // a redirect to the sign-in page, a 404, a 500 — is not a yes either, and is reported as the
  // refusal it amounts to rather than as somebody else's status code.
  const status = verdict.status === 401 || verdict.status === 403 ? verdict.status : 403;

  return NextResponse.json(
    {
      detail:
        status === 401
          ? 'Sign in to DataPallas before connecting a database here.'
          : `You are not allowed to use the connection '${connectionCode}'.`,
    },
    { status },
  );
}

/**
 * The signed-in DataPallas username, or '' when it cannot be told.
 *
 * <p>Sent to the sidecar as X-DataPallas-User, which keeps each person's last query result apart
 * ("now chart that" draws your own rows, never somebody else's). It grants nothing: access is
 * {@link refuseUnlessAllowed}, and the middleware has already required a signed-in caller.
 */
export async function usernameOf(request: NextRequest): Promise<string> {
  try {
    const identity = await fetch(`${DP_TARGET}/auth/me`, {
      headers: { cookie: request.headers.get('cookie') ?? '' },
      cache: 'no-store',
    });
    if (!identity.ok) return '';
    const body = (await identity.json()) as { user?: { username?: string } | null };
    return body.user?.username ?? '';
  } catch {
    return '';
  }
}
