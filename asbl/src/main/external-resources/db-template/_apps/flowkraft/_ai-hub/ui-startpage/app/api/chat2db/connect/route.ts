import { NextRequest, NextResponse } from 'next/server';
import { refuseUnlessAllowed } from '@/lib/chat2db-access';

const CHAT2DB_URL = process.env.CHAT2DB_URL || 'http://flowkraft-ai-hub-chat2db:8888';

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
