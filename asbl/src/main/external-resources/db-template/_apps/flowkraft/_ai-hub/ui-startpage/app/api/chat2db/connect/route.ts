import { NextRequest, NextResponse } from 'next/server';

const CHAT2DB_URL = process.env.CHAT2DB_URL || 'http://flowkraft-ai-hub-chat2db:8888';

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
 * WHAT IT DOES NOT DO
 *
 * It closes this door, not the room. The Chat2DB sidecar keeps one process-wide connection and no
 * notion of who is asking, so it is not itself a boundary — see the TODO in
 * `.docs/safe-sql-groups-and-sharing-plan.md` about per-caller sessions there.
 */
async function refuseUnlessAllowed(request: NextRequest, connectionCode: string): Promise<Response | null> {
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
 * POST /api/chat2db/connect — Connect to a database.
 * Body: { connection_code: string, connection_name?: string, dbserver?: object }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Required, and required to be real: the check below is about a named connection, and a blank
    // name would leave the connection details in the body unaccounted for.
    const connectionCode = typeof body?.connection_code === 'string' ? body.connection_code.trim() : '';
    if (!connectionCode) {
      return NextResponse.json({ detail: 'Missing connection_code.' }, { status: 400 });
    }

    const refusal = await refuseUnlessAllowed(request, connectionCode);
    if (refusal) return refusal;

    const res = await fetch(`${CHAT2DB_URL}/api/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      return NextResponse.json(error, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Chat2DB backend unreachable', detail: String(e?.message || e) },
      { status: 502 }
    );
  }
}
