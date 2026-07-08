import type { AgentConfig } from './common';

// Greek advisor agents for FlowKraft
import athenaAgent from './athena/config';
import hephaestusAgent from './hephaestus/config';
import hermesAgent from './hermes/config';
import pythiaAgent from './pythia/config';
import apolloAgent from './apollo/config';

// Standalone learning tutor (NOT part of the AI Crew — teaches, does not build)
import mnemosyneAgent from './mnemosyne/config';

// Other agents (examples from reference project - commented out)
// import adaAgent from './ada-assistant/config';
// import carolineAgent from './caroline-ceo/config';
// import jimmyAgent from './jimmy-cto/config';
// import mariaAgent from './maria-cmo/config';
// import kateAgent from './kate-rb/config';

// Optional global chat URL (if present, shown above the Agents table as an underlined link)
// Read from environment variable - NEXT_PUBLIC_ prefix required for client-side access in Next.js
// Note: Empty string is treated as "not set"
const envChatUrl = process.env.NEXT_PUBLIC_AGENTS_CHAT_URL;
export const AGENTS_CHAT_URL: string | undefined = envChatUrl && envChatUrl.trim() !== '' ? envChatUrl : undefined;

// Static agents registry.
// Add new agents here (prefer explicit imports) to keep a stable, typed list
// rather than discovering files at runtime.
// You may optionally set `chatUrl` on individual AgentConfig entries to override the default chat link for that agent.
export const AGENTS: AgentConfig[] = [
  // FlowKraft Greek advisors (simple advisor agents, no sleeptime)
  athenaAgent,
  hephaestusAgent,
  hermesAgent,
  pythiaAgent,   // WordPress/PHP portal advisor
  apolloAgent,   // Next.js/React/TypeScript advisor

  // Standalone learning tutor (not an AI Crew advisor — teaches data by doing)
  mnemosyneAgent,

  // Other agents (examples from reference project)
  // adaAgent, carolineAgent, jimmyAgent, mariaAgent, kateAgent
];

export function getAgentByKey(key: string): AgentConfig | undefined {
  return AGENTS.find((a) => a.key === key);
}

// Convenience: local agents page uses these keys to show a pre-seeded list
export const AGENT_KEYS = AGENTS.map(a => a.key);