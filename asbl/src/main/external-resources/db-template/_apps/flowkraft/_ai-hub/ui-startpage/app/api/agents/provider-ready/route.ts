import { NextResponse } from 'next/server';
import { checkProviderReady } from '@/lib/letta-ready';

export const dynamic = 'force-dynamic';

/**
 * Thin wrapper over lib/letta-ready.ts (shared with the /api/agents/provision guard).
 * Reports whether the running Letta can serve the active provider's model — see
 * checkProviderReady() for the full contract. Response shape is stable; the /agents
 * save flow polls this to track a Letta restart.
 */
export async function GET() {
  return NextResponse.json(await checkProviderReady());
}
