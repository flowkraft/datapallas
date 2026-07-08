import { getConfig } from '@/lib/db';
import { getActiveProviderConfig, type LLMFullConfig } from '@/lib/llm-providers';

// Letta model-handle prefixes — MUST mirror app/api/llm/update-env/route.ts (source of
// truth). Letta registers each provider's models as "{prefix}/{model}"; the zai Coding
// Plan routes through OPENAI_API_BASE, which Letta 0.16.x exposes as "openai-proxy".
const LETTA_PREFIX: Record<string, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google_ai',
  ollama: 'ollama',
  zai: 'openai-proxy',
  'zai-credits': 'zai',
  openrouter: 'openrouter',
  other: 'openai-proxy',
};

function expectedHandle(providerId: string, model: string): string {
  // Prefer the exact handle update-env synced into the process env (it runs immediately
  // before this is polled during provisioning); else compute it from the saved config.
  const synced = process.env.LLM_MODEL_ID;
  if (synced && synced.endsWith(`/${model}`)) return synced;
  const prefix = LETTA_PREFIX[providerId] ?? 'openai';
  return model.startsWith(`${prefix}/`) ? model : `${prefix}/${model}`;
}

export interface ProviderReadiness {
  ready: boolean;
  llmReady?: boolean;
  embeddingReady?: boolean;
  matrixReady?: boolean;
  handle?: string;
  model?: string;
  providerId?: string;
  reason?: string;
}

/**
 * Best-effort check that the Matrix bot (kraftbot / baibot) is up — so the /agents key-restart
 * flow and the /api/agents/provision guard don't unlock while baibot is still booting after a
 * key-change restart. baibot comes up AFTER Letta (compose depends_on) and needs a moment to sync;
 * without this, the first Matrix room loses that race (the Athena "did not join in 24s" failure).
 *
 * Signal: kraftbot's Matrix PRESENCE. baibot syncs with online presence (verified live), so
 * online / currently_active ⇔ baibot is up and healthy. Presence is real-time — unlike last_seen,
 * which Synapse throttles to 120s and which persists across restarts, so it can't tell a stale
 * pre-restart session from a live one.
 *
 * FAIL-OPEN: any error, or kraftbot not registered yet (first-ever provision), returns true — this
 * can never permanently block provisioning; it only reports not-ready when it positively sees the
 * bot is not online.
 */
async function checkMatrixBotReady(): Promise<boolean> {
  const base = process.env.MATRIX_HOMESERVER_URL || 'http://flowkraft-ai-hub-matrix-synapse:8008';
  const server = process.env.MATRIX_SERVER_NAME || 'localhost';
  const kraftbot = process.env.KRAFTBOT_USERNAME || 'kraftbot';
  const kraftbotPass = process.env.KRAFTBOT_PASSWORD || 'kraftbot';
  try {
    // Log in as kraftbot with a fixed device_id (reuses one probe session — no device spam).
    // This login does NOT sync, so it can't itself set presence "online"; only baibot's sync does.
    const loginRes = await fetch(`${base}/_matrix/client/v3/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'm.login.password',
        identifier: { type: 'm.id.user', user: kraftbot },
        password: kraftbotPass,
        device_id: 'rb-readiness-probe',
      }),
      cache: 'no-store',
    });
    if (!loginRes.ok) return true; // kraftbot not registered yet / Synapse hiccup → don't block
    const token = (await loginRes.json())?.access_token;
    if (!token) return true;

    const userId = `@${kraftbot}:${server}`;
    const presRes = await fetch(
      `${base}/_matrix/client/v3/presence/${encodeURIComponent(userId)}/status`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
    if (!presRes.ok) return true; // inconclusive → don't block
    const pres = await presRes.json();
    return pres?.currently_active === true || pres?.presence === 'online';
  } catch {
    return true; // never permanently block provisioning on an error
  }
}

/**
 * Reports whether the running Letta can serve the active provider's model — i.e. whether
 * its model list already contains the "{prefix}/{model}" handle. Letta reads its provider
 * API keys ONLY at container boot, so right after a fresh key is saved the handle is
 * absent until letta is bounced. Polled by the /agents save flow to track a restart, and
 * checked by /api/agents/provision to refuse provisioning against a down/booting Letta.
 */
export async function checkProviderReady(): Promise<ProviderReadiness> {
  try {
    const raw = getConfig('llm.provider');
    if (!raw) return { ready: false, reason: 'no-provider-configured' };

    const fullConfig = JSON.parse(raw) as LLMFullConfig;
    const active = getActiveProviderConfig(fullConfig);
    if (!active.model) return { ready: false, reason: 'no-model-configured' };

    const handle = expectedHandle(active.providerId, active.model);
    const base = process.env.LETTA_BASE_URL || 'http://localhost:8283';

    const res = await fetch(`${base}/v1/models/`, { cache: 'no-store' });
    if (!res.ok) return { ready: false, handle, reason: `letta-http-${res.status}` };

    const data = await res.json();
    const models: any[] = Array.isArray(data) ? data : (data?.data ?? []);
    const llmReady = models.some((m) => (m?.handle ?? m?.id) === handle);

    // Embedding readiness — every agent embeds its memory via ollama/mxbai-embed-large. Verify
    // Ollama has actually PULLED it; provisioning before the ~670MB pull completes fails hard with
    // "Embedding model ollama/mxbai-embed-large:latest not found". With the compose healthcheck now
    // gating on the model, Ollama-has-the-model ⇔ Letta-synced-the-embedding, so this is the real
    // gate. Unreachable/absent → not ready yet; callers keep polling.
    let embeddingReady = false;
    try {
      const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://flowkraft-ai-hub-ollama:11434';
      const tagsRes = await fetch(`${ollamaBase}/api/tags`, { cache: 'no-store' });
      if (tagsRes.ok) {
        const tags = await tagsRes.json();
        embeddingReady = (tags?.models ?? []).some((m: any) => String(m?.name ?? '').startsWith('mxbai-embed-large'));
      }
    } catch { /* ollama unreachable → treat as not ready */ }

    // Also require the Matrix bot to be up — otherwise provisioning's Matrix phase races a
    // still-booting baibot (see checkMatrixBotReady). Fail-open, so it never permanently blocks.
    const matrixReady = await checkMatrixBotReady();

    const ready = llmReady && embeddingReady && matrixReady;
    return {
      ready,
      llmReady, embeddingReady, matrixReady,
      handle, model: active.model, providerId: active.providerId,
      reason: ready
        ? undefined
        : !llmReady ? 'llm-not-ready'
        : !embeddingReady ? 'embedding-not-ready'
        : 'matrix-bot-starting',
    };
  } catch (e: any) {
    // Letta down/unreachable (e.g. mid-restart) → not ready yet; the caller keeps polling.
    return { ready: false, reason: e?.message || 'letta-unreachable' };
  }
}
