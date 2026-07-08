/**
 * OpenAI-Compatible Chat Completions Adapter for Letta
 * 
 * This route exposes Letta agents as OpenAI-compatible /v1/chat/completions endpoints.
 * Baibot/Kraftbot (Matrix chatbot) connects here to talk to Letta agents.
 * 
 * Route: /api/openai/[agentId]/v1/chat/completions
 * 
 * Uses Vercel AI SDK with Letta provider for proper streaming support.
 * 
 * Known working versions (2026-02-03):
 * - @letta-ai/letta-client: 1.7.7
 * - @letta-ai/vercel-ai-sdk-provider: 1.4.0
 * - ai: 6.0.68
 * - @ai-sdk/react: 3.0.70
 */

import { NextRequest, NextResponse } from 'next/server';
import { streamText, generateText, convertToModelMessages } from 'ai';
import type { TextPart } from 'ai';
import { createLetta } from '@letta-ai/vercel-ai-sdk-provider';
import { getLettaClient } from '../../../../../../../src/services/letta/client';

interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system';
  content?: string;
}

interface OpenAIChatRequest {
  model?: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  agentId?: string;
}

/**
 * Resolve an agent key or ID to the actual Letta agent ID.
 */
async function resolveAgentId(
  agentKeyOrId: string | undefined
): Promise<{ id?: string; count: number; reachable: boolean }> {
  // count: number of agents Letta reported (-1 when we didn't/couldn't list); reachable: was
  // Letta itself queryable. Together they let the caller tell "0 agents provisioned" (an
  // actionable "go provision" case) apart from "agent missing among N" or "Letta unreachable".
  if (!agentKeyOrId) return { id: undefined, count: -1, reachable: true };

  // If it's already an agent ID, return it
  if (agentKeyOrId.startsWith('agent-')) return { id: agentKeyOrId, count: -1, reachable: true };

  // Otherwise treat it as a configured key and look up via metadata.agentKey
  try {
    const client = getLettaClient();
    const resp: any = await client.agents.list({ limit: 100 });
    const agents = Array.isArray(resp) ? resp : (resp?.items ?? resp?.data ?? resp?.agents ?? []);

    const found = agents.find((a: any) => {
      const agentKey = a?.metadata?.agentKey;
      return String(agentKey).toLowerCase() === String(agentKeyOrId).toLowerCase();
    });

    if (found) {
      console.log(`[OpenAI Adapter] Resolved agent key "${agentKeyOrId}" to ID "${found.id}"`);
      return { id: found.id, count: agents.length, reachable: true };
    }

    console.warn(`[OpenAI Adapter] Agent key "${agentKeyOrId}" not found in ${agents.length} agents`);
    return { id: undefined, count: agents.length, reachable: true };
  } catch (e) {
    console.error('[OpenAI Adapter] resolveAgentId lookup error:', e);
    return { id: undefined, count: -1, reachable: false };
  }
}

/**
 * Map OpenAI messages to AI SDK format
 */
function mapOpenAIToSdkMessages(openaiMessages: OpenAIMessage[]) {
  return openaiMessages.map((m) => ({
    role: m.role as 'user' | 'assistant' | 'system',
    parts: [{ type: 'text', text: m.content ?? '' } as TextPart]
  }));
}

/**
 * Normalize various usage formats to OpenAI-compatible schema
 */
function normalizeUsage(usage: any): { prompt_tokens: number; completion_tokens: number; total_tokens: number } {
  const safeNum = (v: any): number => {
    const n = Number(v);
    return isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  };

  if (!usage || typeof usage !== 'object') {
    return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  }

  // Common OpenAI names
  if ('prompt_tokens' in usage || 'completion_tokens' in usage || 'total_tokens' in usage) {
    return {
      prompt_tokens: safeNum(usage.prompt_tokens ?? usage.promptTokens ?? usage.inputTokens ?? usage.input_tokens),
      completion_tokens: safeNum(usage.completion_tokens ?? usage.completionTokens ?? usage.outputTokens ?? usage.output_tokens),
      total_tokens: safeNum(usage.total_tokens ?? usage.totalTokens ?? usage.total)
    };
  }

  // Letta / alternative names (camelCase)
  if ('inputTokens' in usage || 'outputTokens' in usage || 'totalTokens' in usage || 'input_tokens' in usage) {
    return {
      prompt_tokens: safeNum(usage.inputTokens ?? usage.input_tokens ?? usage.input),
      completion_tokens: safeNum(usage.outputTokens ?? usage.output_tokens ?? usage.output),
      total_tokens: safeNum(usage.totalTokens ?? usage.total_tokens ?? usage.total)
    };
  }

  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
}

