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
 * THE AI IS FOR ADMINISTRATORS
 *
 * Inside the app, the AI — the chats, the agents, Chat2DB, the LLM settings — is narrower still:
 * {@code ADMIN} only. The agents act with the installation's API key, which is ADMIN, whoever is
 * talking to them, so letting an author talk to them would hand the author an administrator's reach.
 * The test is the backend's {@code useAi} capability (AuthController.capabilitiesOf), and
 * {@link AI_ROUTES} is the list of doors it stands for. The navbar hides the same links by the same
 * flag, but hiding is not the rule: this is. The Matrix bot passes because its key is the ADMIN
 * machine identity.
 *
 * WHY THERE IS NOTHING TO CONFIGURE
 *
 * There is no flag, no shared secret and no login URL. On Desktop the backend authenticates the
 * local caller, so /auth/me answers 200 and every page opens exactly as before — no login, nothing
 * to set up. On a Server the backend enforces, /auth/me answers 401, and the user is sent to sign
 * in through this app's own form, which posts to the same backend. The same code produces both
 * behaviours because it asks the backend instead of being told.
 *
 * THE MATRIX BOT
 *
 * baibot calls the agents at /api/openai/<agent>/v1 as an OpenAI client, so it has no cookie; it
 * sends the DataPallas installation API key as `Authorization: Bearer <key>` (read from
 * config/_internal/api-key.txt through api_key_file in config/baibot/config.yml). On those routes the
 * bearer is passed to /auth/me as X-API-Key and the backend decides, exactly as for the playgrounds:
 * a valid key is the machine identity, anything else is anonymous and refused. Nothing is compared
 * here, so this file never needs the key. Other routes ignore the header, so a stray Authorization
 * header can never stand in for a browser session.
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

/**
 * The AI: open to the {@code useAi} capability only (see THE AI IS FOR ADMINISTRATORS). Each entry is
 * a path and everything under it; {@code /chat2} is a prefix, for every agent's chat page.
 */
const AI_ROUTES = [
  '/api/chat',
  '/api/chat2db',
  '/api/agents',
  '/api/openai',
  '/api/tools',
  '/api/workspace',
  '/api/llm',
  '/agents',
  '/workspaces',
];
const AI_PAGE_PREFIX = '/chat2';

/** Server-side only. The container's own localhost is not the host's. */
const DP_API_URL = process.env.DP_API_URL || 'http://localhost:9090/api';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (ALWAYS_PUBLIC.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  try {
    const identity = await fetch(`${DP_API_URL}/auth/me`, {
      headers: identityHeaders(request),
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

      if (mayAuthor(who)) return isAiRoute(pathname) && !mayUseAi(who) ? refuseAi(request) : NextResponse.next();

      // Signed in, cannot author — but a dashboard viewer has a home here, so they are shown it
      // instead of the door.
      if (viewsDashboards(who)) return allowViewer(request);

      return refuseRole(request);
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

/**
 * What /auth/me is asked with: the browser's cookie, plus, on the bot's /api/openai routes only, its
 * bearer token as X-API-Key (see THE MATRIX BOT above).
 */
function identityHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { Cookie: request.headers.get('cookie') ?? '' };

  if (request.nextUrl.pathname.startsWith('/api/openai/')) {
    const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim();
    if (bearer) headers['X-API-Key'] = bearer;
  }

  return headers;
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

function isAiRoute(pathname: string): boolean {
  return (
    pathname.startsWith(AI_PAGE_PREFIX) ||
    AI_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'))
  );
}

/**
 * May this caller use the AI? The backend's {@code useAi}, administrators only.
 *
 * <p>Absent answers true, as in {@link mayAuthor}: only a backend too old to send the flag, or an
 * unreadable identity, leaves it out — an anonymous identity carries every flag, set to false.
 */
function mayUseAi(identity: Identity | null): boolean {
  return identity?.capabilities?.useAi !== false;
}

/**
 * An author on one of the AI's doors. API callers get a 403 saying why; pages send them to Explore
 * Data, the part of the app that is theirs, as a viewer is sent to their dashboards.
 */
function refuseAi(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'The AI features are for administrators (ADMIN).' }, { status: 403 });
  }

  return NextResponse.redirect(new URL('/explore-data', request.url));
}

/**
 * Is this caller a dashboard viewer — someone whose whole use of this app is /view?
 *
 * <p>Fails CLOSED, unlike {@link mayAuthor}: an unreadable identity has already been let through as
 * an author above, and answering true here would take the app away from somebody instead of giving
 * it to them.
 */
function viewsDashboards(identity: Identity | null): boolean {
  return identity?.capabilities?.dashboardsOnly === true;
}

/**
 * A dashboard viewer's door: open for their own page and for the backend, shut everywhere else.
 *
 * <p>The proxy is allowed wholesale because every call through it is authorised by the backend as
 * this very person — including the new dashboard rules — so a second, weaker copy of those rules
 * here could only ever disagree with them. This app's OWN api routes are a different matter: they
 * are the authoring tool, and they are refused exactly as they are for an operator.
 *
 * <p>Any other page is a redirect rather than a refusal. A viewer typing /explore-data has not done
 * anything wrong; they have simply gone to a part of the product that is not theirs, and landing on
 * their dashboards says that better than an error page would.
 */
function allowViewer(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/view' || pathname.startsWith('/view/') || pathname.startsWith('/api/dp/'))
    return NextResponse.next();

  if (pathname.startsWith('/api/')) return refuseRole(request);

  return NextResponse.redirect(new URL('/view', request.url));
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
