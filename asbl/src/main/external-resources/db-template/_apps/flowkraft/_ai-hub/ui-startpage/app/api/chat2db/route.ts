import { NextRequest, NextResponse } from 'next/server';
import { refuseUnlessAllowed, usernameOf } from '@/lib/chat2db-access';

const CHAT2DB_URL = process.env.CHAT2DB_URL || 'http://flowkraft-ai-hub-chat2db:8888';

/**
 * POST /api/chat2db — Proxy ask requests to the Chat2DB FastAPI backend and
 * stream the reply back as Server-Sent Events.
 *
 * Athena's narrative arrives as {type:"delta"} frames as she types, then one
 * {type:"done", ...full structured result...} (sql / table / chart), or
 * {type:"error"}. The client's abort signal is forwarded upstream so pressing
 * Stop best-effort halts Athena's turn.
 *
 * Body: { question: string, send_schema?: boolean, connection_code?: string }
 *
 * `connection_code` is the database the question is about (empty: a product question). The sidecar
 * shares one connection per code among everybody, so the caller's right to the code is checked here
 * on every question, not only at connect. The caller's username goes along so the sidecar keeps
 * their last result ("now chart that") apart from everybody else's.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const connectionCode = typeof body?.connection_code === 'string' ? body.connection_code.trim() : '';
    if (connectionCode) {
      const refusal = await refuseUnlessAllowed(request, connectionCode);
      if (refusal) return refusal;
    }

    const res = await fetch(`${CHAT2DB_URL}/api/ask/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-DataPallas-User': await usernameOf(request) },
      body: JSON.stringify({
        question: body?.question,
        send_schema: body?.send_schema,
        connection_code: connectionCode || null,
      }),
      signal: request.signal,
    });

    if (!res.ok || !res.body) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      return NextResponse.json(error, { status: res.status || 502 });
    }

    // Pass the upstream SSE stream straight through to the browser.
    return new Response(res.body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (e: any) {
    // Client pressed Stop / navigated away — the abort propagated here.
    if (e?.name === 'AbortError') {
      return new Response(null, { status: 499 });
    }
    return NextResponse.json(
      { error: 'Chat2DB backend unreachable', detail: String(e?.message || e) },
      { status: 502 }
    );
  }
}
