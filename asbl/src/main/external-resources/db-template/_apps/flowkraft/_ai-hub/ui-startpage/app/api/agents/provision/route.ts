import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/db';
import { getActiveProviderConfig, type LLMFullConfig } from '@/lib/llm-providers';
import { checkProviderReady } from '@/lib/letta-ready';
import provisionAll, { provisionAllAgents } from '../../../../src/services/letta/agentProvisioner';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Check that an LLM provider is configured (reads from SQLite, not env vars)
    const raw = getConfig('llm.provider');
    if (!raw) {
      return NextResponse.json(
        {
          success: false,
          error: 'No LLM provider configured',
          message: 'Go to Settings → API Provider to configure your LLM provider.',
        },
        { status: 400 }
      );
    }
    const fullConfig = JSON.parse(raw) as LLMFullConfig;
    const llmConfig = getActiveProviderConfig(fullConfig);
    if (llmConfig.providerId !== 'ollama' && !llmConfig.apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'No API key configured',
          message: 'Go to Settings → API Provider to enter your API key.',
        },
        { status: 400 }
      );
    }

    // Refuse to provision against a down or booting Letta (e.g. mid key-change restart).
    // Provisioning half-succeeds against a Letta that dies or comes up mid-run — with
    // force=true it can even delete agents and fail to recreate them — so a clean 503
    // beats a partial run. The UI renders this message in the log panel and a toast.
    const readiness = await checkProviderReady();
    if (!readiness.ready) {
      return NextResponse.json(
        {
          success: false,
          error: 'letta-not-ready',
          message:
            'Letta is starting or restarting (e.g. applying a new API key) — wait about 60-90 seconds and try again.' +
            (readiness.reason ? ` (${readiness.reason})` : ''),
        },
        { status: 503 }
      );
    }

    // Get parameters from request body
    const body = await request.json().catch(() => ({}));
    const force = body.force === true;
    const giveDbQueryToolToAthena = body.giveDbQueryToolToAthena === true;
    const skipMatrix = body.skipMatrix === true;
    const lettaOnly = body.lettaOnly === true;
    const stream = body.stream === true;

    // ── Streaming mode: SSE with real-time console capture ──────────
    if (stream) {
      const encoder = new TextEncoder();

      const readable = new ReadableStream({
        async start(controller) {
          const send = (type: string, message: string) => {
            try {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type, message, ts: new Date().toISOString() })}\n\n`
                )
              );
            } catch {
              /* stream already closed */
            }
          };

          // Capture console output and forward to SSE stream
          const origLog = console.log;
          const origError = console.error;
          const origWarn = console.warn;

          const fmt = (...args: any[]): string =>
            args
              .map((a) => {
                if (typeof a === 'string') return a;
                try {
                  return JSON.stringify(a);
                } catch {
                  return String(a);
                }
              })
              .join(' ');

          console.log = (...args: any[]) => {
            origLog(...args);
            send('log', fmt(...args));
          };
          console.error = (...args: any[]) => {
            origError(...args);
            send('error', fmt(...args));
          };
          console.warn = (...args: any[]) => {
            origWarn(...args);
            send('warn', fmt(...args));
          };

          try {
            send('log', `Provisioning started${force ? ' (force)' : ''}${giveDbQueryToolToAthena ? ' (db_query→Athena)' : ''}...`);

            let result: any;

            if (lettaOnly) {
              const results = await provisionAllAgents({ force, giveDbQueryToolToAthena });
              const errorCount = results.filter((r: any) => r.status === 'error').length;
              result = {
                success: errorCount === 0,
                message:
                  errorCount === 0
                    ? 'Letta agents provisioned successfully'
                    : `Provisioned with ${errorCount} error(s)`,
                agents: results,
              };
            } else {
              const fullResult = await provisionAll({ force, skipMatrix, giveDbQueryToolToAthena });
              result = {
                success: fullResult.success,
                message: fullResult.success
                  ? 'FlowKraft AI Hub provisioned successfully (Letta + Matrix)'
                  : `Provisioning completed with ${fullResult.errors.length} error(s)`,
                letta: fullResult.letta,
                matrix: fullResult.matrix
                  ? {
                      success: fullResult.matrix.success,
                      skipped: fullResult.matrix.skipped,
                      roomCount: fullResult.matrix.rooms.length,
                    }
                  : null,
                errors: fullResult.errors,
              };
            }

            send('result', JSON.stringify(result));
            send('done', result.success ? 'success' : 'error');
          } catch (err: any) {
            send('error', `Fatal error: ${err.message || 'Unknown error'}`);
            send('done', 'error');
          } finally {
            console.log = origLog;
            console.error = origError;
            console.warn = origWarn;
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // ── Non-streaming mode (backward compatibility) ─────────────────
    console.log(`Provisioning agents${skipMatrix ? ' (skip-matrix)' : ''}${force ? ' (force)' : ''}${giveDbQueryToolToAthena ? ' (db_query→Athena)' : ''}`);

    if (lettaOnly) {
      // Letta-only provisioning
      const results = await provisionAllAgents({ force, giveDbQueryToolToAthena });
      const errorCount = results.filter(r => r.status === 'error').length;

      return NextResponse.json({
        success: errorCount === 0,
        message: errorCount === 0
          ? 'Letta agents provisioned successfully'
          : `Provisioned with ${errorCount} error(s)`,
        agents: results,
      });
    }

    // Full provisioning: Letta + Matrix
    const result = await provisionAll({
      force,
      skipMatrix,
      giveDbQueryToolToAthena,
    });

    return NextResponse.json({
      success: result.success,
      message: result.success
        ? 'FlowKraft AI Hub provisioned successfully (Letta + Matrix)'
        : `Provisioning completed with ${result.errors.length} error(s)`,
      letta: result.letta,
      matrix: result.matrix ? {
        success: result.matrix.success,
        skipped: result.matrix.skipped,
        roomCount: result.matrix.rooms.length,
      } : null,
      errors: result.errors,
    });
  } catch (error: any) {
    console.error('Error provisioning:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to provision',
        message: error.message || 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