/**
 * Generate a random chat completion ID
 */
function generateCompletionId(): string {
  return `chatcmpl-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Extract the real upstream/provider error text — PROVIDER-AGNOSTIC (no Z.ai/OpenAI/etc.
 * assumptions). Letta wraps any provider failure in an `error_message` stream frame whose
 * `detail` carries the raw text (e.g. "…Error code: 429 - {…}"); the AI SDK's validation
 * error carries that frame under .value / .cause.value, and AI SDK 'error' parts under
 * .error / .errorText. We dig those out; else we scan the serialized error for an HTTP
 * status / rate-limit signal; else we fall back to the message. Downstream just receives
 * the raw text and decides how to present it.
 */
function extractProviderError(e: any): string {
  const objs = [e?.value, e?.cause?.value, e?.error, e];
  for (const o of objs) {
    if (o && typeof o === 'object') {
      const d = (o as any).detail ?? (o as any).message;
      // Skip the SDK's schema-validation message (it hides the real cause).
      if (typeof d === 'string' && d && !d.startsWith('response ->') && !d.includes('Expected "')) {
        return d.slice(0, 2000);
      }
    }
  }
  try {
    const blob = JSON.stringify(e, Object.getOwnPropertyNames(e || {}));
    const code = blob.match(/Error code: \d{3}[^"\\]*/);
    if (code) return code[0];
    if (/(^|[^0-9])(429|5\d\d)([^0-9]|$)|rate.?limit|too many requests|overloaded/i.test(blob)) {
      const m = blob.match(/\b(429|5\d\d)\b/);
      return `Upstream provider error${m ? ` (HTTP ${m[1]})` : ''} — see server logs for detail.`;
    }
  } catch { /* ignore */ }
  return String(e?.errorText ?? e?.message ?? e ?? 'stream error').slice(0, 2000);
}

/**
 * GENERIC leaked-tool-call guard — applies to EVERY agent through this adapter (nothing is
 * hardcoded to a specific agent). Some models (notably GLM) intermittently emit a tool call as XML
 * TEXT instead of a real structured tool call — e.g. "<tool_calls><send_message>…" or
 * "<archival_memory_search>…". Letta can't parse that, so it would stream to the user as junk. We
 * detect it by the reply STARTING with an XML tag whose name is a known Letta tool, then auto-retry.
 */
// Only structured tool identifiers: the standard XML wrappers (tool_calls / function_calls) and
// snake_case Letta tool names. Deliberately NO bare common words — no 'memory', 'assistant',
// 'invoke' — because those could plausibly OPEN a legitimate answer. Every entry here is either a
// wrapper or contains '_', so it can never be the first token of natural prose. (Detection also
// requires the reply to START with '<' + this exact tag, so the word appearing mid-sentence is
// never enough to trigger.)
const LEAK_TOOL_TAGS = new Set<string>([
  'tool_calls', 'tool_call', 'function_calls',
  'send_message',
  'archival_memory_search', 'archival_memory_insert', 'conversation_search', 'search_memory',
  'memory_insert', 'memory_replace', 'memory_rethink', 'memory_finish_edits', 'memory_apply_patch',
  'core_memory_append', 'core_memory_replace', 'rethink_user_memory', 'store_memories',
  'better_web_search', 'better_fetch_webpage', 'web_search', 'fetch_webpage',
  'execute_shell_command', 'run_code', 'run_code_with_tools', 'db_query',
  'grep_files', 'open_files', 'semantic_search_files',
]);

function looksLikeLeakedToolCall(text: string | undefined): boolean {
  const t = (text || '').trimStart();
  if (!t.startsWith('<')) return false;              // real replies open with prose, never '<'
  const m = t.match(/^<\s*\/?\s*([A-Za-z_][\w-]*)/);  // first XML tag name
  return !!m && LEAK_TOOL_TAGS.has(m[1]);            // …and it's a known tool → it's a leak
}

/**
 * Re-run the agent's turn after it leaked an XML tool call, nudging it (agent-neutrally) to use the
 * JSON tool protocol and to EXECUTE tools itself. Returns the first clean reply, or '' if it keeps
 * leaking after maxRetries (the caller then shows a graceful fallback). Non-streaming — retries are
 * the exception, so a buffered generate is fine.
 */
async function regenerateCleanReply(
  lettaModel: any,
  agentId: string,
  modelParams: Record<string, unknown>,
  abortSignal: AbortSignal,
  maxRetries = 2,
): Promise<string> {
  const correction =
    'SYSTEM CORRECTION: your previous reply output a tool call as XML text (for example <tool_calls>, ' +
    '<send_message>, or <archival_memory_search>). That is INVALID — it was NOT executed, and the user ' +
    'must never see tool-call syntax. Re-answer my previous message now: use the JSON tool-calling ' +
    'protocol and EXECUTE any tools yourself; never write tool-call tags as message content.';
  for (let i = 0; i < maxRetries; i++) {
    try {
      const r = await generateText({
        model: lettaModel,
        providerOptions: { letta: { agent: { id: agentId }, timeoutInSeconds: 600, ...modelParams } },
        messages: convertToModelMessages([{ role: 'user', parts: [{ type: 'text', text: correction }] }] as any),
        abortSignal,
      });
      const text = (r?.text ?? '').toString();
      if (text.trim() && !looksLikeLeakedToolCall(text)) return text;
    } catch (e) {
      console.error('[OpenAI Adapter] corrective retry error:', e);
      break;
    }
  }
  return '';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId: agentIdParam } = await params;
  
  let body: OpenAIChatRequest;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json(
      { error: { message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  console.log('[OpenAI Adapter] Request received:', {
    agentIdParam,
    model: body.model,
    messageCount: body.messages?.length,
    stream: body.stream
  });

  // Resolve the agent ID from various sources
  let requestedAgent: string | undefined = agentIdParam;
  
  // Also check body.agentId or model field for "letta:agentKey" format
  if (!requestedAgent) {
    requestedAgent = body.agentId || undefined;
  }
  if (!requestedAgent && typeof body.model === 'string') {
    const m = body.model;
    if (m.startsWith('agent-')) {
      requestedAgent = m;
    } else if (m.startsWith('letta:')) {
      requestedAgent = m.split(':', 2)[1];
    }
  }

  const { id: agentId, count: agentCount, reachable } = await resolveAgentId(requestedAgent);

  if (!agentId) {
    // 0 agents in a reachable Letta = the crew was never provisioned. Return a DISTINCT,
    // machine-detectable code so Chat2DB renders a "Provision Agents" call-to-action instead
    // of a generic 400. (Agent-missing-among-N or Letta-unreachable stay a plain error.)
    if (reachable && agentCount === 0) {
      console.error('[OpenAI Adapter] No agents provisioned (Letta reachable, 0 agents)');
      return NextResponse.json(
        { error: {
            code: 'AGENTS_NOT_PROVISIONED',
            message: 'No AI agents are provisioned yet. Provision the DataPallas AI Crew to start chatting with Athena.',
          } },
        { status: 400 }
      );
    }
    console.error('[OpenAI Adapter] Agent not found:', requestedAgent);
    return NextResponse.json(
      { error: { message: `Agent not found or agentId not provided: ${requestedAgent}` } },
      { status: 400 }
    );
  }

  // Create Letta provider instance
  // Use LETTA_BASE_URL from environment (points to Letta container)
  const lettaModel = createLetta({ baseUrl: process.env.LETTA_BASE_URL })();
  console.log('[OpenAI Adapter] Created lettaModel with baseUrl:', process.env.LETTA_BASE_URL);

  const openaiMessages = Array.isArray(body.messages) ? body.messages : [];
  const sdkMessages = mapOpenAIToSdkMessages(openaiMessages);

  const isStreaming = Boolean(body.stream);

  // Map OpenAI params to provider options
  const modelParams: Record<string, unknown> = {};
  if (body.temperature != null) modelParams.temperature = body.temperature;
  if (body.max_tokens != null) modelParams.max_tokens = body.max_tokens;
  if (body.top_p != null) modelParams.top_p = body.top_p;
  if (body.presence_penalty != null) modelParams.presence_penalty = body.presence_penalty;
  if (body.frequency_penalty != null) modelParams.frequency_penalty = body.frequency_penalty;

  if (!isStreaming) {
    // Non-streaming response
    try {
      const result = await generateText({
        model: lettaModel,
        providerOptions: { 
          letta: { 
            agent: { id: agentId }, 
            timeoutInSeconds: 600,
            ...modelParams 
          } 
        },
        messages: convertToModelMessages(sdkMessages as any)
      });

      const text = result?.text ?? (result?.steps?.[0]?.response?.messages?.[0]?.content?.[0] as any)?.text ?? '';
      const now = Math.floor(Date.now() / 1000);
      const normalizedUsage = normalizeUsage(result?.usage);

      console.debug('[OpenAI Adapter] Normalized usage:', normalizedUsage);

      const openaiResponse = {
        id: generateCompletionId(),
        object: 'chat.completion',
        created: now,
        model: `letta:${agentId}`,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: text },
            finish_reason: 'stop'
          }
        ],
        usage: normalizedUsage
      };

      console.log('[OpenAI Adapter] Non-streaming response sent, text length:', text.length);
      return NextResponse.json(openaiResponse);

    } catch (e: any) {
      console.error('[OpenAI Adapter] generateText error:', e);
      return NextResponse.json(
        { error: { message: extractProviderError(e) } },
        { status: 500 }
      );
    }
  }

  // Streaming response (SSE)
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      // Send initial connection comment
      controller.enqueue(encoder.encode(': connected\n\n'));

      let uiStream: ReadableStream<any>;
      let sResult: any = null;
      try {
        sResult = streamText({
          model: lettaModel,
          providerOptions: {
            letta: {
              agent: { id: agentId },
              ...modelParams
            }
          },
          messages: convertToModelMessages(sdkMessages as any),
          // Forward the caller's abort (Chat2DB Stop button → disconnect) so the
          // Letta turn is best-effort halted instead of running to completion.
          abortSignal: request.signal
        });
        uiStream = sResult.toUIMessageStream();
      } catch (e: any) {
        console.error('[OpenAI Adapter] streamText error:', e);
        send(JSON.stringify({ error: String(e?.message || e) }));
        controller.close();
        return;
      }

      const reader = uiStream.getReader();
      let assistantText = '';

      // Leaked-tool-call guard (generic, all agents): hold the START of the reply until we can
      // classify it — clean → flush and stream live; a leaked XML tool call → suppress it and
      // auto-retry below, so the user only ever sees a clean answer (just a slightly longer wait
      // on the rare leak turns).
      const sendDelta = (content: string) => send(JSON.stringify({
        id: generateCompletionId(),
        object: 'chat.completion.chunk',
        choices: [{ delta: { content }, index: 0, finish_reason: null }],
      }));
      let held = '';
      let classified = false;   // decided clean-vs-leak for the opening of the reply
      let suppress = false;     // withholding a suspected leak (retry after the loop)
      const CLASSIFY_MIN = 24;  // chars to accumulate before classifying the opening

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          if (typeof value === 'object' && value !== null && 'type' in value) {
            const t = (value as any).type;
            
            if (t === 'text-delta') {
              const delta = String((value as any).delta || '');
              assistantText += delta;
              if (classified && !suppress) {
                sendDelta(delta);                 // already known clean → stream live
              } else if (!classified) {
                held += delta;                    // still deciding — hold the opening
                if (held.trim().length >= CLASSIFY_MIN || held.includes('>')) {
                  classified = true;
                  if (looksLikeLeakedToolCall(held)) suppress = true;   // leak → keep withholding
                  else { if (held) sendDelta(held); held = ''; }         // clean → flush + go live
                }
              }
              // classified && suppress → keep withholding (retry handled after the loop)
            } else if (t === 'text-start') {
              send(JSON.stringify({
                id: generateCompletionId(),
                object: 'chat.completion.chunk',
                choices: [{ delta: { role: 'assistant' }, index: 0, finish_reason: null }]
              }));
            } else if (t === 'error') {
              // AI SDK surfaced an upstream error as a stream part — forward it unwrapped.
              send(JSON.stringify({ error: { message: extractProviderError(value), type: 'upstream_error' } }));
            }
            // 'finish'/'text-end'/other: ignored. We send [DONE] ONCE at the very end
            // (below) — AFTER the empty-stream fallback — so a reply delivered via the
            // send_message tool-call (0 text-delta) still gets flushed before [DONE].
          } else {
            // Pass through other formats
            send(JSON.stringify(value));
          }
        }

        // Short reply that never reached the classify threshold — classify it now.
        if (!classified) {
          classified = true;
          if (looksLikeLeakedToolCall(held || assistantText)) suppress = true;
          else if (held) { sendDelta(held); held = ''; }
        }

        // Leaked XML tool call (ANY agent) → it was suppressed above; auto-retry with a corrective
        // turn so the user only ever sees a clean answer.
        if (suppress || looksLikeLeakedToolCall(assistantText)) {
          console.warn('[OpenAI Adapter] Leaked XML tool-call suppressed; auto-retrying. Raw start:', assistantText.slice(0, 120));
          const clean = await regenerateCleanReply(lettaModel, agentId, modelParams, request.signal);
          sendDelta(clean.trim() || 'Sorry — I got a bit tangled composing that. Could you **rephrase** your question and ask again? A slightly different wording almost always gets me there.');
          if (clean.trim()) console.log('[OpenAI Adapter] Recovered via corrective retry, length:', clean.length);
          else console.warn('[OpenAI Adapter] Corrective retry still leaked/empty; sent graceful fallback');
        }
        // Fallback: some Letta turns deliver the reply via the send_message tool (a
        // tool-call), not as text-delta parts, so the stream yields 0 text and the UI
        // goes blank. Recover the assistant text from the resolved result and flush it
        // so the reply ALWAYS reaches the UI.
        else if (assistantText.trim() === '' && sResult) {
          let recovered = '';
          try { recovered = (await sResult.text) || ''; } catch {}
          if (!recovered.trim()) {
            try {
              const resp = await sResult.response;
              for (const m of (resp?.messages || [])) {
                const parts = Array.isArray(m?.content) ? m.content : [];
                for (const p of parts) {
                  if (p?.type === 'text' && p.text) recovered += p.text;
                  else if ((p?.type === 'tool-call' || p?.type === 'dynamic-tool') &&
                           (p?.toolName === 'send_message' || p?.toolName === 'assistant')) {
                    const a = p?.input ?? p?.args;
                    const msg = typeof a === 'string' ? a : (a?.message ?? a?.content);
                    if (msg) recovered += String(msg);
                  }
                }
              }
            } catch (fe) { console.error('[OpenAI Adapter] fallback recover error:', fe); }
          }
          if (recovered.trim()) {
            send(JSON.stringify({
              id: generateCompletionId(),
              object: 'chat.completion.chunk',
              choices: [{ delta: { content: recovered }, index: 0, finish_reason: null }]
            }));
            console.log('[OpenAI Adapter] Recovered reply via fallback, length:', recovered.length);
          } else {
            console.warn('[OpenAI Adapter] 0 text and nothing recoverable from result');
          }
        }

        send('[DONE]');
        console.log('[OpenAI Adapter] Streaming complete, total text length:', assistantText.length);
        
      } catch (e: any) {
        console.error('[OpenAI Adapter] Stream pump error:', e);
        // Never go silent: forward the upstream error (unwrapped) so Chat2DB / the UI
        // can display it and detect status codes (e.g. 429) for a friendly message.
        send(JSON.stringify({ error: { message: extractProviderError(e), type: 'upstream_error' } }));
        send('[DONE]');
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

// Health check endpoint
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId: agentIdParam } = await params;
  const { id: agentId } = await resolveAgentId(agentIdParam);

  return NextResponse.json({
    status: 'ok',
    endpoint: `/api/openai/${agentIdParam}/v1/chat/completions`,
    agentResolved: agentId ? true : false,
    agentId: agentId || null
  });
}
