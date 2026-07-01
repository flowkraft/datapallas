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
async function resolveAgentId(agentKeyOrId: string | undefined): Promise<string | undefined> {
  if (!agentKeyOrId) return undefined;
  
  // If it's already an agent ID, return it
  if (agentKeyOrId.startsWith('agent-')) return agentKeyOrId;

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
      return found.id;
    }
    
    console.warn(`[OpenAI Adapter] Agent key "${agentKeyOrId}" not found in ${agents.length} agents`);
  } catch (e) {
    console.error('[OpenAI Adapter] resolveAgentId lookup error:', e);
  }
  
  return undefined;
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

  const agentId = await resolveAgentId(requestedAgent);
  
  if (!agentId) {
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
        { error: { message: String(e?.message || e || 'generateText failed') } },
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
      try {
        const s = streamText({
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
        uiStream = s.toUIMessageStream();
      } catch (e: any) {
        console.error('[OpenAI Adapter] streamText error:', e);
        send(JSON.stringify({ error: String(e?.message || e) }));
        controller.close();
        return;
      }

      const reader = uiStream.getReader();
      let assistantText = '';

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
              send(JSON.stringify({
                id: generateCompletionId(),
                object: 'chat.completion.chunk',
                choices: [{ delta: { content: delta }, index: 0, finish_reason: null }]
              }));
            } else if (t === 'text-start') {
              send(JSON.stringify({
                id: generateCompletionId(),
                object: 'chat.completion.chunk',
                choices: [{ delta: { role: 'assistant' }, index: 0, finish_reason: null }]
              }));
            } else if (t === 'finish') {
              send('[DONE]');
            }
            // Ignore 'text-end' and other types
          } else {
            // Pass through other formats
            send(JSON.stringify(value));
          }
        }
        
        console.log('[OpenAI Adapter] Streaming complete, total text length:', assistantText.length);
        
      } catch (e: any) {
        console.error('[OpenAI Adapter] Stream pump error:', e);
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
  const agentId = await resolveAgentId(agentIdParam);
  
  return NextResponse.json({
    status: 'ok',
    endpoint: `/api/openai/${agentIdParam}/v1/chat/completions`,
    agentResolved: agentId ? true : false,
    agentId: agentId || null
  });
}
