import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy to the DataPallas Java backend.
 *
 * WHY THIS EXISTS
 *
 * The AI Hub used to call `http://localhost:9090/api/...` straight from the browser. That was
 * cross-origin, carried no credentials, and is the reason the Java side had to allow permissive CORS.
 * Once the backend requires authentication, browser-direct calls break — and the obvious "fix" of
 * shipping a token to the browser would publish that token to every script on the page.
 *
 * So all backend traffic goes through here instead:
 *
 *   browser → /api/dp/**  (same origin, no CORS)  →  this handler  →  the Java backend
 *
 * WHY `/api/dp` AND NOT PLAIN `/api`
 *
 * `/api/*` is already this app's own route namespace — `app/api/agents`, `app/api/chat`,
 * `app/api/config`, `app/api/explorations` and more. Two of those collide by name with backend routes
 * (`/api/explorations`, `/api/config`), and Next.js resolves a specific segment before a catch-all, so
 * a proxy mounted at `/api/[...path]` would silently keep serving this app's own handler for those
 * paths and never reach the backend. A distinct prefix removes the ambiguity.
 *
 * WHY THIS PROXY HOLDS NO CREDENTIAL OF ITS OWN
 *
 * It forwards the caller's own DataPallas session cookie. Cookies are scoped by host and not by port,
 * so the cookie the backend set on :9090 is sent to this app on :8440 as well, and passing it
 * straight through means every request reaches the backend as the actual user, with that user's
 * roles.
 *
 * An API key here would have been strictly worse: it authenticates as an administrator, so this
 * proxy would have become a way for anyone who can reach :8440 to act with more privilege than they
 * hold — precisely the escalation an admin-privileged proxy invites. Holding nothing means there is
 * nothing to leak, nothing to misconfigure, and no privilege to escalate to.
 *
 * DESKTOP BEHAVIOUR
 *
 * Unchanged. The backend authenticates the local caller, so requests succeed with no cookie at all
 * and there is nothing to configure.
 */

/**
 * Where the backend lives, as seen FROM THIS CONTAINER. Needed because a container's own
 * `localhost` is the container, not the host — the browser could use `localhost:9090` only because
 * the browser runs on the host. Compose sets it to `host.docker.internal`.
 *
 * Server-side only: the old `NEXT_PUBLIC_RB_API_URL` is intentionally NOT consulted, because a
 * `NEXT_PUBLIC_` value is inlined into the browser bundle.
 */
const DP_TARGET = process.env.DP_API_URL || 'http://localhost:9090/api';

/** Hop-by-hop and host-specific headers must not be forwarded verbatim. */
const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-length',
]);

const STRIPPED_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
  'content-length',
]);

/** One cookie out of a Cookie header, or null. Values are URL-encoded by the server that set them. */
function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  const search = request.nextUrl.search;
  const target = `${DP_TARGET}/${path.join('/')}${search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  // Echo the CSRF token the backend issued.
  //
  // Spring puts it in the XSRF-TOKEN cookie and expects it back in this header on anything that
  // changes state; a cookie alone is not enough, because being a cookie is precisely what makes it
  // forgeable by another page. The session cookie arrives here for free (cookies ignore the port),
  // so the token is sitting in it — echoing it server-side means saving a canvas or publishing a
  // dashboard works without the browser code knowing that CSRF exists at all.
  const csrfToken = readCookie(request.headers.get('cookie'), 'XSRF-TOKEN');
  if (csrfToken) {
    headers.set('X-XSRF-TOKEN', csrfToken);
  }

  const hasBody = !['GET', 'HEAD'].includes(request.method);

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      // Never let the proxy follow a redirect on the caller's behalf — pass it back instead.
      redirect: 'manual',
    });

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase()) && key.toLowerCase() !== 'set-cookie') {
        responseHeaders.set(key, value);
      }
    });

    // Set-Cookie needs appending, one header per cookie: forEach() above would fold several into one
    // comma-joined string, which no browser will parse back into separate cookies. Relaying them is
    // what lets someone sign in from this app — the session the backend issues is attributed to the
    // host, so it works for this app and for DataPallas itself without either one storing anything.
    for (const cookie of upstream.headers.getSetCookie()) {
      responseHeaders.append('set-cookie', cookie);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    // The backend being down is the common case here (the user has not started DataPallas yet), and
    // it must read as "upstream unavailable", not as a bug in this app.
    return NextResponse.json(
      {
        error: 'DataPallas backend is not reachable',
        target: DP_TARGET,
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}
