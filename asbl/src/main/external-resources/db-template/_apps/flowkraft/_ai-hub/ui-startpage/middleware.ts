import { NextRequest, NextResponse } from 'next/server';

/**
 * Route protection for the AI Hub, derived from DataPallas rather than configured.
 *
 * HOW IT WORKS
 *
 * The browser already holds a DataPallas session cookie once the user has signed in — cookies are
 * scoped by host, not by port, so a cookie set by DataPallas on :9090 is sent to this app on :8440
 * too. This middleware simply forwards that cookie to the backend and asks who the caller is:
 *
 *   200  → a real signed-in user (or DataPallas Desktop, where everyone is the local admin) → allow
 *   401  → nobody is signed in → the app renders its sign-in form
 *
 * WHO IS ALLOWED IN AT ALL
 *
 * Being signed in is not enough. The AI Hub is an authoring tool — every part of it writes
 * explorations, cubes, dashboards or agent configuration — so it is for {@code ADMIN} and
 * {@code REPORT_AUTHOR}. A {@code JOB_OPERATOR} runs jobs and reads their output; there is nothing
 * here they can do, so they are turned away at the door rather than let in to a shell where every
 * panel refuses them.
 *
 * <p>The test is the backend's own {@code editReports} capability, never a role name compared here.
 * That is the same flag DataPallas hides its Configuration menu by and the same decision
 * {@code @PreAuthorize("hasRole('REPORT_AUTHOR')")} enforces on /api/explorations and /api/cubes, so
 * the door and the endpoints behind it can never disagree about who may pass.
 *
 * WHY THERE IS NOTHING TO CONFIGURE
 *
 * There is no flag, no shared secret and no login URL. On Desktop the backend authenticates the
 * local caller, so /auth/me answers 200 and every page opens exactly as before — no login, nothing
 * to set up. On a Server the backend enforces, /auth/me answers 401, and the user is sent to sign
 * in through this app's own form, which posts to the same backend. The same code produces both
 * behaviours because it asks the backend instead of being told.
 *
 * WHAT THIS PROTECTS
 *
 * Not the DataPallas data — the proxy forwards the caller's own session, so the backend already
 * authorises every one of those calls as that user. What it protects is what belongs to this app:
 * saved canvases, the agents, the chat history.
 */

/**
 * Must answer before anyone is signed in, or the page could never load to sign in with.
 *
 * <p>{@code /api/dp/auth} is in here for a reason worth stating: it carries who-am-I, sign-in and
 * sign-out. Gating those on being signed in is circular — the answer to "are you allowed in" cannot
 * itself require being allowed in — and gating them on holding a role locks the door from the inside,
 * because the only way to acquire a different role is to sign in as somebody else through exactly
 * these endpoints.
 */
const ALWAYS_PUBLIC = ['/api/dp/auth', '/api/health', '/_next', '/favicon.ico', '/assets', '/images'];

/** Server-side only. The container's own localhost is not the host's. */
const DP_API_URL = process.env.DP_API_URL || 'http://localhost:9090/api';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (ALWAYS_PUBLIC.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  try {
    const identity = await fetch(`${DP_API_URL}/auth/me`, {
      headers: { Cookie: request.headers.get('cookie') ?? '' },
      cache: 'no-store',
    });

    if (identity.ok) {
      const who = await readIdentity(identity);

      // `/auth/me` answers 200 to EVERYBODY — that is its contract, because the deployment mode has
      // to be knowable before anyone signs in. So 200 does not mean "signed in", and an anonymous
      // answer carries every capability set to false. Reading that as "signed in, but not an author"
      // is what let a signed-out visitor straight into the app: the role refusal 403'd the identity
      // probe itself, the client never learned it was signed out, and so it never asked anyone to
      // sign in. Authentication is the first question; the role is only the second.
      if (who && who.authenticated === false) return refuse(request);

      return mayAuthor(who) ? NextResponse.next() : refuseRole(request);
    }

    if (identity.status === 401) return refuse(request);

    // Any other answer means the backend is unhappy rather than the caller — do not lock people out
    // of the app because DataPallas returned a 500.
    return NextResponse.next();
  } catch {
    // DataPallas unreachable: let the app load. It will show its own "backend is not running"
    // state, which is far more useful than an unexplained redirect.
    return NextResponse.next();
  }
}

/** The two fields of the identity this file decides on. Null when the body could not be read. */
type Identity = { authenticated?: boolean; capabilities?: Record<string, boolean> };

async function readIdentity(response: Response): Promise<Identity | null> {
  try {
    return (await response.json()) as Identity;
  } catch {
    return null;
  }
}

/**
 * May this caller author? Reads the backend's own capability rather than judging role names.
 *
 * <p>An identity that could not be read, or one from a backend too old to send capabilities, answers
 * true: the endpoints behind this door enforce independently, and locking everyone out of the app
 * because a JSON parse failed would be worse than letting a request through to be refused properly.
 */
function mayAuthor(identity: Identity | null): boolean {
  try {
    return identity?.capabilities?.editReports !== false;
  } catch {
    return true;
  }
}

/**
 * Signed in, but not as someone who can author.
 *
 * <p>API callers get a 403 naming the role they lack — the endpoint is real, their role is not
 * enough, and both facts are useful to them. That is the enforcement, and it applies to this app's
 * own routes as much as to the proxied ones.
 *
 * <p>Page navigations fall through instead, and {@code SignInGate} renders the sign-in form with the
 * refusal above it. Nothing of the app is exposed by doing so — the gate replaces the whole page —
 * and it puts the remedy where the problem is stated. A dedicated refusal page was tried first and
 * was strictly worse: it told the visitor they were the wrong person and then made them go and find
 * somewhere else to become the right one.
 */
function refuseRole(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'You need to be ADMIN or REPORT_AUTHOR to use this app.' },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

/**
 * Nobody is signed in.
 *
 * <p>API callers get a 401 they can act on. Page navigations are let THROUGH, so the app renders and
 * {@code SignInGate} offers its sign-in form — the form posts through this app's proxy to DataPallas,
 * so there is still only one account store and one password, exactly as before.
 *
 * <p>This used to redirect to {@code :9090}, and that was wrong twice over. It assumed DataPallas was
 * reachable on that port from wherever the browser happened to be — not true when the AI Hub is opened
 * from another machine, and meaningless when DataPallas is the desktop app rather than a web server.
 * And because the redirect fired on every unauthenticated page load, the sign-in form this app ships
 * could never appear, which left anyone signed in as the wrong user with no way to become another one.
 */
function refuse(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
